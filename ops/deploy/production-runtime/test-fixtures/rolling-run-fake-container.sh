#!/usr/bin/env bash
set -euo pipefail

collection_date=${1:?collection date is required}
auth_ready=${2:?auth readiness is required}
fixture_root=$(cd "${BASH_SOURCE[0]%/*}" && pwd)
repo=$(cd "$fixture_root/../../../.." && pwd)
artifact_root=${SOCIAL_MONITOR_ROLLING_RUN_RECEIPT_HOST_PATH%/*}
test_root=${SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT:?test root is required}

cd "$repo"
ROLLING_RUN_ID=$SOCIAL_MONITOR_ROLLING_RUN_ID \
ROLLING_COLLECTION_DATE=$collection_date \
ROLLING_RECEIPT_PATH=$SOCIAL_MONITOR_ROLLING_RUN_RECEIPT_HOST_PATH \
ROLLING_AUTH_READY=$auth_ready \
ROLLING_ARTIFACT_ROOT=$artifact_root \
SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_MODE=1 \
SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_ROOT=$test_root \
SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_NOW=$SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW \
SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_COLLECTION_COMMAND=$fixture_root/rolling-run-fake-collection.sh \
SOCIAL_MONITOR_ROLLING_CONTAINER_TEST_SUMMARY_COMMAND=$fixture_root/rolling-run-fake-summary.sh \
  sh ops/deploy/production-runtime/rolling-summary-container-run.sh
