#!/usr/bin/env bash
set -euo pipefail

path=${1:?collection artifact path is required}
collection_date=${2:?collection date is required}
fixture_root=$(cd "${BASH_SOURCE[0]%/*}" && pwd)
run_id=${ROLLING_RUN_ID:?rolling run id is required}
log=${SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG:?test log is required}

if [[ ${SOCIAL_MONITOR_ROLLING_RUN_TEST_FAIL_COLLECTION_RUN_ID:-} == "$run_id" ]]; then
  printf 'collection-failed %s %s\n' "$run_id" "$collection_date" >> "$log"
  exit 1
fi

degraded=false
if [[ ${SOCIAL_MONITOR_ROLLING_RUN_TEST_DEGRADED_COLLECTION_RUN_ID:-} == "$run_id" ]]; then
  degraded=true
fi
node "$fixture_root/rolling-run-fake-artifact.mjs" collection \
  "$path" "$run_id" "$collection_date" "$degraded"
if [[ $degraded == true ]]; then
  printf 'collection-degraded %s %s\n' "$run_id" "$collection_date" >> "$log"
  exit 1
fi
printf 'collection-created %s %s\n' "$run_id" "$collection_date" >> "$log"
