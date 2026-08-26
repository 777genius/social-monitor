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
  collection_date=
  if [[ $* =~ -e[[:space:]]ROLLING_COLLECTION_DATE=([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
    collection_date=${BASH_REMATCH[1]}
  fi
  artifact_root=${SOCIAL_MONITOR_ROLLING_RUN_RECEIPT_HOST_PATH%/*}
  collection_directory=$artifact_root/collections
  collection_staging_directory=$collection_directory/runs/$SOCIAL_MONITOR_ROLLING_RUN_ID
  collection_path=$collection_directory/reader-summary-clean-real-day-collection.$collection_date.v1.json
  collection_staging_path=$collection_staging_directory/reader-summary-clean-real-day-collection.$collection_date.v1.json
  collection_run_path=$artifact_root/rolling-summary.$SOCIAL_MONITOR_ROLLING_RUN_ID.collection.v1.json
  mkdir -p "$collection_staging_directory"
  if [[ ${SOCIAL_MONITOR_ROLLING_RUN_TEST_FAIL_COLLECTION_RUN_ID:-} == "$SOCIAL_MONITOR_ROLLING_RUN_ID" ]]; then
    printf 'collection-failed %s %s\n' "$SOCIAL_MONITOR_ROLLING_RUN_ID" "$collection_date" >> "$SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG"
    exit 1
  elif [[ ${SOCIAL_MONITOR_ROLLING_RUN_TEST_DEGRADED_COLLECTION_RUN_ID:-} == "$SOCIAL_MONITOR_ROLLING_RUN_ID" ]]; then
    printf '%s\n' "{\"run\":{\"collectionDate\":\"$collection_date\"},\"blockingPassed\":false,\"scans\":[{\"providerKey\":\"github-trending-page\",\"status\":\"succeeded\"},{\"providerKey\":\"hacker-news\",\"status\":\"succeeded\"},{\"providerKey\":\"reddit\",\"status\":\"failed\"},{\"providerKey\":\"rss\",\"status\":\"succeeded\"},{\"providerKey\":\"x-twitter\",\"status\":\"succeeded\"}]}" > "$collection_staging_path"
    printf 'collection-degraded %s %s\n' "$SOCIAL_MONITOR_ROLLING_RUN_ID" "$collection_date" >> "$SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG"
  elif [[ -f $collection_staging_path ]]; then
    printf 'collection-reused %s %s\n' "$SOCIAL_MONITOR_ROLLING_RUN_ID" "$collection_date" >> "$SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG"
  else
    printf '%s\n' "{\"run\":{\"collectionDate\":\"$collection_date\"},\"blockingPassed\":true,\"scans\":[{\"providerKey\":\"github-trending-page\",\"status\":\"succeeded\"},{\"providerKey\":\"hacker-news\",\"status\":\"succeeded\"},{\"providerKey\":\"reddit\",\"status\":\"succeeded\"},{\"providerKey\":\"rss\",\"status\":\"succeeded\"},{\"providerKey\":\"x-twitter\",\"status\":\"succeeded\"}]}" > "$collection_staging_path"
    printf 'collection-created %s %s\n' "$SOCIAL_MONITOR_ROLLING_RUN_ID" "$collection_date" >> "$SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG"
  fi
  cp "$collection_staging_path" "$collection_path.next.$SOCIAL_MONITOR_ROLLING_RUN_ID"
  mv "$collection_path.next.$SOCIAL_MONITOR_ROLLING_RUN_ID" "$collection_path"
  cp "$collection_staging_path" "$collection_run_path"
  rm -f "$collection_staging_path"
  rmdir "$collection_staging_directory"
  [[ $* != *'-e ROLLING_AUTH_READY=false'* ]] || exit 75
  printf '{"runId":"%s","collectionDate":"2026-08-15","status":"SUCCESS","publication":{"readerSummaryJobId":"test-job","readerSummaryId":"test-summary","status":"completed"}}\n' \
    "$SOCIAL_MONITOR_ROLLING_RUN_ID" > \
    "$SOCIAL_MONITOR_ROLLING_RUN_RECEIPT_HOST_PATH"
fi
