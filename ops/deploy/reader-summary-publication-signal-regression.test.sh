#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
DAILY_RUN=$SCRIPT_DIR/production-runtime/daily-run.sh
WORKER_SOURCE=$SCRIPT_DIR/fixtures/reader-summary-publication-pause-worker.sh
FAKE_DOCKER=$SCRIPT_DIR/fixtures/reader-summary-publication-fake-docker.sh
FAKE_FLOCK=$SCRIPT_DIR/fixtures/reader-summary-publication-fake-flock.sh
FIXTURE=$(mktemp -d "/tmp/reader-summary-publication-signal.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
WORKER=$FIXTURE/reader-summary-publication-pause-worker.sh
sed 's/gpt-5\.5/gpt-5.6-sol/g' "$WORKER_SOURCE" > "$WORKER"
chmod 0755 "$WORKER"

EXPECTED_DATE=2026-07-16
RELEASE_SHA=0123456789abcdef0123456789abcdef01234567

# Production keeps collection before the canonical terminal. The terminal
# receives the pinned date and owns the only production publication path.
grep -F 'npm run run:reader-summary-clean-real-day-collection' "$DAILY_RUN" >/dev/null
# C1 recovery starts from the reviewed first unresolved production date.
grep -F 'READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE=2026-07-23' \
  "$DAILY_RUN" >/dev/null
# This source assertion intentionally matches a literal shell variable reference.
# shellcheck disable=SC2016
grep -F 'READER_SUMMARY_DAILY_PUBLIC_DIRECTORY="$public_dir"' \
  "$DAILY_RUN" >/dev/null
grep -F 'scripts/run-reader-summary-daily-terminal.ts' "$DAILY_RUN" >/dev/null
if grep -F 'scripts/run-reader-summary-production-day.ts' "$DAILY_RUN" >/dev/null; then
  echo 'noncanonical production-day generation remains publishable' >&2
  exit 1
fi
grep -F 'latest-state.v1.json' "$DAILY_RUN" >/dev/null

wait_for_ready() {
  local ready=$1
  local attempts=0
  while [[ ! -s $ready ]]; do
    attempts=$((attempts + 1))
    if ((attempts > 200)); then
      echo 'real daily-run path did not stage its candidate' >&2
      if [[ -s ${ready%/*}/run.log ]]; then
        tail -20 "${ready%/*}/run.log" >&2
      fi
      return 1
    fi
    sleep 0.05
  done
}

prepare_case() {
  local case_dir=$1
  local root=$case_dir/root
  install -d \
    "$root/control/deploy-state" \
    "$root/control/postgres-runtime-current" \
    "$root/runtime" \
    "$case_dir/reports" \
    "$case_dir/public"
  printf '%s\n' "$RELEASE_SHA" > "$root/control/deploy-state/backend.sha"
  printf '%s\n' "$RELEASE_SHA" > "$root/control/postgres-runtime-current/READY"
  printf '%s\n' \
    schemaVersion=reader_summary.daily_delivery_readiness.c1 \
    state=READY \
    requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN \
    activation=reviewed \
    > "$root/control/postgres-runtime-current/reader-summary-daily-c1.readiness"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'set -euo pipefail' \
    '[[ "$#" -eq 2 ]]' \
    "[[ \"\$1\" == --broker-pool-job-id ]]" \
    "[[ \"\$2\" == social-monitor-production-account-pool-terra-v25-20260804 ]]" \
    'exit 0' > "$root/control/refresh-codex-auth.sh"
  chmod +x "$root/control/refresh-codex-auth.sh"
}

assert_previous_latest_unchanged() {
  local case_dir=$1
  [[ ! -e $case_dir/public/latest.v1.json ]]
  [[ ! -e $case_dir/public/latest-state.v1.json ]]
  [[ -e $case_dir/reports/reader-summary-production-day-run.v1.json ]]
  [[ -e $case_dir/reports/reader-summary-production-day-run.$EXPECTED_DATE.v1.json ]]
  [[ ! -e $case_dir/public/reader-summary-production-day-run.$EXPECTED_DATE.v1.json ]]
  [[ ! -e $case_dir/public/reader-summary-production-day-run.$EXPECTED_DATE.publication-proof.v1.json ]]
  [[ ! -e $case_dir/public/reader-summary-production-day-state.$EXPECTED_DATE.v1.json ]]
}

run_daily() {
  local case_dir=$1
  local timeout_ms=$2
  local worker_mode=${3:-pause}
  local failpoint=${4:-}
  local expected_date=${5-$EXPECTED_DATE}
  local test_today=${6:-}
  local date_flag=${7:---today}
  SOCIAL_MONITOR_DAILY_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT="$case_dir/root" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER="$FAKE_DOCKER" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_FLOCK="$FAKE_FLOCK" \
  READER_SUMMARY_DAILY_RUN_EXPECTED_DATE=$expected_date \
  READER_SUMMARY_DAILY_RUN_TEST_TODAY=$test_today \
  READER_SUMMARY_DAILY_RUN_PAUSE_WORKER=$WORKER \
  READER_SUMMARY_DAILY_RUN_REPORT_DIR="$case_dir/reports" \
  READER_SUMMARY_DAILY_RUN_PUBLIC_DIR="$case_dir/public" \
  READER_SUMMARY_DAILY_RUN_READY_FILE="$case_dir/ready" \
  READER_SUMMARY_DAILY_RUN_FAILPOINT=$failpoint \
  READER_SUMMARY_DAILY_RUN_FAILPOINT_READY_FILE="$case_dir/failpoint-ready" \
  READER_SUMMARY_DAILY_RUN_WORKER_MODE=$worker_mode \
  READER_SUMMARY_DAILY_RUN_TIMEOUT_MS=$timeout_ms \
    bash "$DAILY_RUN" "$date_flag"
}

timeout_case=$FIXTURE/timeout
prepare_case "$timeout_case"
set +e
run_daily "$timeout_case" 1000 >"$timeout_case/run.log" 2>&1
timeout_status=$?
set -e
((timeout_status == 124))
assert_previous_latest_unchanged "$timeout_case"

invalid_case=$FIXTURE/invalid
prepare_case "$invalid_case"
set +e
run_daily "$invalid_case" 30000 invalid >"$invalid_case/run.log" 2>&1
invalid_status=$?
set -e
((invalid_status != 0))
assert_previous_latest_unchanged "$invalid_case"

sigkill_case=$FIXTURE/sigkill
prepare_case "$sigkill_case"
run_daily "$sigkill_case" 30000 >"$sigkill_case/run.log" 2>&1 &
daily_pid=$!
wait_for_ready "$sigkill_case/ready"
worker_pid=$(<"$sigkill_case/ready")
kill -KILL "$worker_pid"
set +e
wait "$daily_pid"
sigkill_status=$?
set -e
((sigkill_status != 0))
assert_previous_latest_unchanged "$sigkill_case"

proof_first_case=$FIXTURE/proof-first-sigkill
prepare_case "$proof_first_case"
run_daily "$proof_first_case" 30000 success after-proof-before-report \
  >"$proof_first_case/run.log" 2>&1 &
daily_pid=$!
wait_for_ready "$proof_first_case/failpoint-ready"
failpoint_pid=$(<"$proof_first_case/failpoint-ready")
kill -KILL "$failpoint_pid"
set +e
wait "$daily_pid"
proof_first_status=$?
set -e
((proof_first_status != 0))
[[ ! -e $proof_first_case/public/latest.v1.json ]]
[[ ! -e $proof_first_case/public/latest-state.v1.json ]]
proof_first_proof=$proof_first_case/public/reader-summary-production-day-run.$EXPECTED_DATE.publication-proof.v1.json
proof_first_report=$proof_first_case/public/reader-summary-production-day-run.$EXPECTED_DATE.v1.json
[[ -s $proof_first_proof ]]
[[ ! -e $proof_first_report ]]
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"))' \
  "$proof_first_proof"

report_before_latest_case=$FIXTURE/report-before-latest-sigkill
prepare_case "$report_before_latest_case"
run_daily "$report_before_latest_case" 30000 success after-report-before-latest \
  >"$report_before_latest_case/run.log" 2>&1 &
daily_pid=$!
wait_for_ready "$report_before_latest_case/failpoint-ready"
failpoint_pid=$(<"$report_before_latest_case/failpoint-ready")
kill -KILL "$failpoint_pid"
set +e
wait "$daily_pid"
report_before_latest_status=$?
set -e
((report_before_latest_status != 0))
[[ ! -e $report_before_latest_case/public/latest.v1.json ]]
[[ ! -e $report_before_latest_case/public/latest-state.v1.json ]]
report_before_latest_report=$report_before_latest_case/public/reader-summary-production-day-run.$EXPECTED_DATE.v1.json
report_before_latest_proof=$report_before_latest_case/public/reader-summary-production-day-run.$EXPECTED_DATE.publication-proof.v1.json
[[ -s $report_before_latest_report ]]
[[ -s $report_before_latest_proof ]]
node "$PROJECT_ROOT/scripts/verify-reader-summary-production-day-publication.mjs" \
  --dated-report "$report_before_latest_report" \
  --expected-date "$EXPECTED_DATE" \
  --evidence-artifact "$report_before_latest_case/reports/durable-reader-summary-$EXPECTED_DATE.v1.json" \
  --frontend-artifact "$report_before_latest_case/reports/frontend-reader-summary-$EXPECTED_DATE.fixture.v1.json" \
  --proof "$report_before_latest_proof" >/dev/null

success_case=$FIXTURE/success
prepare_case "$success_case"
run_daily "$success_case" 30000 success >"$success_case/run.log" 2>&1
dated_report=$success_case/public/reader-summary-production-day-run.$EXPECTED_DATE.v1.json
proof=$success_case/public/reader-summary-production-day-run.$EXPECTED_DATE.publication-proof.v1.json
runtime_identity=$success_case/public/runtime-live-identity-$EXPECTED_DATE.v1.json
state=$success_case/public/reader-summary-production-day-state.$EXPECTED_DATE.v1.json
[[ -e $dated_report ]]
[[ -e $proof ]]
[[ -e $runtime_identity ]]
[[ -e $state ]]
cmp -s "$dated_report" "$success_case/public/latest.v1.json"
cmp -s "$state" "$success_case/public/latest-state.v1.json"
node "$PROJECT_ROOT/scripts/verify-reader-summary-production-day-publication.mjs" \
  --dated-report "$dated_report" \
  --expected-date "$EXPECTED_DATE" \
  --evidence-artifact "$success_case/reports/durable-reader-summary-$EXPECTED_DATE.v1.json" \
  --frontend-artifact "$success_case/reports/frontend-reader-summary-$EXPECTED_DATE.fixture.v1.json" \
  --proof "$proof" >/dev/null
node "$PROJECT_ROOT/scripts/verify-reader-summary-production-day-state.mjs" \
  --latest-state "$success_case/public/latest-state.v1.json" \
  --state-dir "$success_case/public" |
  grep -Fx "$EXPECTED_DATE" >/dev/null

complete_public_inodes_before=$(stat -c '%n:%i:%Y' \
  "$dated_report" "$proof" "$runtime_identity" "$state" \
  "$success_case/public/latest.v1.json" \
  "$success_case/public/latest-state.v1.json")
run_daily "$success_case" 30000 success >"$success_case/replay.log" 2>&1
[[ $(stat -c '%n:%i:%Y' \
  "$dated_report" "$proof" "$runtime_identity" "$state" \
  "$success_case/public/latest.v1.json" \
  "$success_case/public/latest-state.v1.json") == \
  "$complete_public_inodes_before" ]]
run_daily "$success_case" 30000 success '' '' 2026-07-18 --yesterday \
  >"$success_case/advance.log" 2>&1
[[ -s $success_case/public/reader-summary-production-day-run.2026-07-17.v1.json ]]
node "$PROJECT_ROOT/scripts/verify-reader-summary-production-day-state.mjs" \
  --latest-state "$success_case/public/latest-state.v1.json" \
  --state-dir "$success_case/public" |
  grep -Fx 2026-07-17 >/dev/null

fresh_case=$FIXTURE/fresh-yesterday
prepare_case "$fresh_case"
run_daily "$fresh_case" 30000 partial '' '' 2026-07-18 --yesterday \
  >"$fresh_case/run.log" 2>&1
[[ -s $fresh_case/public/reader-summary-production-day-state.2026-07-17.v1.json ]]
[[ ! -e $fresh_case/public/reader-summary-production-day-state.2026-07-18.v1.json ]]

catchup_case=$FIXTURE/catchup
prepare_case "$catchup_case"
run_daily "$catchup_case" 30000 partial '' 2026-07-15 \
  >"$catchup_case/partial.log" 2>&1
partial_outcome=$catchup_case/public/reader-summary-production-day-outcome.2026-07-15.v1.json
partial_state=$catchup_case/public/reader-summary-production-day-state.2026-07-15.v1.json
[[ -s $partial_outcome ]]
[[ -s $partial_state ]]
cmp -s "$partial_state" "$catchup_case/public/latest-state.v1.json"
[[ ! -e $catchup_case/public/latest.v1.json ]]
[[ ! -e $catchup_case/public/reader-summary-production-day-run.2026-07-15.v1.json ]]
[[ ! -e $catchup_case/public/reader-summary-production-day-run.2026-07-15.publication-proof.v1.json ]]
partial_public_inodes_before=$(stat -c '%n:%i:%Y' \
  "$partial_outcome" "$partial_state" \
  "$catchup_case/public/latest-state.v1.json")
run_daily "$catchup_case" 30000 partial '' 2026-07-15 \
  >"$catchup_case/partial-replay.log" 2>&1
[[ $(stat -c '%n:%i:%Y' \
  "$partial_outcome" "$partial_state" \
  "$catchup_case/public/latest-state.v1.json") == \
  "$partial_public_inodes_before" ]]

# Once latest-state exists, even a malformed legacy completed-only pointer is
# ignored. The partial terminal Jul15 cursor advances exactly to Jul16.
printf '{ignored malformed legacy\n' >"$catchup_case/public/latest.v1.json"
run_daily "$catchup_case" 30000 success '' '' 2026-07-17 --yesterday \
  >"$catchup_case/run.log" 2>&1
[[ -s $catchup_case/public/reader-summary-production-day-run.2026-07-16.v1.json ]]
[[ -s $catchup_case/public/reader-summary-production-day-run.2026-07-16.publication-proof.v1.json ]]
node "$PROJECT_ROOT/scripts/verify-reader-summary-production-day-state.mjs" \
  --latest-state "$catchup_case/public/latest-state.v1.json" \
  --state-dir "$catchup_case/public" |
  grep -Fx 2026-07-16 >/dev/null

legacy_case=$FIXTURE/legacy-jul22
prepare_case "$legacy_case"
run_daily "$legacy_case" 30000 success '' 2026-07-22 \
  >"$legacy_case/seed.log" 2>&1
rm "$legacy_case/public/latest-state.v1.json"
rm "$legacy_case/public/reader-summary-production-day-state.2026-07-22.v1.json"
rm -f "$legacy_case/ready"
run_daily "$legacy_case" 30000 success '' '' 2026-07-30 --yesterday \
  >"$legacy_case/migration.log" 2>&1
[[ -s $legacy_case/public/reader-summary-production-day-run.2026-07-23.v1.json ]]
[[ ! -e $legacy_case/public/reader-summary-production-day-run.2026-07-29.v1.json ]]
node "$PROJECT_ROOT/scripts/verify-reader-summary-production-day-state.mjs" \
  --latest-state "$legacy_case/public/latest-state.v1.json" \
  --state-dir "$legacy_case/public" |
  grep -Fx 2026-07-23 >/dev/null

unavailable_case=$FIXTURE/unavailable
prepare_case "$unavailable_case"
run_daily "$unavailable_case" 30000 unavailable \
  >"$unavailable_case/run.log" 2>&1
unavailable_outcome=$unavailable_case/public/reader-summary-production-day-outcome.$EXPECTED_DATE.v1.json
unavailable_state=$unavailable_case/public/reader-summary-production-day-state.$EXPECTED_DATE.v1.json
[[ -s $unavailable_outcome ]]
[[ -s $unavailable_state ]]
cmp -s "$unavailable_state" "$unavailable_case/public/latest-state.v1.json"
[[ ! -e $unavailable_case/public/latest.v1.json ]]
[[ ! -e $unavailable_case/public/reader-summary-production-day-run.$EXPECTED_DATE.v1.json ]]
[[ ! -e $unavailable_case/public/reader-summary-production-day-run.$EXPECTED_DATE.publication-proof.v1.json ]]

recovery_case=$FIXTURE/state-before-latest-sigkill
prepare_case "$recovery_case"
run_daily "$recovery_case" 30000 partial after-state-before-latest \
  >"$recovery_case/initial.log" 2>&1 &
daily_pid=$!
wait_for_ready "$recovery_case/failpoint-ready"
failpoint_pid=$(<"$recovery_case/failpoint-ready")
kill -KILL "$failpoint_pid"
set +e
wait "$daily_pid"
recovery_status=$?
set -e
((recovery_status != 0))
[[ -s $recovery_case/public/reader-summary-production-day-state.$EXPECTED_DATE.v1.json ]]
[[ ! -e $recovery_case/public/latest-state.v1.json ]]
rm -f "$recovery_case/ready" "$recovery_case/failpoint-ready"
run_daily "$recovery_case" 30000 success '' '' 2026-07-18 --yesterday \
  >"$recovery_case/recovery.log" 2>&1
[[ -s $recovery_case/public/reader-summary-production-day-run.2026-07-17.v1.json ]]
node "$PROJECT_ROOT/scripts/verify-reader-summary-production-day-state.mjs" \
  --latest-state "$recovery_case/public/latest-state.v1.json" \
  --state-dir "$recovery_case/public" |
  grep -Fx 2026-07-17 >/dev/null

up_to_date_case=$FIXTURE/up-to-date
prepare_case "$up_to_date_case"
run_daily "$up_to_date_case" 30000 unavailable \
  >"$up_to_date_case/initial.log" 2>&1
rm -f "$up_to_date_case/ready"
run_daily "$up_to_date_case" 30000 success '' '' 2026-07-17 --yesterday \
  >"$up_to_date_case/run.log" 2>&1
[[ ! -e $up_to_date_case/public/latest.v1.json ]]
[[ ! -e $up_to_date_case/ready ]]

malformed_case=$FIXTURE/malformed-legacy
prepare_case "$malformed_case"
printf '{malformed legacy\n' >"$malformed_case/public/latest.v1.json"
set +e
run_daily "$malformed_case" 30000 success '' '' 2026-07-30 --yesterday \
  >"$malformed_case/run.log" 2>&1
malformed_status=$?
set -e
((malformed_status != 0))
[[ ! -e $malformed_case/ready ]]
[[ ! -e $malformed_case/public/latest-state.v1.json ]]

immutable_case=$FIXTURE/partial-to-complete
prepare_case "$immutable_case"
run_daily "$immutable_case" 30000 partial \
  >"$immutable_case/partial.log" 2>&1
immutable_outcome=$immutable_case/public/reader-summary-production-day-outcome.$EXPECTED_DATE.v1.json
immutable_state=$immutable_case/public/reader-summary-production-day-state.$EXPECTED_DATE.v1.json
immutable_before=$(stat -c '%n:%i:%Y' \
  "$immutable_outcome" "$immutable_state" \
  "$immutable_case/public/latest-state.v1.json")
set +e
run_daily "$immutable_case" 30000 success \
  >"$immutable_case/complete.log" 2>&1
immutable_status=$?
set -e
((immutable_status != 0))
[[ $(stat -c '%n:%i:%Y' \
  "$immutable_outcome" "$immutable_state" \
  "$immutable_case/public/latest-state.v1.json") == "$immutable_before" ]]
[[ ! -e $immutable_case/public/latest.v1.json ]]
[[ ! -e $immutable_case/public/reader-summary-production-day-run.$EXPECTED_DATE.v1.json ]]
[[ ! -e $immutable_case/public/reader-summary-production-day-run.$EXPECTED_DATE.publication-proof.v1.json ]]

conflict_case=$FIXTURE/conflicting-state
prepare_case "$conflict_case"
conflicting_state=$conflict_case/public/reader-summary-production-day-state.$EXPECTED_DATE.v1.json
printf 'conflicting-immutable-state\n' >"$conflicting_state"
cp "$conflicting_state" "$conflict_case/expected-conflicting-state"
set +e
run_daily "$conflict_case" 30000 success \
  >"$conflict_case/run.log" 2>&1
conflict_status=$?
set -e
((conflict_status != 0))
cmp -s "$conflict_case/expected-conflicting-state" "$conflicting_state"
[[ ! -e $conflict_case/public/latest.v1.json ]]
[[ ! -e $conflict_case/public/latest-state.v1.json ]]
[[ ! -e $conflict_case/public/reader-summary-production-day-run.$EXPECTED_DATE.v1.json ]]

printf 'Daily terminal cursor migration, monotonic advance, replay, immutability, no-article, and fail-closed regression OK\n'
