#!/usr/bin/env bash
LC_ALL=C
export LC_ALL
PRODUCTION_TRANSITION_REPOSITORY=777genius/social-monitor
PRODUCTION_TRANSITION_A0=bb4b3f8a0e81ed371aaef5bf362afaaaaacf3c30
PRODUCTION_TRANSITION_HOST_STATE_VERSION=production-transition-b0-host-state-v1
PRODUCTION_TRANSITION_HOST_STATE_FILE=production-transition-b0-host.state
PRODUCTION_TRANSITION_HOST_LOCK_FILE=production-transition-b0-host.lock
PRODUCTION_TRANSITION_HOST_SCHEDULER_HOLD_FILE=production-transition-scheduler-hold.v2
PRODUCTION_TRANSITION_HOST_PROTECTED_MANIFEST=ops/deploy/production-transition-protected.manifest
PRODUCTION_TRANSITION_HOST_PROTECTED_VERSION=social-monitor-production-transition-protected-paths-v1
PRODUCTION_TRANSITION_FORWARD_AUTHORITY_SEAL=ops/deploy/production-forward-bridge-authority.blobs
production_transition_host_failpoint() { [[ ${PRODUCTION_TRANSITION_HOST_FAILPOINT:-} != "$1" ]] || return 97; }
production_transition_host_fail() { fail "$@"; }
if declare -p PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_OWNER 2>/dev/null | grep -q '^declare -[^ ]*r' &&
   declare -p PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_NONCE 2>/dev/null | grep -q '^declare -[^ ]*r'; then
  : # Preserve the readonly identity so a child remains distinguishable.
else
  if [[ -n ${PRODUCTION_TRANSITION_HOST_LOCK_FD:-} || -n ${PRODUCTION_TRANSITION_HOST_LOCK_OWNER:-} || -n ${PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY:-} || -n ${PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_NONCE:-} ]]; then
    production_transition_host_lock_input_rejected=1
  else
    production_transition_host_lock_input_rejected=0
  fi
  unset PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_OWNER PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_NONCE PRODUCTION_TRANSITION_HOST_LOCK_FD PRODUCTION_TRANSITION_HOST_LOCK_OWNER PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY
  production_transition_host_control_context_nonce=$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')
  [[ $production_transition_host_control_context_nonce =~ ^[0-9a-f]{64}$ ]] || \
    production_transition_host_fail 'transition host lock custody nonce could not be generated'
  readonly PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_OWNER=$BASHPID \
    PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_NONCE=$production_transition_host_control_context_nonce PRODUCTION_TRANSITION_HOST_LOCK_INPUT_REJECTED="$production_transition_host_lock_input_rejected"
  unset production_transition_host_lock_input_rejected production_transition_host_control_context_nonce
fi
production_transition_host_file_identity() { stat -Lc '%d:%i:%f:%s:%Y:%Z:%h' "$1"; }
production_transition_host_require_installed_blob() {
  local base=$1 relative_path=$2 installed_path=$3 label=$4
  local entry mode type object tree_path extra before after installed_object owner
  local installed_mode=${5:-}
  entry=$(git -C "$REPO" ls-tree "$base" -- "$relative_path") || \
    production_transition_host_fail "$label cannot be inspected at trusted B0"
  read -r mode type object tree_path extra <<< "$entry"
  [[ -z ${extra:-} && ($mode == 100644 || $mode == 100755) && \
     $type == blob && $object =~ ^[0-9a-f]{40}$ && \
     $tree_path == "$relative_path" ]] || \
    production_transition_host_fail "$label is not a regular trusted B0 blob"
  [[ -f $installed_path && ! -L $installed_path ]] || \
    production_transition_host_fail "$label is not an installed regular file"
  before=$(production_transition_host_file_identity "$installed_path") || \
    production_transition_host_fail "$label identity cannot be read"
  owner=$(stat -Lc '%u:%g:%a' "$installed_path") || \
    production_transition_host_fail "$label owner or mode cannot be read"
  [[ -n $installed_mode ]] || installed_mode=${mode#100}
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    [[ $owner == "$(id -u):$(id -g):$installed_mode" ]] || \
      production_transition_host_fail "$label test owner or mode is invalid"
  else
    [[ $owner == "0:0:$installed_mode" ]] || \
      production_transition_host_fail "$label owner or mode is invalid"
  fi
  installed_object=$(git -C "$REPO" hash-object --no-filters "$installed_path") || \
    production_transition_host_fail "$label installed blob cannot be read"
  after=$(production_transition_host_file_identity "$installed_path") || \
    production_transition_host_fail "$label identity cannot be re-read"
  [[ ! -L $installed_path && $before == *:1 && $before == "$after" && $installed_object == "$object" ]] || \
    production_transition_host_fail "$label differs from trusted B0"
}
production_transition_host_read_base() {
  local marker=$STATE/control.sha before after value owner
  [[ -f $marker && ! -L $marker ]] || \
    production_transition_host_fail 'trusted B0 control marker is unsafe'
  before=$(production_transition_host_file_identity "$marker") || \
    production_transition_host_fail 'trusted B0 control marker identity cannot be read'
  owner=$(stat -Lc '%u:%g:%a' "$marker") || \
    production_transition_host_fail 'trusted B0 control marker owner or mode cannot be read'
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    [[ $owner == "$(id -u):$(id -g):600" || \
       $owner == "$(id -u):$(id -g):644" ]] || \
      production_transition_host_fail 'trusted B0 test marker owner or mode is invalid'
  else
    [[ $owner == 0:0:644 ]] || \
      production_transition_host_fail 'trusted B0 control marker owner or mode is invalid'
  fi
  IFS= read -r value < "$marker" || \
    production_transition_host_fail 'trusted B0 control marker cannot be read'
  [[ $before == *:1 && $(wc -c < "$marker") == 41 && $value =~ ^[0-9a-f]{40}$ ]] || \
    production_transition_host_fail 'trusted B0 control marker is malformed'
  after=$(production_transition_host_file_identity "$marker") || \
    production_transition_host_fail 'trusted B0 control marker identity cannot be re-read'
  [[ ! -L $marker && $before == "$after" ]] || \
    production_transition_host_fail 'trusted B0 control marker changed while being read'
  git -C "$REPO" cat-file -e "$value^{commit}" 2>/dev/null || \
    production_transition_host_fail 'trusted B0 commit is unavailable'
  local required_a0=$PRODUCTION_TRANSITION_A0
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
        -n ${SOCIAL_MONITOR_DEPLOY_TEST_A0:-} ]]; then
    required_a0=$SOCIAL_MONITOR_DEPLOY_TEST_A0
  fi
  [[ $required_a0 =~ ^[0-9a-f]{40}$ ]] || \
    production_transition_host_fail 'required A0 identity is malformed'
  git -C "$REPO" merge-base --is-ancestor "$required_a0" "$value" || \
    production_transition_host_fail 'trusted B0 does not descend from pinned A0'
  printf '%s\n' "$value"
}
production_transition_host_require_b0_seals() {
  local base=$1 allowed_target=${2:-} current
  current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
    production_transition_host_fail 'current integration commit is unavailable'
  [[ $current == "$base" || (-n $allowed_target && $current == "$allowed_target") ]] || \
    production_transition_host_fail 'current integration is neither trusted B0 nor resumable T'
  production_transition_host_require_installed_blob "$base" \
    ops/deploy/social-monitor-production-deploy.sh \
    "$CONTROL/github-production-deploy.sh" 'installed deploy entrypoint' 755
  production_transition_host_require_installed_blob "$base" \
    ops/deploy/social-monitor-production-ssh-wrapper.sh \
    "$CONTROL/github-production-deploy-wrapper.sh" 'installed SSH wrapper' 755
  production_transition_host_require_installed_blob "$base" \
    ops/deploy/production-transition-admission.sh \
    "$CONTROL/production-transition-admission.sh" 'installed transition admission'
  production_transition_host_require_installed_blob "$base" \
    ops/deploy/production-transition-b0-host-control.sh \
    "$CONTROL/production-transition-b0-host-control.sh" 'installed B0 host control'
  production_transition_host_require_installed_blob "$base" \
    ops/deploy/production-transition-canonical-lib.sh \
    "$CONTROL/production-transition-canonical-lib.sh" 'installed canonical library'
}
production_transition_host_require_protected_trust_manifest() {
  local base=$1 target=$2 manifest version spec expected_mode relative
  local base_entry target_entry previous=
  local base_mode base_type base_object base_path base_extra
  local target_mode target_type target_object target_path target_extra
  manifest=$(git -C "$REPO" show \
    "$base:$PRODUCTION_TRANSITION_HOST_PROTECTED_MANIFEST" 2>/dev/null) || \
    production_transition_host_fail 'protected B0 trust manifest is unavailable'
  IFS= read -r version <<< "$manifest"
  [[ $version == "version=$PRODUCTION_TRANSITION_HOST_PROTECTED_VERSION" ]] || \
    production_transition_host_fail 'protected B0 trust manifest version is invalid'
  while IFS= read -r spec; do
    expected_mode=${spec%%:*}
    relative=${spec#*:}
    [[ $expected_mode =~ ^100(644|755)$ && $relative != "$spec" ]] || \
      production_transition_host_fail 'protected B0 trust manifest entry is malformed'
    [[ -z $previous || $previous < $relative ]] || \
      production_transition_host_fail 'protected B0 trust manifest is not unique and sorted'
    previous=$relative
    base_entry=$(git -C "$REPO" ls-tree "$base" -- "$relative") || \
      production_transition_host_fail "protected B0 trust path cannot be inspected: $relative"
    target_entry=$(git -C "$REPO" ls-tree "$target" -- "$relative") || \
      production_transition_host_fail "protected target trust path cannot be inspected: $relative"
    read -r base_mode base_type base_object base_path base_extra <<< "$base_entry"
    read -r target_mode target_type target_object target_path target_extra <<< "$target_entry"
    [[ -z ${base_extra:-} && -z ${target_extra:-} && \
       $base_mode == "$expected_mode" && \
       $base_type == blob && $base_object =~ ^[0-9a-f]{40}$ && \
       $base_path == "$relative" && $target_mode == "$base_mode" && \
       $target_type == blob && $target_object == "$base_object" && \
       $target_path == "$relative" ]] || \
      production_transition_host_fail "protected B0 trust blob changed or is missing: $relative"
  done < <(tail -n +2 <<< "$manifest")
}
production_transition_host_state_path() {
  printf '%s/%s\n' "$STATE" "$PRODUCTION_TRANSITION_HOST_STATE_FILE"
}
production_transition_host_read_state() {
  local path before after owner
  path=$(production_transition_host_state_path)
  [[ ! -e $path && ! -L $path ]] && return 1
  [[ -f $path && ! -L $path ]] || \
    production_transition_host_fail 'transition host state is unsafe'
  before=$(production_transition_host_file_identity "$path") || \
    production_transition_host_fail 'transition host state identity cannot be read'
  owner=$(stat -Lc '%u:%g:%a' "$path") || \
    production_transition_host_fail 'transition host state owner or mode cannot be read'
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    [[ $owner == "$(id -u):$(id -g):600" ]] || \
      production_transition_host_fail 'transition host test state owner or mode is invalid'
  else
    [[ $owner == 0:0:600 ]] || \
      production_transition_host_fail 'transition host state owner or mode is invalid'
  fi
  cat "$path"
  after=$(production_transition_host_file_identity "$path") || \
    production_transition_host_fail 'transition host state identity cannot be re-read'
  [[ $before == "$after" ]] || \
    production_transition_host_fail 'transition host state changed while being read'
}
production_transition_host_parse_state() {
  local record=$1 version status base target tree
  local -a fields=()
  mapfile -t fields <<< "$record"
  [[ ${#fields[@]} == 5 ]] || \
    production_transition_host_fail 'transition host state has an invalid field count'
  version=${fields[0]}
  status=${fields[1]}
  base=${fields[2]}
  target=${fields[3]}
  tree=${fields[4]}
  [[ \
     $version == "version=$PRODUCTION_TRANSITION_HOST_STATE_VERSION" && \
     $status =~ ^status=(admitted|terminal)$ && \
     $base =~ ^trusted-base=[0-9a-f]{40}$ && \
     $target =~ ^target=[0-9a-f]{40}$ && \
     $tree =~ ^target-tree=[0-9a-f]{40}$ ]] || \
    production_transition_host_fail 'transition host state is malformed'
  printf '%s %s %s %s\n' "${status#status=}" "${base#trusted-base=}" \
    "${target#target=}" "${tree#target-tree=}"
}
production_transition_host_state_rank() {
  case $1 in
    admitted) printf '1\n' ;;
    terminal) printf '2\n' ;;
    *) return 1 ;;
  esac
}
production_transition_host_reconcile_state() {
  local path next next_record next_parsed next_status next_base next_target next_tree
  local record parsed status base target tree next_rank rank owner
  path=$(production_transition_host_state_path)
  next=$path.next
  [[ -e $next || -L $next ]] || return 0
  [[ -f $next && ! -L $next ]] || \
    production_transition_host_fail 'transition host temporary state is unsafe'
  owner=$(stat -Lc '%u:%g:%a' "$next") || \
    production_transition_host_fail 'transition host temporary state mode cannot be read'
  [[ $owner == "$(id -u):$(id -g):600" ]] || \
    production_transition_host_fail 'transition host temporary state owner or mode is invalid'
  next_record=$(cat "$next")
  next_parsed=$(production_transition_host_parse_state "$next_record")
  read -r next_status next_base next_target next_tree <<< "$next_parsed"
  next_rank=$(production_transition_host_state_rank "$next_status") || \
    production_transition_host_fail 'transition host temporary phase is invalid'
  if [[ -e $path || -L $path ]]; then
    record=$(production_transition_host_read_state)
    parsed=$(production_transition_host_parse_state "$record")
    read -r status base target tree <<< "$parsed"
    [[ $base == "$next_base" && $target == "$next_target" && \
       $tree == "$next_tree" ]] || \
      production_transition_host_fail 'transition host temporary state conflicts with durable target'
    rank=$(production_transition_host_state_rank "$status") || return 1
    if ((rank >= next_rank)); then
      rm -f -- "$next"
      sync -f "$STATE"
      return 0
    fi
    ((next_rank == rank + 1)) || \
      production_transition_host_fail 'transition host temporary state skips a phase'
  elif [[ $next_status != admitted ]]; then
    production_transition_host_fail 'transition host temporary terminal has no admission'
  fi
  mv -T "$next" "$path"
  sync -f "$path" && sync -f "$STATE" || \
    production_transition_host_fail 'transition host temporary state recovery was not durable'
}
production_transition_host_write_state() {
  local status=$1 base=$2 target=$3 tree=$4 path next previous parsed expected
  [[ $status == admitted || $status == terminal ]] || \
    production_transition_host_fail 'transition host state status is invalid'
  path=$(production_transition_host_state_path)
  next=$path.next
  production_transition_host_reconcile_state
  [[ ! -e $next && ! -L $next ]] || \
    production_transition_host_fail 'transition host state temporary path is unsafe'
  if [[ $status == admitted ]]; then
    [[ ! -e $path && ! -L $path ]] || \
      production_transition_host_fail 'transition host admission CAS found existing state'
  else
    previous=$(production_transition_host_read_state) || \
      production_transition_host_fail 'transition host terminal CAS found no admitted state'
    parsed=$(production_transition_host_parse_state "$previous")
    [[ $parsed == "admitted $base $target $tree" ]] || \
      production_transition_host_fail 'transition host terminal CAS found different state'
  fi
  expected=$(printf 'version=%s\nstatus=%s\ntrusted-base=%s\ntarget=%s\ntarget-tree=%s\n' \
    "$PRODUCTION_TRANSITION_HOST_STATE_VERSION" "$status" "$base" "$target" "$tree" \
  )
  umask 077
  if ! (set -o noclobber; printf '%s\n' "$expected" > "$next") 2>/dev/null; then
    production_transition_host_fail 'transition host temporary state was concurrently created'
  fi
  chmod 0600 "$next"
  sync -f "$next" || \
    production_transition_host_fail 'transition host state could not be made durable'
  production_transition_host_failpoint "$status-staged"
  mv -T "$next" "$path"
  sync -f "$path" && sync -f "$STATE" || \
    production_transition_host_fail 'transition host state rename could not be made durable'
  parsed=$(production_transition_host_parse_state "$(production_transition_host_read_state)")
  [[ $parsed == "$status $base $target $tree" ]] || \
    production_transition_host_fail 'transition host state did not commit exactly'
}
production_transition_host_acquire_lock() {
  local lock=$STATE/$PRODUCTION_TRANSITION_HOST_LOCK_FILE fd=${PRODUCTION_TRANSITION_HOST_LOCK_FD:-} probe
  [[ $PRODUCTION_TRANSITION_HOST_LOCK_INPUT_REJECTED == 0 ]] ||
    production_transition_host_fail \
      'transition host inherited an unsafe lock descriptor'
  if [[ -n $fd || -n ${PRODUCTION_TRANSITION_HOST_LOCK_OWNER:-} || -n ${PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY:-} ]]; then
    if [[ ! $fd =~ ^[0-9]+$ || \
          ${PRODUCTION_TRANSITION_HOST_LOCK_OWNER:-} != "$BASHPID" || \
          $PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_OWNER != "$BASHPID" || \
          ${PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY:-} != \
            "$PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_OWNER:$fd:$PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_NONCE" ]]; then
      if [[ $fd =~ ^[0-9]+$ ]] && \
          production_transition_host_validate_lock "$fd" "$lock"; then
        eval "exec $fd>&-"
      fi
      unset PRODUCTION_TRANSITION_HOST_LOCK_FD PRODUCTION_TRANSITION_HOST_LOCK_OWNER
      unset PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY
      production_transition_host_fail 'transition host inherited an unsafe lock descriptor'
    fi
    production_transition_host_validate_lock "$fd" "$lock" || \
      production_transition_host_fail 'transition host owned lock descriptor is unsafe'
    exec {probe}<>"$lock" || production_transition_host_fail 'transition host lock custody probe cannot be opened'; if flock -n "$probe"; then eval "exec $probe>&-"; production_transition_host_fail 'transition host owned lock descriptor had no prior lock'; fi; eval "exec $probe>&-"
    flock -n "$fd" || production_transition_host_fail \
      'transition host owned lock descriptor does not hold the lock'
    production_transition_host_validate_lock "$fd" "$lock" || \
      production_transition_host_fail 'transition host lock changed while proving custody'
  else
    umask 077
    exec {PRODUCTION_TRANSITION_HOST_LOCK_FD}<>"$lock" || \
      production_transition_host_fail 'transition host lock cannot be opened'
    PRODUCTION_TRANSITION_HOST_LOCK_OWNER=$BASHPID
    fd=$PRODUCTION_TRANSITION_HOST_LOCK_FD
    production_transition_host_validate_lock "$fd" "$lock" || {
      exec {PRODUCTION_TRANSITION_HOST_LOCK_FD}>&-
      unset PRODUCTION_TRANSITION_HOST_LOCK_FD PRODUCTION_TRANSITION_HOST_LOCK_OWNER
      production_transition_host_fail 'transition host lock path is unsafe'
    }
    flock -w 3600 "$fd" || {
      exec {PRODUCTION_TRANSITION_HOST_LOCK_FD}>&-
      unset PRODUCTION_TRANSITION_HOST_LOCK_FD PRODUCTION_TRANSITION_HOST_LOCK_OWNER
      production_transition_host_fail 'timed out waiting for transition host lock'
    }
    production_transition_host_validate_lock "$fd" "$lock" || {
      exec {PRODUCTION_TRANSITION_HOST_LOCK_FD}>&-
      unset PRODUCTION_TRANSITION_HOST_LOCK_FD PRODUCTION_TRANSITION_HOST_LOCK_OWNER
      production_transition_host_fail 'transition host lock changed while acquiring it'
    }
    PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY="$PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_OWNER:$fd:$PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_NONCE"
  fi
  production_transition_host_reconcile_state
}
production_transition_host_validate_lock() {
  local fd=$1 lock=$2 descriptor path
  [[ -f /proc/$BASHPID/fd/$fd && -f $lock && ! -L $lock ]] || return 1
  descriptor=$(stat -Lc '%d:%i:%u:%g:%a:%h' "/proc/$BASHPID/fd/$fd") || return
  path=$(stat -Lc '%d:%i:%u:%g:%a:%h' "$lock") || return
  [[ $descriptor == "$path" && \
     $descriptor == *":$(id -u):$(id -g):600:1" ]]
}
production_transition_host_release_lock() {
  local lock=$STATE/$PRODUCTION_TRANSITION_HOST_LOCK_FILE
  local fd=${PRODUCTION_TRANSITION_HOST_LOCK_FD:-}
  if [[ ! $fd =~ ^[0-9]+$ || \
        ${PRODUCTION_TRANSITION_HOST_LOCK_OWNER:-} != "$BASHPID" || \
        $PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_OWNER != "$BASHPID" || \
        ${PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY:-} != \
          "$PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_OWNER:$fd:$PRODUCTION_TRANSITION_HOST_CONTROL_CONTEXT_NONCE" ]]; then
    if [[ $fd =~ ^[0-9]+$ ]] && \
        production_transition_host_validate_lock "$fd" "$lock"; then
      eval "exec $fd>&-"
    fi
    unset PRODUCTION_TRANSITION_HOST_LOCK_FD PRODUCTION_TRANSITION_HOST_LOCK_OWNER
    unset PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY
    production_transition_host_fail \
      'transition host lock release is not owned by this shell'
  fi
  production_transition_host_validate_lock "$fd" "$lock" || \
    production_transition_host_fail 'transition host lock changed before release'
  eval "exec $fd>&-"
  unset PRODUCTION_TRANSITION_HOST_LOCK_FD PRODUCTION_TRANSITION_HOST_LOCK_OWNER
  unset PRODUCTION_TRANSITION_HOST_LOCK_CUSTODY
}
production_transition_host_require_scheduler_finalized() {
  local hold=$STATE/$PRODUCTION_TRANSITION_HOST_SCHEDULER_HOLD_FILE
  [[ ! -e $hold && ! -L $hold ]] || \
    production_transition_host_fail \
      'production mutation is held until exact deploy-transition replay finalizes the scheduler hold'
}
production_transition_host_require_action_allowed() {
  local action=$1 record parsed status
  production_transition_host_acquire_lock
  if record=$(production_transition_host_read_state); then
    parsed=$(production_transition_host_parse_state "$record")
    read -r status _ <<< "$parsed"
    [[ $status == terminal ]] || \
      production_transition_host_fail "production mutation $action is held by an incomplete authenticated transition"
    production_transition_host_require_scheduler_finalized
  fi
}
production_transition_host_require_ordinary_deploy() {
  local target=$1 record parsed status terminal_target current
  production_transition_host_acquire_lock
  if record=$(production_transition_host_read_state); then
    parsed=$(production_transition_host_parse_state "$record")
    read -r status _ terminal_target _ <<< "$parsed"
    [[ $status == terminal ]] || \
      production_transition_host_fail 'ordinary deploy is held by an incomplete authenticated transition'
    production_transition_host_require_scheduler_finalized
    current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
      production_transition_host_fail 'ordinary deploy current commit is unavailable'
    git -C "$REPO" merge-base --is-ancestor "$terminal_target" "$current" || \
      production_transition_host_fail 'ordinary deploy current commit is outside authenticated history'
    return 0
  fi
  current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
    production_transition_host_fail 'ordinary deploy current commit is unavailable'
  [[ $target == "$current" ]] || \
    production_transition_host_fail 'first post-B0 release requires deploy-transition with a signed target'
}
production_transition_authenticated_pair() {
  local base=$1 target=$2 current
  [[ ${PRODUCTION_TRANSITION_AUTHENTICATED_BASE:-} == "$base" && \
     ${PRODUCTION_TRANSITION_AUTHENTICATED_TARGET:-} == "$target" ]] || return 1
  current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || return 1
  [[ $current == "$base" || $current == "$target" ]]
}
production_transition_install_compatibility_overrides() {
  local definition function_name
  declare -F verify_deploy_control_bridge_target_compatibility >/dev/null || \
    production_transition_host_fail 'target compatibility verifier is unavailable'
  declare -F verify_deploy_control_bridge_compatibility >/dev/null || \
    production_transition_host_fail 'runtime compatibility verifier is unavailable'
  definition=$(declare -f verify_deploy_control_bridge_target_compatibility)
  definition=${definition/verify_deploy_control_bridge_target_compatibility/production_transition_original_target_compatibility}
  eval "$definition"
  definition=$(declare -f verify_deploy_control_bridge_compatibility)
  definition=${definition/verify_deploy_control_bridge_compatibility/production_transition_original_runtime_compatibility}
  eval "$definition"
  for function_name in \
    run_reader_summary_daily_scan_terminal_repair_c1_from_stdin \
    run_reader_summary_production_history_from_stdin \
    run_reader_summary_daily_delivery_c1 \
    run_reader_summary_daily_delivery_c1_containment; do
    declare -F "$function_name" >/dev/null || \
      production_transition_host_fail "production mutation handler is unavailable: $function_name"
    definition=$(declare -f "$function_name")
    definition=${definition/$function_name/production_transition_original_$function_name}
    eval "$definition"
  done
  verify_deploy_control_bridge_target_compatibility() {
    local target=$1
    if production_transition_authenticated_pair \
        "${PRODUCTION_TRANSITION_AUTHENTICATED_BASE:-}" "$target"; then
      [[ $(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') == \
         "$PRODUCTION_TRANSITION_AUTHENTICATED_BASE" ]] || \
        production_transition_host_fail 'authenticated target compatibility ran outside trusted B0'
      return 0
    fi
    production_transition_original_target_compatibility "$@"
  }
  verify_deploy_control_bridge_compatibility() {
    local current
    current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
      production_transition_host_fail 'runtime compatibility current commit is unavailable'
    if [[ ${PRODUCTION_TRANSITION_AUTHENTICATED_TARGET:-} == "$current" ]] && \
       production_transition_authenticated_pair \
         "${PRODUCTION_TRANSITION_AUTHENTICATED_BASE:-}" "$current"; then
      return 0
    fi
    production_transition_original_runtime_compatibility "$@"
  }
  run_reader_summary_daily_scan_terminal_repair_c1_from_stdin() {
    production_transition_host_require_action_allowed \
      reader-summary-daily-scan-terminal-repair-c1
    production_transition_original_run_reader_summary_daily_scan_terminal_repair_c1_from_stdin "$@"
  }
  run_reader_summary_production_history_from_stdin() {
    production_transition_host_require_action_allowed reader-summary-production-history
    production_transition_original_run_reader_summary_production_history_from_stdin "$@"
  }
  run_reader_summary_daily_delivery_c1() {
    production_transition_host_require_action_allowed reader-summary-daily-delivery-c1-run
    production_transition_original_run_reader_summary_daily_delivery_c1 "$@"
  }
  run_reader_summary_daily_delivery_c1_containment() {
    production_transition_host_require_action_allowed reader-summary-daily-delivery-c1-contain
    production_transition_original_run_reader_summary_daily_delivery_c1_containment "$@"
  }
}
production_transition_host_validate_target_after_admission() {
  local base=$1 target=$2 tree=$3 current current_tree
  current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
    production_transition_host_fail 'current integration disappeared after admission'
  [[ $current == "$base" || $current == "$target" ]] || \
    production_transition_host_fail 'current integration is outside resumable B0 to T'
  current_tree=$(git -C "$REPO" rev-parse --verify "$target^{tree}") || \
    production_transition_host_fail 'target disappeared after admission'
  [[ $current_tree == "$tree" ]] || \
    production_transition_host_fail 'target tree changed during admission'
  production_transition_host_require_exact_remote_main "$target"
  production_transition_host_require_b0_seals "$base" "$target"
}
production_transition_host_verify_independent_admission() {
  local base=$1 target=$2 target_tree=$3 admission_output
  admission_output=$("$CONTROL/production-transition-admission.sh" verify --target "$target") || \
    production_transition_host_fail 'trusted transition admission rejected target'
  [[ $admission_output =~ ^production-transition-admission-ok\ trusted-base=$base\ target=$target\ repository=$PRODUCTION_TRANSITION_REPOSITORY\ s2=[0-9a-f]{40}\ p6=[0-9a-f]{40}\ review-id=[0-9a-f]{64}$ && \
     $(wc -l <<< "$admission_output") == 1 ]] || \
    production_transition_host_fail 'trusted transition admission returned malformed success evidence'
  production_transition_host_validate_target_after_admission \
    "$base" "$target" "$target_tree"
}
production_transition_host_seal_prelude_commit() {
  local current=$1
  [[ $current =~ ^[0-9a-f]{40}$ && \
     $(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') == "$current" ]] || \
    production_transition_host_fail \
      'production prelude commit changed after authorization'
  PRODUCTION_TRANSITION_PRELUDE_COMMIT=$current
  export PRODUCTION_TRANSITION_PRELUDE_COMMIT
}
production_transition_host_require_exact_remote_main() {
  local target=$1 output live ref extra tracking
  local allow_local_origin=false
  local -a urls=()
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
        ${PRODUCTION_FORWARD_TEST_ALLOW_LOCAL_ORIGIN:-} == 1 ]]; then
    allow_local_origin=true
  else
    mapfile -t urls < <(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 git -C "$REPO" remote get-url --all origin)
    [[ ${#urls[@]} == 1 && (${urls[0]} == https://github.com/777genius/social-monitor.git || ${urls[0]} == https://github.com/777genius/social-monitor || ${urls[0]} == git@github.com:777genius/social-monitor.git) ]] || production_transition_host_fail 'origin differs from pinned 777genius/social-monitor'
  fi
  if [[ $allow_local_origin == true ]]; then
    live=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 git -C "$REPO" rev-parse --verify 'origin/main^{commit}') || production_transition_host_fail 'protected origin main cannot be resolved'
    ref=refs/heads/main
  else
    GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 git -C "$REPO" fetch --quiet origin main || production_transition_host_fail 'protected origin main fetch failed'
    output=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 git -C "$REPO" ls-remote --exit-code origin refs/heads/main) || production_transition_host_fail 'protected live origin main cannot be read'
    read -r live ref extra <<< "$output"
  fi
  tracking=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 git -C "$REPO" rev-parse --verify 'origin/main^{commit}') || production_transition_host_fail 'protected origin main cannot be resolved'
  [[ ($allow_local_origin == true || (-z ${extra:-} && $(wc -l <<< "$output") == 1)) && $live == "$target" && $tracking == "$live" && $ref == refs/heads/main ]] || production_transition_host_fail 'production prelude target is not exact live origin main'
  validate_main_commit "$target"; }
production_transition_host_source_authorized_prelude() {
  local relative=$1 label=$2 commit entry mode type object tree_path extra staging staged fd
  commit=${PRODUCTION_TRANSITION_PRELUDE_COMMIT:-}
  [[ $commit =~ ^[0-9a-f]{40}$ && \
     $(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 git -C "$REPO" rev-parse --verify 'HEAD^{commit}') == "$commit" ]] || \
    production_transition_host_fail "$label has no stable authorized prelude commit"
  entry=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 git -C "$REPO" ls-tree "$commit" -- "$relative") || \
    production_transition_host_fail "$label cannot be inspected at the authorized commit"
  read -r mode type object tree_path extra <<< "$entry"
  [[ -z ${extra:-} && ( $mode == 100644 || $mode == 100755 ) && \
     $type == blob && $object =~ ^[0-9a-f]{40}$ && $tree_path == "$relative" ]] || \
    production_transition_host_fail "$label is not an authorized regular blob"
  if [[ $relative == ops/deploy/production-transition-marker-lib.sh &&
     ${PRODUCTION_TRANSITION_HOST_MARKER_OBJECT:-} == "$object" ]] &&
     declare -p PRODUCTION_TRANSITION_HOST_MARKER_OBJECT 2>/dev/null |
       grep -q '^declare -r '; then
    return 0
  fi
  staging=$(mktemp -d "$STATE/authorized-prelude.XXXXXX") || \
    production_transition_host_fail "$label staging failed"
  chmod 0700 "$staging" || production_transition_host_fail "$label staging cannot be sealed"
  staged=$staging/library.sh
  GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 git -C "$REPO" cat-file blob "$object" > "$staged" || \
    production_transition_host_fail "$label authorized blob cannot be staged"
  chmod 0400 "$staged" || production_transition_host_fail "$label blob cannot be sealed"
  exec {fd}<"$staged" || production_transition_host_fail "$label blob cannot be opened"
  rm -f "$staged"; rmdir "$staging"
  if ! builtin source "/dev/fd/$fd"; then
    exec {fd}<&-
    production_transition_host_fail "$label authorized blob could not be loaded"
  fi
  exec {fd}<&-
}
production_transition_host_derive_forward_graph() {
  local target=$1 base=$2 current=$1 record parent candidate_h candidate_r
  local hops=0
  local -a parents=() h_parents=() w_parents=() r_parents=()
  while ((hops <= 256)); do
    record=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
      git -C "$REPO" rev-list --parents -n 1 "$current" 2>/dev/null) || return 1
    read -r -a parents <<< "$record"
    if [[ ${#parents[@]} == 3 ]]; then
      candidate_h=${parents[2]}
      read -r -a h_parents <<< "$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
        git -C "$REPO" rev-list --parents -n 1 "$candidate_h" 2>/dev/null)"
      if [[ ${#h_parents[@]} == 2 ]]; then
        read -r -a w_parents <<< "$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
          git -C "$REPO" rev-list --parents -n 1 "${h_parents[1]}" 2>/dev/null)"
        if [[ ${#w_parents[@]} == 2 ]]; then
          candidate_r=${w_parents[1]}
          read -r -a r_parents <<< "$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
            git -C "$REPO" rev-list --parents -n 1 "$candidate_r" 2>/dev/null)"
          if [[ ${#r_parents[@]} == 3 && ${r_parents[1]} == "${parents[1]}" && \
                ${r_parents[2]} == "$base" ]]; then
            [[ $(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
              git -C "$REPO" rev-parse "$target^{tree}") == \
               $(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
              git -C "$REPO" rev-parse "$candidate_h^{tree}") ]] || return 1
            PRODUCTION_TRANSITION_FORWARD_H=$candidate_h
            return 0
          fi
        fi
      fi
    fi
    [[ ${#parents[@]} == 2 ]] || break
    parent=${parents[1]}
    current=$parent
    ((hops += 1))
  done
  read -r -a h_parents <<< "$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    git -C "$REPO" rev-list --parents -n 1 "$target" 2>/dev/null)"
  [[ ${#h_parents[@]} == 2 ]] || return 1
  read -r -a w_parents <<< "$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    git -C "$REPO" rev-list --parents -n 1 "${h_parents[1]}" 2>/dev/null)"
  [[ ${#w_parents[@]} == 2 ]] || return 1
  read -r -a r_parents <<< "$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    git -C "$REPO" rev-list --parents -n 1 "${w_parents[1]}" 2>/dev/null)"
  [[ ${#r_parents[@]} == 3 && ${r_parents[2]} == "$base" ]] || return 1
  PRODUCTION_TRANSITION_FORWARD_H=$target
}
production_transition_host_require_forward_blob() {
  local commit=$1 expected_mode=$2 expected_object=$3 expected_path=$4
  local entry mode type object path extra
  entry=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    git -C "$REPO" ls-tree "$commit" -- "$expected_path") || \
    production_transition_host_fail "production forward cannot inspect sealed path: $expected_path"
  read -r mode type object path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == "$expected_mode" && $type == blob && \
     $object == "$expected_object" && $path == "$expected_path" ]] || \
    production_transition_host_fail "production forward sealed path differs: $expected_path"
}
production_transition_host_load_forward_authority() {
  local base=$1 reviewed_h=$2 target=$3 entry mode type object path extra staging staged fd
  local line row=0 expected_path sealed_mode sealed_object sealed_path reviewed_r
  local authority_object='' marker_object='' source_object source_label
  local relative=ops/deploy/production-forward-bridge-host-lib.sh
  local -a expected_paths=(ops/deploy/deploy-control-bridge-lib.sh
    ops/deploy/production-forward-bridge-host-lib.sh
    ops/deploy/production-forward-bridge.blobs
    ops/deploy/production-transition-b0-host-control.sh
    ops/deploy/production-transition-marker-lib.sh)
  entry=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 git -C "$REPO" \
    ls-tree "$reviewed_h" -- "$PRODUCTION_TRANSITION_FORWARD_AUTHORITY_SEAL") || \
    production_transition_host_fail 'production forward authority seal cannot be inspected at reviewed H'
  read -r mode type object path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
     $object =~ ^[0-9a-f]{40}$ && $path == "$PRODUCTION_TRANSITION_FORWARD_AUTHORITY_SEAL" ]] || \
    production_transition_host_fail 'production forward authority seal is not a regular H blob'
  reviewed_r=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    git -C "$REPO" rev-parse "$reviewed_h^1^1") || \
    production_transition_host_fail 'production forward R cannot be derived before authority load'
  staging=$(mktemp -d "$STATE/forward-authority.XXXXXX") || \
    production_transition_host_fail 'production forward authority staging failed'
  chmod 0700 "$staging" || \
    production_transition_host_fail 'production forward authority staging cannot be sealed'
  staged=$staging/seal
  GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    git -C "$REPO" cat-file blob "$object" > "$staged" || \
    production_transition_host_fail 'production forward authority seal cannot be staged'
  [[ $(tail -c 1 "$staged" | od -An -tx1 | tr -d ' ') == 0a ]] || \
    production_transition_host_fail 'production forward authority seal is not newline terminated'
  chmod 0400 "$staged" || \
    production_transition_host_fail 'production forward authority seal cannot be protected'
  exec {fd}<"$staged" || \
    production_transition_host_fail 'production forward authority seal cannot be opened'
  rm -f "$staged"
  while IFS= read -r line <&$fd || [[ -n $line ]]; do
    ((row += 1)); expected_path=${expected_paths[row - 1]:-}
    [[ $row -le 5 && \
       $line =~ ^100644\ ([0-9a-f]{40})\ ([./a-z0-9-]+)$ ]] || \
      production_transition_host_fail \
      'production forward authority seal formatting is invalid'
    sealed_mode=100644
    sealed_object=${BASH_REMATCH[1]}
    sealed_path=${BASH_REMATCH[2]}
    [[ $sealed_path == "$expected_path" ]] || \
      production_transition_host_fail 'production forward authority seal row is invalid'
    production_transition_host_require_forward_blob \
      "$base" "$sealed_mode" "$sealed_object" "$sealed_path"
    production_transition_host_require_forward_blob \
      "$reviewed_r" "$sealed_mode" "$sealed_object" "$sealed_path"
    production_transition_host_require_forward_blob \
      "$reviewed_h" "$sealed_mode" "$sealed_object" "$sealed_path"
    production_transition_host_require_forward_blob \
      "$target" "$sealed_mode" "$sealed_object" "$sealed_path"
    [[ $sealed_path != "$relative" ]] || authority_object=$sealed_object
    [[ $sealed_path != ops/deploy/production-transition-marker-lib.sh ]] || \
      marker_object=$sealed_object
  done
  exec {fd}<&-
  [[ $row == 5 && $authority_object =~ ^[0-9a-f]{40}$ && \
     $marker_object =~ ^[0-9a-f]{40}$ ]] || \
    production_transition_host_fail 'production forward authority seal path set is invalid'
  ! declare -p PRODUCTION_TRANSITION_HOST_MARKER_OBJECT >/dev/null 2>&1 ||
    production_transition_host_fail 'marker authority identity was prepopulated'
  for source_object in "$marker_object" "$authority_object"; do
    [[ $source_object == "$marker_object" ]] && \
      source_label='production transition marker authority' || \
      source_label='production forward host authority'
    staged=$staging/library.sh
    GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
      git -C "$REPO" cat-file blob "$source_object" > "$staged" || \
      production_transition_host_fail "$source_label blob cannot be staged"
    chmod 0400 "$staged" || production_transition_host_fail \
      "$source_label blob cannot be protected"
    exec {fd}<"$staged" || production_transition_host_fail \
      "$source_label blob cannot be opened"
    rm -f "$staged"
    if builtin source "/dev/fd/$fd"; then
      :
    else
      exec {fd}<&-
      production_transition_host_fail "$source_label could not be loaded"
    fi
    exec {fd}<&-
    [[ $source_object != "$marker_object" ]] ||
      readonly PRODUCTION_TRANSITION_HOST_MARKER_OBJECT=$source_object
  done
  rmdir "$staging"
}
production_transition_host_try_forward_handoff() {
  local action=$1 target=$2 current base
  [[ $action =~ ^(plan|upload|deploy)$ ]] || return 1
  current=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
    git -C "$REPO" rev-parse --verify 'HEAD^{commit}' 2>/dev/null) || return 1
  [[ $current == "$target" ]] || return 1
  base=$(production_transition_host_read_base) || return 1
  production_transition_host_require_exact_remote_main "$target"
  production_transition_host_derive_forward_graph "$target" "$base" || return 1
  production_transition_host_load_forward_authority \
    "$base" "$PRODUCTION_TRANSITION_FORWARD_H" "$target"
  production_forward_require_exact_handoff "$base" "$target" "$action"
  production_transition_host_seal_prelude_commit "$current"
}
production_transition_host_preflight_prelude() {
  local action=$1 target=$2 record parsed status base recorded_target target_tree
  local current fresh=true
  production_transition_host_acquire_lock
  if [[ $action != deploy-transition ]]; then
    if production_transition_host_try_forward_handoff "$action" "$target"; then
      return 0
    fi
    if record=$(production_transition_host_read_state); then
      parsed=$(production_transition_host_parse_state "$record")
      read -r status _ recorded_target _ <<< "$parsed"
      [[ $status == terminal ]] || \
        production_transition_host_fail \
          'only exact deploy-transition replay may load production code during an incomplete authenticated transition'
      production_transition_host_require_scheduler_finalized
      production_transition_host_require_exact_remote_main "$target"
      current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
        production_transition_host_fail 'production prelude current commit is unavailable'
      git -C "$REPO" merge-base --is-ancestor "$recorded_target" "$current" && \
        git -C "$REPO" merge-base --is-ancestor "$current" "$target" || \
        production_transition_host_fail \
          'production prelude current commit is not authenticated origin main history'
      production_transition_host_seal_prelude_commit "$current"
      return 0
    fi
    base=$(production_transition_host_read_base)
    current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
      production_transition_host_fail 'production prelude current commit is unavailable'
    [[ $current == "$base" ]] || \
      production_transition_host_fail \
        'first post-B0 production code load requires deploy-transition'
    production_transition_host_seal_prelude_commit "$current"
    return 0
  fi
  validate_sha "$target"
  if record=$(production_transition_host_read_state); then
    parsed=$(production_transition_host_parse_state "$record")
    read -r status base recorded_target target_tree <<< "$parsed"
    [[ $recorded_target == "$target" && \
       ( $status == admitted || $status == terminal ) ]] || \
      production_transition_host_fail \
        'transition prelude target conflicts with durable admission'
    fresh=false
  fi
  production_transition_host_require_exact_remote_main "$target"
  if [[ $fresh == true ]]; then
    base=$(production_transition_host_read_base)
    target_tree=$(git -C "$REPO" rev-parse --verify "$target^{tree}") || \
      production_transition_host_fail 'transition prelude target tree is unavailable'
  else
    [[ $(git -C "$REPO" rev-parse --verify "$target^{tree}") == "$target_tree" ]] || \
      production_transition_host_fail 'transition prelude target tree differs from admission'
  fi
  production_transition_host_require_b0_seals "$base" "$target"
  [[ $target != "$base" ]] || \
    production_transition_host_fail 'authenticated transition target must differ from trusted B0'
  production_transition_host_require_protected_trust_manifest "$base" "$target"
  [[ $fresh != true ]] || \
    production_transition_host_verify_independent_admission \
      "$base" "$target" "$target_tree"
  current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
    production_transition_host_fail 'transition prelude current commit is unavailable'
  [[ $current == "$base" || $current == "$target" ]] || \
    production_transition_host_fail 'transition prelude left authorized B0 to T'
  production_transition_host_seal_prelude_commit "$current"
}
production_transition_host_load_activation_contract() {
  local base=$1
  if declare -F production_transition_deploy_embedded_target >/dev/null && \
     declare -F production_transition_finalize_embedded_scheduler_hold >/dev/null; then
    return 0
  fi
  declare -F source_reviewed_deploy_library >/dev/null || \
    production_transition_host_fail 'trusted reviewed-library loader is unavailable'
  PRODUCTION_TRANSITION_TRUSTED_BASE=$base
  export PRODUCTION_TRANSITION_TRUSTED_BASE
  source_reviewed_deploy_library "$base" \
    ops/deploy/production-deploy-history-lib.sh \
    'production transition deploy history'
  declare -F production_transition_deploy_embedded_target >/dev/null || \
    production_transition_host_fail 'authenticated target activation contract is unavailable'
  declare -F production_transition_finalize_embedded_scheduler_hold >/dev/null || \
    production_transition_host_fail 'authenticated scheduler finalization contract is unavailable'
}
production_transition_require_host_terminal_receipt() {
  local target=$1 record parsed status base recorded_target tree current_tree
  record=$(production_transition_host_read_state) || \
    production_transition_host_fail 'scheduler finalization has no host terminal receipt'
  parsed=$(production_transition_host_parse_state "$record")
  read -r status base recorded_target tree <<< "$parsed"
  [[ $status == terminal && $recorded_target == "$target" ]] || \
    production_transition_host_fail 'scheduler finalization host receipt differs from target'
  current_tree=$(git -C "$REPO" rev-parse --verify "$target^{tree}") || \
    production_transition_host_fail 'scheduler finalization target tree is unavailable'
  [[ $current_tree == "$tree" ]] || \
    production_transition_host_fail 'scheduler finalization target tree differs from host receipt'
}
production_transition_require_runtime_terminal_receipts() {
  local target=$1 current backend bootstrap
  current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || return 1
  [[ $current == "$target" ]] || \
    production_transition_host_fail 'terminal runtime receipt requires exact target checkout'
  backend=$(marker_value backend) || return 1
  bootstrap=$(marker_value postgres-pool-bootstrap) || return 1
  [[ $bootstrap == "$target" ]] || \
    production_transition_host_fail 'terminal runtime receipt requires the migration marker'
  postgres_pool_bootstrap_installed "$target" || \
    production_transition_host_fail 'terminal runtime receipt lacks installed migration bootstrap'
  component_changed backend "$target" "${BACKEND_PATHS[@]}" && \
    production_transition_host_fail 'terminal runtime receipt lacks backend health completion'
  git -C "$REPO" merge-base --is-ancestor "$backend" "$target" || \
    production_transition_host_fail 'terminal runtime backend receipt is outside target ancestry'
}
production_transition_deploy_authenticated_target() {
  local target=$1 base target_tree record parsed status recorded_target
  local fresh=true terminal_recovery=false
  validate_sha "$target"
  production_transition_host_acquire_lock
  if record=$(production_transition_host_read_state); then
    parsed=$(production_transition_host_parse_state "$record")
    read -r status base recorded_target target_tree <<< "$parsed"
    [[ $recorded_target == "$target" ]] || \
      production_transition_host_fail 'transition host resume target conflicts with admitted target'
    if [[ $status == terminal ]]; then
      terminal_recovery=true
    else
      [[ $status == admitted ]] || \
        production_transition_host_fail "transition host state is not resumable: $parsed"
    fi
    fresh=false
  fi
  production_transition_host_require_exact_remote_main "$target"
  if [[ $fresh == true ]]; then
    base=$(production_transition_host_read_base)
    target_tree=$(git -C "$REPO" rev-parse --verify "$target^{tree}") || \
      production_transition_host_fail 'transition target tree is unavailable'
  else
    [[ $(git -C "$REPO" rev-parse --verify "$target^{tree}") == "$target_tree" ]] || \
      production_transition_host_fail 'resumed transition target tree differs'
  fi
  production_transition_host_require_b0_seals "$base" "$target"
  [[ $target != "$base" ]] || \
    production_transition_host_fail 'authenticated transition target must differ from trusted B0'
  production_transition_host_require_protected_trust_manifest "$base" "$target"
  if [[ $terminal_recovery == true ]]; then
    PRODUCTION_TRANSITION_AUTHENTICATED_BASE=$base
    PRODUCTION_TRANSITION_AUTHENTICATED_TARGET=$target
    export PRODUCTION_TRANSITION_AUTHENTICATED_BASE PRODUCTION_TRANSITION_AUTHENTICATED_TARGET
    production_transition_host_load_activation_contract "$base" || \
      production_transition_host_fail 'authenticated terminal recovery contract could not be loaded'
    production_transition_finalize_embedded_scheduler_hold "$target" || \
      production_transition_host_fail 'authenticated terminal scheduler finalization failed'
    printf 'production-transition-deployed trusted-base=%s target=%s repository=%s\n' \
      "$base" "$target" "$PRODUCTION_TRANSITION_REPOSITORY"
    return 0
  fi
  production_transition_host_verify_independent_admission \
    "$base" "$target" "$target_tree"
  [[ $fresh != true ]] || \
    production_transition_host_write_state admitted "$base" "$target" "$target_tree"
  PRODUCTION_TRANSITION_AUTHENTICATED_BASE=$base
  PRODUCTION_TRANSITION_AUTHENTICATED_TARGET=$target
  export PRODUCTION_TRANSITION_AUTHENTICATED_BASE PRODUCTION_TRANSITION_AUTHENTICATED_TARGET
  production_transition_host_load_activation_contract "$base" || \
    production_transition_host_fail 'authenticated target activation contract could not be loaded'
  production_transition_deploy_embedded_target "$target" || \
    production_transition_host_fail 'authenticated target activation failed'
  [[ $(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') == "$target" ]] || \
    production_transition_host_fail 'authenticated deployment did not activate exact target'
  [[ $(production_transition_host_read_base) == "$target" ]] || \
    production_transition_host_fail 'authenticated deployment did not commit exact control marker'
  production_transition_host_write_state terminal "$base" "$target" "$target_tree" || \
    production_transition_host_fail 'authenticated host terminal receipt did not commit'
  production_transition_host_failpoint terminal-after-marker
  production_transition_finalize_embedded_scheduler_hold "$target" || \
    production_transition_host_fail 'authenticated terminal scheduler finalization failed'
  printf 'production-transition-deployed trusted-base=%s target=%s repository=%s\n' \
    "$base" "$target" "$PRODUCTION_TRANSITION_REPOSITORY"
}
sync_production_transition_b0_control() {
  local sha=$1 relative source destination mode
  while read -r mode relative; do
    source=$REPO/$relative
    [[ -f $source && ! -L $source ]] || \
      production_transition_host_fail "target is missing ${relative##*/}"
    [[ $(git -C "$REPO" hash-object --no-filters "$source") == \
       $(git -C "$REPO" rev-parse "$sha:$relative") ]] || \
      production_transition_host_fail "target worktree ${relative##*/} differs from target blob"
    destination=$CONTROL/${relative##*/}
    install -m "$mode" -o root -g root "$source" "$destination.next"
    mv -T "$destination.next" "$destination"
    [[ $(git -C "$REPO" hash-object --no-filters "$destination") == \
       $(git -C "$REPO" rev-parse "$sha:$relative") ]] || \
      production_transition_host_fail "installed ${relative##*/} differs from target blob"
  done <<'CONTROL_SPECS'
0755 ops/deploy/production-transition-admission.sh
0644 ops/deploy/production-transition-b0-host-control.sh
0644 ops/deploy/production-transition-canonical-lib.sh
CONTROL_SPECS
}
production_transition_sync_control_entrypoint() { local sha=${1:-} source=$REPO/ops/deploy/social-monitor-production-deploy.sh \
    destination=$CONTROL/github-production-deploy.sh
  [[ -f $source ]] || return 0
  if declare -F production_forward_sync_handoff_blob >/dev/null; then
    [[ $sha =~ ^[0-9a-f]{40}$ ]] || \
      sha=$(GIT_NO_REPLACE_OBJECTS=1 GIT_NO_LAZY_FETCH=1 \
        git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
        production_transition_host_fail 'target deploy entrypoint commit is unavailable'
    production_forward_sync_handoff_blob "$sha" ops/deploy/social-monitor-production-deploy.sh "$destination" 0755 100644
    return
  fi
  install -m 0755 -o root -g root "$source" "$destination.next"
  mv -f "$destination.next" "$destination"
  cmp -s "$source" "$destination" || \
    production_transition_host_fail 'installed deploy entrypoint differs from reviewed source'
}
production_transition_sync_control_script() { local sha=$1 wrapper_source=$REPO/ops/deploy/social-monitor-production-ssh-wrapper.sh
  local wrapper_destination=$CONTROL/github-production-deploy-wrapper.sh
  local auth_refresh_source=$REPO/ops/deploy/host/refresh-codex-auth.sh \
    auth_refresh_destination=$CONTROL/refresh-codex-auth.sh
  [[ -f $REPO/ops/deploy/social-monitor-production-deploy.sh ]] || return 0
  if [[ -f $wrapper_source ]]; then
    if declare -F production_forward_sync_handoff_blob >/dev/null; then
      production_forward_sync_handoff_blob "$sha" ops/deploy/social-monitor-production-ssh-wrapper.sh "$wrapper_destination" 0755 100755
    else
      install -m 0755 -o root -g root "$wrapper_source" "$wrapper_destination.next"
      mv -f "$wrapper_destination.next" "$wrapper_destination"
    fi
    production_transition_host_failpoint forward-wrapper-synced
  fi
  if [[ -f $auth_refresh_source ]]; then
    install -m 0700 -o root -g root "$auth_refresh_source" "$auth_refresh_destination.next"
    mv -f "$auth_refresh_destination.next" "$auth_refresh_destination"
    [[ $(stat -c '%U:%G:%a' "$auth_refresh_destination") == root:root:700 ]] || \
      production_transition_host_fail 'subscription auth refresh ownership or mode is invalid after sync'
  fi
  if x_collector_target_has_tracked_dockerfile "$sha"; then sync_x_collector_dockerfile "$sha"; fi
  sync_production_transition_b0_control "$sha"
  production_transition_sync_control_entrypoint "$sha"
  production_transition_host_failpoint forward-entrypoint-synced
}
verify_host_policy() {
  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] && return 0
  ((EUID == 0)) || return 0
  [[ $(stat -c '%U:%G:%a' "$CONTROL/github-production-deploy.sh") == root:root:755 ]] || \
    production_transition_host_fail 'root deploy entrypoint ownership or mode is invalid'
  [[ $(stat -c '%U:%G:%a' "$CONTROL/github-production-deploy-wrapper.sh") == root:root:755 ]] || \
    production_transition_host_fail 'SSH deploy wrapper ownership or mode is invalid'
  [[ $(stat -c '%U:%G:%a' "$CONTROL/production-transition-admission.sh") == root:root:755 ]] || \
    production_transition_host_fail 'transition admission ownership or mode is invalid'
  [[ $(stat -c '%U:%G:%a' "$CONTROL/production-transition-b0-host-control.sh") == root:root:644 ]] || \
    production_transition_host_fail 'B0 host control ownership or mode is invalid'
  [[ $(stat -c '%U:%G:%a' "$CONTROL/production-transition-canonical-lib.sh") == root:root:644 ]] || \
    production_transition_host_fail 'canonical library ownership or mode is invalid'
  if id -nG social-monitor-deploy | tr ' ' '\n' | grep -qx docker; then
    production_transition_host_fail 'deploy user must not belong to the docker group'
  fi
  local sudoers=/etc/sudoers.d/social-monitor-deploy
  [[ $(stat -c '%U:%G:%a' "$sudoers") == root:root:440 ]] || \
    production_transition_host_fail 'deploy sudoers ownership or mode is invalid'
  [[ $(cat "$sudoers") == 'social-monitor-deploy ALL=(root) NOPASSWD: /var/data/social-monitor/control/github-production-deploy.sh *' ]] || \
    production_transition_host_fail 'deploy sudoers content is not project-scoped'
  visudo -cf "$sudoers" >/dev/null || \
    production_transition_host_fail 'deploy sudoers policy is invalid'
  local sudo_commands
  sudo_commands=$(LC_ALL=C sudo -l -U social-monitor-deploy | \
    sed -n '/may run the following commands/,$p' | tail -n +2 | sed '/^[[:space:]]*$/d; s/^[[:space:]]*//')
  [[ $sudo_commands == '(root) NOPASSWD: /var/data/social-monitor/control/github-production-deploy.sh *' ]] || \
    production_transition_host_fail 'deploy user has unexpected sudo authority'
  local ssh_policy
  ssh_policy=$(sshd -T -C user=social-monitor-deploy,host=localhost,addr=127.0.0.1)
  for expectation in \
    'passwordauthentication no' \
    'kbdinteractiveauthentication no' \
    'disableforwarding yes' \
    'allowagentforwarding no' \
    'allowtcpforwarding no' \
    'x11forwarding no' \
    'permittty no' \
    'forcecommand /var/data/social-monitor/control/github-production-deploy-wrapper.sh'; do
    grep -Fx "$expectation" <<< "$ssh_policy" >/dev/null || \
      production_transition_host_fail "missing SSH policy: $expectation"
  done
}
commit_postgres_pool_bootstrap() {
  production_transition_commit_postgres_pool_bootstrap "$@"
}
