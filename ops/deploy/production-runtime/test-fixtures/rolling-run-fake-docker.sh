#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> "${SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG:?test log is required}"
if [[ $* == *' daily-runner sh -lc '* ]]; then
  printf '{"runId":"%s","collectionDate":"2026-08-15","status":"SUCCESS","publication":{"readerSummaryJobId":"test-job","readerSummaryId":"test-summary","status":"completed"}}\n' \
    "$SOCIAL_MONITOR_ROLLING_RUN_ID" > \
    "$SOCIAL_MONITOR_ROLLING_RUN_RECEIPT_HOST_PATH"
fi
