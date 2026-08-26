#!/usr/bin/env bash
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
RUNNER=$REPO/ops/deploy/production-runtime/rolling-run.sh
CONTAINER_RUNNER=$REPO/ops/deploy/production-runtime/rolling-summary-container-run.sh
TEST_ROOT=$(mktemp -d /tmp/social-monitor-rolling-run.XXXXXX)
trap 'rm -rf "$TEST_ROOT"' EXIT

mkdir -p \
  "$TEST_ROOT/control/postgres-runtime-current" \
  "$TEST_ROOT/control/deploy-state" \
  "$TEST_ROOT/backups" \
  "$TEST_ROOT/runtime/subscription-runtime/sessions" \
  "$TEST_ROOT/runtime/x-collector" \
  "$TEST_ROOT/secrets" \
  "$TEST_ROOT/secrets/db" \
  "$TEST_ROOT/artifacts/evals" \
  "$TEST_ROOT/artifacts/rolling-summary"
sha=1111111111111111111111111111111111111111
printf '%s\n' "$sha" > "$TEST_ROOT/control/postgres-runtime-current/READY"
printf '%s\n' "$sha" > "$TEST_ROOT/control/deploy-state/backend.sha"
touch "$TEST_ROOT/secrets/production.env"
touch "$TEST_ROOT/secrets/db/ca-certificate.crt"
ln -s "$REPO" "$TEST_ROOT/integration"

fake_flock=/usr/bin/true
fake_docker=$REPO/ops/deploy/production-runtime/test-fixtures/rolling-run-fake-docker.sh
fake_ctr=$REPO/ops/deploy/production-runtime/test-fixtures/rolling-run-fake-ctr.sh
fake_agent_restart=$REPO/ops/deploy/production-runtime/test-fixtures/rolling-run-fake-agent-restart.sh
refresh=$TEST_ROOT/control/refresh-codex-auth.sh
ln -s /usr/bin/true "$refresh"
export SOCIAL_MONITOR_ROLLING_RUN_TEST_LOG=$TEST_ROOT/docker.log
prior_alias=$TEST_ROOT/artifacts/evals/reader-summary-clean-real-day-collection.v1.json
printf '%s\n' '{"run":{"collectionDate":"2026-08-14"},"sentinel":"prior-day"}' > "$prior_alias"
prior_alias_bytes=$(sha256sum "$prior_alias" | cut -d' ' -f1)

SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE=1 \
SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT=$TEST_ROOT \
SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER=$fake_docker \
SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK=$fake_flock \
SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW=2026-08-15T08:15:00.000Z \
  bash "$RUNNER"

grep -F -- '--profile app up -d --no-deps agent-runtime' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- '--profile daily run --rm --no-deps' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- '-e ROLLING_COLLECTION_DATE=2026-08-15' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- '-e ROLLING_AUTH_READY=true' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- 'daily-runner sh -lc' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- '--exact-date-artifact-directory "$collection_staging_directory"' "$CONTAINER_RUNNER" >/dev/null
grep -F -- 'reader-summary-clean-real-day-collection.$ROLLING_COLLECTION_DATE.v1.json' "$CONTAINER_RUNNER" >/dev/null
grep -F -- 'collection_directory/runs/$ROLLING_RUN_ID' "$CONTAINER_RUNNER" >/dev/null
! grep -F -- 'collection_source=ops/evals/reader-summary-clean-real-day-collection.v1.json' "$CONTAINER_RUNNER" >/dev/null
[[ $(sha256sum "$prior_alias" | cut -d' ' -f1) == "$prior_alias_bytes" ]]
exact_collection=$TEST_ROOT/artifacts/rolling-summary/collections/reader-summary-clean-real-day-collection.2026-08-15.v1.json
node "$REPO/ops/deploy/production-runtime/rolling-summary-receipt.mjs" \
  validate-collection "$exact_collection" 2026-08-15
grep -Fx 'collection-created 20260815T081500000Z 2026-08-15' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- "--providers \"\$required_providers\"" "$CONTAINER_RUNNER" >/dev/null
grep -F -- 'npm run capture:durable-reader-summary' "$CONTAINER_RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_MODEL=agent-runtime' "$CONTAINER_RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_TOPIC_LABELER=deterministic' "$CONTAINER_RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_MAX_EVIDENCE_ITEMS=120' "$CONTAINER_RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_PERIOD_ENDED_AT' "$CONTAINER_RUNNER" >/dev/null
grep -F -- 'DURABLE_READER_SUMMARY_LIVE_OBSERVATION_CUTOFF' "$CONTAINER_RUNNER" >/dev/null
grep -Fx 'ExecStart=/var/data/social-monitor/control/rolling-run.sh' \
  "$REPO/ops/deploy/production-runtime/social-monitor-rolling.service" >/dev/null
grep -Fx 'OnCalendar=*-*-* 04,08,12,16,20:15:00 UTC' \
  "$REPO/ops/deploy/production-runtime/social-monitor-rolling.timer" >/dev/null
grep -Fx 'Persistent=true' \
  "$REPO/ops/deploy/production-runtime/social-monitor-rolling.timer" >/dev/null

successful_collection_bytes=$(sha256sum "$exact_collection" | cut -d' ' -f1)
SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE=1 \
SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT=$TEST_ROOT \
SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER=$fake_docker \
SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK=$fake_flock \
SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW=2026-08-15T12:15:00.000Z \
SOCIAL_MONITOR_ROLLING_RUN_TEST_DEGRADED_COLLECTION_RUN_ID=20260815T121500000Z \
  bash "$RUNNER"
grep -Fx 'collection-degraded 20260815T121500000Z 2026-08-15' "$TEST_ROOT/docker.log" >/dev/null
degraded_collection_bytes=$(sha256sum "$exact_collection" | cut -d' ' -f1)
[[ $degraded_collection_bytes != "$successful_collection_bytes" ]]
[[ -e $TEST_ROOT/artifacts/rolling-summary/rolling-summary.20260815T121500000Z.collection.v1.json ]]
degraded_receipt=$TEST_ROOT/artifacts/rolling-summary/rolling-summary.20260815T121500000Z.receipt.v1.json
[[ -e $degraded_receipt ]]
node "$REPO/ops/deploy/production-runtime/rolling-summary-receipt.mjs" \
  validate-receipt "$degraded_receipt" 20260815T121500000Z 2026-08-15
node -e '
  const receipt = require(process.argv[1]);
  if (receipt.collection.commandExitCode !== 1 ||
      receipt.collection.finalDayQualityGatePassed !== false) process.exit(1);
' "$degraded_receipt"

SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE=1 \
SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT=$TEST_ROOT \
SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER=$fake_docker \
SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK=$fake_flock \
SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW=2026-08-15T23:59:00.000Z \
SOCIAL_MONITOR_ROLLING_RUN_TEST_CONTAINER_NOW=2026-08-16T00:01:00.000Z \
  bash "$RUNNER"
midnight_receipt=$TEST_ROOT/artifacts/rolling-summary/rolling-summary.20260815T235900000Z.receipt.v1.json
node "$REPO/ops/deploy/production-runtime/rolling-summary-receipt.mjs" \
  validate-receipt "$midnight_receipt" 20260815T235900000Z 2026-08-15
node -e '
  const receipt = require(process.argv[1]);
  if (receipt.period.endedAt !== "2026-08-15T23:59:59.999Z") process.exit(1);
' "$midnight_receipt"

if SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT=$TEST_ROOT \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER=$fake_docker \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK=$fake_flock \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW=2026-08-15T13:15:00.000Z \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_FAIL_COLLECTION_RUN_ID=20260815T131500000Z \
    bash "$RUNNER"; then
  echo 'rolling run published a stale same-day collection after current collection failure' >&2
  exit 1
fi
grep -Fx 'collection-failed 20260815T131500000Z 2026-08-15' "$TEST_ROOT/docker.log" >/dev/null
[[ $(sha256sum "$exact_collection" | cut -d' ' -f1) == "$degraded_collection_bytes" ]]
[[ ! -e $TEST_ROOT/artifacts/rolling-summary/rolling-summary.20260815T131500000Z.collection.v1.json ]]
[[ ! -e $TEST_ROOT/artifacts/rolling-summary/rolling-summary.20260815T131500000Z.receipt.v1.json ]]
[[ ! -e $TEST_ROOT/artifacts/rolling-summary/collections/runs/20260815T131500000Z/reader-summary-clean-real-day-collection.2026-08-15.v1.json ]]

ln -sfn /usr/bin/false "$refresh"
if SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT=$TEST_ROOT \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER=$fake_docker \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK=$fake_flock \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW=2026-08-15T14:15:00.000Z \
    bash "$RUNNER"; then
  echo 'rolling run accepted unavailable summary auth' >&2
  exit 1
fi
grep -F -- '-e ROLLING_AUTH_READY=false' "$TEST_ROOT/docker.log" >/dev/null
[[ $(grep -Fc -- '--profile app up -d --no-deps agent-runtime' \
  "$TEST_ROOT/docker.log") == 4 ]]

collection_line=$(grep -n 'npm run run:reader-summary-clean-real-day-collection' \
  "$CONTAINER_RUNNER" | cut -d: -f1)
collection_staging_clear_line=$(grep -n 'rm -f "\$collection_staging_source"' \
  "$CONTAINER_RUNNER" | head -1 | cut -d: -f1)
collection_validation_line=$(grep -n 'collection_validation_exit=0' \
  "$CONTAINER_RUNNER" | cut -d: -f1)
collection_failure_guard_line=$(grep -n '"\$collection_validation_exit" -ne 0' \
  "$CONTAINER_RUNNER" | cut -d: -f1)
collection_degraded_line=$(grep -n 'publishing from terminal current-pass evidence' \
  "$CONTAINER_RUNNER" | cut -d: -f1)
collection_promotion_line=$(grep -n 'cp "\$collection_staging_source" "\$collection_source' \
  "$CONTAINER_RUNNER" | cut -d: -f1)
auth_guard_line=$(grep -n 'ROLLING_AUTH_READY.*!= true' "$CONTAINER_RUNNER" | cut -d: -f1)
((collection_staging_clear_line < collection_line))
((collection_line < collection_validation_line))
((collection_validation_line < collection_failure_guard_line))
((collection_failure_guard_line < collection_degraded_line))
((collection_degraded_line < collection_promotion_line))
((collection_line < auth_guard_line))
grep -F 'if [ "$ROLLING_AUTH_READY" != true ]; then' "$CONTAINER_RUNNER" >/dev/null
! grep -F 'if [[ "$ROLLING_AUTH_READY"' "$CONTAINER_RUNNER" >/dev/null
set +e
ROLLING_AUTH_READY=false sh -ec \
  'if [ "$ROLLING_AUTH_READY" != true ]; then exit 75; fi'
auth_guard_status=$?
set -e
((auth_guard_status == 75))

ln -sfn /usr/bin/true "$refresh"
SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE=1 \
SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT=$TEST_ROOT \
SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER=$fake_docker \
SOCIAL_MONITOR_ROLLING_RUN_TEST_CTR=$fake_ctr \
SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK=$fake_flock \
SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW=2026-08-15T16:15:00.000Z \
SOCIAL_MONITOR_ROLLING_RUNTIME=containerd \
  bash "$RUNNER"
grep -Fx 'collection-created 20260815T161500000Z 2026-08-15' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- '-n moby run --rm --net-host' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- '--env ROLLING_COLLECTION_DATE=2026-08-15' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- '--env ROLLING_AUTH_READY=true' "$TEST_ROOT/docker.log" >/dev/null
grep -F -- 'docker.io/library/social-monitor-prod-daily-runner:latest' \
  "$TEST_ROOT/docker.log" >/dev/null
grep -Fx 'AGENT_RUNTIME_GRPC_ADDRESS=172.19.0.6:50052' \
  "$TEST_ROOT/docker.log" >/dev/null
grep -Fx 'X_COLLECTOR_GRPC_ADDRESS=127.0.0.1:50051' \
  "$TEST_ROOT/docker.log" >/dev/null
grep -Fx 'REDIS_URL=redis://172.19.0.3:6379' "$TEST_ROOT/docker.log" >/dev/null
grep -Fx 'RABBITMQ_URL=amqp://user:password@172.19.0.2:5672' \
  "$TEST_ROOT/docker.log" >/dev/null
if compgen -G "$TEST_ROOT/runtime/rolling-containerd-*-env.*" >/dev/null; then
  echo 'rolling containerd secret environment was not cleaned up' >&2
  exit 1
fi

touch "$TEST_ROOT/runtime/auth-account-changed"
SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE=1 \
SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT=$TEST_ROOT \
SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER=$fake_docker \
SOCIAL_MONITOR_ROLLING_RUN_TEST_CTR=$fake_ctr \
SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK=$fake_flock \
SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW=2026-08-15T20:15:00.000Z \
SOCIAL_MONITOR_ROLLING_RUN_TEST_DEGRADED_COLLECTION_RUN_ID=20260815T201500000Z \
SOCIAL_MONITOR_ROLLING_RUNTIME=containerd \
SOCIAL_MONITOR_ROLLING_AGENT_RUNTIME_RESTART_SCRIPT=$fake_agent_restart \
  bash "$RUNNER"
grep -Fx 'collection-degraded 20260815T201500000Z 2026-08-15' \
  "$TEST_ROOT/docker.log" >/dev/null
containerd_degraded_receipt=$TEST_ROOT/artifacts/rolling-summary/rolling-summary.20260815T201500000Z.receipt.v1.json
node "$REPO/ops/deploy/production-runtime/rolling-summary-receipt.mjs" \
  validate-receipt "$containerd_degraded_receipt" \
  20260815T201500000Z 2026-08-15
node -e '
  const receipt = require(process.argv[1]);
  if (receipt.collection.commandExitCode !== 1 ||
      receipt.collection.finalDayQualityGatePassed !== false) process.exit(1);
' "$containerd_degraded_receipt"
grep -Fx -- '--restart-agent-runtime' "$TEST_ROOT/agent-restart.log" >/dev/null
[[ ! -e $TEST_ROOT/runtime/auth-account-changed ]]
[[ -d $TEST_ROOT/runtime/subscription-runtime/sessions ]]
find "$TEST_ROOT/backups" -maxdepth 1 -type d \
  -name 'subscription-runtime-sessions.*' | grep -q .

fallback=$REPO/ops/deploy/production-runtime/rolling-containerd-fallback.sh
grep -F 'AGENT_TASK_ID=social-monitor-agent-runtime-host-fallback' "$fallback" >/dev/null
grep -F 'SOCIAL_MONITOR_ROLLING_AGENT_RUNTIME_IP=127.0.0.1' "$fallback" >/dev/null
grep -F 'SOCIAL_MONITOR_ROLLING_AGENT_RUNTIME_RESTART_SCRIPT=' "$fallback" >/dev/null

echo 'rolling-run tests passed'
