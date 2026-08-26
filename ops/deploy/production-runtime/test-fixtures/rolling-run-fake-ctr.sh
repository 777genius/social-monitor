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
collection_date=
if [[ $* =~ --env[[:space:]]ROLLING_COLLECTION_DATE=([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
  collection_date=${BASH_REMATCH[1]}
fi
auth_ready=true
[[ $* != *'--env ROLLING_AUTH_READY=false'* ]] || auth_ready=false
exec "${BASH_SOURCE[0]%/*}/rolling-run-fake-container.sh" \
  "$collection_date" "$auth_ready"
