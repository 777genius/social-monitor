#!/usr/bin/env bash
set -euo pipefail

if [[ ${SOCIAL_MONITOR_AUTH_REFRESH_TEST_MODE:-} == 1 ]]; then
  ((EUID != 0)) || {
    echo 'auth-refresh-error: test mode refuses root execution' >&2
    exit 1
  }
  AUTH_ROOT=${SOCIAL_MONITOR_AUTH_ROOT:?test auth root is required}
  TARGET_DIR=${SOCIAL_MONITOR_AUTH_TARGET_DIR:?test target dir is required}
  REGISTRY_ROOT=${SOCIAL_MONITOR_AUTH_REGISTRY_ROOT:?test registry root is required}
  CONTROLLER_JOB_ID=${SOCIAL_MONITOR_AUTH_CONTROLLER_JOB_ID:-test-controller}
  CURSOR_FILE=${SOCIAL_MONITOR_AUTH_CURSOR_FILE:?test cursor file is required}
  ACCOUNT_NAME_FILE=${SOCIAL_MONITOR_AUTH_ACCOUNT_NAME_FILE:?test account name file is required}
  PROBE_WORKSPACE=${SOCIAL_MONITOR_AUTH_PROBE_WORKSPACE:?test probe workspace is required}
  ACCOUNT_CHANGED_MARKER=${SOCIAL_MONITOR_AUTH_CHANGED_MARKER:?test marker is required}
  PROBE_TMP_ROOT=${SOCIAL_MONITOR_AUTH_PROBE_TMP_ROOT:?test probe temp root is required}
  TARGET_DIR_OWNER=$(id -u)
  TARGET_OWNER=$(id -u)
  TARGET_GROUP=$(id -g)
  TARGET_MODE=0400
  POOL_POINTER=${SOCIAL_MONITOR_AUTH_POOL_POINTER:-}
  POOL_REGISTRY_PREFIX=${SOCIAL_MONITOR_AUTH_POOL_REGISTRY_PREFIX:-/var/data/social-monitor/worker-jobs/}
elif ((EUID == 0)); then
  PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
  AUTH_ROOT=/var/data/codex-home/live-codex-auth
  TARGET_DIR=/var/data/social-monitor/auth-current
  POOL_POINTER=/var/data/social-monitor/control/subscription-account-pool.json
  CURSOR_FILE=/var/data/social-monitor/runtime/auth-account-cursor
  ACCOUNT_NAME_FILE=/var/data/social-monitor/runtime/auth-account-name
  PROBE_WORKSPACE=/var/data/social-monitor/runtime/auth-probe-workspace
  ACCOUNT_CHANGED_MARKER=/var/data/social-monitor/runtime/auth-account-changed
  PROBE_TMP_ROOT=/var/data/social-monitor/runtime/auth-probes
  TARGET_DIR_OWNER=root
  TARGET_OWNER=root
  TARGET_GROUP=1000
  TARGET_MODE=0440
  POOL_REGISTRY_PREFIX=/var/data/social-monitor/worker-jobs/
  unset SOCIAL_MONITOR_AUTH_REFRESH_TEST_MODE SOCIAL_MONITOR_AUTH_ROOT \
    SOCIAL_MONITOR_AUTH_TARGET_DIR SOCIAL_MONITOR_AUTH_REGISTRY_ROOT \
    SOCIAL_MONITOR_AUTH_CONTROLLER_JOB_ID SOCIAL_MONITOR_AUTH_CURSOR_FILE \
    SOCIAL_MONITOR_AUTH_ACCOUNT_NAME_FILE \
    SOCIAL_MONITOR_AUTH_PROBE_WORKSPACE SOCIAL_MONITOR_AUTH_CHANGED_MARKER \
    SOCIAL_MONITOR_AUTH_PROBE_TMP_ROOT SOCIAL_MONITOR_AUTH_POOL_POINTER \
    SOCIAL_MONITOR_AUTH_POOL_REGISTRY_PREFIX
else
  echo 'auth-refresh-error: production entrypoint requires root' >&2
  exit 1
fi

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

if [[ -n ${POOL_POINTER:-} ]]; then
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
exec 9>"$CURSOR_FILE.lock"
chmod 0600 "$CURSOR_FILE.lock"
flock -w 1800 9

status_json=$(timeout 30 subscription-runtime-codex-goal tool codex_goal_accounts_status \
  --args-json "{\"jobId\":\"$CONTROLLER_JOB_ID\",\"registryRootDir\":\"$REGISTRY_ROOT\",\"liveCheck\":false}")

jq -e '
  (.ok == true)
  and (.hasAvailableAccount == true)
  and (.availableDedupedAccountNames | type == "array")
  and (.availableDedupedAccountNames | length > 0)
' >/dev/null <<<"$status_json"

available_accounts=()
while IFS= read -r account; do
  available_accounts+=("$account")
done < <(jq -r '.availableDedupedAccountNames[]' <<<"$status_json")
account_count=${#available_accounts[@]}
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
auth_root_resolved=$(realpath "$AUTH_ROOT")
target_auth_existed=false
[[ -f $TARGET_DIR/auth.json ]] && target_auth_existed=true

probe_home=''
cleanup() {
  [[ -z $probe_home ]] || rm -rf "$probe_home"
}
trap cleanup EXIT

for ((offset = 0; offset < account_count; offset += 1)); do
  index=$(((start_index + offset) % account_count))
  account=${available_accounts[$index]}
  [[ $account =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || continue
  selected=$(realpath "$AUTH_ROOT/$account/auth.json" 2>/dev/null) || continue
  [[ $selected == "$auth_root_resolved"/*/auth.json ]] || continue

  probe_home=$(mktemp -d "$PROBE_TMP_ROOT/auth-probe.XXXXXX")
  probe_result=$probe_home/result.txt
  install -m 0400 "$selected" "$probe_home/auth.json"
  if timeout 180 env CODEX_HOME="$probe_home" codex exec \
    --skip-git-repo-check \
    --sandbox read-only \
    --model gpt-5.5 \
    --color never \
    --output-last-message "$probe_result" \
    -C "$PROBE_WORKSPACE" \
    'Return exactly AUTH_OK and do nothing else.' \
    </dev/null >/dev/null 2>&1 \
    && [[ -f $probe_result ]] \
    && [[ $(tr -d '\r\n' < "$probe_result") == AUTH_OK ]]; then
    install -m "$TARGET_MODE" -o "$TARGET_OWNER" -g "$TARGET_GROUP" \
      "$probe_home/auth.json" "$TARGET_DIR/auth.json.next"
    mv -f "$TARGET_DIR/auth.json.next" "$TARGET_DIR/auth.json"
    printf '%s\n' "$index" > "$CURSOR_FILE.next.$$"
    chmod 0600 "$CURSOR_FILE.next.$$"
    mv -f "$CURSOR_FILE.next.$$" "$CURSOR_FILE"
    printf '%s\n' "$account" > "$ACCOUNT_NAME_FILE.next.$$"
    chmod 0600 "$ACCOUNT_NAME_FILE.next.$$"
    mv -f "$ACCOUNT_NAME_FILE.next.$$" "$ACCOUNT_NAME_FILE"
    if [[ -n $previous_account && $account != "$previous_account" ]] \
      || [[ -z $previous_account && $target_auth_existed == true ]]; then
      : > "$ACCOUNT_CHANGED_MARKER"
      chmod 0600 "$ACCOUNT_CHANGED_MARKER"
    fi
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
