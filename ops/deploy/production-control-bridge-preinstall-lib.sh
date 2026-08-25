#!/usr/bin/env bash

# Target-specific, resumable bootstrap for the 92afd production control bridge.
# This file is sourced only after the outer operator command has authenticated
# the checkout and tracked driver with trusted git/shell primitives.
PRODUCTION_CONTROL_BRIDGE_JOURNAL_VERSION=production-control-bridge-v1

production_control_bridge_journal_path() {
  printf '%s/production-control-bridge-%s.transaction\n' "$STATE" "$1"
}

production_control_bridge_receipt_path() {
  printf '%s/production-control-bridge-%s.receipt\n' "$STATE" "$1"
}

deploy_control_production_bridge_exact_marker() {
  local marker=$1 expected=$2 label=$3 value before after
  [[ -f $marker && ! -L $marker && $(wc -c < "$marker") == 41 ]] || \
    fail "$label marker is not an exact regular file"
  before=$(deploy_control_bridge_file_identity "$marker") || \
    fail "$label marker identity cannot be inventoried"
  IFS= read -r value < "$marker" || fail "$label marker cannot be read"
  after=$(deploy_control_bridge_file_identity "$marker") || \
    fail "$label marker identity cannot be re-inventoried"
  [[ $value == "$expected" && $after == "$before" ]] || \
    fail "$label marker differs from the reviewed state"
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    [[ $(stat -c '%U:%G:%a' "$marker") == root:root:644 ]] || \
      fail "$label marker ownership or mode is invalid"
  else
    [[ $(stat -c '%a' "$marker") == 644 ]] || \
      fail "$label marker mode is invalid"
  fi
  git -C "$REPO" cat-file -e "$value^{commit}" 2>/dev/null || \
    fail "$label marker commit is unavailable"
}

deploy_control_production_bridge_exact_installed_file() {
  local sha=$1 path=$2 installed=$3 label=$4 installed_mode=${5:-755}
  local expected actual before after
  [[ -f $installed && ! -L $installed ]] || fail "$label is not a regular file"
  before=$(deploy_control_bridge_file_identity "$installed") || fail "$label cannot be inventoried"
  expected=$(git -C "$REPO" rev-parse "$sha:$path") || fail "$label reviewed blob is unavailable"
  actual=$(git -C "$REPO" hash-object --no-filters "$installed") || fail "$label digest cannot be read"
  after=$(deploy_control_bridge_file_identity "$installed") || fail "$label cannot be re-inventoried"
  [[ $actual == "$expected" && $after == "$before" ]] || fail "$label differs from reviewed bytes"
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    [[ $(stat -c '%U:%G:%a' "$installed") == "root:root:$installed_mode" ]] || \
      fail "$label ownership or mode is invalid"
  else
    [[ $(stat -c '%a' "$installed") == "$installed_mode" ]] || fail "$label mode is invalid"
  fi
}

production_control_bridge_require_lock_descriptor() {
  local descriptor=$1 path=$2 label=$3 descriptor_identity path_identity
  [[ -f $path && ! -L $path && -e /dev/fd/$descriptor ]] || \
    fail "$label path is not a regular non-symlink file"
  descriptor_identity=$(stat -Lc '%d:%i:%f:%u:%g:%h' "/dev/fd/$descriptor") || \
    fail "$label descriptor cannot be inventoried"
  path_identity=$(stat -c '%d:%i:%f:%u:%g:%h' "$path") || \
    fail "$label path cannot be inventoried"
  [[ $descriptor_identity == "$path_identity" ]] || \
    fail "$label descriptor does not bind the named inode"
  [[ $(stat -Lc '%h' "/dev/fd/$descriptor") == 1 ]] || \
    fail "$label must not be hard linked"
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    [[ $(stat -c '%U:%G' "$path") == root:root ]] || fail "$label ownership is invalid"
  fi
  (( (8#$(stat -c '%a' "$path") & 8#022) == 0 )) || \
    fail "$label write mode is invalid"
}

production_control_bridge_acquire_locks() {
  ((EUID == 0)) || [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] || \
    fail 'production control bridge bootstrap requires root'
  [[ -d $CONTROL && ! -L $CONTROL ]] || fail 'control directory is not exact'
  [[ ${PRODUCTION_CONTROL_BRIDGE_LOCK_FDS_READY:-} == 1 ]] || \
    fail 'production bridge lock descriptors were not opened safely'
  production_control_bridge_validate_host_directory_chains
  production_control_bridge_require_lock_descriptor 9 "$DEPLOY_LOCK" 'deployment lock'
  flock -w 3600 9 || fail 'timed out waiting for deployment lock'
  production_control_bridge_require_lock_descriptor 8 "$POSTGRES_ADMISSION_LOCK" 'PostgreSQL admission lock'
  [[ $(stat -Lc '%d:%i' /dev/fd/9) != $(stat -Lc '%d:%i' /dev/fd/8) ]] || \
    fail 'production bridge locks must have distinct identities'
  acquire_postgres_admission_with_daily_priority 8
}

production_control_bridge_sync_filesystem() {
  local path=$1
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    python3 - "$path" <<'PY' || fail "production bridge test filesystem sync failed: $path"
import os
import sys
descriptor = os.open(sys.argv[1], os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(descriptor)
finally:
    os.close(descriptor)
PY
    return
  fi
  sync -f "$path" || fail "production bridge filesystem sync failed: $path"
}

production_control_bridge_repair_integration() {
  local target=$1 tree=$2 current index_lock untracked
  current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || \
    fail 'integration HEAD cannot be read for repair'
  [[ $current == "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD" || \
     $current == "$target" ]] || fail 'integration HEAD is outside the resumable transition'
  untracked=$(git -C "$REPO" ls-files --others --exclude-standard) || \
    fail 'integration untracked state cannot be inspected'
  [[ -z $untracked ]] || fail 'integration contains untracked files outside bridge repair'
  index_lock=$(git -C "$REPO" rev-parse --path-format=absolute --git-path index.lock) || \
    fail 'integration index lock path cannot be resolved'
  if [[ -e $index_lock || -L $index_lock ]]; then
    [[ -f $index_lock && ! -L $index_lock && $(stat -c '%u:%h' "$index_lock") == "$EUID:1" ]] || \
      fail 'stale integration index lock is unsafe'
    rm -f -- "$index_lock"
  fi
  git -C "$REPO" read-tree --reset -u "$target" || \
    fail 'integration index and worktree could not be repaired'
  production_control_bridge_abort_after_mutation INTEGRATION_INDEX_REWRITTEN
  if [[ $current != "$target" ]]; then
    git -C "$REPO" update-ref HEAD "$target" "$current" || \
      fail 'integration reference could not be advanced atomically'
  fi
  production_control_bridge_sync_filesystem "$REPO"
  [[ $(git -C "$REPO" rev-parse HEAD) == "$target" && \
     $(git -C "$REPO" rev-parse 'HEAD^{tree}') == "$tree" && \
     -z $(git -C "$REPO" status --porcelain=v1 --untracked-files=all) ]] || \
    fail 'integration repair did not reach the exact target tree'
}

production_control_bridge_install_descriptor() {
  local descriptor=$1 destination=$2 installed_mode=$3 reviewed_path=$4 label=$5
  local expected actual next expected_uid=$EUID
  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] || expected_uid=0
  expected=$(git -C "$REPO" rev-parse "$PRODUCTION_CONTROL_BRIDGE_TARGET:$reviewed_path") || \
    fail "$label reviewed blob is unavailable"
  actual=$(git -C "$REPO" hash-object --no-filters "$destination" 2>/dev/null || true)
  if [[ -f $destination && ! -L $destination && $actual == "$expected" && \
        $(stat -c '%u:%a' "$destination" 2>/dev/null || true) == "$expected_uid:$installed_mode" ]]; then
    return 0
  fi
  next=$(mktemp "${destination}.bridge.XXXXXX") || fail "$label temp could not be created"
  trap 'rm -f "$next"' RETURN
  cat "/dev/fd/$descriptor" > "$next" || fail "$label reviewed descriptor could not be copied"
  chmod "0$installed_mode" "$next"
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    chown root:root "$next"
  fi
  production_control_bridge_fsync_file_and_parent "$next"
  mv -f "$next" "$destination"
  production_control_bridge_fsync_file_and_parent "$destination"
  trap - RETURN
  actual=$(git -C "$REPO" hash-object --no-filters "$destination") || \
    fail "$label installed digest cannot be read"
  [[ $actual == "$expected" ]] || fail "$label differs from its open reviewed descriptor"
  [[ ${PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_CONTROL_FILE:-} != "$reviewed_path" ]] || \
    kill -KILL "$BASHPID"
}

production_control_bridge_sync_control() {
  production_control_bridge_install_descriptor 21 \
    "$CONTROL/github-production-deploy.sh" 755 \
    ops/deploy/social-monitor-production-deploy.sh 'deploy entrypoint'
  production_control_bridge_install_descriptor 35 \
    "$CONTROL/github-production-deploy-wrapper.sh" 755 \
    ops/deploy/social-monitor-production-ssh-wrapper.sh 'deploy wrapper'
  production_control_bridge_install_descriptor 36 \
    "$CONTROL/refresh-codex-auth.sh" 700 \
    ops/deploy/host/refresh-codex-auth.sh 'authentication refresh helper'
  production_control_bridge_install_descriptor 37 \
    "$CONTROL/x-collector.Dockerfile" 644 \
    ops/deploy/production-runtime/x-collector.Dockerfile 'X collector Dockerfile'
  production_control_bridge_sync_filesystem "$CONTROL"
}

production_control_bridge_fsync_file_and_parent() {
  local path=$1
  [[ -f $path && ! -L $path ]] || fail 'durable bridge file is not exact'
  python3 - "$path" "$(dirname "$path")" <<'PY' || \
    fail "durable bridge sync failed: $path"
import os
import stat
import sys

for path in sys.argv[1:]:
    item = os.lstat(path)
    if stat.S_ISLNK(item.st_mode):
        raise SystemExit(1)
    flags = os.O_RDONLY | (os.O_DIRECTORY if stat.S_ISDIR(item.st_mode) else 0)
    descriptor = os.open(path, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
PY
}

production_control_bridge_fsync_parent() {
  local path=$1 parent
  parent=$(dirname "$path")
  python3 - "$parent" <<'PY' || fail "durable bridge directory sync failed: $parent"
import os
import sys

descriptor = os.open(sys.argv[1], os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(descriptor)
finally:
    os.close(descriptor)
PY
}

production_control_bridge_write_phase() {
  local journal=$1 phase=$2 target=$3 tree=$4 next
  [[ -f $journal && ! -L $journal ]] || fail 'production bridge journal path is invalid'
  umask 077
  next=$(mktemp "${journal}.phase.XXXXXX") || fail 'production bridge journal temp could not be created'
  trap 'rm -f "$next"' RETURN
  printf 'version=%s\ntarget=%s\ntree=%s\nphase=%s\n' \
    "$PRODUCTION_CONTROL_BRIDGE_JOURNAL_VERSION" "$target" "$tree" "$phase" > "$next"
  chmod 0600 "$next"
  production_control_bridge_fsync_file_and_parent "$next"
  mv -f "$next" "$journal"
  production_control_bridge_fsync_file_and_parent "$journal"
  trap - RETURN
}

production_control_bridge_create_journal() {
  local journal=$1 target=$2 tree=$3 next
  [[ ! -e $journal && ! -L $journal ]] || return 0
  umask 077
  next=$(mktemp "${journal}.create.XXXXXX") || fail 'production bridge journal temp could not be created'
  trap 'rm -f "$next"' RETURN
  printf 'version=%s\ntarget=%s\ntree=%s\nphase=PREPARED\n' \
    "$PRODUCTION_CONTROL_BRIDGE_JOURNAL_VERSION" "$target" "$tree" > "$next"
  chmod 0600 "$next"
  production_control_bridge_fsync_file_and_parent "$next"
  ln "$next" "$journal" || \
    fail 'production bridge journal could not be created exclusively'
  production_control_bridge_fsync_file_and_parent "$journal"
  rm -f "$next"
  production_control_bridge_fsync_parent "$journal"
  trap - RETURN
}

production_control_bridge_read_phase() {
  local journal=$1 target=$2 tree=$3 phase before after newline
  local -a records=()
  [[ -f $journal && ! -L $journal && $(stat -c '%a' "$journal") == 600 ]] || \
    fail 'production bridge journal is not exact'
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    [[ $(stat -c '%U:%G' "$journal") == root:root ]] || \
      fail 'production bridge journal ownership is invalid'
  fi
  before=$(deploy_control_bridge_file_identity "$journal") || \
    fail 'production bridge journal identity cannot be inventoried'
  newline=$(tail -c 1 "$journal" | od -An -t x1 | tr -d '[:space:]')
  mapfile -t records < "$journal"
  production_control_bridge_after_journal_read "$journal"
  after=$(deploy_control_bridge_file_identity "$journal") || \
    fail 'production bridge journal identity cannot be re-inventoried'
  [[ $before == "$after" && $newline == 0a && ${#records[@]} == 4 && \
     ${records[0]} == "version=$PRODUCTION_CONTROL_BRIDGE_JOURNAL_VERSION" && \
     ${records[1]} == "target=$target" && ${records[2]} == "tree=$tree" && \
     ${records[3]} == phase=* ]] || \
    fail 'production bridge journal binding is invalid'
  phase=${records[3]#phase=}
  case $phase in
    PREPARED|INTEGRATION_ADVANCE_PENDING|INTEGRATION_ADVANCED|CONTROL_SYNC_PENDING|CONTROL_SYNCED|RUNTIME_VERIFY_PENDING|RUNTIME_VERIFIED|POOL_MARKER_PENDING|POOL_MARKER_COMMITTED|CONTROL_MARKER_PENDING|CONTROL_MARKER_COMMITTED|RECEIPT_PENDING|RECEIPT_COMMITTED|COMPLETE) ;;
    *) fail 'production bridge journal phase is invalid' ;;
  esac
  printf '%s\n' "$phase"
}

production_control_bridge_after_journal_read() { :; }

production_control_bridge_marker_value() {
  [[ -f $1 && ! -L $1 ]] || return 1
  local value
  IFS= read -r value < "$1" || return 1
  printf '%s\n' "$value"
}

production_control_bridge_require_allowed_marker() {
  local path=$1 label=$2 value=$3 first=$4 second=${5:-}
  [[ $value == "$first" || ( -n $second && $value == "$second" ) ]] || \
    fail "$label marker is outside the phase state"
  deploy_control_production_bridge_exact_marker "$path" "$value" "$label"
}

production_control_bridge_validate_immutable_markers() {
  local phase=$1 target=$2 pool control
  deploy_control_production_bridge_exact_marker \
    "$STATE/frontend.sha" "$DEPLOY_CONTROL_PRODUCTION_FRONTEND_MARKER" frontend
  deploy_control_production_bridge_exact_marker \
    "$STATE/backend.sha" "$DEPLOY_CONTROL_PRODUCTION_BACKEND_MARKER" backend
  pool=$(production_control_bridge_marker_value \
    "$STATE/postgres-pool-bootstrap.sha") || \
    fail 'PostgreSQL bootstrap marker cannot be read'
  control=$(production_control_bridge_marker_value "$STATE/control.sha") || \
    fail 'control marker cannot be read'
  case $phase in
    PREPARED|INTEGRATION_ADVANCE_PENDING|INTEGRATION_ADVANCED|CONTROL_SYNC_PENDING|CONTROL_SYNCED|RUNTIME_VERIFY_PENDING|RUNTIME_VERIFIED)
      production_control_bridge_require_allowed_marker \
        "$STATE/postgres-pool-bootstrap.sha" 'PostgreSQL bootstrap' "$pool" \
        "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER"
      production_control_bridge_require_allowed_marker \
        "$STATE/control.sha" control "$control" \
        "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER"
      ;;
    POOL_MARKER_PENDING)
      production_control_bridge_require_allowed_marker \
        "$STATE/postgres-pool-bootstrap.sha" 'PostgreSQL bootstrap' "$pool" \
        "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" "$target"
      production_control_bridge_require_allowed_marker \
        "$STATE/control.sha" control "$control" \
        "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER"
      ;;
    POOL_MARKER_COMMITTED)
      production_control_bridge_require_allowed_marker \
        "$STATE/postgres-pool-bootstrap.sha" 'PostgreSQL bootstrap' "$pool" "$target"
      production_control_bridge_require_allowed_marker \
        "$STATE/control.sha" control "$control" \
        "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER"
      ;;
    CONTROL_MARKER_PENDING)
      production_control_bridge_require_allowed_marker \
        "$STATE/postgres-pool-bootstrap.sha" 'PostgreSQL bootstrap' "$pool" "$target"
      production_control_bridge_require_allowed_marker \
        "$STATE/control.sha" control "$control" \
        "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" "$target"
      ;;
    CONTROL_MARKER_COMMITTED|RECEIPT_PENDING|RECEIPT_COMMITTED|COMPLETE)
      production_control_bridge_require_allowed_marker \
        "$STATE/postgres-pool-bootstrap.sha" 'PostgreSQL bootstrap' "$pool" "$target"
      production_control_bridge_require_allowed_marker \
        "$STATE/control.sha" control "$control" "$target"
      ;;
    *) fail 'production bridge immutable marker phase is invalid' ;;
  esac
}

production_control_bridge_validate_phase_state() {
  local phase=$1 target=$2 current entry_sha wrapper_sha auth_sha x_sha pool control
  production_control_bridge_validate_immutable_markers "$phase" "$target"
  current=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}') || fail 'integration HEAD is unavailable'
  entry_sha=$(git -C "$REPO" hash-object --no-filters "$CONTROL/github-production-deploy.sh" 2>/dev/null || true)
  wrapper_sha=$(git -C "$REPO" hash-object --no-filters "$CONTROL/github-production-deploy-wrapper.sh" 2>/dev/null || true)
  auth_sha=$(git -C "$REPO" hash-object --no-filters "$CONTROL/refresh-codex-auth.sh" 2>/dev/null || true)
  x_sha=$(git -C "$REPO" hash-object --no-filters "$CONTROL/x-collector.Dockerfile" 2>/dev/null || true)
  pool=$(production_control_bridge_marker_value "$STATE/postgres-pool-bootstrap.sha" || true)
  control=$(production_control_bridge_marker_value "$STATE/control.sha" || true)
  local old_entry old_wrapper old_auth old_x new_entry new_wrapper new_auth new_x
  old_entry=$(git -C "$REPO" rev-parse "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER:ops/deploy/social-monitor-production-deploy.sh")
  old_wrapper=$(git -C "$REPO" rev-parse "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER:ops/deploy/social-monitor-production-ssh-wrapper.sh")
  new_entry=$(git -C "$REPO" rev-parse "$target:ops/deploy/social-monitor-production-deploy.sh")
  new_wrapper=$(git -C "$REPO" rev-parse "$target:ops/deploy/social-monitor-production-ssh-wrapper.sh")
  old_auth=$(git -C "$REPO" rev-parse "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER:ops/deploy/host/refresh-codex-auth.sh")
  old_x=$(git -C "$REPO" rev-parse "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER:ops/deploy/production-runtime/x-collector.Dockerfile")
  new_auth=$(git -C "$REPO" rev-parse "$target:ops/deploy/host/refresh-codex-auth.sh")
  new_x=$(git -C "$REPO" rev-parse "$target:ops/deploy/production-runtime/x-collector.Dockerfile")
  case $phase in
    PREPARED)
      [[ $current == "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD" && $entry_sha == "$old_entry" && \
         $wrapper_sha == "$old_wrapper" && $pool == "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" && \
         $control == "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" && \
         $auth_sha == "$old_auth" && $x_sha == "$old_x" ]] ;;
    INTEGRATION_ADVANCE_PENDING)
      [[ ($current == "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD" || $current == "$target") && \
         $entry_sha == "$old_entry" && $wrapper_sha == "$old_wrapper" && \
         $pool == "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" && \
         $control == "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" && \
         $auth_sha == "$old_auth" && $x_sha == "$old_x" ]] ;;
    INTEGRATION_ADVANCED)
      [[ $current == "$target" && $pool == "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" && \
         $control == "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" && \
         $entry_sha == "$old_entry" && $wrapper_sha == "$old_wrapper" && \
         $auth_sha == "$old_auth" && $x_sha == "$old_x" ]] ;;
    CONTROL_SYNC_PENDING)
      [[ $current == "$target" && $pool == "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" && \
         $control == "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" && \
         ($entry_sha == "$old_entry" || $entry_sha == "$new_entry") && \
         ($wrapper_sha == "$old_wrapper" || $wrapper_sha == "$new_wrapper") && \
         ($auth_sha == "$old_auth" || $auth_sha == "$new_auth") && \
         ($x_sha == "$old_x" || $x_sha == "$new_x") ]] ;;
    CONTROL_SYNCED|RUNTIME_VERIFY_PENDING|RUNTIME_VERIFIED)
      [[ $current == "$target" && $pool == "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" && \
         $control == "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" && \
         $entry_sha == "$new_entry" && $wrapper_sha == "$new_wrapper" && \
         $auth_sha == "$new_auth" && $x_sha == "$new_x" ]] ;;
    POOL_MARKER_PENDING)
      [[ $current == "$target" && $entry_sha == "$new_entry" && $wrapper_sha == "$new_wrapper" && \
         $auth_sha == "$new_auth" && $x_sha == "$new_x" && \
         ($pool == "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" || $pool == "$target") && \
         $control == "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" ]] ;;
    POOL_MARKER_COMMITTED)
      [[ $current == "$target" && $entry_sha == "$new_entry" && $wrapper_sha == "$new_wrapper" && \
         $auth_sha == "$new_auth" && $x_sha == "$new_x" && \
         $pool == "$target" && $control == "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" ]] ;;
    CONTROL_MARKER_PENDING)
      [[ $current == "$target" && $entry_sha == "$new_entry" && $wrapper_sha == "$new_wrapper" && \
         $auth_sha == "$new_auth" && $x_sha == "$new_x" && \
         $pool == "$target" && \
         ($control == "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" || $control == "$target") ]] ;;
    CONTROL_MARKER_COMMITTED|RECEIPT_PENDING|RECEIPT_COMMITTED|COMPLETE)
      [[ $current == "$target" && $entry_sha == "$new_entry" && $wrapper_sha == "$new_wrapper" && \
         $auth_sha == "$new_auth" && $x_sha == "$new_x" && \
         $pool == "$target" && $control == "$target" ]] ;;
  esac || fail "production bridge host state is invalid for phase $phase"
}

production_control_bridge_fail_after() {
  [[ ${PRODUCTION_CONTROL_BRIDGE_FAIL_AFTER:-} != "$1" ]] || \
    fail "injected production bridge failure after $1"
}

production_control_bridge_fail_after_mutation() {
  [[ ${PRODUCTION_CONTROL_BRIDGE_FAIL_AFTER_MUTATION:-} != "$1" ]] || \
    fail "injected production bridge failure after mutation $1 before phase commit"
}

production_control_bridge_abort_after_mutation() {
  [[ ${PRODUCTION_CONTROL_BRIDGE_ABORT_AFTER_MUTATION:-} != "$1" ]] || \
    kill -KILL "$BASHPID"
}

production_control_bridge_advance_phase() {
  local journal=$1 current_phase=$2 next_phase=$3 target=$4 tree=$5
  production_control_bridge_validate_phase_state "$current_phase" "$target"
  production_control_bridge_write_phase "$journal" "$next_phase" "$target" "$tree"
}

production_control_bridge_poststate_text() {
  local target=$1 tree=$2 classification entry wrapper
  classification=$(deploy_control_production_bridge_classification "$target") || return 1
  entry=$(git -C "$REPO" hash-object --no-filters "$CONTROL/github-production-deploy.sh")
  wrapper=$(git -C "$REPO" hash-object --no-filters "$CONTROL/github-production-deploy-wrapper.sh")
  printf 'version=%s\ntarget=%s\ntree=%s\nparent=%s\nfrontend=%s\nbackend=%s\nx_collector=%s\nruntime_control=%s\ncontrol=%s\nintegration=%s\nfrontend_marker=%s\nbackend_marker=%s\ncontrol_marker=%s\npool_marker=%s\nentrypoint_blob=%s\nwrapper_blob=%s\n' \
    "$PRODUCTION_CONTROL_BRIDGE_JOURNAL_VERSION" "$target" "$tree" \
    "$(git -C "$REPO" rev-parse "$target^")" \
    "$(awk -F= '$1=="frontend"{print $2}' <<< "$classification")" \
    "$(awk -F= '$1=="backend"{print $2}' <<< "$classification")" \
    "$(awk -F= '$1=="x_collector"{print $2}' <<< "$classification")" \
    "$(awk -F= '$1=="runtime_control"{print $2}' <<< "$classification")" \
    "$(awk -F= '$1=="control"{print $2}' <<< "$classification")" \
    "$(git -C "$REPO" rev-parse HEAD)" \
    "$(production_control_bridge_marker_value "$STATE/frontend.sha")" \
    "$(production_control_bridge_marker_value "$STATE/backend.sha")" \
    "$(production_control_bridge_marker_value "$STATE/control.sha")" \
    "$(production_control_bridge_marker_value "$STATE/postgres-pool-bootstrap.sha")" "$entry" "$wrapper"
}

production_control_bridge_verify_repository_poststate() {
  local repository=$1 target=$2 tree=$3 label=$4
  [[ $(git -C "$repository" rev-parse HEAD) == "$target" && \
     $(git -C "$repository" rev-parse 'HEAD^{tree}') == "$tree" && \
     -z $(git -C "$repository" status --porcelain=v1 --untracked-files=all) ]] || \
    fail "production bridge $label poststate is not exact"
}

production_control_bridge_verify_host_poststate() {
  local target=$1
  deploy_control_production_bridge_exact_marker "$STATE/frontend.sha" "$DEPLOY_CONTROL_PRODUCTION_FRONTEND_MARKER" frontend
  deploy_control_production_bridge_exact_marker "$STATE/backend.sha" "$DEPLOY_CONTROL_PRODUCTION_BACKEND_MARKER" backend
  deploy_control_production_bridge_exact_marker "$STATE/control.sha" "$target" control
  deploy_control_production_bridge_exact_marker "$STATE/postgres-pool-bootstrap.sha" "$target" 'PostgreSQL bootstrap'
  deploy_control_production_bridge_exact_installed_file "$target" ops/deploy/social-monitor-production-deploy.sh \
    "$CONTROL/github-production-deploy.sh" 'installed deploy entrypoint'
  deploy_control_production_bridge_exact_installed_file "$target" ops/deploy/social-monitor-production-ssh-wrapper.sh \
    "$CONTROL/github-production-deploy-wrapper.sh" 'installed deploy wrapper'
  deploy_control_production_bridge_exact_installed_file "$target" ops/deploy/host/refresh-codex-auth.sh \
    "$CONTROL/refresh-codex-auth.sh" 'installed authentication refresh helper' 700
  deploy_control_production_bridge_exact_installed_file "$target" ops/deploy/production-runtime/x-collector.Dockerfile \
    "$CONTROL/x-collector.Dockerfile" 'installed X collector Dockerfile' 644
  [[ $(deploy_control_production_bridge_classification "$target") == $'frontend=false\nbackend=false\nx_collector=false\nruntime_control=false\ncontrol=true' ]] || \
    fail 'production bridge poststate classification drifted'
}

production_control_bridge_verify_poststate() {
  local target=$1 tree=$2 checkout=${PRODUCTION_CONTROL_BRIDGE_CHECKOUT:?authenticated checkout is required}
  production_control_bridge_verify_repository_poststate "$checkout" "$target" "$tree" 'authenticated checkout'
  production_control_bridge_verify_repository_poststate "$REPO" "$target" "$tree" integration
  production_control_bridge_verify_host_poststate "$target"
}

production_control_bridge_verify_integration_poststate() {
  local target=$1 tree=$2
  production_control_bridge_verify_repository_poststate "$REPO" "$target" "$tree" integration
  production_control_bridge_verify_host_poststate "$target"
}

production_control_bridge_write_receipt() {
  local target=$1 tree=$2 receipt text digest next
  receipt=$(production_control_bridge_receipt_path "$target")
  [[ ! -e $receipt && ! -L $receipt ]] || fail 'production bridge receipt already exists'
  text=$(production_control_bridge_poststate_text "$target" "$tree") || fail 'production bridge evidence cannot be rendered'
  digest=$(printf '%s\n' "$text" | sha256sum | awk '{print $1}')
  umask 077
  next=$(mktemp "${receipt}.create.XXXXXX") || fail 'production bridge receipt temp could not be created'
  trap 'rm -f "$next"' RETURN
  printf '%s\nevidence_sha256=%s\n' "$text" "$digest" > "$next"
  chmod 0444 "$next"
  production_control_bridge_fsync_file_and_parent "$next"
  ln "$next" "$receipt" || \
    fail 'production bridge receipt could not be created exclusively'
  production_control_bridge_fsync_file_and_parent "$receipt"
  rm -f "$next"
  production_control_bridge_fsync_parent "$receipt"
  trap - RETURN
}

production_control_bridge_verify_receipt() {
  local target=$1 tree=$2 receipt expected actual stored
  receipt=$(production_control_bridge_receipt_path "$target")
  [[ -f $receipt && ! -L $receipt && $(stat -c '%a' "$receipt") == 444 ]] || return 1
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    [[ $(stat -c '%U:%G' "$receipt") == root:root ]] || return 1
  fi
  expected=$(production_control_bridge_poststate_text "$target" "$tree") || return 1
  stored=$(sed -n '$s/^evidence_sha256=//p' "$receipt")
  actual=$(printf '%s\n' "$expected" | sha256sum | awk '{print $1}')
  [[ $stored == "$actual" && $(sed '$d' "$receipt") == "$expected" ]]
}

verify_production_control_bridge_host_pre_mutation_state() {
  local integration_tree
  integration_tree=$(git -C "$REPO" rev-parse \
    "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD^{tree}") || \
    fail 'pre-mutation integration tree cannot be resolved'
  production_control_bridge_verify_repository_poststate "$REPO" \
    "$DEPLOY_CONTROL_PRODUCTION_INTEGRATION_HEAD" "$integration_tree" \
    'pre-mutation integration'
  deploy_control_production_bridge_exact_marker "$STATE/frontend.sha" "$DEPLOY_CONTROL_PRODUCTION_FRONTEND_MARKER" frontend
  deploy_control_production_bridge_exact_marker "$STATE/backend.sha" "$DEPLOY_CONTROL_PRODUCTION_BACKEND_MARKER" backend
  deploy_control_production_bridge_exact_marker "$STATE/control.sha" "$DEPLOY_CONTROL_PRODUCTION_CONTROL_MARKER" control
  deploy_control_production_bridge_exact_marker "$STATE/postgres-pool-bootstrap.sha" "$DEPLOY_CONTROL_PRODUCTION_POSTGRES_BOOTSTRAP_MARKER" 'PostgreSQL bootstrap'
  production_control_bridge_validate_phase_state PREPARED "$PRODUCTION_CONTROL_BRIDGE_TARGET"
  verify_production_deploy_host_policy
}

verify_production_control_bridge_pre_mutation_state() {
  local target=$1 journal phase tree
  deploy_control_is_production_bridge_candidate "$target" || return 0
  deploy_control_is_exact_production_bridge "$target" || fail 'production bridge target cannot be authenticated exactly'
  tree=$(git -C "$REPO" rev-parse "$target^{tree}")
  journal=$(production_control_bridge_journal_path "$target")
  [[ -e $journal ]] || fail 'production bridge requires the reviewed one-shot before ordinary deploy'
  phase=$(production_control_bridge_read_phase "$journal" "$target" "$tree")
  [[ $phase == COMPLETE ]] || fail 'partial production bridge transaction is resumable only by the reviewed one-shot'
  production_control_bridge_validate_phase_state COMPLETE "$target"
  production_control_bridge_verify_receipt "$target" "$tree" || fail 'production bridge completion receipt is invalid'
}

production_control_bridge_completed_noop() {
  local target=$1 journal tree phase
  deploy_control_is_production_bridge_candidate "$target" || return 1
  tree=$(git -C "$REPO" rev-parse "$target^{tree}") || fail 'production bridge target tree is unavailable'
  journal=$(production_control_bridge_journal_path "$target")
  [[ -e $journal ]] || fail 'production bridge requires the reviewed one-shot before ordinary deploy'
  phase=$(production_control_bridge_read_phase "$journal" "$target" "$tree")
  [[ $phase == COMPLETE ]] || fail 'partial production bridge transaction is resumable only by the reviewed one-shot'
  production_control_bridge_verify_integration_poststate "$target" "$tree"
  production_control_bridge_verify_receipt "$target" "$tree" || fail 'production bridge completion receipt is invalid'
  printf 'already-deployed-control-bridge=%s receipt_sha256=%s\n' "$target" \
    "$(sed -n '$s/^evidence_sha256=//p' "$(production_control_bridge_receipt_path "$target")")"
}

deploy_production_control_bridge_preinstall() {
  local target=$1 tree=$2 journal phase current marker next
  PRODUCTION_CONTROL_BRIDGE_TARGET=$target
  export PRODUCTION_CONTROL_BRIDGE_TARGET
  deploy_control_is_exact_production_bridge "$target" || fail 'production bridge target cannot be authenticated exactly'
  [[ $(git -C "$REPO" rev-parse "$target^{tree}") == "$tree" ]] || fail 'production bridge target tree changed'
  production_control_bridge_acquire_locks
  [[ -d $STATE && ! -L $STATE && -d $STAGING && ! -L $STAGING && \
     -d $RELEASES && ! -L $RELEASES ]] || \
    fail 'production bridge host directories are not exact'
  journal=$(production_control_bridge_journal_path "$target")
  if [[ ! -e $journal ]]; then
    verify_production_control_bridge_host_pre_mutation_state
    production_control_bridge_create_journal "$journal" "$target" "$tree"
    production_control_bridge_fail_after PREPARED
  fi
  while :; do
    phase=$(production_control_bridge_read_phase "$journal" "$target" "$tree")
    production_control_bridge_validate_phase_state "$phase" "$target"
    case $phase in
      PREPARED)
        production_control_bridge_advance_phase "$journal" PREPARED \
          INTEGRATION_ADVANCE_PENDING "$target" "$tree" ;;
      INTEGRATION_ADVANCE_PENDING)
        current=$(git -C "$REPO" rev-parse HEAD)
        production_control_bridge_validate_phase_state INTEGRATION_ADVANCE_PENDING "$target"
        production_control_bridge_repair_integration "$target" "$tree"
        [[ $current == "$target" ]] || \
          production_control_bridge_abort_after_mutation INTEGRATION_ADVANCED
        [[ $current == "$target" ]] || \
          production_control_bridge_fail_after_mutation INTEGRATION_ADVANCED
        production_control_bridge_advance_phase "$journal" INTEGRATION_ADVANCE_PENDING \
          INTEGRATION_ADVANCED "$target" "$tree"
        production_control_bridge_fail_after INTEGRATION_ADVANCED ;;
      INTEGRATION_ADVANCED)
        production_control_bridge_advance_phase "$journal" INTEGRATION_ADVANCED \
          CONTROL_SYNC_PENDING "$target" "$tree" ;;
      CONTROL_SYNC_PENDING)
        production_control_bridge_validate_phase_state CONTROL_SYNC_PENDING "$target"
        initialize_deploy_control_bridge
        verify_deploy_control_bridge_compatibility
        production_control_bridge_sync_control
        production_control_bridge_abort_after_mutation CONTROL_SYNCED
        production_control_bridge_fail_after_mutation CONTROL_SYNCED
        production_control_bridge_advance_phase "$journal" CONTROL_SYNC_PENDING \
          CONTROL_SYNCED "$target" "$tree"
        production_control_bridge_fail_after CONTROL_SYNCED ;;
      CONTROL_SYNCED)
        production_control_bridge_advance_phase "$journal" CONTROL_SYNCED \
          RUNTIME_VERIFY_PENDING "$target" "$tree" ;;
      RUNTIME_VERIFY_PENDING)
        production_control_bridge_validate_phase_state RUNTIME_VERIFY_PENDING "$target"
        deploy_release_runtime_transaction "$target" false false
        production_control_bridge_abort_after_mutation RUNTIME_VERIFIED
        production_control_bridge_fail_after_mutation RUNTIME_VERIFIED
        production_control_bridge_advance_phase "$journal" RUNTIME_VERIFY_PENDING \
          RUNTIME_VERIFIED "$target" "$tree"
        production_control_bridge_fail_after RUNTIME_VERIFIED ;;
      RUNTIME_VERIFIED)
        production_control_bridge_advance_phase "$journal" RUNTIME_VERIFIED \
          POOL_MARKER_PENDING "$target" "$tree" ;;
      POOL_MARKER_PENDING)
        marker=$(production_control_bridge_marker_value "$STATE/postgres-pool-bootstrap.sha")
        if [[ $marker != "$target" ]]; then
          production_control_bridge_validate_phase_state POOL_MARKER_PENDING "$target"
          commit_postgres_pool_bootstrap "$target"
          production_control_bridge_fsync_file_and_parent \
            "$STATE/postgres-pool-bootstrap.sha"
          production_control_bridge_abort_after_mutation POOL_MARKER_COMMITTED
          production_control_bridge_fail_after_mutation POOL_MARKER_COMMITTED
        fi
        production_control_bridge_advance_phase "$journal" POOL_MARKER_PENDING \
          POOL_MARKER_COMMITTED "$target" "$tree"
        production_control_bridge_fail_after POOL_MARKER_COMMITTED ;;
      POOL_MARKER_COMMITTED)
        production_control_bridge_advance_phase "$journal" POOL_MARKER_COMMITTED \
          CONTROL_MARKER_PENDING "$target" "$tree" ;;
      CONTROL_MARKER_PENDING)
        marker=$(production_control_bridge_marker_value "$STATE/control.sha")
        if [[ $marker != "$target" ]]; then
          production_control_bridge_validate_phase_state CONTROL_MARKER_PENDING "$target"
          umask 022
          next=$(mktemp "$STATE/control.sha.bridge.XXXXXX") || fail 'control marker temp could not be created'
          printf '%s\n' "$target" > "$next"
          chmod 0644 "$next"
          production_control_bridge_fsync_file_and_parent "$next"
          mv -f "$next" "$STATE/control.sha"
          production_control_bridge_fsync_file_and_parent "$STATE/control.sha"
          production_control_bridge_abort_after_mutation CONTROL_MARKER_COMMITTED
          production_control_bridge_fail_after_mutation CONTROL_MARKER_COMMITTED
        fi
        production_control_bridge_advance_phase "$journal" CONTROL_MARKER_PENDING \
          CONTROL_MARKER_COMMITTED "$target" "$tree"
        production_control_bridge_fail_after CONTROL_MARKER_COMMITTED ;;
      CONTROL_MARKER_COMMITTED)
        production_control_bridge_advance_phase "$journal" CONTROL_MARKER_COMMITTED \
          RECEIPT_PENDING "$target" "$tree" ;;
      RECEIPT_PENDING)
        production_control_bridge_verify_poststate "$target" "$tree"
        if [[ -e $(production_control_bridge_receipt_path "$target") ]]; then
          production_control_bridge_verify_receipt "$target" "$tree" || fail 'partial receipt is invalid'
        else
          production_control_bridge_validate_phase_state RECEIPT_PENDING "$target"
          production_control_bridge_write_receipt "$target" "$tree"
          production_control_bridge_abort_after_mutation RECEIPT_COMMITTED
          production_control_bridge_fail_after_mutation RECEIPT_COMMITTED
        fi
        production_control_bridge_advance_phase "$journal" RECEIPT_PENDING \
          RECEIPT_COMMITTED "$target" "$tree" ;;
      RECEIPT_COMMITTED)
        production_control_bridge_verify_receipt "$target" "$tree" || fail 'production bridge completion receipt is invalid'
        production_control_bridge_advance_phase "$journal" RECEIPT_COMMITTED \
          COMPLETE "$target" "$tree"
        production_control_bridge_fail_after COMPLETE ;;
      COMPLETE)
        production_control_bridge_verify_poststate "$target" "$tree"
        production_control_bridge_verify_receipt "$target" "$tree" || fail 'production bridge completion receipt is invalid'
        printf 'production-control-bridge-complete=%s tree=%s receipt=%s\n' "$target" "$tree" \
          "$(production_control_bridge_receipt_path "$target")"
        return 0 ;;
    esac
  done
}

print_production_control_bridge_receipt() {
  local target=$1 tree journal phase
  deploy_control_is_exact_production_bridge "$target" || fail 'receipt target is not the exact production bridge'
  tree=$(git -C "$REPO" rev-parse "$target^{tree}")
  journal=$(production_control_bridge_journal_path "$target")
  phase=$(production_control_bridge_read_phase "$journal" "$target" "$tree")
  [[ $phase == COMPLETE ]] || fail 'production bridge transaction is not complete'
  production_control_bridge_verify_integration_poststate "$target" "$tree"
  production_control_bridge_verify_receipt "$target" "$tree" || fail 'production bridge completion receipt is invalid'
  cat "$(production_control_bridge_receipt_path "$target")"
}
