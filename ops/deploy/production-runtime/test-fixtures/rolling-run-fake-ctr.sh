#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> "${SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG:?test log is required}"
args=("$@")
for ((index = 0; index < ${#args[@]}; index += 1)); do
  if [[ ${args[$index]} == --env-file ]]; then
    grep -E '^(AGENT_RUNTIME_GRPC_ADDRESS|X_COLLECTOR_GRPC_ADDRESS|REDIS_URL|RABBITMQ_URL)=' \
      "${args[$((index + 1))]}" >> "$SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG"
  fi
done
[[ $* != *'--env ROLLING_AUTH_READY=false'* ]] || exit 75
printf '{"runId":"%s","collectionDate":"2026-08-15","status":"SUCCESS","publication":{"readerSummaryJobId":"test-job","readerSummaryId":"test-summary","status":"completed"}}\n' \
  "$SOCIAL_MONITOR_ROLLING_RUN_ID" > \
  "$SOCIAL_MONITOR_ROLLING_RUN_RECEIPT_HOST_PATH"
