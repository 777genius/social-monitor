#!/usr/bin/env bash
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
RUNNER=$REPO/ops/deploy/production-runtime/rolling-run.sh
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
grep -F -- '--exact-date-artifact-directory "$collection_directory"' "$RUNNER" >/dev/null
grep -F -- 'reader-summary-clean-real-day-collection.$ROLLING_COLLECTION_DATE.v1.json' "$RUNNER" >/dev/null
! grep -F -- 'collection_source=ops/evals/reader-summary-clean-real-day-collection.v1.json' "$RUNNER" >/dev/null
[[ $(sha256sum "$prior_alias" | cut -d' ' -f1) == "$prior_alias_bytes" ]]
exact_collection=$TEST_ROOT/artifacts/rolling-summary/collections/reader-summary-clean-real-day-collection.2026-08-15.v1.json
node "$REPO/ops/deploy/production-runtime/rolling-summary-receipt.mjs" \
  validate-collection "$exact_collection" 2026-08-15
grep -Fx 'collection-created 2026-08-15' "$TEST_ROOT/docker.log" >/dev/null
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

ln -sfn /usr/bin/false "$refresh"
if SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT=$TEST_ROOT \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER=$fake_docker \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK=$fake_flock \
  SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW=2026-08-15T12:15:00.000Z \
    bash "$RUNNER"; then
  echo 'rolling run accepted unavailable summary auth' >&2
  exit 1
fi
grep -F -- '-e ROLLING_AUTH_READY=false' "$TEST_ROOT/docker.log" >/dev/null
[[ $(grep -Fc -- '--profile app up -d --no-deps agent-runtime' \
  "$TEST_ROOT/docker.log") == 1 ]]

collection_line=$(grep -n 'npm run run:reader-summary-clean-real-day-collection' \
  "$RUNNER" | cut -d: -f1)
auth_guard_line=$(grep -n 'ROLLING_AUTH_READY.*!= true' "$RUNNER" | cut -d: -f1)
((collection_line < auth_guard_line))
grep -F 'if [ "$ROLLING_AUTH_READY" != true ]; then' "$RUNNER" >/dev/null
! grep -F 'if [[ "$ROLLING_AUTH_READY"' "$RUNNER" >/dev/null
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
grep -Fx 'collection-reused 2026-08-15' "$TEST_ROOT/docker.log" >/dev/null
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
SOCIAL_MONITOR_ROLLING_RUNTIME=containerd \
SOCIAL_MONITOR_ROLLING_AGENT_RUNTIME_RESTART_SCRIPT=$fake_agent_restart \
  bash "$RUNNER"
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
