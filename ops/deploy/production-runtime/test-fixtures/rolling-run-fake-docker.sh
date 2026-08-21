#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >> "${SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG:?test log is required}"
if [[ $1 == inspect ]]; then
  case "${*: -1}" in
    social-monitor-prod-agent-runtime-1) printf '%s\n' 172.19.0.6 ;;
    social-monitor-prod-redis-1) printf '%s\n' 172.19.0.3 ;;
    social-monitor-prod-rabbitmq-1) printf '%s\n' 172.19.0.2 ;;
    *) exit 1 ;;
  esac
  exit 0
fi
if [[ $* == *' config --format json'* ]]; then
  printf '%s\n' \
    '{"services":{"daily-runner":{"environment":{' \
    '"AGENT_RUNTIME_GRPC_ADDRESS":"agent-runtime:50052",' \
    '"X_COLLECTOR_GRPC_ADDRESS":"x-collector:50051",' \
    '"REDIS_URL":"redis://redis:6379",' \
    '"RABBITMQ_URL":"amqp://user:password@rabbitmq:5672",' \
    '"DATABASE_URL":"postgres://example"' \
    '}}}}'
  exit 0
fi
if [[ $* == *' daily-runner sh -lc '* ]]; then
  [[ $* != *'-e ROLLING_AUTH_READY=false'* ]] || exit 75
  printf '{"runId":"%s","collectionDate":"2026-08-15","status":"SUCCESS","publication":{"readerSummaryJobId":"test-job","readerSummaryId":"test-summary","status":"completed"}}\n' \
    "$SOCIAL_MONITOR_ROLLING_RUN_ID" > \
    "$SOCIAL_MONITOR_ROLLING_RUN_RECEIPT_HOST_PATH"
fi
