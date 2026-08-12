#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DAILY_RUN=$SCRIPT_DIR/daily-run.sh
DAILY_SERVICE=$SCRIPT_DIR/social-monitor-daily.service
DAILY_TIMER=$SCRIPT_DIR/social-monitor-daily.timer

grep -F 'postgres-runtime-current/compose.postgres-runtime.yml' "$DAILY_RUN" >/dev/null
grep -F 'compose.agent-runtime-model.yml' "$DAILY_RUN" >/dev/null
grep -F 'daily-run-singleton.lock' "$DAILY_RUN" >/dev/null
# The assertions below intentionally match literal shell variables.
# shellcheck disable=SC2016
grep -F 'runtime_release != "$backend_release"' "$DAILY_RUN" >/dev/null
# shellcheck disable=SC2016
grep -F '"$FLOCK_COMMAND" -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8' \
  "$DAILY_RUN" >/dev/null
grep -Fx 'ExecStart=/var/data/social-monitor/control/daily-run.sh --yesterday' \
  "$DAILY_SERVICE" >/dev/null
grep -Fx 'Unit=social-monitor-daily.service' "$DAILY_TIMER" >/dev/null
grep -Fx 'Restart=no' "$DAILY_SERVICE" >/dev/null

singleton_lock_line=$(grep -n 'daily-run-singleton.lock' "$DAILY_RUN" | cut -d: -f1)
admission_lock_line=$(grep -n 'daily-run.lock"' "$DAILY_RUN" | cut -d: -f1)
release_line=$(grep -n 'check_runtime_release || exit 75' "$DAILY_RUN" | tail -1 | cut -d: -f1)
auth_line=$(grep -n 'refresh-codex-auth.sh" --broker-pool-job-id' "$DAILY_RUN" | cut -d: -f1)
runtime_line=$(grep -n 'profile app up -d --no-deps agent-runtime' "$DAILY_RUN" | cut -d: -f1)
daily_line=$(grep -n 'profile daily run --rm --no-deps' "$DAILY_RUN" | cut -d: -f1)
((singleton_lock_line < admission_lock_line && \
  admission_lock_line < release_line && release_line < auth_line && \
  auth_line < runtime_line && runtime_line < daily_line)) || {
  echo 'daily V6 runtime admission ordering is unsafe' >&2
  exit 1
}

test_root=$(mktemp -d /tmp/social-monitor-daily-runtime-contract.XXXXXX)
trap 'rm -rf "$test_root"' EXIT HUP INT TERM
readonly RELEASE_SHA=0123456789abcdef0123456789abcdef01234567

prepare_case() {
  local name=$1
  local case_root=$test_root/$name
  install -d "$case_root/control/postgres-runtime-current" \
    "$case_root/control/deploy-state"
  cat >"$case_root/flock" <<EOF
#!/usr/bin/env bash
printf '%s\\n' "\$*" >>'$case_root/flock.calls'
EOF
  cat >"$case_root/control/refresh-codex-auth.sh" <<EOF
#!/usr/bin/env bash
printf '%s\\n' "\$*" >'$case_root/auth.called'
exit 91
EOF
  cat >"$case_root/docker" <<EOF
#!/usr/bin/env bash
printf '%s\\n' "\$*" >>'$case_root/docker.calls'
exit 92
EOF
  chmod +x "$case_root/flock" "$case_root/control/refresh-codex-auth.sh" \
    "$case_root/docker"
  printf '%s\n' "$case_root"
}

run_daily() {
  local case_root=$1
  SOCIAL_MONITOR_DAILY_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT="$case_root" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ADMISSION_WAIT_SECONDS=0 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_FLOCK="$case_root/flock" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER="$case_root/docker" \
    bash "$DAILY_RUN" --yesterday
}

run_check() {
  local case_root=$1
  SOCIAL_MONITOR_DAILY_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT="$case_root" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ADMISSION_WAIT_SECONDS=0 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_FLOCK="$case_root/flock" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER="$case_root/docker" \
    bash "$DAILY_RUN" --check-readiness
}

mismatch_root=$(prepare_case release-mismatch)
printf '%s\n' "$RELEASE_SHA" >"$mismatch_root/control/postgres-runtime-current/READY"
printf '%s\n' 1111111111111111111111111111111111111111 \
  >"$mismatch_root/control/deploy-state/backend.sha"
set +e
run_check "$mismatch_root" >"$mismatch_root/stdout" 2>"$mismatch_root/stderr"
mismatch_status=$?
set -e
[[ $mismatch_status -eq 75 ]]
grep -Fx 'daily production-day runtime is not committed by the backend release' \
  "$mismatch_root/stderr" >/dev/null
[[ ! -e "$mismatch_root/flock.calls" && ! -e "$mismatch_root/auth.called" && \
   ! -e "$mismatch_root/docker.calls" ]]

canonical_root=$(prepare_case canonical)
printf '%s\n' "$RELEASE_SHA" \
  >"$canonical_root/control/postgres-runtime-current/READY"
printf '%s\n' "$RELEASE_SHA" \
  >"$canonical_root/control/deploy-state/backend.sha"
run_check "$canonical_root" >"$canonical_root/check.stdout" \
  2>"$canonical_root/check.stderr"
[[ ! -s "$canonical_root/check.stdout" && ! -s "$canonical_root/check.stderr" ]]
[[ ! -e "$canonical_root/flock.calls" && ! -e "$canonical_root/auth.called" && \
   ! -e "$canonical_root/docker.calls" ]]

set +e
run_daily "$canonical_root" >"$canonical_root/stdout" \
  2>"$canonical_root/stderr"
canonical_status=$?
set -e
[[ $canonical_status -eq 91 ]] || {
  echo "canonical release did not reach retained auth admission, got $canonical_status" >&2
  exit 1
}
grep -Fx -- \
  '--broker-pool-job-id social-monitor-production-account-pool-terra-v25-20260804' \
  "$canonical_root/auth.called" >/dev/null
diff -u <(printf '%s\n' '-n 9' '-w 0 8') "$canonical_root/flock.calls"
[[ ! -e "$canonical_root/docker.calls" ]]

printf 'production daily V6 runtime contract test passed\n'
