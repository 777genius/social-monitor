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
[[ $* != *'--env ROLLING_AUTH_READY=false'* ]] || exit 75
printf '{"runId":"%s","collectionDate":"2026-08-15","status":"SUCCESS","publication":{"readerSummaryJobId":"test-job","readerSummaryId":"test-summary","status":"completed"}}\n' \
  "$SOCIAL_MONITOR_ROLLING_RUN_ID" > \
  "$SOCIAL_MONITOR_ROLLING_RUN_RECEIPT_HOST_PATH"
