#!/usr/bin/env bash
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
RUNNER=$REPO/ops/deploy/production-runtime/rolling-run.sh
TEST_ROOT=$(mktemp -d /tmp/social-monitor-rolling-run.XXXXXX)
trap 'rm -rf "$TEST_ROOT"' EXIT

mkdir -p \
  "$TEST_ROOT/control/postgres-runtime-current" \
  "$TEST_ROOT/control/deploy-state" \
  "$TEST_ROOT/secrets" \
  "$TEST_ROOT/artifacts/rolling-summary"
sha=1111111111111111111111111111111111111111
printf '%s\n' "$sha" > "$TEST_ROOT/control/postgres-runtime-current/READY"
printf '%s\n' "$sha" > "$TEST_ROOT/control/deploy-state/backend.sha"
touch "$TEST_ROOT/secrets/production.env"
ln -s "$REPO" "$TEST_ROOT/integration"

fake_flock=/usr/bin/true
fake_docker=$REPO/ops/deploy/production-runtime/test-fixtures/rolling-run-fake-docker.sh
refresh=$TEST_ROOT/control/refresh-codex-auth.sh
ln -s /usr/bin/true "$refresh"
export SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG=$TEST_ROOT/docker.log

SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE=1 \
SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT=$TEST_ROOT \
SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER=$fake_docker \
SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK=$fake_flock \
SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW=2026-08-15T08:15:00.000Z \
  bash "$RUNNER"

grep -F -- '--profile app up -d --no-deps agent-runtime' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- '--profile daily run --rm --no-deps' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- '-e ROLLING_COLLECTION_DATE=2026-08-15' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- 'daily-runner sh -lc' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- "--providers \"\$required_providers\"" "$RUNNER" >/dev/null
grep -F -- 'npm run capture:durable-reader-summary' "$RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_MODEL=agent-runtime' "$RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_TOPIC_LABELER=deterministic' "$RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_MAX_EVIDENCE_ITEMS=120' "$RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_PERIOD_ENDED_AT' "$RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_LIVE_OBSERVATION_CUTOFF' "$RUNNER" >/dev/null
grep -Fx 'ExecStart=/var/data/social-monitor/control/rolling-run.sh' \
  "$REPO/ops/deploy/production-runtime/social-monitor-rolling.service" >/dev/null
grep -Fx 'OnCalendar=*-*-* 04,08,12,16,20:15:00 UTC' \
  "$REPO/ops/deploy/production-runtime/social-monitor-rolling.timer" >/dev/null
grep -Fx 'Persistent=true' \
  "$REPO/ops/deploy/production-runtime/social-monitor-rolling.timer" >/dev/null

echo 'rolling-run tests passed'
