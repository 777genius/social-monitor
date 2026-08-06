#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DAILY_RUN=$SCRIPT_DIR/daily-run.sh

grep -Fx 'readonly DAILY_AUTH_POOL_JOB_ID=social-monitor-production-account-pool-terra-v25-20260804' \
  "$DAILY_RUN" >/dev/null
grep -Fx '"$ROOT/control/refresh-codex-auth.sh" --broker-pool-job-id "$DAILY_AUTH_POOL_JOB_ID"' \
  "$DAILY_RUN" >/dev/null
grep -F 'npm run migrate:deploy' "$DAILY_RUN" >/dev/null
grep -F 'scripts/run-reader-summary-daily-catch-up.ts' "$DAILY_RUN" >/dev/null
grep -F 'if [ -n "${READER_SUMMARY_DAILY_RUN_PAUSE_WORKER:-}" ]; then' \
  "$DAILY_RUN" >/dev/null
grep -F 'READER_SUMMARY_DAILY_FIRST_UNRESOLVED_UTC_DATE="$requested_date"' \
  "$DAILY_RUN" >/dev/null
grep -F -- '--node-options --max-old-space-size=1024' "$DAILY_RUN" >/dev/null
grep -F 'scripts/run-reader-summary-daily-terminal.ts' "$DAILY_RUN" >/dev/null
grep -F 'run:reader-summary-clean-real-day-collection' "$DAILY_RUN" >/dev/null

if sed -n '/^  else$/,/^    exit 0$/p' "$DAILY_RUN" |
  grep -E '^[[:space:]]*npm run run:reader-summary-clean-real-day-collection' \
    >/dev/null; then
  echo 'ordinary daily run bypasses the catch-up supervisor' >&2
  exit 1
fi

printf 'daily reader-summary catch-up wiring test passed\n'
