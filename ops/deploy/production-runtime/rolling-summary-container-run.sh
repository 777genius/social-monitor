#!/usr/bin/env sh
set -eu

: "${ROLLING_RUN_ID:?rolling run id is required}"
: "${ROLLING_COLLECTION_DATE:?rolling collection date is required}"
: "${ROLLING_RECEIPT_PATH:?rolling receipt path is required}"
: "${ROLLING_AUTH_READY:?rolling auth readiness is required}"

artifact_root=${ROLLING_ARTIFACT_ROOT:-/var/lib/social-monitor/artifacts/rolling-summary}
collection_directory="$artifact_root/collections"
collection_staging_directory="$collection_directory/runs/$ROLLING_RUN_ID"
collection_source="$collection_directory/reader-summary-clean-real-day-collection.$ROLLING_COLLECTION_DATE.v1.json"
collection_staging_source="$collection_staging_directory/reader-summary-clean-real-day-collection.$ROLLING_COLLECTION_DATE.v1.json"
collection_artifact="$artifact_root/rolling-summary.$ROLLING_RUN_ID.collection.v1.json"
evidence_path="$artifact_root/rolling-summary.$ROLLING_RUN_ID.evidence.v1.json"
frontend_path="$artifact_root/rolling-summary.$ROLLING_RUN_ID.frontend.v1.json"
period_started_at="${ROLLING_COLLECTION_DATE}T00:00:00.000Z"
required_providers=github-trending-page,hacker-news,reddit,rss,x-twitter

if [ "${SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_MODE:-0}" = 1 ]; then
  test_root=${SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_ROOT:?rolling container test root is required}
  case "$test_root:$artifact_root" in
    /tmp/*:"$test_root"/*) ;;
    *) echo 'rolling container test artifacts must stay below its test root' >&2; exit 64 ;;
  esac
  : "${SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_COLLECTION_COMMAND:?test collection command is required}"
  : "${SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_SUMMARY_COMMAND:?test summary command is required}"
fi

mkdir -p "$collection_staging_directory"
rm -f "$collection_staging_source" \
  "$collection_source.next.$ROLLING_RUN_ID" \
  "$collection_artifact.next"

collection_exit=0
if [ "${SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_MODE:-0}" = 1 ]; then
  "$SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_COLLECTION_COMMAND" \
    "$collection_staging_source" "$ROLLING_COLLECTION_DATE" || collection_exit=$?
else
  npm run run:reader-summary-clean-real-day-collection -- \
    --update \
    --date "$ROLLING_COLLECTION_DATE" \
    --production-scheduled-scope \
    --exact-date-artifact-directory "$collection_staging_directory" \
    --providers "$required_providers" || collection_exit=$?
fi

collection_validation_exit=0
node ops/deploy/production-runtime/rolling-summary-receipt.mjs \
  validate-collection-result "$collection_staging_source" \
  "$ROLLING_COLLECTION_DATE" "$collection_exit" || \
  collection_validation_exit=$?
if [ "$collection_validation_exit" -ne 0 ]; then
  echo "rolling collection produced no valid current-pass artifact for $ROLLING_RUN_ID" >&2
  rm -f "$collection_staging_source"
  rmdir "$collection_staging_directory" 2>/dev/null || true
  if [ "$collection_exit" -ne 0 ]; then
    exit "$collection_exit"
  fi
  exit "$collection_validation_exit"
fi
if [ "$collection_exit" -ne 0 ]; then
  echo "rolling collection is degraded for $ROLLING_RUN_ID (exit $collection_exit); publishing from terminal current-pass evidence" >&2
fi

cp "$collection_staging_source" "$collection_source.next.$ROLLING_RUN_ID"
chmod 0444 "$collection_source.next.$ROLLING_RUN_ID"
mv "$collection_source.next.$ROLLING_RUN_ID" "$collection_source"
cp "$collection_staging_source" "$collection_artifact.next"
chmod 0444 "$collection_artifact.next"
mv "$collection_artifact.next" "$collection_artifact"
rm -f "$collection_staging_source"
rmdir "$collection_staging_directory" 2>/dev/null || true
rolling_observation_now=${SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_NOW:-$(date -u +%Y-%m-%dT%H:%M:%S.000Z)}
rolling_observation_cutoff=$(node -e '
  const observed = new Date(process.argv[1]);
  const dayEnd = new Date(`${process.argv[2]}T23:59:59.999Z`);
  process.stdout.write(new Date(Math.min(observed, dayEnd)).toISOString());
' "$rolling_observation_now" "$ROLLING_COLLECTION_DATE")

if [ "$ROLLING_AUTH_READY" != true ]; then
  echo 'rolling collection saved; AI summary is pending an available subscription account' >&2
  exit 75
fi

if [ "${SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_MODE:-0}" = 1 ]; then
  "$SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_SUMMARY_COMMAND" \
    "$evidence_path" "$frontend_path"
else
  export DURABLE_READER_SUMMARY_TENANT_ID=00000000-0000-7000-8000-000000006101
  export DURABLE_READER_SUMMARY_WORKSPACE_ID=00000000-0000-7000-8000-000000006102
  export DURABLE_READER_SUMMARY_CADENCE=daily
  export DURABLE_READER_SUMMARY_PERIOD_STARTED_AT="$period_started_at"
  DURABLE_READER_SUMMARY_PERIOD_ENDED_AT=$(node -e 'const day = new Date(`${process.argv[1]}T00:00:00.000Z`); day.setUTCDate(day.getUTCDate() + 1); process.stdout.write(day.toISOString());' "$ROLLING_COLLECTION_DATE")
  export DURABLE_READER_SUMMARY_PERIOD_ENDED_AT
  export DURABLE_READER_SUMMARY_LIVE_OBSERVATION_CUTOFF="$rolling_observation_cutoff"
  export DURABLE_READER_SUMMARY_MODEL=agent-runtime
  export DURABLE_READER_SUMMARY_TOPIC_LABELER=deterministic
  export DURABLE_READER_SUMMARY_MAX_EVIDENCE_ITEMS=120
  export DURABLE_READER_SUMMARY_EVIDENCE_PATH="$evidence_path"
  export DURABLE_READER_SUMMARY_FRONTEND_FIXTURE_PATH="$frontend_path"
  npm run capture:durable-reader-summary
fi

node ops/deploy/production-runtime/rolling-summary-receipt.mjs \
  write-receipt "$ROLLING_RECEIPT_PATH" "$evidence_path" "$frontend_path" \
  "$collection_artifact" \
  "$ROLLING_RUN_ID" "$ROLLING_COLLECTION_DATE" "$rolling_observation_cutoff" \
  "$collection_exit"
