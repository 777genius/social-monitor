#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DAILY_RUN=$SCRIPT_DIR/daily-run.sh
DAILY_SERVICE=$SCRIPT_DIR/social-monitor-daily.service
DAILY_TIMER=$SCRIPT_DIR/social-monitor-daily.timer
DAILY_ARTIFACTS_COMPOSE=$SCRIPT_DIR/compose.daily-artifacts.yml
C1_READINESS=$SCRIPT_DIR/reader-summary-daily-c1.readiness

grep -Fx 'state=READY' "$C1_READINESS" >/dev/null
grep -Fx 'requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN' \
  "$C1_READINESS" >/dev/null
grep -Fx 'activation=reviewed' "$C1_READINESS" >/dev/null

! grep -F 'DAILY_AUTH_POOL_JOB_ID=' "$DAILY_RUN"
! grep -F -- '--broker-pool-job-id' "$DAILY_RUN"
# The assertions below intentionally match literal nested-shell variables.
# shellcheck disable=SC2016
grep -Fx \
  '"$ROOT/control/refresh-codex-auth.sh"' \
  "$DAILY_RUN" >/dev/null
grep -F 'scripts/run-reader-summary-production-day.ts \' "$DAILY_RUN" >/dev/null
grep -F -- '--date "$requested_date" --update' "$DAILY_RUN" >/dev/null
grep -F 'scripts/verify-reader-summary-production-day-publication.mjs' \
  "$DAILY_RUN" >/dev/null
grep -F 'scripts/verify-reader-summary-production-day-state.mjs' \
  "$DAILY_RUN" >/dev/null
grep -F 'latest-state.v1.json' "$DAILY_RUN" >/dev/null
grep -F \
  'public_dir=${READER_SUMMARY_DAILY_RUN_PUBLIC_DIR:-/var/lib/social-monitor/artifacts/reports/reader-summary-production-v2}' \
  "$DAILY_RUN" >/dev/null
grep -Fx '      - /var/data/social-monitor/artifacts:/var/lib/social-monitor/artifacts' \
  "$DAILY_ARTIFACTS_COMPOSE" >/dev/null
grep -F -- '--allow-historical --allow-historical-provider-collection' \
  "$DAILY_RUN" >/dev/null
grep -F 'READER_SUMMARY_PRODUCTION_HISTORY_COLLECTION_DIR=/var/lib/social-monitor/artifacts/reader-summary-production-history-collection' \
  "$DAILY_RUN" >/dev/null
grep -F 'DATE_FLAG=${1:---yesterday}' "$DAILY_RUN" >/dev/null
! grep -Eq 'READER_SUMMARY.*(MAINTENANCE|HISTORICAL).*DATE_FLAG' "$DAILY_RUN"

if grep -Eq \
  '(allow-degraded|00000000-0000-7000-8000-00000000090[12]|daily-c1|delivery-c1|daily-catch-up)' \
  "$DAILY_RUN" "$DAILY_SERVICE" "$DAILY_TIMER"; then
  echo 'normal V6 daily schedule retains C1 scope or degraded mode' >&2
  exit 1
fi

# The systemd path is live-production only. Historical recovery uses the
# separately hash-bound dataset-manifest flow and cannot weaken this timer.
! grep -F 'allow-historical' "$DAILY_RUN" "$DAILY_SERVICE" "$DAILY_TIMER"
! grep -F -- '--frozen-date' "$DAILY_RUN" "$DAILY_SERVICE" "$DAILY_TIMER"

grep -Fx 'ExecStart=/var/data/social-monitor/control/daily-run.sh --yesterday' \
  "$DAILY_SERVICE" >/dev/null
[[ $(grep -c '^ExecStart=' "$DAILY_SERVICE") -eq 1 ]]
! grep -Eq '^Exec(Condition|StartPre|StopPost)=' "$DAILY_SERVICE"
grep -Fx 'TimeoutStartSec=19800' "$DAILY_SERVICE" >/dev/null
grep -Fx 'Unit=social-monitor-daily.service' "$DAILY_TIMER" >/dev/null
grep -Fx 'OnCalendar=*-*-* 00:15:00 UTC' "$DAILY_TIMER" >/dev/null
grep -Fx 'Persistent=true' "$DAILY_TIMER" >/dev/null

test_root=$(mktemp -d /tmp/social-monitor-daily-run-test.XXXXXX)
trap 'rm -rf "$test_root"' EXIT HUP INT TERM
mkdir -p "$test_root/control/postgres-runtime-current"
fake_flock=$test_root/fail-flock
cat >"$fake_flock" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$0.calls"
exit 1
EOF
chmod +x "$fake_flock"
work_marker=$test_root/work-started
fake_docker=$test_root/fake-docker
cat >"$fake_docker" <<EOF
#!/usr/bin/env bash
touch '$work_marker'
EOF
cat >"$test_root/control/refresh-codex-auth.sh" <<EOF
#!/usr/bin/env bash
touch '$work_marker'
EOF
chmod +x "$fake_docker" "$test_root/control/refresh-codex-auth.sh"
set +e
SOCIAL_MONITOR_DAILY_RUN_TEST_MODE=1 \
SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT="$test_root" \
SOCIAL_MONITOR_DAILY_RUN_TEST_FLOCK="$fake_flock" \
SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER="$fake_docker" \
  bash "$DAILY_RUN" --yesterday >"$test_root/stdout" 2>"$test_root/stderr"
status=$?
set -e
[[ $status -eq 75 ]] || {
  echo "singleton contention must exit 75, got $status" >&2
  exit 1
}
[[ ! -s "$test_root/stdout" ]]
grep -Fx 'daily production-day run already active' "$test_root/stderr" >/dev/null
[[ $(wc -l <"$test_root/stderr") -eq 1 ]]
grep -Fx -- '-n 9' "$fake_flock.calls" >/dev/null
[[ $(wc -l <"$fake_flock.calls") -eq 1 ]]
[[ ! -e "$work_marker" ]]

for invalid in 2026-07-22 2026-08-13 not-a-date; do
  set +e
  SOCIAL_MONITOR_DAILY_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT="$test_root" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_FLOCK="$fake_flock" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER="$fake_docker" \
    bash "$DAILY_RUN" --maintenance-date "$invalid" >/dev/null 2>"$test_root/invalid"
  status=$?
  set -e
  [[ $status -eq 64 ]]
  grep -Fx 'historical daily production-day date is outside the reviewed recovery bound' \
    "$test_root/invalid" >/dev/null
done

printf 'daily V6 reader-summary schedule wiring test passed\n'
