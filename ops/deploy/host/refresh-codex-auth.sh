#!/usr/bin/env bash
set -euo pipefail

POOL_JOB_ID=''
POOL_JOB_SELECTED=false
usage() {
  echo "usage: $0 [--broker-pool-job-id <social-monitor-job-id>]" >&2
  exit 64
}

case $# in
  0) ;;
  2)
    [[ $1 == --broker-pool-job-id ]] || usage
    POOL_JOB_ID=$2
    POOL_JOB_SELECTED=true
    ;;
  *) usage ;;
esac

if [[ ${SOCIAL_MONITOR_AUTH_REFRESH_TEST_MODE:-} == 1 ]]; then
  ((EUID != 0)) || {
    echo 'auth-refresh-error: test mode refuses root execution' >&2
    exit 1
  }
  AUTH_ROOT=${SOCIAL_MONITOR_AUTH_ROOT:?test auth root is required}
  TARGET_DIR=${SOCIAL_MONITOR_AUTH_TARGET_DIR:?test target dir is required}
  REGISTRY_ROOT=${SOCIAL_MONITOR_AUTH_REGISTRY_ROOT:?test registry root is required}
  PROJECT_ROOT=${SOCIAL_MONITOR_AUTH_PROJECT_ROOT:-}
  CONTROLLER_JOB_ID=${SOCIAL_MONITOR_AUTH_CONTROLLER_JOB_ID:-test-controller}
  CURSOR_FILE=${SOCIAL_MONITOR_AUTH_CURSOR_FILE:?test cursor file is required}
  ACCOUNT_NAME_FILE=${SOCIAL_MONITOR_AUTH_ACCOUNT_NAME_FILE:?test account name file is required}
  PROBE_WORKSPACE=${SOCIAL_MONITOR_AUTH_PROBE_WORKSPACE:?test probe workspace is required}
  ACCOUNT_CHANGED_MARKER=${SOCIAL_MONITOR_AUTH_CHANGED_MARKER:?test marker is required}
  PROBE_TMP_ROOT=${SOCIAL_MONITOR_AUTH_PROBE_TMP_ROOT:?test probe temp root is required}
  POOL_SNAPSHOT_ROOT=${SOCIAL_MONITOR_AUTH_POOL_SNAPSHOT_ROOT:?test pool snapshot root is required}
  TARGET_DIR_OWNER=$(id -u)
  TARGET_OWNER=$(id -u)
  TARGET_GROUP=$(id -g)
  TARGET_MODE=0400
  POOL_POINTER=${SOCIAL_MONITOR_AUTH_POOL_POINTER:-}
  POOL_REGISTRY_PREFIX=${SOCIAL_MONITOR_AUTH_POOL_REGISTRY_PREFIX:-/var/data/social-monitor/worker-jobs/}
elif ((EUID == 0)); then
  PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
  PROJECT_ROOT=/var/data/social-monitor
  AUTH_ROOT=/var/data/codex-home/live-codex-auth
  TARGET_DIR=/var/data/social-monitor/auth-current
  POOL_POINTER=/var/data/social-monitor/control/subscription-account-pool.json
  CURSOR_FILE=/var/data/social-monitor/runtime/auth-account-cursor
  ACCOUNT_NAME_FILE=/var/data/social-monitor/runtime/auth-account-name
  PROBE_WORKSPACE=/var/data/social-monitor/runtime/auth-probe-workspace
  ACCOUNT_CHANGED_MARKER=/var/data/social-monitor/runtime/auth-account-changed
  PROBE_TMP_ROOT=/var/data/social-monitor/runtime/auth-probes
  POOL_SNAPSHOT_ROOT=/var/data/social-monitor/auth-pool
  TARGET_DIR_OWNER=root
  TARGET_OWNER=root
  TARGET_GROUP=1000
  TARGET_MODE=0440
  POOL_REGISTRY_PREFIX=/var/data/social-monitor/worker-jobs/
  unset SOCIAL_MONITOR_AUTH_REFRESH_TEST_MODE SOCIAL_MONITOR_AUTH_ROOT \
    SOCIAL_MONITOR_AUTH_TARGET_DIR SOCIAL_MONITOR_AUTH_REGISTRY_ROOT \
    SOCIAL_MONITOR_AUTH_PROJECT_ROOT \
    SOCIAL_MONITOR_AUTH_CONTROLLER_JOB_ID SOCIAL_MONITOR_AUTH_CURSOR_FILE \
    SOCIAL_MONITOR_AUTH_ACCOUNT_NAME_FILE \
    SOCIAL_MONITOR_AUTH_PROBE_WORKSPACE SOCIAL_MONITOR_AUTH_CHANGED_MARKER \
    SOCIAL_MONITOR_AUTH_PROBE_TMP_ROOT SOCIAL_MONITOR_AUTH_POOL_POINTER \
    SOCIAL_MONITOR_AUTH_POOL_REGISTRY_PREFIX \
    SOCIAL_MONITOR_AUTH_POOL_SNAPSHOT_ROOT
else
  echo 'auth-refresh-error: production entrypoint requires root' >&2
  exit 1
fi

MANIFEST_ACCOUNTS=()
REQUIRE_MANIFEST_ACCOUNT_MEMBERSHIP=false
# This remains based on the default runtime cursor so every invocation shares
# one install lock. Only the rotation cursor and selected-account name vary by
# approved pool.
AUTH_INSTALL_LOCK_FILE=$CURSOR_FILE.install.lock

fail() {
  echo "auth-refresh-error: $*" >&2
  exit 1
}

file_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

require_canonical_directory() {
  local directory=$1 label=$2 canonical
  [[ -d $directory && ! -L $directory ]] || fail "$label is missing or unsafe"
  canonical=$(realpath -e "$directory") || fail "cannot canonicalize $label"
  [[ $canonical == "$directory" ]] || fail "$label is not canonical"
}

require_not_group_or_other_writable() {
  local path=$1 label=$2 mode
  mode=$(stat -c '%a' "$path" 2>/dev/null || stat -f '%Lp' "$path")
  [[ $mode =~ ^[0-7]{3,4}$ ]] || fail "$label mode is invalid"
  (( (8#$mode & 022) == 0 )) || fail "$label is writable by group or other"
}

resolve_approved_account_auth() {
  local account=$1 account_directory account_directory_resolved account_auth
  [[ $account =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || \
    fail 'broker account name is invalid'
  account_directory=$AUTH_ROOT/$account
  [[ -d $account_directory && ! -L $account_directory ]] || \
    fail 'approved broker account directory is missing or unsafe'
  account_directory_resolved=$(realpath -e "$account_directory") || \
    fail 'cannot canonicalize approved broker account directory'
  [[ $account_directory_resolved == "$auth_root_resolved/$account" ]] || \
    fail 'approved broker account directory is not canonical'
  account_auth=$account_directory/auth.json
  [[ -f $account_auth && ! -L $account_auth ]] || \
    fail 'approved broker account auth file is missing or unsafe'
  selected=$(realpath -e "$account_auth") || \
    fail 'cannot canonicalize approved broker account auth file'
  [[ $selected == "$auth_root_resolved/$account/auth.json" ]] || \
    fail 'approved broker account auth file is not canonical'
  printf '%s\n' "$selected"
}

materialize_auth_pool_snapshot() {
  local stage_dir digest_input generation snapshot_dir account selected
  local manifest_next manifest_changed=true

  install -d -m 0750 -o "$TARGET_DIR_OWNER" -g "$TARGET_GROUP" \
    "$POOL_SNAPSHOT_ROOT" "$POOL_SNAPSHOT_ROOT/snapshots"
  stage_dir=$(mktemp -d "$POOL_SNAPSHOT_ROOT/.snapshot.XXXXXX")
  digest_input=$stage_dir/digests
  : > "$digest_input"
  for account in "${available_accounts[@]}"; do
    selected=$(resolve_approved_account_auth "$account")
    install -d -m 0750 -o "$TARGET_DIR_OWNER" -g "$TARGET_GROUP" \
      "$stage_dir/$account"
    install -m "$TARGET_MODE" -o "$TARGET_OWNER" -g "$TARGET_GROUP" \
      "$selected" "$stage_dir/$account/auth.json"
    printf '%s\t%s\n' "$account" "$(file_sha256 "$stage_dir/$account/auth.json")" \
      >> "$digest_input"
  done
  generation=$(file_sha256 "$digest_input")
  rm -f "$digest_input"
  chown "$TARGET_DIR_OWNER:$TARGET_GROUP" "$stage_dir"
  chmod 0750 "$stage_dir"
  snapshot_dir=$POOL_SNAPSHOT_ROOT/snapshots/$generation
  if [[ -d $snapshot_dir && ! -L $snapshot_dir ]]; then
    for account in "${available_accounts[@]}"; do
      [[ -f $snapshot_dir/$account/auth.json && \
         ! -L $snapshot_dir/$account/auth.json ]] || \
        fail 'existing auth pool snapshot is incomplete or unsafe'
      cmp -s "$stage_dir/$account/auth.json" \
        "$snapshot_dir/$account/auth.json" || \
        fail 'existing auth pool snapshot bytes do not match its digest'
    done
    [[ $(find "$snapshot_dir" -mindepth 2 -maxdepth 2 -type f \
      -name auth.json | wc -l) == ${#available_accounts[@]} ]] || \
      fail 'existing auth pool snapshot contains unexpected auth files'
    rm -rf -- "$stage_dir"
  else
    [[ ! -e $snapshot_dir && ! -L $snapshot_dir ]] || \
      fail 'auth pool snapshot destination is unsafe'
    mv "$stage_dir" "$snapshot_dir"
    find "$snapshot_dir" -type d -exec chmod 0550 {} +
    find "$snapshot_dir" -type f -exec chmod "$TARGET_MODE" {} +
  fi

  manifest_next=$POOL_SNAPSHOT_ROOT/current.json.next.$$
  jq -n --arg generation "$generation" \
    --argjson accounts "$(printf '%s\n' "${available_accounts[@]}" | \
      jq -Rsc --arg generation "$generation" '
        split("\n") | map(select(length > 0)) |
        map({id: ., relativePath: ("snapshots/" + $generation + "/" + . + "/auth.json")})
      ')" '
      {
        schemaVersion: 1,
        snapshotId: $generation,
        accounts: $accounts
      }
    ' > "$manifest_next"
  chown "$TARGET_OWNER:$TARGET_GROUP" "$manifest_next"
  chmod "$TARGET_MODE" "$manifest_next"
  if [[ -f $POOL_SNAPSHOT_ROOT/current.json && \
        ! -L $POOL_SNAPSHOT_ROOT/current.json ]] && \
      cmp -s "$manifest_next" "$POOL_SNAPSHOT_ROOT/current.json"; then
    manifest_changed=false
  fi
  if [[ $manifest_changed == true ]]; then
    mv -f "$manifest_next" "$POOL_SNAPSHOT_ROOT/current.json"
  else
    rm -f "$manifest_next"
  fi
  prune_expired_auth_pool_snapshots "$generation"
}

prune_expired_auth_pool_snapshots() {
  local current_generation=$1 snapshot generation modified_at now
  local retention_seconds=${SOCIAL_MONITOR_AUTH_POOL_RETENTION_SECONDS:-172800}
  [[ $retention_seconds =~ ^[0-9]+$ && $retention_seconds -ge 86400 ]] || \
    fail 'auth pool snapshot retention must be at least one day'
  now=$(date +%s)
  while IFS= read -r -d '' snapshot; do
    [[ ! -L $snapshot ]] || fail 'auth pool snapshot cannot be a symlink'
    generation=${snapshot##*/}
    [[ $generation =~ ^[0-9a-f]{64}$ ]] || \
      fail 'auth pool snapshot name is invalid'
    [[ $generation != "$current_generation" ]] || continue
    modified_at=$(stat -c '%Y' "$snapshot" 2>/dev/null || stat -f '%m' "$snapshot")
    ((now - modified_at >= retention_seconds)) || continue
    rm -rf -- "$snapshot"
  done < <(find "$POOL_SNAPSHOT_ROOT/snapshots" -mindepth 1 -maxdepth 1 \
    -type d -print0)
}

is_manifest_account() {
  local candidate=$1 manifest_account
  for manifest_account in "${MANIFEST_ACCOUNTS[@]}"; do
    [[ $candidate == "$manifest_account" ]] && return 0
  done
  return 1
}

resolve_broker_managed_pool() {
  local job_id=$1 registry_root worker_jobs job_directory job_manifest
  local job_root workspace_path canonical_manifest manifest_data manifest_account

  [[ -n ${PROJECT_ROOT:-} ]] || fail 'broker-managed pool selection requires a project root'
  [[ $job_id =~ ^social-monitor-production-account-pool-[A-Za-z0-9][A-Za-z0-9._-]{0,120}$ && \
     $job_id != *..* ]] || fail 'broker-managed pool job id is invalid'

  worker_jobs=$PROJECT_ROOT/worker-jobs
  registry_root=$worker_jobs/registry-v4
  require_canonical_directory "$PROJECT_ROOT" 'project root'
  require_canonical_directory "$worker_jobs" 'project worker-jobs root'
  require_canonical_directory "$registry_root" 'broker-managed pool registry'
  require_not_group_or_other_writable "$registry_root" \
    'broker-managed pool registry'

  job_directory=$registry_root/$job_id
  require_canonical_directory "$job_directory" 'broker-managed pool job directory'
  require_not_group_or_other_writable "$job_directory" \
    'broker-managed pool job directory'
  job_manifest=$job_directory/job.json
  [[ -f $job_manifest && ! -L $job_manifest ]] || \
    fail 'broker-managed pool manifest is missing or unsafe'
  canonical_manifest=$(realpath -e "$job_manifest") || \
    fail 'cannot canonicalize broker-managed pool manifest'
  [[ $canonical_manifest == "$job_manifest" ]] || \
    fail 'broker-managed pool manifest is not canonical'
  require_not_group_or_other_writable "$job_manifest" \
    'broker-managed pool manifest'

  job_root=$worker_jobs/$job_id
  manifest_data=$(jq -cer --arg job_id "$job_id" --arg registry_root "$registry_root" \
    --arg job_root "$job_root" '
      if (
        type == "object" and .schemaVersion == 1 and .jobId == $job_id and
        (.tags | type == "array" and index("account-pool") != null and
          index("production-auth") != null) and
        (.accounts | type == "array" and length > 0 and
          all(.[]; type == "string" and test("^[A-Za-z0-9][A-Za-z0-9._-]*$")) and
          (length == (unique | length))) and
        (.jobRootDir | type == "string" and . == $job_root) and
        (.workspacePath | type == "string" and startswith("/")) and
        (.workspacePath as $workspace_path |
          .projectAccessScope | type == "object" and
          .projectId == "social-monitor" and
          .registryRoot == $registry_root and
          (.workspaceRoots | type == "array" and length == 1 and
            .[0] == $workspace_path))
      ) then {
        accounts: .accounts,
        workspacePath: .workspacePath
      } else empty end
    ' "$job_manifest") || \
    fail 'broker-managed pool manifest is not an approved Social Monitor pool'

  require_canonical_directory "$job_root" 'broker-managed pool job root'
  MANIFEST_ACCOUNTS=()
  while IFS= read -r manifest_account; do
    MANIFEST_ACCOUNTS+=("$manifest_account")
  done < <(jq -r '.accounts[]' <<<"$manifest_data")
  (( ${#MANIFEST_ACCOUNTS[@]} > 0 )) || \
    fail 'broker-managed pool manifest has no approved accounts'
  workspace_path=$(jq -r '.workspacePath' <<<"$manifest_data")
  require_canonical_directory "$workspace_path" 'broker-managed pool workspace'
  [[ $workspace_path == "$PROJECT_ROOT"/worktrees/* ]] || \
    fail 'broker-managed pool workspace escapes the project worktrees root'

  CONTROLLER_JOB_ID=$job_id
  REGISTRY_ROOT=$registry_root
  CURSOR_FILE=$CURSOR_FILE.pool-$job_id
  ACCOUNT_NAME_FILE=$ACCOUNT_NAME_FILE.pool-$job_id
  REQUIRE_MANIFEST_ACCOUNT_MEMBERSHIP=true
}

resolve_account_pool_pointer() {
  [[ -f $POOL_POINTER && ! -L $POOL_POINTER ]] || {
    echo 'auth-refresh-error: account pool pointer is missing or unsafe' >&2
    exit 1
  }
  local pointer_owner pointer_mode
  pointer_owner=$(stat -c '%u' "$POOL_POINTER" 2>/dev/null || \
    stat -f '%u' "$POOL_POINTER")
  pointer_mode=$(stat -c '%a' "$POOL_POINTER" 2>/dev/null || \
    stat -f '%Lp' "$POOL_POINTER")
  if [[ $pointer_owner != "$EUID" || ! $pointer_mode =~ ^[0-7]{3,4}$ ]] \
    || (( (8#$pointer_mode & 022) != 0 )); then
    echo 'auth-refresh-error: account pool pointer ownership or mode is unsafe' >&2
    exit 1
  fi
  jq -e --arg registry_prefix "$POOL_REGISTRY_PREFIX" '
    (keys | sort) == ["controllerJobId", "registryRootDir"]
    and (.controllerJobId | type == "string" and test("^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$"))
    and (.registryRootDir | type == "string" and startswith($registry_prefix))
  ' "$POOL_POINTER" >/dev/null || {
    echo 'auth-refresh-error: account pool pointer contract is invalid' >&2
    exit 1
  }
  CONTROLLER_JOB_ID=$(jq -r '.controllerJobId' "$POOL_POINTER")
  REGISTRY_ROOT=$(jq -r '.registryRootDir' "$POOL_POINTER")
  [[ -d $REGISTRY_ROOT && ! -L $REGISTRY_ROOT ]] || {
    echo 'auth-refresh-error: account pool registry is missing or unsafe' >&2
    exit 1
  }
  local canonical_registry canonical_prefix
  canonical_registry=$(cd "$REGISTRY_ROOT" && pwd -P)
  canonical_prefix=$(cd "$POOL_REGISTRY_PREFIX" && pwd -P)
  [[ $canonical_registry == "$canonical_prefix/"* ]] || {
    echo 'auth-refresh-error: account pool registry escapes the project root' >&2
    exit 1
  }
  REGISTRY_ROOT=$canonical_registry
}

exec 9>"$AUTH_INSTALL_LOCK_FILE"
chmod 0600 "$AUTH_INSTALL_LOCK_FILE"
flock -w 1800 9

if [[ $POOL_JOB_SELECTED == true ]]; then
  resolve_broker_managed_pool "$POOL_JOB_ID"
elif [[ -n ${POOL_POINTER:-} ]]; then
  resolve_account_pool_pointer
fi

install -d -m 0750 -o "$TARGET_DIR_OWNER" -g "$TARGET_GROUP" "$TARGET_DIR"
if [[ -e $TARGET_DIR/auth.json ]]; then
  [[ -f $TARGET_DIR/auth.json && ! -L $TARGET_DIR/auth.json ]] || {
    echo 'auth-refresh-error: existing target auth is not a regular file' >&2
    exit 1
  }
  chown "$TARGET_OWNER:$TARGET_GROUP" "$TARGET_DIR/auth.json"
  chmod "$TARGET_MODE" "$TARGET_DIR/auth.json"
fi
rm -f "$TARGET_DIR/auth.json.next"
install -d -m 0750 "$PROBE_WORKSPACE"
install -d -m 0700 "$PROBE_TMP_ROOT"

status_json=$(timeout 30 subscription-runtime-codex-goal tool codex_goal_accounts_status \
  --args-json "{\"jobId\":\"$CONTROLLER_JOB_ID\",\"registryRootDir\":\"$REGISTRY_ROOT\",\"liveCheck\":false}")

jq -e --arg job_id "$CONTROLLER_JOB_ID" --arg registry_root "$REGISTRY_ROOT" '
  (.ok == true)
  and (.jobId == $job_id)
  and (.registryRootDir == $registry_root)
  and (.hasAvailableAccount == true)
  and (.availableDedupedAccountNames | type == "array")
  and (.availableDedupedAccountNames | length > 0)
  and (.availableDedupedAccountNames |
    all(.[]; type == "string" and test("^[A-Za-z0-9][A-Za-z0-9._-]*$")))
  and (.availableDedupedAccountNames as $accounts |
    ($accounts | length) == ($accounts | unique | length))
  and (.availableDedupedAccountNames as $accounts |
    ($accounts | length) as $available_count |
    (.summary | type == "object" and
      (.ready | type == "number" and . == floor and . >= $available_count) and
      (.availableDeduped | type == "number" and . == floor and
        . == $available_count)))
' >/dev/null <<<"$status_json"

available_accounts=()
while IFS= read -r account; do
  available_accounts+=("$account")
done < <(jq -r '.availableDedupedAccountNames[]' <<<"$status_json")
account_count=${#available_accounts[@]}
if [[ $REQUIRE_MANIFEST_ACCOUNT_MEMBERSHIP == true ]]; then
  for account in "${available_accounts[@]}"; do
    is_manifest_account "$account" || \
      fail 'broker account status is outside the approved pool manifest'
  done
fi
start_index=0
if [[ -f $CURSOR_FILE ]]; then
  read -r start_index < "$CURSOR_FILE"
fi
[[ $start_index =~ ^[0-9]+$ ]] || start_index=0
start_index=$((start_index % account_count))
previous_account=''
if [[ -f $ACCOUNT_NAME_FILE ]]; then
  read -r previous_account < "$ACCOUNT_NAME_FILE"
fi
for ((candidate_index = 0; candidate_index < account_count; candidate_index += 1)); do
  if [[ ${available_accounts[$candidate_index]} == "$previous_account" ]]; then
    start_index=$candidate_index
    break
  fi
done
require_canonical_directory "$AUTH_ROOT" 'auth root'
auth_root_resolved=$(realpath -e "$AUTH_ROOT")

probe_home=''
cleanup() {
  [[ -z $probe_home ]] || rm -rf "$probe_home"
}
trap cleanup EXIT

for ((offset = 0; offset < account_count; offset += 1)); do
  index=$(((start_index + offset) % account_count))
  account=${available_accounts[$index]}
  [[ $account =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || \
    fail 'broker account name is invalid'
  account_directory=$AUTH_ROOT/$account
  [[ -d $account_directory && ! -L $account_directory ]] || \
    fail 'approved broker account directory is missing or unsafe'
  account_directory_resolved=$(realpath -e "$account_directory") || \
    fail 'cannot canonicalize approved broker account directory'
  [[ $account_directory_resolved == "$auth_root_resolved/$account" ]] || \
    fail 'approved broker account directory is not canonical'
  account_auth=$account_directory/auth.json
  [[ -f $account_auth && ! -L $account_auth ]] || \
    fail 'approved broker account auth file is missing or unsafe'
  selected=$(realpath -e "$account_auth") || \
    fail 'cannot canonicalize approved broker account auth file'
  [[ $selected == "$auth_root_resolved/$account/auth.json" ]] || \
    fail 'approved broker account auth file is not canonical'

  probe_home=$(mktemp -d "$PROBE_TMP_ROOT/auth-probe.XXXXXX")
  probe_result=$probe_home/result.txt
  install -m 0400 "$selected" "$probe_home/auth.json"
  if timeout 180 env CODEX_HOME="$probe_home" codex exec \
    --skip-git-repo-check \
    --sandbox read-only \
    --model gpt-5.6-sol \
    --color never \
    --output-last-message "$probe_result" \
    -C "$PROBE_WORKSPACE" \
    'Return exactly AUTH_OK and do nothing else.' \
    </dev/null >/dev/null 2>&1 \
    && [[ -f $probe_result ]] \
    && [[ $(tr -d '\r\n' < "$probe_result") == AUTH_OK ]]; then
    materialize_auth_pool_snapshot
    target_auth_changed=true
    if [[ -e $TARGET_DIR/auth.json ]]; then
      [[ -f $TARGET_DIR/auth.json && ! -L $TARGET_DIR/auth.json ]] || \
        fail 'existing target auth is not a regular file'
      if cmp -s "$probe_home/auth.json" "$TARGET_DIR/auth.json"; then
        target_auth_changed=false
      fi
    fi
    if [[ $target_auth_changed == true ]]; then
      install -m "$TARGET_MODE" -o "$TARGET_OWNER" -g "$TARGET_GROUP" \
        "$probe_home/auth.json" "$TARGET_DIR/auth.json.next"
      mv -f "$TARGET_DIR/auth.json.next" "$TARGET_DIR/auth.json"
      : > "$ACCOUNT_CHANGED_MARKER"
      chmod 0600 "$ACCOUNT_CHANGED_MARKER"
    fi
    printf '%s\n' "$index" > "$CURSOR_FILE.next.$$"
    chmod 0600 "$CURSOR_FILE.next.$$"
    mv -f "$CURSOR_FILE.next.$$" "$CURSOR_FILE"
    printf '%s\n' "$account" > "$ACCOUNT_NAME_FILE.next.$$"
    chmod 0600 "$ACCOUNT_NAME_FILE.next.$$"
    mv -f "$ACCOUNT_NAME_FILE.next.$$" "$ACCOUNT_NAME_FILE"
    cleanup
    probe_home=''
    echo 'subscription account validation passed'
    exit 0
  fi
  cleanup
  probe_home=''
done

echo 'no broker-available subscription account passed the isolated auth probe' >&2
exit 1
