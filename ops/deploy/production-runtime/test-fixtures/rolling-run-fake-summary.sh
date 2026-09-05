#!/usr/bin/env bash
set -euo pipefail

evidence_path=${1:?summary evidence path is required}
frontend_path=${2:?summary frontend path is required}
expected_recovery_dir=${evidence_path%/*}/.reader-summary-db-publications/$ROLLING_RUN_ID
[[ ${DURABLE_READER_SUMMARY_PUBLICATION_RECOVERY_DIR:-} == "$expected_recovery_dir" ]] || {
  echo 'rolling publication recovery must be configured for the current run before summary' >&2
  exit 1
}
[[ ${DURABLE_READER_SUMMARY_TOPIC_LABELER:-} == agent-runtime ]] || {
  echo 'rolling summary must use verified agent-runtime topic labeling' >&2
  exit 1
}
expected_rejection_path=${evidence_path%.evidence.v1.json}.rejected-topic-map.v1.json
[[ ${DURABLE_READER_SUMMARY_REJECTED_TOPIC_MAP_PATH:-} == "$expected_rejection_path" ]] || {
  echo 'rolling rejected topic map audit must belong to the current run' >&2
  exit 1
}
printf 'topic-labeler-config %s %s\n' "$ROLLING_RUN_ID" \
  "$DURABLE_READER_SUMMARY_TOPIC_LABELER" >> "$SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG"
fixture_root=$(cd "${BASH_SOURCE[0]%/*}" && pwd)
node "$fixture_root/rolling-run-fake-artifact.mjs" evidence \
  "$evidence_path" "$ROLLING_RUN_ID" "$ROLLING_COLLECTION_DATE" \
  "$frontend_path"
