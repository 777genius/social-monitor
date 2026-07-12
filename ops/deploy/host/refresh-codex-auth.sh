#!/usr/bin/env bash
set -euo pipefail

if ((EUID == 0)); then
  PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
  AUTH_ROOT=/var/data/codex-home/live-codex-auth
  TARGET_DIR=/var/data/social-monitor/auth-current
  REGISTRY_ROOT=/var/data/social-monitor/worker-jobs/registry
  CONTROLLER_JOB_ID=social-monitor-project-controller-v1
  CURSOR_FILE=/var/data/social-monitor/runtime/auth-account-cursor
  PROBE_WORKSPACE=/var/data/social-monitor/runtime/auth-probe-workspace
  ACCOUNT_CHANGED_MARKER=/var/data/social-monitor/runtime/auth-account-changed
  PROBE_TMP_ROOT=/var/data/social-monitor/runtime/auth-probes
  TARGET_OWNER=1000
  TARGET_GROUP=1000
  unset SOCIAL_MONITOR_AUTH_REFRESH_TEST_MODE SOCIAL_MONITOR_AUTH_ROOT \
    SOCIAL_MONITOR_AUTH_TARGET_DIR SOCIAL_MONITOR_AUTH_REGISTRY_ROOT \
    SOCIAL_MONITOR_AUTH_CONTROLLER_JOB_ID SOCIAL_MONITOR_AUTH_CURSOR_FILE \
    SOCIAL_MONITOR_AUTH_PROBE_WORKSPACE SOCIAL_MONITOR_AUTH_CHANGED_MARKER \
    SOCIAL_MONITOR_AUTH_PROBE_TMP_ROOT
else
  [[ ${SOCIAL_MONITOR_AUTH_REFRESH_TEST_MODE:-} == 1 ]] || {
    echo 'auth-refresh-error: production entrypoint requires root' >&2
    exit 1
  }
  AUTH_ROOT=${SOCIAL_MONITOR_AUTH_ROOT:?test auth root is required}
  TARGET_DIR=${SOCIAL_MONITOR_AUTH_TARGET_DIR:?test target dir is required}
  REGISTRY_ROOT=${SOCIAL_MONITOR_AUTH_REGISTRY_ROOT:?test registry root is required}
  CONTROLLER_JOB_ID=${SOCIAL_MONITOR_AUTH_CONTROLLER_JOB_ID:-test-controller}
  CURSOR_FILE=${SOCIAL_MONITOR_AUTH_CURSOR_FILE:?test cursor file is required}
  PROBE_WORKSPACE=${SOCIAL_MONITOR_AUTH_PROBE_WORKSPACE:?test probe workspace is required}
  ACCOUNT_CHANGED_MARKER=${SOCIAL_MONITOR_AUTH_CHANGED_MARKER:?test marker is required}
  PROBE_TMP_ROOT=${SOCIAL_MONITOR_AUTH_PROBE_TMP_ROOT:?test probe temp root is required}
  TARGET_OWNER=$(id -u)
  TARGET_GROUP=$(id -g)
fi

install -d -m 0750 -o "$TARGET_OWNER" -g "$TARGET_GROUP" "$TARGET_DIR"
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
auth_root_resolved=$(realpath "$AUTH_ROOT")

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
    install -m 0400 -o "$TARGET_OWNER" -g "$TARGET_GROUP" \
      "$probe_home/auth.json" "$TARGET_DIR/auth.json.next"
    mv -f "$TARGET_DIR/auth.json.next" "$TARGET_DIR/auth.json"
    printf '%s\n' "$index" > "$CURSOR_FILE.next.$$"
    chmod 0600 "$CURSOR_FILE.next.$$"
    mv -f "$CURSOR_FILE.next.$$" "$CURSOR_FILE"
    if ((index != start_index)); then
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
