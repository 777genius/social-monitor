#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
RUNNER=$SCRIPT_DIR/daily-collection-run.sh
SERVICE=$SCRIPT_DIR/social-monitor-post-collection.service
TIMER=$SCRIPT_DIR/social-monitor-daily.timer

grep -F 'date -u +%F' "$RUNNER" >/dev/null
grep -F 'daily-collection-singleton.lock' "$RUNNER" >/dev/null
grep -F 'daily-run.lock' "$RUNNER" >/dev/null
grep -F 'runtime_release != "$backend_release"' "$RUNNER" >/dev/null
grep -F 'run:reader-summary-clean-real-day-collection' "$RUNNER" >/dev/null
grep -F -- '--update --date "$1"' "$RUNNER" >/dev/null
! grep -F -- '--wait-for-x-readiness' "$RUNNER" >/dev/null
grep -F 'successfulProviderCount' "$RUNNER" >/dev/null
grep -F 'fetchedItemCount' "$RUNNER" >/dev/null
grep -F 'insertedItemCount' "$RUNNER" >/dev/null
grep -F 'social_monitor.daily_collection_receipt.v1' "$RUNNER" >/dev/null

for forbidden in \
  run-reader-summary-daily-catch-up \
  run-reader-summary-daily-terminal \
  reader-summary-daily-canonical-recovery \
  run:reader-summary-weekly-production; do
  ! grep -F "$forbidden" "$RUNNER" >/dev/null
done

grep -Fx 'ExecStart=/var/data/social-monitor/control/daily-collection-run.sh' \
  "$SERVICE" >/dev/null
grep -Fx 'TimeoutStartSec=5400' "$SERVICE" >/dev/null
[[ $(grep -c '^ExecStart=' "$SERVICE") -eq 1 ]]
! grep -F 'daily-c1-runtime.sh' "$SERVICE" >/dev/null
grep -Fx 'Unit=social-monitor-post-collection.service' "$TIMER" >/dev/null

bash -n "$RUNNER"
printf 'daily collection-only runtime contract test passed\n'
