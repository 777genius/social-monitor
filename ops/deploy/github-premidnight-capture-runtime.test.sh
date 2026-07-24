#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/github-premidnight-capture-runtime-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

RUNNER=$SCRIPT_DIR/production-runtime/github-premidnight-capture-v1.sh
FAKE_DATE=$SCRIPT_DIR/fixtures/github-premidnight-capture-fake-date.sh
FAKE_DOCKER=$SCRIPT_DIR/fixtures/github-premidnight-capture-fake-docker.sh
FAKE_FLOCK=$SCRIPT_DIR/fixtures/github-premidnight-capture-fake-flock.sh
FAKE_TIMEOUT=$SCRIPT_DIR/fixtures/github-premidnight-capture-fake-timeout.sh
ROOT=$FIXTURE/root
DATE_SEQUENCE=$FIXTURE/date-sequence
DATE_STATE=$FIXTURE/date-state
DOCKER_EVENTS=$FIXTURE/docker-events
FLOCK_EVENTS=$FIXTURE/flock-events
TIMEOUT_EVENTS=$FIXTURE/timeout-events
RELEASE=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

mkdir -p "$ROOT/control/deploy-state" \
  "$ROOT/control/postgres-runtime-current" \
  "$ROOT/integration" \
  "$ROOT/secrets"
touch "$ROOT/integration/docker-compose.yml" \
  "$ROOT/control/compose.production.yml" \
  "$ROOT/control/compose.managed-db.yml" \
  "$ROOT/control/postgres-runtime-current/compose.postgres-runtime.yml" \
  "$ROOT/secrets/production.env"
printf '%s\n' "$RELEASE" > "$ROOT/control/postgres-runtime-current/READY"
printf '%s\n' "$RELEASE" > "$ROOT/control/deploy-state/backend.sha"

fail() {
  printf 'GitHub pre-midnight runtime test failure: %s\n' "$*" >&2
  exit 1
}

reset_case() {
  : > "$DATE_SEQUENCE"
  for sample in "$@"; do
    printf '%s\n' "$sample" >> "$DATE_SEQUENCE"
  done
  rm -f "$DATE_STATE" "$DOCKER_EVENTS" "$FLOCK_EVENTS" "$TIMEOUT_EVENTS"
}

run_capture() {
  GITHUB_PREMIDNIGHT_FAKE_DATE_SEQUENCE=$DATE_SEQUENCE \
  GITHUB_PREMIDNIGHT_FAKE_DATE_STATE=$DATE_STATE \
  GITHUB_PREMIDNIGHT_FAKE_DOCKER_EVENTS=$DOCKER_EVENTS \
  GITHUB_PREMIDNIGHT_FAKE_FLOCK_EVENTS=$FLOCK_EVENTS \
  GITHUB_PREMIDNIGHT_FAKE_TIMEOUT_EVENTS=$TIMEOUT_EVENTS \
  GITHUB_PREMIDNIGHT_FAKE_DOCKER_STATUS=${DOCKER_STATUS:-0} \
  GITHUB_PREMIDNIGHT_FAKE_DOCKER_CLEANUP_STATUS=${CLEANUP_STATUS:-0} \
  GITHUB_PREMIDNIGHT_FAKE_DOCKER_OUTPUT="${DOCKER_OUTPUT-Reader summary clean real-day collection OK (10 fresh items)}" \
  GITHUB_PREMIDNIGHT_FAKE_FLOCK_SINGLETON_STATUS=${SINGLETON_STATUS:-0} \
  GITHUB_PREMIDNIGHT_FAKE_FLOCK_ADMISSION_STATUS=${ADMISSION_STATUS:-0} \
  SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_MODE=1 \
  SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_ROOT=$ROOT \
  SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_DATE=$FAKE_DATE \
  SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_DOCKER=$FAKE_DOCKER \
  SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_FLOCK=$FAKE_FLOCK \
  SOCIAL_MONITOR_GITHUB_PREMIDNIGHT_CAPTURE_TEST_TIMEOUT=$FAKE_TIMEOUT \
    bash "$RUNNER"
}

assert_no_runtime_command() {
  [[ ! -e $DOCKER_EVENTS ]] || fail 'Docker was invoked unexpectedly'
  [[ ! -e $TIMEOUT_EVENTS ]] || fail 'timeout was invoked unexpectedly'
}

set +e
bash "$RUNNER" unexpected >/dev/null 2>&1
argument_status=$?
set -e
[[ $argument_status == 64 ]] || fail 'capture launcher accepted an argument'

sample_2350='1784937000 2026-07-24 235000'
reset_case "$sample_2350" "$sample_2350"
run_capture
[[ $(<"$FLOCK_EVENTS") == $'-n 9\n-w 60 8' ]] || \
  fail 'singleton and shared PostgreSQL admission were not acquired exactly'
[[ $(<"$TIMEOUT_EVENTS") == \
   $'--kill-after=3s 540s\n--kill-after=1s 3s' ]] || \
  fail 'collection and cleanup runtimes were not bounded'
IFS=$'\t' read -r -a docker_args < "$DOCKER_EVENTS"
expected_command=(
  compose -p social-monitor-prod
  --env-file "$ROOT/secrets/production.env"
  -f "$ROOT/integration/docker-compose.yml"
  -f "$ROOT/control/compose.production.yml"
  -f "$ROOT/control/compose.managed-db.yml"
  -f "$ROOT/control/postgres-runtime-current/compose.postgres-runtime.yml"
  --profile daily run --no-deps
  --name social-monitor-prod-github-premidnight-capture-v1
  --env SUMMARY_MODEL_PROVIDER=deterministic
  --env READER_SUMMARY_MODEL_PROVIDER=deterministic
  --env READER_SUMMARY_TOPIC_LABELER=deterministic
  --env OPENAI_API_KEY=
  --env X_COLLECTOR_ENABLED=0
  --env X_COLLECTOR_EXPERIMENTAL_ENABLED=0
  daily-runner
  node scripts/run-with-timeout.mjs
  --timeout-ms 540000
  --node-options --max-old-space-size=768
  -- ./node_modules/.bin/ts-node -r tsconfig-paths/register
  scripts/run-reader-summary-clean-real-day-collection.ts
  --providers github-trending-page
  --date 2026-07-24
)
[[ ${#docker_args[@]} == ${#expected_command[@]} ]] || \
  fail 'daily-runner command argument count drifted'
for index in "${!expected_command[@]}"; do
  [[ ${docker_args[$index]} == "${expected_command[$index]}" ]] || \
    fail "daily-runner command drifted at argument $index"
done
[[ $(grep -c '^rm' "$DOCKER_EVENTS") == 1 ]] || \
  fail 'capture container cleanup was not attempted exactly once'
grep -Fx $'rm\t-f\tsocial-monitor-prod-github-premidnight-capture-v1' \
  "$DOCKER_EVENTS" >/dev/null || fail 'capture container cleanup target drifted'
if grep -Eq 'run-reader-summary-production-day|agent-runtime|hacker-news|reddit|rss|x-twitter' \
  "$DOCKER_EVENTS"; then
  fail 'capture command included AI, the daily workflow, or another provider'
fi
if compgen -G "$ROOT/control/github-premidnight-capture-v1.*.log" >/dev/null; then
  fail 'capture output log was not removed'
fi

sample_2345='1784936700 2026-07-24 234500'
reset_case "$sample_2345" "$sample_2345"
run_capture >/dev/null
grep -F -- $'--date\t2026-07-24' "$DOCKER_EVENTS" >/dev/null || \
  fail '23:45:00 boundary did not retain the same UTC day'

reset_case "$sample_2350"
set +e
SINGLETON_STATUS=1 run_capture >/dev/null 2>&1
singleton_status=$?
set -e
[[ $singleton_status == 75 ]] || fail 'singleton contention was swallowed'
[[ $(<"$FLOCK_EVENTS") == '-n 9' ]] || fail 'singleton replay did extra work'
assert_no_runtime_command

reset_case '1784936699 2026-07-24 234459'
set +e
run_capture >/dev/null 2>&1
wrong_time_status=$?
set -e
[[ $wrong_time_status == 64 ]] || fail 'wrong-time capture did not fail closed'
[[ ! -e $FLOCK_EVENTS ]] || fail 'wrong-time capture attempted locking'
assert_no_runtime_command

reset_case '1784937000 2026-07-25 235000'
set +e
run_capture >/dev/null 2>&1
incoherent_clock_status=$?
set -e
[[ $incoherent_clock_status == 64 ]] || \
  fail 'incoherent UTC date and epoch were accepted'
[[ ! -e $FLOCK_EVENTS ]] || fail 'incoherent UTC clock attempted locking'
assert_no_runtime_command

reset_case "$sample_2350" '1784936999 2026-07-24 234959'
set +e
run_capture >/dev/null 2>&1
backward_clock_status=$?
set -e
[[ $backward_clock_status == 75 ]] || \
  fail 'backwards UTC clock movement was accepted'
assert_no_runtime_command

reset_case "$sample_2350"
set +e
ADMISSION_STATUS=1 run_capture >/dev/null 2>&1
admission_status=$?
set -e
[[ $admission_status == 75 ]] || fail 'admission timeout did not fail closed'
[[ $(<"$FLOCK_EVENTS") == $'-n 9\n-w 60 8' ]] || \
  fail 'admission timeout did not use the dedicated/shared locks'
assert_no_runtime_command

reset_case "$sample_2350" "$sample_2350"
set +e
DOCKER_STATUS=42 run_capture >/dev/null 2>&1
command_status=$?
set -e
[[ $command_status == 42 ]] || fail 'collection command failure was swallowed'
grep -Fx $'rm\t-f\tsocial-monitor-prod-github-premidnight-capture-v1' \
  "$DOCKER_EVENTS" >/dev/null || fail 'failed collection container was not cleaned'

reset_case "$sample_2350" "$sample_2350"
set +e
DOCKER_OUTPUT=$'Reader summary clean real-day collection local source unavailable: connection refused\nReader summary clean real-day collection artifact OK (10 fresh items)' \
  run_capture >/dev/null 2>&1
fallback_status=$?
set -e
[[ $fallback_status == 70 ]] || fail 'existing-artifact fallback was accepted'
grep -Fx $'rm\t-f\tsocial-monitor-prod-github-premidnight-capture-v1' \
  "$DOCKER_EVENTS" >/dev/null || fail 'fallback capture container was not cleaned'

reset_case "$sample_2350" "$sample_2350"
set +e
DOCKER_OUTPUT='Reader summary clean real-day collection OK (0 fresh items)' \
  run_capture >/dev/null 2>&1
empty_capture_status=$?
set -e
[[ $empty_capture_status == 70 ]] || \
  fail 'zero-item live collection was accepted as a capture'

reset_case "$sample_2350" "$sample_2350"
set +e
CLEANUP_STATUS=41 run_capture >/dev/null 2>&1
cleanup_status=$?
set -e
[[ $cleanup_status == 74 ]] || fail 'container cleanup failure was swallowed'

reset_case "$sample_2350" '1784937600 2026-07-25 000000'
set +e
run_capture >/dev/null 2>&1
midnight_status=$?
set -e
[[ $midnight_status != 0 ]] || fail 'capture crossed UTC midnight'
assert_no_runtime_command

reset_case '1784937599 2026-07-24 235959'
set +e
run_capture >/dev/null 2>&1
latest_guard_status=$?
set -e
[[ $latest_guard_status == 75 ]] || \
  fail '23:59:59 boundary ignored the finalization reserve'
[[ $(<"$FLOCK_EVENTS") == '-n 9' ]] || \
  fail '23:59:59 boundary attempted PostgreSQL admission'
assert_no_runtime_command

sample_235949='1784937589 2026-07-24 235949'
reset_case "$sample_235949" "$sample_235949"
run_capture
[[ $(<"$FLOCK_EVENTS") == $'-n 9\n-w 1 8' ]] || \
  fail 'late admission was not capped by the midnight deadline'
[[ $(<"$TIMEOUT_EVENTS") == \
   $'--kill-after=3s 1s\n--kill-after=1s 3s' ]] || \
  fail 'late collection was not capped before midnight'
grep -F -- $'--timeout-ms\t1000' "$DOCKER_EVENTS" >/dev/null || \
  fail 'inner collection timeout exceeded the midnight deadline'

timer=$SCRIPT_DIR/production-runtime/social-monitor-github-premidnight-capture-v1.timer
service=$SCRIPT_DIR/production-runtime/social-monitor-github-premidnight-capture-v1.service
grep -Fx 'OnCalendar=*-*-* 23:50:00 UTC' "$timer" >/dev/null || \
  fail 'timer is not fixed at 23:50 UTC'
grep -Fx 'Persistent=false' "$timer" >/dev/null || \
  fail 'timer persistence must be disabled'
grep -Fx 'RandomizedDelaySec=0' "$timer" >/dev/null || \
  fail 'timer random delay must be zero'
grep -Fx 'Unit=social-monitor-github-premidnight-capture-v1.service' \
  "$timer" >/dev/null || fail 'timer target drifted'
grep -Fx 'ExecStart=/var/data/social-monitor/control/github-premidnight-capture-v1.sh' \
  "$service" >/dev/null || fail 'service launcher drifted'
grep -Fx 'TimeoutStartSec=600' "$service" >/dev/null || \
  fail 'service timeout no longer contains the bounded capture and cleanup'
grep -Fx 'Restart=no' "$service" >/dev/null || fail 'service must not restart'

printf 'GitHub pre-midnight capture runtime tests passed\n'
