#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
if ((EUID == 0)); then
  command -v setpriv >/dev/null || {
    echo 'Subscription auth refresh fixture requires setpriv when run as root' >&2
    exit 1
  }
  relocated_root=$(mktemp -d \
    "${TMPDIR:-/tmp}/social-monitor-auth-refresh-source.XXXXXX")
  install -d "$relocated_root/host"
  install -m 0644 "$0" "$relocated_root/refresh-codex-auth.test.sh"
  install -m 0755 "$SCRIPT_DIR/host/refresh-codex-auth.sh" \
    "$relocated_root/host/refresh-codex-auth.sh"
  : > "$relocated_root/.social-monitor-auth-refresh-relocated"
  chown -R 65534:65534 "$relocated_root"
  exec setpriv --reuid=65534 --regid=65534 --clear-groups \
    env -u SOCIAL_MONITOR_AUTH_REFRESH_RELOCATED_ROOT \
      PATH="$PATH" TMPDIR=/tmp \
      bash "$relocated_root/refresh-codex-auth.test.sh" "$@"
fi

RELOCATED_ROOT=
case $SCRIPT_DIR in
  /tmp/social-monitor-auth-refresh-source.*)
    if [[ -f $SCRIPT_DIR/.social-monitor-auth-refresh-relocated && \
          ! -L $SCRIPT_DIR/.social-monitor-auth-refresh-relocated && \
          $(stat -c '%u' "$SCRIPT_DIR" 2>/dev/null || stat -f '%u' "$SCRIPT_DIR") == "$EUID" ]]; then
      RELOCATED_ROOT=$SCRIPT_DIR
    fi
    ;;
esac
unset SOCIAL_MONITOR_AUTH_REFRESH_RELOCATED_ROOT

ENTRYPOINT=$SCRIPT_DIR/host/refresh-codex-auth.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-auth-refresh-test.XXXXXX")
cleanup() {
  rm -rf "$FIXTURE"
  if [[ -n $RELOCATED_ROOT ]]; then
    rm -rf -- "$RELOCATED_ROOT"
  fi
}
trap cleanup EXIT

AUTH_ROOT=$FIXTURE/auth
TARGET_DIR=$FIXTURE/target
PROJECT_ROOT=$FIXTURE/project
REGISTRY_ROOT=$PROJECT_ROOT/worker-jobs/registry-v4
CURSOR_FILE=$FIXTURE/cursor
ACCOUNT_NAME_FILE=$FIXTURE/account-name
PROBE_WORKSPACE=$FIXTURE/workspace
CHANGED_MARKER=$FIXTURE/changed
PROBE_TMP_ROOT=$FIXTURE/tmp
POOL_SNAPSHOT_ROOT=$FIXTURE/auth-pool
POOL_POINTER=$FIXTURE/account-pool.json
BIN=$FIXTURE/bin
POOL_JOB_ID=social-monitor-production-account-pool-terra-v25-20260804
POOL_JOB_DIRECTORY=$REGISTRY_ROOT/$POOL_JOB_ID
POOL_JOB_ROOT=$PROJECT_ROOT/worker-jobs/$POOL_JOB_ID
POOL_WORKSPACE=$PROJECT_ROOT/worktrees/.volume2/$POOL_JOB_ID
POOL_CURSOR_FILE=$CURSOR_FILE.pool-$POOL_JOB_ID
POOL_ACCOUNT_NAME_FILE=$ACCOUNT_NAME_FILE.pool-$POOL_JOB_ID
STATUS_LOG=$FIXTURE/accounts-status.log
PROBE_LOG=$FIXTURE/codex-probe.log
LOCK_GATE=$FIXTURE/auth-install-lock-gate
FLOCK_LOG=$FIXTURE/auth-install-flock.log
SYSTEM_FLOCK=$(PATH=/usr/bin:/bin command -v flock || true)
[[ -n $SYSTEM_FLOCK ]] || {
  echo 'Subscription auth refresh fixture requires flock' >&2
  exit 1
}
install -d "$AUTH_ROOT/account-a" "$AUTH_ROOT/account-b" "$AUTH_ROOT/account-m" \
  "$REGISTRY_ROOT" "$PROBE_WORKSPACE" "$BIN" "$FIXTURE/tmp"
install -d "$PROJECT_ROOT/escaped-job-root" "$PROJECT_ROOT/escaped-workspace"
printf '{"account":"a"}\n' > "$AUTH_ROOT/account-a/auth.json"
printf '{"account":"b"}\n' > "$AUTH_ROOT/account-b/auth.json"
printf '{"account":"m"}\n' > "$AUTH_ROOT/account-m/auth.json"
printf '{"controllerJobId":"test-controller","registryRootDir":"%s"}\n' \
  "$REGISTRY_ROOT" > "$POOL_POINTER"
chmod 0600 "$POOL_POINTER"

write_pool_manifest() {
  local job_id=$1 project_id=$2 job_root=$3 workspace_path=$4 registry_root=$5
  local job_directory=$REGISTRY_ROOT/$job_id
  install -d "$job_directory" "$job_root" "$workspace_path"
  jq -n --arg job_id "$job_id" --arg project_id "$project_id" \
    --arg job_root "$job_root" --arg workspace_path "$workspace_path" \
    --arg registry_root "$registry_root" '
      {
        schemaVersion: 1,
        jobId: $job_id,
        tags: ["account-pool", "production-auth"],
        accounts: ["account-m"],
        jobRootDir: $job_root,
        workspacePath: $workspace_path,
        projectAccessScope: {
          projectId: $project_id,
          registryRoot: $registry_root,
          workspaceRoots: [$workspace_path]
        }
      }
    ' > "$job_directory/job.json"
}

write_pool_manifest "$POOL_JOB_ID" social-monitor "$POOL_JOB_ROOT" \
  "$POOL_WORKSPACE" "$REGISTRY_ROOT"

cat > "$BIN/subscription-runtime-codex-goal" <<'SH'
#!/usr/bin/env bash
[[ $* == *'"liveCheck":false'* ]] || exit 41
expected_job=${SOCIAL_MONITOR_TEST_EXPECTED_JOB_ID:-test-controller}
expected_registry=${SOCIAL_MONITOR_TEST_EXPECTED_REGISTRY_ROOT:?}
[[ $* == *"\"jobId\":\"$expected_job\""* ]] || exit 42
[[ $* == *"\"registryRootDir\":\"$expected_registry\""* ]] || exit 43
if [[ -n ${SOCIAL_MONITOR_TEST_STATUS_LOG:-} ]]; then
  printf '%s\n' "$*" >> "$SOCIAL_MONITOR_TEST_STATUS_LOG"
fi
if [[ -n ${SOCIAL_MONITOR_TEST_RAW_STATUS_JSON:-} ]]; then
  printf '%s\n' "$SOCIAL_MONITOR_TEST_RAW_STATUS_JSON"
  exit 0
fi
if [[ -n ${SOCIAL_MONITOR_TEST_STATUS_JSON:-} ]]; then
  jq -c --arg job_id "$expected_job" --arg registry_root "$expected_registry" \
    '. + {jobId: $job_id, registryRootDir: $registry_root}' \
    <<<"$SOCIAL_MONITOR_TEST_STATUS_JSON"
  exit 0
fi
accounts=${SOCIAL_MONITOR_TEST_ACCOUNTS:-'["account-a","account-b"]'}
account_count=$(jq -er 'length' <<<"$accounts")
printf '{"ok":true,"jobId":"%s","registryRootDir":"%s","hasAvailableAccount":true,"availableDedupedAccountNames":%s,"summary":{"ready":%s,"availableDeduped":%s}}\n' \
  "$expected_job" "$expected_registry" "$accounts" "$account_count" "$account_count"
SH
cat > "$BIN/codex" <<'SH'
#!/usr/bin/env bash
while (($#)); do
  if [[ $1 == --output-last-message ]]; then
    if [[ -n ${SOCIAL_MONITOR_TEST_PROBE_LOG:-} ]]; then
      printf '%s\n' "$CODEX_HOME" >> "$SOCIAL_MONITOR_TEST_PROBE_LOG"
    fi
    if [[ -n ${SOCIAL_MONITOR_TEST_PROBE_GATE:-} ]]; then
      : > "${SOCIAL_MONITOR_TEST_PROBE_GATE}.entered"
      while [[ ! -e ${SOCIAL_MONITOR_TEST_PROBE_GATE}.release ]]; do
        /usr/bin/sleep 0.01
      done
    fi
    if [[ -n ${SOCIAL_MONITOR_TEST_FAIL_ACCOUNT:-} ]] \
      && grep -F "\"$SOCIAL_MONITOR_TEST_FAIL_ACCOUNT\"" "$CODEX_HOME/auth.json" >/dev/null; then
      exit 43
    fi
    printf '%s\n' "${SOCIAL_MONITOR_TEST_RESULT:-AUTH_OK}" > "$2"
    exit 0
  fi
  shift
done
exit 42
SH
cat > "$BIN/flock" <<'SH'
#!/usr/bin/env bash
if [[ -n ${SOCIAL_MONITOR_TEST_FLOCK_LOG:-} ]]; then
  printf '%s\n' "$*" >> "$SOCIAL_MONITOR_TEST_FLOCK_LOG"
fi
exec "${SOCIAL_MONITOR_TEST_SYSTEM_FLOCK:?}" "$@"
SH
chmod 0755 "$BIN/subscription-runtime-codex-goal" "$BIN/codex" "$BIN/flock"

run_refresh() {
PATH="$BIN:$PATH" \
SOCIAL_MONITOR_AUTH_REFRESH_TEST_MODE=1 \
SOCIAL_MONITOR_AUTH_ROOT="$AUTH_ROOT" \
SOCIAL_MONITOR_AUTH_TARGET_DIR="$TARGET_DIR" \
SOCIAL_MONITOR_AUTH_REGISTRY_ROOT="$REGISTRY_ROOT" \
SOCIAL_MONITOR_AUTH_PROJECT_ROOT="$PROJECT_ROOT" \
SOCIAL_MONITOR_AUTH_CURSOR_FILE="$CURSOR_FILE" \
SOCIAL_MONITOR_AUTH_ACCOUNT_NAME_FILE="$ACCOUNT_NAME_FILE" \
SOCIAL_MONITOR_AUTH_PROBE_WORKSPACE="$PROBE_WORKSPACE" \
SOCIAL_MONITOR_AUTH_CHANGED_MARKER="$CHANGED_MARKER" \
SOCIAL_MONITOR_AUTH_PROBE_TMP_ROOT="$PROBE_TMP_ROOT" \
SOCIAL_MONITOR_AUTH_POOL_SNAPSHOT_ROOT="$POOL_SNAPSHOT_ROOT" \
SOCIAL_MONITOR_AUTH_POOL_POINTER="$POOL_POINTER" \
SOCIAL_MONITOR_AUTH_POOL_REGISTRY_PREFIX="$PROJECT_ROOT/worker-jobs/" \
SOCIAL_MONITOR_TEST_SYSTEM_FLOCK="$SYSTEM_FLOCK" \
SOCIAL_MONITOR_TEST_EXPECTED_JOB_ID="${SOCIAL_MONITOR_TEST_EXPECTED_JOB_ID:-test-controller}" \
SOCIAL_MONITOR_TEST_EXPECTED_REGISTRY_ROOT="${SOCIAL_MONITOR_TEST_EXPECTED_REGISTRY_ROOT:-$REGISTRY_ROOT}" \
  bash "$ENTRYPOINT" "$@"
}

run_pool_refresh() {
  SOCIAL_MONITOR_TEST_EXPECTED_JOB_ID="$POOL_JOB_ID" \
  SOCIAL_MONITOR_TEST_EXPECTED_REGISTRY_ROOT="$REGISTRY_ROOT" \
  SOCIAL_MONITOR_TEST_ACCOUNTS='["account-m"]' \
    run_refresh --broker-pool-job-id "$POOL_JOB_ID"
}

target_mode() {
  if stat -c '%a' "$TARGET_DIR/auth.json" >/dev/null 2>&1; then
    stat -c '%a' "$TARGET_DIR/auth.json"
  else
    stat -f '%Lp' "$TARGET_DIR/auth.json"
  fi
}

wait_for_file() {
  local file=$1 attempt
  for ((attempt = 0; attempt < 200; attempt += 1)); do
    [[ -e $file ]] && return 0
    /usr/bin/sleep 0.01
  done
  echo "Timed out waiting for fixture file: $file" >&2
  return 1
}

wait_for_line_count() {
  local file=$1 required_count=$2 attempt current_count
  for ((attempt = 0; attempt < 200; attempt += 1)); do
    current_count=0
    if [[ -e $file ]]; then
      current_count=$(/usr/bin/wc -l < "$file")
    fi
    (( current_count >= required_count )) && return 0
    /usr/bin/sleep 0.01
  done
  echo "Timed out waiting for $required_count fixture lines in: $file" >&2
  return 1
}

# The default path remains pointer-driven even if a similarly named ambient
# variable is present; only the root-only CLI option can select a pool job.
SOCIAL_MONITOR_AUTH_POOL_JOB_ID="$POOL_JOB_ID" run_refresh >/dev/null

cmp "$AUTH_ROOT/account-a/auth.json" "$TARGET_DIR/auth.json"
[[ $(cat "$CURSOR_FILE") == 0 ]]
[[ $(cat "$ACCOUNT_NAME_FILE") == account-a ]]
[[ $(target_mode) == 400 ]]
[[ ! -e $TARGET_DIR/auth.json.next && ! -L $TARGET_DIR/auth.json.next ]]
[[ -f $CHANGED_MARKER ]]
[[ -f $CURSOR_FILE.install.lock ]]
[[ ! -e $CURSOR_FILE.lock && ! -L $CURSOR_FILE.lock ]]
jq -e '
  .schemaVersion == 1 and
  (.snapshotId | test("^[0-9a-f]{64}$")) and
  (.accounts | map(.id) == ["account-a", "account-b"]) and
  (.accounts | all(.relativePath | startswith("snapshots/")))
' "$POOL_SNAPSHOT_ROOT/current.json" >/dev/null
[[ $(stat -c '%a' "$POOL_SNAPSHOT_ROOT/current.json" 2>/dev/null || \
      stat -f '%Lp' "$POOL_SNAPSHOT_ROOT/current.json") == 400 ]]
while IFS=$'\t' read -r account relative_path; do
  cmp "$AUTH_ROOT/$account/auth.json" "$POOL_SNAPSHOT_ROOT/$relative_path"
  [[ $(stat -c '%a' "$POOL_SNAPSHOT_ROOT/$relative_path" 2>/dev/null || \
        stat -f '%Lp' "$POOL_SNAPSHOT_ROOT/$relative_path") == 400 ]]
done < <(jq -r '.accounts[] | [.id, .relativePath] | @tsv' \
  "$POOL_SNAPSHOT_ROOT/current.json")

current_generation=$(jq -r '.snapshotId' "$POOL_SNAPSHOT_ROOT/current.json")
expired_generation=$(printf 'f%.0s' {1..64})
install -d "$POOL_SNAPSHOT_ROOT/snapshots/$expired_generation/account-old"
printf '{"account":"old"}\n' > \
  "$POOL_SNAPSHOT_ROOT/snapshots/$expired_generation/account-old/auth.json"
touch -t 202001010000 "$POOL_SNAPSHOT_ROOT/snapshots/$expired_generation"
run_refresh >/dev/null
[[ ! -e $POOL_SNAPSHOT_ROOT/snapshots/$expired_generation ]]
[[ -d $POOL_SNAPSHOT_ROOT/snapshots/$current_generation ]]

rm -f "$CHANGED_MARKER"
SOCIAL_MONITOR_TEST_ACCOUNTS='["account-b"]' run_refresh >/dev/null
cmp "$AUTH_ROOT/account-b/auth.json" "$TARGET_DIR/auth.json"
[[ $(cat "$CURSOR_FILE") == 0 ]]
[[ $(cat "$ACCOUNT_NAME_FILE") == account-b ]]
[[ $(target_mode) == 400 ]]
[[ ! -e $TARGET_DIR/auth.json.next && ! -L $TARGET_DIR/auth.json.next ]]
[[ -f $CHANGED_MARKER ]]

rm -f "$CHANGED_MARKER"
SOCIAL_MONITOR_TEST_FAIL_ACCOUNT=b run_refresh >/dev/null
cmp "$AUTH_ROOT/account-a/auth.json" "$TARGET_DIR/auth.json"
[[ $(cat "$CURSOR_FILE") == 0 ]]
[[ $(cat "$ACCOUNT_NAME_FILE") == account-a ]]
[[ -f $CHANGED_MARKER ]]

old_hash=$(cksum < "$TARGET_DIR/auth.json")
if SOCIAL_MONITOR_TEST_RESULT=WRONG run_refresh >/dev/null 2>&1; then
  echo 'invalid probe result was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$old_hash" ]]
[[ -z $(find "$PROBE_TMP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'auth-probe.*' -print -quit) ]]

# Default and broker-pool invocations share the fixed install lock. The pool
# cannot select/probe while a default refresh is in its isolated probe.
rm -f "$STATUS_LOG" "$PROBE_LOG" "$FLOCK_LOG" "$LOCK_GATE.entered" \
  "$LOCK_GATE.release"
SOCIAL_MONITOR_TEST_ACCOUNTS='["account-a"]' \
  SOCIAL_MONITOR_TEST_STATUS_LOG="$STATUS_LOG" \
  SOCIAL_MONITOR_TEST_FLOCK_LOG="$FLOCK_LOG" \
  SOCIAL_MONITOR_TEST_PROBE_GATE="$LOCK_GATE" run_refresh >/dev/null 2>&1 &
default_refresh_pid=$!
wait_for_file "$LOCK_GATE.entered"
SOCIAL_MONITOR_TEST_STATUS_LOG="$STATUS_LOG" \
  SOCIAL_MONITOR_TEST_FLOCK_LOG="$FLOCK_LOG" run_pool_refresh >/dev/null 2>&1 &
pool_refresh_pid=$!
wait_for_line_count "$FLOCK_LOG" 2
/usr/bin/sleep 0.10
default_status_calls=$(grep -Fc '"jobId":"test-controller"' "$STATUS_LOG" || true)
pool_status_calls=$(grep -Fc "\"jobId\":\"$POOL_JOB_ID\"" "$STATUS_LOG" || true)
[[ $default_status_calls == 1 ]]
[[ $pool_status_calls == 0 ]]
[[ ! -e $POOL_CURSOR_FILE && ! -L $POOL_CURSOR_FILE ]]
: > "$LOCK_GATE.release"
wait "$default_refresh_pid"
wait "$pool_refresh_pid"
[[ $(grep -Fc '"jobId":"test-controller"' "$STATUS_LOG") == 1 ]]
[[ $(grep -Fc "\"jobId\":\"$POOL_JOB_ID\"" "$STATUS_LOG") == 1 ]]
cmp "$AUTH_ROOT/account-m/auth.json" "$TARGET_DIR/auth.json"
[[ -f $CURSOR_FILE.install.lock ]]
[[ ! -e $POOL_CURSOR_FILE.lock && ! -L $POOL_CURSOR_FILE.lock ]]

# Marker semantics follow installed auth bytes, not a scope-local account name.
rm -f "$CHANGED_MARKER"
SOCIAL_MONITOR_TEST_ACCOUNTS='["account-a"]' run_refresh >/dev/null
cmp "$AUTH_ROOT/account-a/auth.json" "$TARGET_DIR/auth.json"
[[ -f $CHANGED_MARKER ]]
rm -f "$CHANGED_MARKER"
run_pool_refresh >/dev/null
cmp "$AUTH_ROOT/account-m/auth.json" "$TARGET_DIR/auth.json"
[[ -f $CHANGED_MARKER ]]

chmod 0666 "$POOL_POINTER"
if run_refresh >/dev/null 2>&1; then
  echo 'group-writable account pool pointer was accepted' >&2
  exit 1
fi
chmod 0600 "$POOL_POINTER"
printf '{"controllerJobId":"test-controller","registryRootDir":"/tmp/escape"}\n' \
  > "$POOL_POINTER"
if run_refresh >/dev/null 2>&1; then
  echo 'out-of-project account pool registry was accepted' >&2
  exit 1
fi
printf '{"controllerJobId":"test-controller","registryRootDir":"%s"}\n' \
  "$REGISTRY_ROOT/../.." > "$POOL_POINTER"
if run_refresh >/dev/null 2>&1; then
  echo 'traversing account pool registry was accepted' >&2
  exit 1
fi
printf '{"controllerJobId":"test-controller","registryRootDir":"%s"}\n' \
  "$REGISTRY_ROOT" > "$POOL_POINTER"
chmod 0600 "$POOL_POINTER"

default_pointer_hash=$(cksum < "$POOL_POINTER")
printf '7\n' > "$CURSOR_FILE"
printf 'account-b\n' > "$ACCOUNT_NAME_FILE"
rm -f "$CHANGED_MARKER" "$STATUS_LOG"
SOCIAL_MONITOR_TEST_STATUS_JSON='{"ok":true,"hasAvailableAccount":true,"availableDedupedAccountNames":["account-m"],"summary":{"ready":1,"availableDeduped":1}}' \
  SOCIAL_MONITOR_TEST_STATUS_LOG="$STATUS_LOG" run_pool_refresh >/dev/null
cmp "$AUTH_ROOT/account-m/auth.json" "$TARGET_DIR/auth.json"
[[ $(cksum < "$POOL_POINTER") == "$default_pointer_hash" ]]
[[ $(cat "$CURSOR_FILE") == 7 ]]
[[ $(cat "$ACCOUNT_NAME_FILE") == account-b ]]
[[ $(cat "$POOL_CURSOR_FILE") == 0 ]]
[[ $(cat "$POOL_ACCOUNT_NAME_FILE") == account-m ]]
[[ $(target_mode) == 400 ]]
[[ ! -e $TARGET_DIR/auth.json.next && ! -L $TARGET_DIR/auth.json.next ]]
[[ ! -e $CHANGED_MARKER && -s $STATUS_LOG ]]

pool_target_hash=$(cksum < "$TARGET_DIR/auth.json")
rm -f "$CHANGED_MARKER"
if SOCIAL_MONITOR_TEST_STATUS_JSON='{"ok":true,"hasAvailableAccount":false,"availableDedupedAccountNames":[],"summary":{"ready":0,"availableDeduped":0}}' \
  SOCIAL_MONITOR_TEST_STATUS_LOG="$STATUS_LOG" run_pool_refresh >/dev/null 2>&1; then
  echo 'nonready broker-managed pool was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]
[[ $(cat "$POOL_CURSOR_FILE") == 0 ]]
[[ $(cat "$POOL_ACCOUNT_NAME_FILE") == account-m ]]
[[ ! -e $TARGET_DIR/auth.json.next && ! -L $TARGET_DIR/auth.json.next ]]

if SOCIAL_MONITOR_TEST_STATUS_JSON='{"ok":true,"hasAvailableAccount":true,"availableDedupedAccountNames":["account-m"],"summary":{"ready":0,"availableDeduped":1}}' \
  run_pool_refresh >/dev/null 2>&1; then
  echo 'broker status with no ready account was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]

if SOCIAL_MONITOR_TEST_STATUS_JSON='{"ok":true,"hasAvailableAccount":true,"availableDedupedAccountNames":["account-m"]}' \
  run_pool_refresh >/dev/null 2>&1; then
  echo 'broker status without a readiness summary was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]

if SOCIAL_MONITOR_TEST_STATUS_JSON='{"ok":true,"hasAvailableAccount":true,"availableDedupedAccountNames":["account-m"],"summary":{"ready":1,"availableDeduped":2}}' \
  run_pool_refresh >/dev/null 2>&1; then
  echo 'broker status with a mismatched deduped count was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]

if SOCIAL_MONITOR_TEST_STATUS_JSON='{"ok":true,"hasAvailableAccount":true,"availableDedupedAccountNames":["account-m","account-m"],"summary":{"ready":2,"availableDeduped":2}}' \
  run_pool_refresh >/dev/null 2>&1; then
  echo 'non-deduped broker account status was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]

rm -f "$PROBE_LOG"
if SOCIAL_MONITOR_TEST_STATUS_JSON='{"ok":true,"hasAvailableAccount":true,"availableDedupedAccountNames":["account-a"],"summary":{"ready":1,"availableDeduped":1}}' \
  SOCIAL_MONITOR_TEST_PROBE_LOG="$PROBE_LOG" run_pool_refresh >/dev/null 2>&1; then
  echo 'broker status account outside the pool manifest was accepted' >&2
  exit 1
fi
[[ ! -e $PROBE_LOG ]]
[[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]

wrong_status_job=$(jq -nc --arg registry_root "$REGISTRY_ROOT" '
  {
    ok: true,
    jobId: "social-monitor-production-account-pool-wrong",
    registryRootDir: $registry_root,
    hasAvailableAccount: true,
    availableDedupedAccountNames: ["account-m"],
    summary: {ready: 1, availableDeduped: 1}
  }
')
if SOCIAL_MONITOR_TEST_RAW_STATUS_JSON="$wrong_status_job" \
  run_pool_refresh >/dev/null 2>&1; then
  echo 'broker status for a different pool job was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]

assert_pool_rejected_before_status() {
  local requested_job_id=$1
  rm -f "$STATUS_LOG"
  if SOCIAL_MONITOR_TEST_EXPECTED_JOB_ID="$requested_job_id" \
    SOCIAL_MONITOR_TEST_EXPECTED_REGISTRY_ROOT="$REGISTRY_ROOT" \
    SOCIAL_MONITOR_TEST_STATUS_LOG="$STATUS_LOG" \
    run_refresh --broker-pool-job-id "$requested_job_id" >/dev/null 2>&1; then
    echo "unsafe broker-managed pool was accepted: $requested_job_id" >&2
    exit 1
  fi
  [[ ! -e $STATUS_LOG ]]
  [[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]
  [[ $(cat "$CURSOR_FILE") == 7 ]]
  [[ $(cat "$POOL_CURSOR_FILE") == 0 ]]
}

assert_pool_rejected_before_status ''
assert_pool_rejected_before_status '../escape'
assert_pool_rejected_before_status 'social-monitor-../escape'
assert_pool_rejected_before_status 'other-project-pool'
assert_pool_rejected_before_status 'social-monitor-missing-pool'
controller_like_job_id=social-monitor-controller-v4
write_pool_manifest "$controller_like_job_id" social-monitor \
  "$PROJECT_ROOT/worker-jobs/$controller_like_job_id" \
  "$PROJECT_ROOT/worktrees/.volume2/$controller_like_job_id" "$REGISTRY_ROOT"
assert_pool_rejected_before_status "$controller_like_job_id"

POOL_MANIFEST=$POOL_JOB_DIRECTORY/job.json
jq --arg project_id other-project '.projectAccessScope.projectId = $project_id' \
  "$POOL_MANIFEST" > "$FIXTURE/wrong-project.json"
mv "$FIXTURE/wrong-project.json" "$POOL_MANIFEST"
assert_pool_rejected_before_status "$POOL_JOB_ID"
write_pool_manifest "$POOL_JOB_ID" social-monitor "$POOL_JOB_ROOT" \
  "$POOL_WORKSPACE" "$REGISTRY_ROOT"

chmod 0775 "$REGISTRY_ROOT"
assert_pool_rejected_before_status "$POOL_JOB_ID"
chmod 0755 "$REGISTRY_ROOT"
chmod 0757 "$REGISTRY_ROOT"
assert_pool_rejected_before_status "$POOL_JOB_ID"
chmod 0755 "$REGISTRY_ROOT"

chmod 0775 "$POOL_JOB_DIRECTORY"
assert_pool_rejected_before_status "$POOL_JOB_ID"
chmod 0755 "$POOL_JOB_DIRECTORY"
chmod 0757 "$POOL_JOB_DIRECTORY"
assert_pool_rejected_before_status "$POOL_JOB_ID"
chmod 0755 "$POOL_JOB_DIRECTORY"

chmod 0664 "$POOL_MANIFEST"
assert_pool_rejected_before_status "$POOL_JOB_ID"
chmod 0644 "$POOL_MANIFEST"
chmod 0646 "$POOL_MANIFEST"
assert_pool_rejected_before_status "$POOL_JOB_ID"
chmod 0644 "$POOL_MANIFEST"

jq --arg job_root "$PROJECT_ROOT/worker-jobs/../escaped-job-root" \
  '.jobRootDir = $job_root' "$POOL_MANIFEST" > "$FIXTURE/unsafe-job-root.json"
mv "$FIXTURE/unsafe-job-root.json" "$POOL_MANIFEST"
assert_pool_rejected_before_status "$POOL_JOB_ID"
write_pool_manifest "$POOL_JOB_ID" social-monitor "$POOL_JOB_ROOT" \
  "$POOL_WORKSPACE" "$REGISTRY_ROOT"

jq --arg workspace "$PROJECT_ROOT/worktrees/../escaped-workspace" \
  '.workspacePath = $workspace | .projectAccessScope.workspaceRoots = [$workspace]' \
  "$POOL_MANIFEST" > "$FIXTURE/unsafe-workspace.json"
mv "$FIXTURE/unsafe-workspace.json" "$POOL_MANIFEST"
assert_pool_rejected_before_status "$POOL_JOB_ID"
write_pool_manifest "$POOL_JOB_ID" social-monitor "$POOL_JOB_ROOT" \
  "$POOL_WORKSPACE" "$REGISTRY_ROOT"

mv "$POOL_MANIFEST" "$FIXTURE/valid-pool-manifest.json"
ln -s "$FIXTURE/valid-pool-manifest.json" "$POOL_MANIFEST"
assert_pool_rejected_before_status "$POOL_JOB_ID"
rm "$POOL_MANIFEST"
mv "$FIXTURE/valid-pool-manifest.json" "$POOL_MANIFEST"

mv "$POOL_JOB_DIRECTORY" "$FIXTURE/valid-pool-directory"
ln -s "$FIXTURE/valid-pool-directory" "$POOL_JOB_DIRECTORY"
assert_pool_rejected_before_status "$POOL_JOB_ID"
rm "$POOL_JOB_DIRECTORY"
mv "$FIXTURE/valid-pool-directory" "$POOL_JOB_DIRECTORY"

mv "$POOL_JOB_ROOT" "$FIXTURE/valid-pool-job-root"
ln -s "$FIXTURE/valid-pool-job-root" "$POOL_JOB_ROOT"
assert_pool_rejected_before_status "$POOL_JOB_ID"
rm "$POOL_JOB_ROOT"
mv "$FIXTURE/valid-pool-job-root" "$POOL_JOB_ROOT"

mv "$POOL_WORKSPACE" "$FIXTURE/valid-pool-workspace"
ln -s "$FIXTURE/valid-pool-workspace" "$POOL_WORKSPACE"
assert_pool_rejected_before_status "$POOL_JOB_ID"
rm "$POOL_WORKSPACE"
mv "$FIXTURE/valid-pool-workspace" "$POOL_WORKSPACE"

mv "$REGISTRY_ROOT" "$FIXTURE/registry-v4-real"
ln -s "$FIXTURE/registry-v4-real" "$REGISTRY_ROOT"
assert_pool_rejected_before_status "$POOL_JOB_ID"
rm "$REGISTRY_ROOT"
mv "$FIXTURE/registry-v4-real" "$REGISTRY_ROOT"

assert_pool_rejected_before_probe() {
  rm -f "$PROBE_LOG"
  if SOCIAL_MONITOR_TEST_PROBE_LOG="$PROBE_LOG" \
    run_pool_refresh >/dev/null 2>&1; then
    echo 'unsafe broker account source was accepted' >&2
    exit 1
  fi
  [[ ! -e $PROBE_LOG ]]
  [[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]
  [[ $(cat "$POOL_CURSOR_FILE") == 0 ]]
  [[ $(cat "$POOL_ACCOUNT_NAME_FILE") == account-m ]]
}

mv "$AUTH_ROOT/account-m/auth.json" "$FIXTURE/account-m-auth.json"
ln -s "$FIXTURE/account-m-auth.json" "$AUTH_ROOT/account-m/auth.json"
assert_pool_rejected_before_probe
rm "$AUTH_ROOT/account-m/auth.json"
mv "$FIXTURE/account-m-auth.json" "$AUTH_ROOT/account-m/auth.json"

mv "$AUTH_ROOT/account-m" "$FIXTURE/account-m-directory"
ln -s "$FIXTURE/account-m-directory" "$AUTH_ROOT/account-m"
assert_pool_rejected_before_probe
rm "$AUTH_ROOT/account-m"
mv "$FIXTURE/account-m-directory" "$AUTH_ROOT/account-m"

if SOCIAL_MONITOR_TEST_ACCOUNTS='["../escape"]' run_refresh >/dev/null 2>&1; then
  echo 'unsafe broker account path was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]

if SOCIAL_MONITOR_TEST_ACCOUNTS='[]' run_refresh >/dev/null 2>&1; then
  echo 'empty broker account pool was accepted' >&2
  exit 1
fi
[[ $(cksum < "$TARGET_DIR/auth.json") == "$pool_target_hash" ]]
grep -F -- '--sandbox read-only' "$ENTRYPOINT" >/dev/null
grep -F -- '--output-last-message' "$ENTRYPOINT" >/dev/null
grep -F -- '--broker-pool-job-id' "$ENTRYPOINT" >/dev/null
grep -F 'registry-v4' "$ENTRYPOINT" >/dev/null
if grep -F 'reader-summary-recovery-maintenance-lib' "$ENTRYPOINT" >/dev/null; then
  echo 'reader-summary recovery maintenance library reference is present' >&2
  exit 1
fi

echo 'Subscription auth refresh tests passed'
