#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DAILY_RUN=$SCRIPT_DIR/daily-run.sh
DAILY_SERVICE=$SCRIPT_DIR/social-monitor-daily.service
C1_READINESS=$SCRIPT_DIR/reader-summary-daily-c1.readiness

grep -Fx 'readonly DAILY_AUTH_POOL_JOB_ID=social-monitor-production-account-pool-terra-v25-20260804' \
  "$DAILY_RUN" >/dev/null
# The test asserts literal runtime expansion syntax.
# shellcheck disable=SC2016
grep -Fx '"$ROOT/control/refresh-codex-auth.sh" --broker-pool-job-id "$DAILY_AUTH_POOL_JOB_ID"' \
  "$DAILY_RUN" >/dev/null
grep -F 'npm run migrate:deploy' "$DAILY_RUN" >/dev/null
grep -F 'scripts/run-reader-summary-daily-catch-up.ts' "$DAILY_RUN" >/dev/null
# The test asserts literal nested-shell syntax.
# shellcheck disable=SC2016
grep -F 'if [ -n "${READER_SUMMARY_DAILY_RUN_PAUSE_WORKER:-}" ]; then' \
  "$DAILY_RUN" >/dev/null
grep -F 'READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE=2026-07-23' \
  "$DAILY_RUN" >/dev/null
grep -Fx '    export READER_SUMMARY_DAILY_DELIVERY_C1_MODE=exact' \
  "$DAILY_RUN" >/dev/null
grep -F -- '--node-options --max-old-space-size=1024' "$DAILY_RUN" >/dev/null
grep -F 'scripts/run-reader-summary-daily-terminal.ts' "$DAILY_RUN" >/dev/null
grep -F 'run:reader-summary-clean-real-day-collection' "$DAILY_RUN" >/dev/null
grep -F 'reader-summary-daily-canonical-recovery-v4-delivery-c1.ts precollect' \
  "$DAILY_RUN" >/dev/null
grep -F 'reader-summary-daily-canonical-recovery-v4-delivery-c1.ts verify-caught-up' \
  "$DAILY_RUN" >/dev/null
grep -F 'READER_SUMMARY_DAILY_DELIVERY_C1_RECOVERY_THROUGH_FILE=' \
  "$DAILY_RUN" >/dev/null
grep -F 'export READER_SUMMARY_DAILY_DELIVERY_C1_RECOVERY_THROUGH' \
  "$DAILY_RUN" >/dev/null
grep -F 'readFileSync(process.argv[1], "utf8")' "$DAILY_RUN" >/dev/null
grep -Fx 'state=BLOCKED' "$C1_READINESS" >/dev/null
grep -Fx 'requires=H_GREEN,C0_GREEN,reviewed_activation' "$C1_READINESS" >/dev/null
grep -Fx 'activation=forbidden' "$C1_READINESS" >/dev/null
grep -Fx 'ExecCondition=/var/data/social-monitor/control/daily-c1-runtime.sh --check-legacy-owner' \
  "$DAILY_SERVICE" >/dev/null
grep -Fx 'ExecStartPre=/var/data/social-monitor/control/daily-c1-runtime.sh --prepare-legacy-start' \
  "$DAILY_SERVICE" >/dev/null
grep -Fx 'ExecStart=/var/data/social-monitor/control/daily-c1-runtime.sh --run-and-complete-legacy' \
  "$DAILY_SERVICE" >/dev/null
grep -Fx 'ExecStopPost=/var/data/social-monitor/control/daily-c1-runtime.sh --complete-legacy-start' \
  "$DAILY_SERVICE" >/dev/null
grep -Fx 'TimeoutStartSec=19800' "$DAILY_SERVICE" >/dev/null
precollect_line=$(grep -n 'delivery-c1.ts precollect' "$DAILY_RUN" | cut -d: -f1)
catch_up_line=$(grep -n 'run-reader-summary-daily-catch-up.ts' "$DAILY_RUN" | tail -1 | cut -d: -f1)
verify_line=$(grep -n 'delivery-c1.ts verify-caught-up' "$DAILY_RUN" | cut -d: -f1)
((precollect_line < catch_up_line && catch_up_line < verify_line)) || {
  echo 'C1 must precollect before the full daily catch-up and verify afterward' >&2
  exit 1
}

if sed -n '/^  else$/,/^    exit 0$/p' "$DAILY_RUN" |
  grep -E '^[[:space:]]*npm run run:reader-summary-clean-real-day-collection' \
    >/dev/null; then
  echo 'ordinary daily run bypasses the catch-up supervisor' >&2
  exit 1
fi

test_root=$(mktemp -d /tmp/social-monitor-daily-run-test.XXXXXX)
trap 'rm -rf "$test_root"' EXIT HUP INT TERM
mkdir -p "$test_root/control/postgres-runtime-current"
cat >"$test_root/control/postgres-runtime-current/reader-summary-daily-c1.readiness" <<'EOF'
schemaVersion=reader_summary.daily_delivery_readiness.c1
state=READY
requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN
activation=reviewed
EOF
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
[[ ! -s "$test_root/stdout" ]] || {
  echo 'singleton contention wrote unexpected stdout' >&2
  exit 1
}
grep -Fx 'daily production-day run already active' "$test_root/stderr" >/dev/null
[[ $(wc -l <"$test_root/stderr") -eq 1 ]] || {
  echo 'singleton contention wrote unexpected stderr' >&2
  exit 1
}
grep -Fx -- '-n 9' "$fake_flock.calls" >/dev/null
[[ $(wc -l <"$fake_flock.calls") -eq 1 ]] || {
  echo 'singleton contention attempted another lock or work phase' >&2
  exit 1
}
[[ ! -e "$work_marker" ]] || {
  echo 'singleton contention continued into daily work' >&2
  exit 1
}

printf 'daily reader-summary catch-up wiring test passed\n'
