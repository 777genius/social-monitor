#!/usr/bin/env bash
PRODUCTION_TRANSITION_BACKEND_BASE=05744f99b2d13e47a64a7ff12ea2ab8893f5e88a
PRODUCTION_TRANSITION_ENTRYPOINT_PATH=ops/deploy/social-monitor-production-deploy.sh
PRODUCTION_TRANSITION_ANCHOR_BASE=${PRODUCTION_TRANSITION_ANCHOR_BASE:-bb4b3f8a0e81ed371aaef5bf362afaaaaacf3c30}
PRODUCTION_TRANSITION_BRIDGE_BASE=${PRODUCTION_TRANSITION_TRUSTED_BASE:-}
PRODUCTION_TRANSITION_REPOSITORY_ID=777genius/social-monitor
PRODUCTION_TRANSITION_AUDIENCE=production-deploy
PRODUCTION_TRANSITION_SIGNATURE_NAMESPACE=git
PRODUCTION_TRANSITION_LEASE_REF=refs/heads/main
PRODUCTION_TRANSITION_ACTIVE_PAYLOAD_CONTRACT_PATH=ops/deploy/production-transition-bridge.manifest
PRODUCTION_TRANSITION_ACTIVE_PAYLOAD_CONTRACT_VERSION=social-monitor-production-transition-inert-p6-v2
PRODUCTION_TRANSITION_TARGET_CONTRACT_VERSION=social-monitor-production-transition-target-v2
PRODUCTION_TRANSITION_PAYLOAD_CONTRACT_VERSION=social-monitor-production-transition-inert-p6-v2
PRODUCTION_TRANSITION_REVIEW_CONTRACT_VERSION=social-monitor-production-transition-canonical-review-v2
PRODUCTION_TRANSITION_REVIEW_SIGNER_PATH=ops/deploy/production-transition-review.allowed_signers
PRODUCTION_TRANSITION_TARGET_SIGNER_PATH=ops/deploy/production-transition-target.allowed_signers
PRODUCTION_TRANSITION_REVIEW_STATEMENT_PATH=ops/deploy/production-transition-review.statement
PRODUCTION_TRANSITION_REVIEW_SIGNATURE_PATH=ops/deploy/production-transition-review.statement.sig
PRODUCTION_TRANSITION_MARKER_LIBRARY_PATH=ops/deploy/production-transition-marker-lib.sh
PRODUCTION_TRANSITION_TARGET_LIBRARY_PATH=ops/deploy/production-transition-target-lib.sh
PRODUCTION_TRANSITION_REVIEW_SIGNER_PRINCIPAL=production-transition-review
PRODUCTION_TRANSITION_REVIEW_SIGNER_FINGERPRINT=SHA256:RQ/JZlrtmTgY4lNHhyzQnxI4IjQZ47Xt/Pu00ppuUaA
PRODUCTION_TRANSITION_TARGET_SIGNER_PRINCIPAL=production-transition-target
PRODUCTION_TRANSITION_TARGET_SIGNER_FINGERPRINT=SHA256:qVOLECole+i4fHxRbDvz5kw+f0J5l2jVHi795GeCAT0
PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT=${PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT:-$PRODUCTION_TRANSITION_REVIEW_SIGNER_FINGERPRINT}
PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT=${PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT:-$PRODUCTION_TRANSITION_TARGET_SIGNER_FINGERPRINT}
PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH=${PRODUCTION_TRANSITION_EFFECTIVE_NOW_EPOCH:-${PRODUCTION_TRANSITION_NOW_EPOCH:-}}
PRODUCTION_TRANSITION_ACTIVATED_MARKER=production-transition-activated.sha
PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER=production-transition-review-consumption.v2
PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_LOCK=production-transition-review-consumption.lock
PRODUCTION_TRANSITION_SCHEDULER_HOLD_MARKER=production-transition-scheduler-hold.v2
PRODUCTION_TRANSITION_S2_MANIFEST_SERIALIZATION=git-changed-destination-tombstone-v2
PRODUCTION_TRANSITION_BRIDGE_SHA_NOT_READY=0000000000000000000000000000000000000000
if [[ ${BASH_SOURCE[0]} =~ ^/dev/fd/[0-9]+$ ]] && \
   declare -F source_bootstrapped_deploy_library >/dev/null; then
  source_bootstrapped_deploy_library "$DEPLOY_CONTROL_BOOTSTRAP_SHA" \
    ops/deploy/production-transition-canonical-lib.sh 'transition canonical library'
  source_bootstrapped_deploy_library "$DEPLOY_CONTROL_BOOTSTRAP_SHA" \
    ops/deploy/production-transition-review-lib.sh 'transition review library'
  source_bootstrapped_deploy_library "$DEPLOY_CONTROL_BOOTSTRAP_SHA" \
    "$PRODUCTION_TRANSITION_MARKER_LIBRARY_PATH" 'transition marker library'
elif [[ ${BASH_SOURCE[0]} =~ ^/dev/fd/[0-9]+$ ]]; then
  [[ ${sha:-} =~ ^[0-9a-f]{40}$ ]] || fail 'reviewed dependency context is malformed'
  source_reviewed_deploy_library "$sha" \
    ops/deploy/production-transition-canonical-lib.sh 'transition canonical library'
  source_reviewed_deploy_library "$sha" \
    ops/deploy/production-transition-review-lib.sh 'transition review library'
  source_reviewed_deploy_library "$sha" \
    "$PRODUCTION_TRANSITION_MARKER_LIBRARY_PATH" 'transition marker library'
else
  PRODUCTION_TRANSITION_HISTORY_LIB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  # shellcheck source=ops/deploy/production-transition-canonical-lib.sh
  source "$PRODUCTION_TRANSITION_HISTORY_LIB_DIR/production-transition-canonical-lib.sh"
  # shellcheck source=ops/deploy/production-transition-review-lib.sh
  source "$PRODUCTION_TRANSITION_HISTORY_LIB_DIR/production-transition-review-lib.sh"
  # shellcheck source=ops/deploy/production-transition-marker-lib.sh
  source "$PRODUCTION_TRANSITION_HISTORY_LIB_DIR/production-transition-marker-lib.sh"
  unset PRODUCTION_TRANSITION_HISTORY_LIB_DIR
fi
declare -F production_transition_verify_canonical_review >/dev/null || \
  fail 'production transition canonical verifier is unavailable'
production_deploy_file_identity() {
  local path=$1
  [[ -f $path && ! -L $path ]] || return 1
  stat -c '%d:%i:%f:%s:%y:%z' "$path"
}
marker_value() {
  local component=$1 marker value identity_before identity_after
  marker=$STATE/$component.sha

  if [[ ! -e $marker && ! -L $marker ]]; then
    return 0
  fi
  [[ -f $marker && ! -L $marker ]] || {
    printf 'deploy-error: %s marker is not a regular file\n' "$component" >&2
    return 1
  }
  identity_before=$(production_deploy_file_identity "$marker") || {
    printf 'deploy-error: %s marker identity cannot be read\n' "$component" >&2
    return 1
  }
  [[ $(wc -c < "$marker") == 41 ]] || {
    printf 'deploy-error: %s marker is malformed\n' "$component" >&2
    return 1
  }
  IFS= read -r value < "$marker" || {
    printf 'deploy-error: %s marker cannot be read\n' "$component" >&2
    return 1
  }
  [[ $value =~ ^[0-9a-f]{40}$ ]] || {
    printf 'deploy-error: %s marker is malformed\n' "$component" >&2
    return 1
  }
  identity_after=$(production_deploy_file_identity "$marker") || {
    printf 'deploy-error: %s marker identity cannot be re-read\n' "$component" >&2
    return 1
  }
  [[ $identity_after == "$identity_before" ]] || {
    printf 'deploy-error: %s marker changed while being read\n' "$component" >&2
    return 1
  }
  printf '%s\n' "$value"
}
production_deploy_require_available_ancestor() {
  local label=$1 sha=$2 target=$3
  git -C "$REPO" cat-file -e "$sha^{commit}" 2>/dev/null || \
    fail "$label marker commit is unavailable"
  git -C "$REPO" merge-base --is-ancestor "$sha" "$target" || \
    fail "$label marker is not an ancestor of target"
}
component_changed() {
  local component=$1 target=$2 marker
  shift 2

  marker=$(marker_value "$component") || \
    fail "$component marker validation failed"
  [[ -n $marker ]] || return 0
  git -C "$REPO" cat-file -e "$marker^{commit}" 2>/dev/null || \
    fail "$component marker commit is unavailable"
  if [[ $marker == "$target" ]]; then
    return 1
  fi
  if git -C "$REPO" merge-base --is-ancestor "$target" "$marker"; then
    fail "$component marker is newer than target"
  fi
  git -C "$REPO" merge-base --is-ancestor "$marker" "$target" || \
    fail "$component marker diverged from target"
  ! git -C "$REPO" diff --quiet "$marker" "$target" -- "$@"
}
advance_integration() {
  local sha=$1 current
  [[ -z $(git -C "$REPO" status --porcelain) ]] || \
    fail 'integration worktree is dirty'
  current=$(git -C "$REPO" rev-parse 'HEAD^{commit}') || \
    fail 'integration commit cannot be read'
  if git -C "$REPO" merge-base --is-ancestor "$sha" "$current"; then
    return 0
  fi
  git -C "$REPO" merge-base --is-ancestor "$current" "$sha" || \
    fail 'integration worktree cannot fast-forward'
  git -C "$REPO" merge --ff-only --quiet "$sha"
}
production_transition_installed_control_sha() {
  local bootstrap_sha=$1 alternate_sha=${2:-}
  local installed=$CONTROL/github-production-deploy.sh
  local expected_object alternate_object actual_object
  local identity_before identity_after entry alternate_entry
  local mode type object path extra
  identity_before=$(production_deploy_file_identity "$installed") || \
    fail 'installed deploy entrypoint is not a regular file'
  entry=$(git -C "$REPO" ls-tree "$bootstrap_sha" -- \
    "$PRODUCTION_TRANSITION_ENTRYPOINT_PATH") || \
    fail 'bootstrap deploy entrypoint cannot be inspected'
  read -r mode type object path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
     $object =~ ^[0-9a-f]{40}$ && \
     $path == "$PRODUCTION_TRANSITION_ENTRYPOINT_PATH" ]] || \
    fail 'bootstrap deploy entrypoint is not its exact regular blob'
  expected_object=$object
  actual_object=$(git -C "$REPO" hash-object --no-filters "$installed") || \
    fail 'installed deploy entrypoint blob cannot be computed'
  identity_after=$(production_deploy_file_identity "$installed") || \
    fail 'installed deploy entrypoint identity cannot be re-read'
  [[ $identity_after == "$identity_before" ]] || \
    fail 'installed deploy entrypoint changed while being verified'
  if [[ $actual_object != "$expected_object" ]]; then
    [[ $alternate_sha =~ ^[0-9a-f]{40}$ ]] || \
      fail 'installed deploy entrypoint differs from bootstrap marker'
    alternate_entry=$(git -C "$REPO" ls-tree "$alternate_sha" -- \
      "$PRODUCTION_TRANSITION_ENTRYPOINT_PATH") || \
      fail 'alternate deploy entrypoint cannot be inspected'
    read -r mode type alternate_object path extra <<< "$alternate_entry"
    [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
       $alternate_object =~ ^[0-9a-f]{40}$ && \
       $path == "$PRODUCTION_TRANSITION_ENTRYPOINT_PATH" && \
       $actual_object == "$alternate_object" ]] || \
      fail 'installed deploy entrypoint is neither exact bridge nor target'
  fi
  printf '%s\n' "$actual_object"
}
production_transition_active_payload_bridge() {
  local target=$1 p6
  p6=$(production_transition_git -C "$REPO" rev-parse "$target^1") || \
    fail 'transition target P6 cannot be inspected'
  production_transition_git -C "$REPO" rev-parse "$p6^1" || \
    fail 'transition target B0 cannot be inspected'
}
production_transition_complete_tree_manifest_digest() {
  production_transition_git -C "$REPO" ls-tree -r -z --full-tree "$1" | \
    /usr/bin/sha256sum | /usr/bin/awk '{print $1}'
}
production_transition_expected_target_message() {
  production_transition_target_message "$@"
}
production_transition_verify_embedded_review() (
  local target=$1 supplied_statement=${2:-} supplied_signature=${3:-}
  local lifetime=${4:-fresh} b0 signers=''
  cleanup() { [[ -z $signers ]] || /usr/bin/rm -f -- "$signers"; }
  trap cleanup EXIT
  b0=$(production_transition_git -C "$REPO" rev-parse "$target^1^1") || \
    fail 'transition B0 cannot be inspected'
  PRODUCTION_TRANSITION_BRIDGE_BASE=$b0
  signers=$(/usr/bin/mktemp "${TMPDIR:-/tmp}/history-target-signers.XXXXXX")
  production_transition_copy_blob "$b0" "$PRODUCTION_TRANSITION_TARGET_SIGNERS_PATH" \
    "$signers" 'B0 target signers'
  production_transition_verify_target_contract "$target" "$supplied_statement" \
    "$supplied_signature" "$lifetime" "$signers" \
    "$PRODUCTION_TRANSITION_EFFECTIVE_TARGET_FINGERPRINT"
)
production_transition_verify_signed_target() {
  production_transition_verify_embedded_review "$1" '' '' "${2:-fresh}" >/dev/null
}
production_transition_require_lease_push_base() {
  local target=$1 frozen_main=$2 observed_main=$3 signed
  production_transition_verify_signed_target "$target"
  signed=$(production_transition_git -C "$REPO" rev-parse "$target^1^1")
  [[ $signed == "$frozen_main" && $observed_main == "$frozen_main" ]] || \
    fail 'protected main moved or differs from signed B0 lease'
}
production_transition_has_payload_contract() {
  local target=$1 payload entry mode type object path extra first_line
  local -a parents=()

  read -r -a parents <<< "$(git -C "$REPO" \
    rev-list --parents -n 1 "$target" 2>/dev/null)" || return 1
  [[ ${#parents[@]} == 3 && ${parents[0]} == "$target" ]] || return 1
  payload=${parents[1]}
  entry=$(git -C "$REPO" ls-tree "$payload" -- \
    "$PRODUCTION_TRANSITION_ACTIVE_PAYLOAD_CONTRACT_PATH" 2>/dev/null) || \
    return 1
  read -r mode type object path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
     $object =~ ^[0-9a-f]{40}$ && \
     $path == "$PRODUCTION_TRANSITION_ACTIVE_PAYLOAD_CONTRACT_PATH" ]] || \
    return 1
  first_line=$(git -C "$REPO" show \
    "$payload:$PRODUCTION_TRANSITION_ACTIVE_PAYLOAD_CONTRACT_PATH" 2>/dev/null | \
    head -n 1) || return 1
  [[ $first_line == \
     "version=$PRODUCTION_TRANSITION_ACTIVE_PAYLOAD_CONTRACT_VERSION" ]]
}
production_transition_is_transition_shaped() {
  local target=$1 path
  git -C "$REPO" cat-file -e "$target^{commit}" 2>/dev/null || return 1
  for path in \
    "$PRODUCTION_TRANSITION_ACTIVE_PAYLOAD_CONTRACT_PATH" \
    "$PRODUCTION_TRANSITION_REVIEW_SIGNER_PATH" \
    ops/deploy/production-deploy-history-lib.sh \
    ops/deploy/production-transition-publisher.sh; do
    if git -C "$REPO" cat-file -e "$target:$path" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}
production_transition_read_activation_marker() {
  local marker=$STATE/$PRODUCTION_TRANSITION_ACTIVATED_MARKER
  local value identity_before identity_after
  [[ -e $marker || -L $marker ]] || return 1
  [[ -f $marker && ! -L $marker ]] || \
    fail 'production transition activation marker is not a regular file'
  identity_before=$(production_deploy_file_identity "$marker") || \
    fail 'production transition activation marker identity cannot be read'
  [[ $(wc -c < "$marker") == 41 ]] || \
    fail 'production transition activation marker is malformed'
  IFS= read -r value < "$marker" || \
    fail 'production transition activation marker cannot be read'
  validate_sha "$value"
  identity_after=$(production_deploy_file_identity "$marker") || \
    fail 'production transition activation marker identity cannot be re-read'
  [[ $identity_after == "$identity_before" ]] || \
    fail 'production transition activation marker changed while being read'
  production_transition_verify_signed_target "$value" allow-expired
  printf '%s\n' "$value"
}
production_transition_require_ordinary_deploy() {
  local target=$1 activated commit
  if activated=$(production_transition_read_activation_marker); then
    production_deploy_require_available_ancestor \
      'production transition activation' "$activated" "$target"
    return 0
  fi
  if production_transition_is_transition_shaped "$target"; then
    fail 'transition-shaped target requires authenticated transition admission while activation is absent'
  fi
  while IFS= read -r commit; do
    if production_transition_has_payload_contract "$commit"; then
      fail 'post-transition commit requires durable transition activation'
    fi
  done < <(git -C "$REPO" rev-list "$target" 2>/dev/null)
}
production_transition_snapshot() {
  local target=$1 lifetime_policy=${2:-fresh}
  local bridge integration control backend bootstrap installed_object
  validate_sha "$target"
  git -C "$REPO" cat-file -e "$target^{commit}" 2>/dev/null || \
    fail 'transition target commit is unavailable'
  production_transition_verify_signed_target "$target" "$lifetime_policy"
  bridge=$(production_transition_active_payload_bridge "$target") || return 1
  integration=$(git -C "$REPO" rev-parse 'HEAD^{commit}') || \
    fail 'integration commit cannot be read'
  git -C "$REPO" merge-base --is-ancestor "$integration" "$target" || \
    [[ $integration == "$target" ]] || \
    fail 'integration is not the target or its ancestor'
  control=$(marker_value control) || fail 'control marker validation failed'
  backend=$(marker_value backend) || fail 'backend marker validation failed'
  bootstrap=$(marker_value postgres-pool-bootstrap) || \
    fail 'PostgreSQL bootstrap marker validation failed'
  [[ -n $control && -n $backend && -n $bootstrap ]] || \
    fail 'transition marker tuple is incomplete'
  [[ $bootstrap == "$bridge" || $bootstrap == "$target" ]] || \
    fail 'PostgreSQL bootstrap marker is neither the active payload exact bridge nor target'
  production_deploy_require_available_ancestor control "$control" "$target"
  production_deploy_require_available_ancestor backend "$backend" "$target"
  production_deploy_require_available_ancestor \
    'PostgreSQL bootstrap' "$bootstrap" "$target"
  installed_object=$(production_transition_installed_control_sha \
    "$bootstrap" "$target") || \
    return 1
  printf 'integration=%s\ncontrol=%s\nbackend=%s\nbootstrap=%s\ninstalled_control_blob=%s\n' \
    "$integration" "$control" "$backend" "$bootstrap" "$installed_object"
}
production_transition_verify_join_target() {
  local bridge=$1 target=$2 p6 s2 p6_base s2_base
  local -a parents=()
  read -r -a parents <<< "$(git -C "$REPO" \
    rev-list --parents -n 1 "$target" 2>/dev/null)" || \
    fail 'transition target parents cannot be inspected'
  [[ ${#parents[@]} == 3 && ${parents[0]} == "$target" ]] || \
    fail 'transition target does not have exact ordered P6 and S2 parents'
  p6=${parents[1]}; s2=${parents[2]}
  p6_base=$(git -C "$REPO" rev-parse "$p6^1") || \
    fail 'transition P6 base cannot be inspected'
  s2_base=$(git -C "$REPO" rev-parse "$s2^1") || \
    fail 'transition S2 base cannot be inspected'
  [[ $p6_base == "$bridge" && $s2_base == "$bridge" ]] || \
    fail 'transition P6 and S2 are not sole children of exact B0'
}
production_transition_require_target_deploy_state() {
  local target=$1 lifetime_policy=${2:-fresh} output_policy=${3:-silent}
  local snapshot integration='' control='' backend='' bootstrap=''
  local key value classification bridge
  [[ $output_policy == silent || $output_policy == classify ]] || \
    fail 'transition deploy-state output policy is invalid'
  snapshot=$(production_transition_snapshot "$target" "$lifetime_policy") || return 1
  while IFS='=' read -r key value; do
    case $key in
      integration) integration=$value ;;
      control) control=$value ;;
      backend) backend=$value ;;
      bootstrap) bootstrap=$value ;;
    esac
  done <<< "$snapshot"
  [[ $backend == "$PRODUCTION_TRANSITION_BACKEND_BASE" || \
     $backend == "$PRODUCTION_TRANSITION_BRIDGE_BASE" || \
     $backend == "$target" ]] || \
    fail 'transition backend marker is neither an exact bootstrap base nor target'
  if [[ $integration == "$target" && $control == "$target" && \
        $bootstrap == "$target" ]]; then
    classification='runtime-complete'
  elif [[ $integration == "$target" && $bootstrap == "$target" ]]; then
    bridge=$(production_transition_active_payload_bridge "$target") || return 1
    [[ $control == "$bridge" ]] || \
      fail 'transition target bootstrap has mismatched control identity'
    classification='target-control-pending'
  else
    [[ $control == "$bootstrap" && \
       ($backend == "$PRODUCTION_TRANSITION_BACKEND_BASE" || \
        $backend == "$PRODUCTION_TRANSITION_BRIDGE_BASE") ]] || \
      fail 'transition marker tuple is stale, future, or mixed'
    production_transition_verify_join_target "$bootstrap" "$target"
    if [[ $integration == "$bootstrap" ]]; then
      classification='pre-deploy'
    elif [[ $integration == "$target" ]]; then
      classification='target-prepared'
    else
      fail 'transition integration is neither bridge-complete nor target-prepared'
    fi
  fi
  [[ $output_policy == silent ]] || printf '%s\n' "$classification"
}
production_transition_consumption_record() {
  local status=$1 authorization=$2
  printf '%s\n' \
    'version=social-monitor-production-transition-review-consumption-v2' \
    "status=$status" \
    'command-scope=deploy-transition' \
    "$authorization"
}
production_transition_validate_authorization() {
  local authorization=$1 lease_main
  local -a lines=()
  mapfile -t lines <<< "$authorization"
  [[ ${#lines[@]} == 25 && \
     ${lines[0]} =~ ^statement-sha256=[0-9a-f]{64}$ && \
     ${lines[1]} =~ ^signature-sha256=[0-9a-f]{64}$ && \
     ${lines[2]} =~ ^review-id=[0-9a-f]{64}$ && \
     ${lines[3]} == "review-repository=$PRODUCTION_TRANSITION_REPOSITORY_ID" && \
     ${lines[4]} =~ ^review-b0=[0-9a-f]{40}$ && \
     ${lines[5]} =~ ^review-s2=[0-9a-f]{40}$ && \
     ${lines[6]} =~ ^review-p6=[0-9a-f]{40}$ && \
     ${lines[7]} =~ ^review-run-id=[A-Za-z0-9._:-]{1,128}$ && \
     ${lines[8]} == "review-workflow-ref=$PRODUCTION_TRANSITION_WORKFLOW_REF" && \
     ${lines[9]} == "review-workflow-head=${lines[4]#review-b0=}" && \
     ${lines[10]} == "review-producer=$PRODUCTION_TRANSITION_REVIEW_PRODUCER" && \
     ${lines[11]} =~ ^review-transition-id=[A-Za-z0-9._:-]{1,128}$ && \
     ${lines[12]} == "review-audience=$PRODUCTION_TRANSITION_AUDIENCE" && \
     ${lines[13]} == 'review-signature-namespace=git' && \
     ${lines[14]} =~ ^review-replay-id=[A-Za-z0-9._:-]{16,128}$ && \
     ${lines[15]} == "review-lease-ref=$PRODUCTION_TRANSITION_LEASE_REF" && \
     ${lines[16]} == "review-lease-main=${lines[4]#review-b0=}" && \
     ${lines[17]} =~ ^review-issued-at=[0-9]+$ && \
     ${lines[18]} =~ ^review-expires-at=[0-9]+$ && \
     ${lines[19]} == "review-signer-principal=$PRODUCTION_TRANSITION_REVIEW_PRINCIPAL" && \
     ${lines[20]} == "review-signer-fingerprint=$PRODUCTION_TRANSITION_EFFECTIVE_REVIEW_FINGERPRINT" && \
     ${lines[21]} == "s2=${lines[5]#review-s2=}" && \
     ${lines[22]} == "p6=${lines[6]#review-p6=}" && \
     ${lines[23]} =~ ^t=[0-9a-f]{40}$ && \
     ${lines[24]} == "lease-current-main=${lines[4]#review-b0=}" ]] || \
    fail 'transition canonical authorization record is malformed'
  lease_main=$(production_transition_git -C "$REPO" rev-parse "${lines[22]#p6=}^1") || \
    fail 'transition authorization lease cannot be inspected'
  [[ $lease_main == "${lines[24]#lease-current-main=}" ]] || \
    fail 'transition authorization lease differs from exact P6 parent'
}
production_transition_read_consumption_record() {
  local marker=$STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER
  local identity_before identity_after value
  [[ -f $marker && ! -L $marker ]] || \
    fail 'transition review consumption record is unsafe'
  identity_before=$(production_deploy_file_identity "$marker") || \
    fail 'transition review consumption record identity cannot be read'
  value=$(<"$marker")
  identity_after=$(production_deploy_file_identity "$marker") || \
    fail 'transition review consumption record identity cannot be re-read'
  [[ $identity_after == "$identity_before" ]] || \
    fail 'transition review consumption record changed while being read'
  printf '%s\n' "$value"
}
production_transition_begin_consumption() {
  local authorization=$1 fresh=$2
  local marker=$STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER
  local expected_pending expected_runtime expected_complete actual
  production_transition_validate_authorization "$authorization"
  [[ $fresh == true || $fresh == false ]] || \
    fail 'transition review freshness state is invalid'
  production_transition_reconcile_consumption_next "$authorization" || return 1
  expected_pending=$(production_transition_consumption_record pending "$authorization")
  expected_runtime=$(production_transition_consumption_record runtime-complete "$authorization")
  expected_complete=$(production_transition_consumption_record complete "$authorization")
  if [[ ! -e $marker && ! -L $marker ]]; then
    [[ $fresh == true ]] || \
      fail 'new transition review consumption requires unexpired signed evidence'
    production_transition_write_consumption pending "$authorization"
    printf 'claimed\n'
    return 0
  fi
  actual=$(production_transition_read_consumption_record)
  if [[ $actual == "$expected_pending" || $actual == "$expected_runtime" ]]; then
    printf 'resume\n'
    return 0
  fi
  if [[ $actual == "$expected_complete" ]]; then
    if production_transition_scheduler_hold_exists; then
      printf 'terminal\n'
      return 0
    fi
    fail 'transition review identity was already consumed successfully'
    return 1
  fi
  fail 'transition review identity is bound to another S2, P6, or T'
}
production_transition_discriminate_state() {
  local target=$1 authorization record expected_pending expected_runtime expected_complete state activated
  production_transition_verify_signed_target "$target" allow-expired
  authorization=$(production_transition_verify_embedded_review \
    "$target" '' '' allow-expired) || return 1
  production_transition_reconcile_consumption_next "$authorization" || return 1
  if [[ ! -e $STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER && \
        ! -L $STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER ]] && \
      production_transition_s2_bootstrap_pending "$target" "$authorization"; then
    state='bootstrap-pending'
    printf '%s\n' \
      'version=social-monitor-production-transition-state-v1' \
      "state=$state" 'command-scope=deploy-transition' "$authorization"
    return 0
  fi
  declare -F production_transition_reconcile_target_effect_markers >/dev/null && \
    production_transition_reconcile_target_effect_markers "$target"
  expected_pending=$(production_transition_consumption_record pending "$authorization")
  expected_runtime=$(production_transition_consumption_record runtime-complete "$authorization")
  expected_complete=$(production_transition_consumption_record complete "$authorization")
  if [[ -e $STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER || \
        -L $STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER ]]; then
    record=$(production_transition_read_consumption_record)
    if [[ $record == "$expected_complete" ]]; then
      activated=$(production_transition_read_activation_marker) || \
        fail 'terminal transition has no durable activation marker'
      [[ $activated == "$target" ]] || \
        fail 'terminal transition activation differs from exact target'
      state=terminal
    elif [[ $record == "$expected_pending" || $record == "$expected_runtime" ]]; then
      if [[ $record == "$expected_runtime" ]] && \
          activated=$(production_transition_read_activation_marker) && \
          [[ $activated == "$target" ]]; then
        :
      else
        production_transition_require_target_deploy_state "$target" allow-expired
      fi
      state=pending
    else
      fail 'transition review identity is bound to another S2, P6, or T'
    fi
  else
    production_transition_require_target_deploy_state "$target" allow-expired
    production_transition_read_activation_marker >/dev/null 2>&1 && \
      fail 'completed transition has no resumable pending review authority'
    state=ready
  fi
  printf '%s\n' \
    'version=social-monitor-production-transition-state-v1' \
    "state=$state" 'command-scope=deploy-transition' "$authorization"
}
production_transition_complete_consumption() {
  local authorization=$1 activated target
  production_transition_validate_authorization "$authorization"
  target=$(sed -n 's/^t=//p' <<< "$authorization")
  activated=$(production_transition_read_activation_marker) || \
    fail 'transition activation must commit before review consumption completes'
  [[ $activated == "$target" ]] || \
    fail 'transition activation differs from review consumption target'
  production_transition_write_consumption complete "$authorization"
}
production_transition_commit_runtime_completion() {
  local target=$1 record authorization expected_authorization
  local expected_pending expected_runtime receipt_target
  [[ -e $STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER || \
     -L $STATE/$PRODUCTION_TRANSITION_REVIEW_CONSUMPTION_MARKER ]] || return 0
  record=$(production_transition_read_consumption_record)
  authorization=$(tail -n +4 <<< "$record")
  receipt_target=$(sed -n 's/^t=//p' <<< "$authorization")
  [[ $receipt_target == "$target" ]] || return 0
  expected_authorization=$(production_transition_verify_embedded_review \
    "$target" '' '' allow-expired)
  [[ $authorization == "$expected_authorization" ]] || \
    fail 'transition runtime completion receipt authorization is tampered'
  expected_pending=$(production_transition_consumption_record pending "$authorization")
  expected_runtime=$(production_transition_consumption_record runtime-complete "$authorization")
  [[ $record != "$expected_runtime" ]] || return 0
  [[ $record == "$expected_pending" ]] || \
    fail 'transition runtime completion receipt is not exact pending authority'
  production_transition_require_target_deploy_state "$target" allow-expired
  production_transition_write_consumption runtime-complete "$authorization"
}
if [[ ${BASH_SOURCE[0]} =~ ^/dev/fd/[0-9]+$ ]] && \
   declare -F source_bootstrapped_deploy_library >/dev/null; then
  source_bootstrapped_deploy_library "$DEPLOY_CONTROL_BOOTSTRAP_SHA" \
    "$PRODUCTION_TRANSITION_TARGET_LIBRARY_PATH" \
    'production transition target library'
elif [[ ${BASH_SOURCE[0]} =~ ^/dev/fd/[0-9]+$ ]]; then
  source_reviewed_deploy_library "$sha" \
    "$PRODUCTION_TRANSITION_TARGET_LIBRARY_PATH" \
    'production transition target library'
else
  PRODUCTION_TRANSITION_HISTORY_LIB_DIR=$(cd \
    "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  # shellcheck source=ops/deploy/production-transition-target-lib.sh
  source "$PRODUCTION_TRANSITION_HISTORY_LIB_DIR/production-transition-target-lib.sh"
  unset PRODUCTION_TRANSITION_HISTORY_LIB_DIR
fi
