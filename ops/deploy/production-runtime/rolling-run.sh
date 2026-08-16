#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

if [[ ${SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE:-} == 1 ]]; then
  ROOT=${SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT:?rolling-run test root is required}
  [[ $ROOT == /tmp/* ]] || {
    echo 'rolling summary test root must be below /tmp' >&2
    exit 64
  }
  DOCKER_COMMAND=${SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER:?test docker command is required}
  FLOCK_COMMAND=${SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK:-flock}
  NOW=${SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW:-2026-08-15T08:15:00.000Z}
else
  ROOT=/var/data/social-monitor
  DOCKER_COMMAND=docker
  FLOCK_COMMAND=flock
  NOW=
  unset SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE \
    SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT \
    SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER \
    SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK \
    SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW
fi
unset DATABASE_URL

COMPOSE=(
  "$DOCKER_COMMAND" compose -p social-monitor-prod
  --env-file "$ROOT/secrets/production.env"
  -f "$ROOT/integration/docker-compose.yml"
  -f "$ROOT/control/compose.production.yml"
  -f "$ROOT/control/compose.managed-db.yml"
  -f "$ROOT/control/postgres-runtime-current/compose.postgres-runtime.yml"
  -f "$ROOT/integration/ops/deploy/production-runtime/compose.agent-runtime-model.yml"
  -f "$ROOT/integration/ops/deploy/production-runtime/compose.daily-artifacts.yml"
)

runtime_release=$(cat "$ROOT/control/postgres-runtime-current/READY" 2>/dev/null || true)
backend_release=$(cat "$ROOT/control/deploy-state/backend.sha" 2>/dev/null || true)
if [[ ! $runtime_release =~ ^[0-9a-f]{40}$ || $runtime_release != "$backend_release" ]]; then
  echo 'rolling summary runtime is not committed by the backend release' >&2
  exit 75
fi

exec 9>"$ROOT/control/rolling-run-singleton.lock"
"$FLOCK_COMMAND" -n 9 || {
  echo 'rolling summary run already active' >&2
  exit 75
}
exec 8>"$ROOT/control/daily-run.lock"
"$FLOCK_COMMAND" -w 7500 8 || {
  echo 'rolling summary timed out waiting for daily pipeline admission' >&2
  exit 75
}

if [[ -z $NOW ]]; then
  NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
fi

auth_ready=false
if "$ROOT/control/refresh-codex-auth.sh"; then
  auth_ready=true
  if [[ -f "$ROOT/runtime/auth-account-changed" ]]; then
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    if [[ -d "$ROOT/runtime/subscription-runtime/sessions" ]]; then
      mv "$ROOT/runtime/subscription-runtime/sessions" \
        "$ROOT/backups/subscription-runtime-sessions.$stamp"
    fi
    install -d -m 0700 -o 1000 -g 1000 \
      "$ROOT/runtime/subscription-runtime/sessions"
    "${COMPOSE[@]}" restart agent-runtime
    rm -f "$ROOT/runtime/auth-account-changed"
    sleep 3
  fi
  "${COMPOSE[@]}" --profile app up -d --no-deps agent-runtime
fi

collection_date=${NOW:0:10}
run_id=$(printf '%s' "$NOW" | tr -d ':.-')
artifact_root="$ROOT/artifacts/rolling-summary"
receipt_host_path="$artifact_root/rolling-summary.$run_id.receipt.v1.json"
receipt_container_path="/var/lib/social-monitor/artifacts/rolling-summary/rolling-summary.$run_id.receipt.v1.json"
if [[ ${SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE:-} == 1 ]]; then
  install -d -m 0750 "$artifact_root"
else
  install -d -m 0750 -o 1000 -g 1000 "$artifact_root"
fi

export SOCIAL_MONITOR_ROLLING_RUN_ID=$run_id
export SOCIAL_MONITOR_ROLLING_RUN_RECEIPT_HOST_PATH=$receipt_host_path

# The quoted body expands only inside the daily runner container.
# shellcheck disable=SC2016
"${COMPOSE[@]}" --profile daily run --rm --no-deps \
  -e "ROLLING_RUN_ID=$run_id" \
  -e "ROLLING_COLLECTION_DATE=$collection_date" \
  -e "ROLLING_PERIOD_ENDED_AT=$NOW" \
  -e "ROLLING_RECEIPT_PATH=$receipt_container_path" \
  -e "ROLLING_AUTH_READY=$auth_ready" \
  daily-runner sh -lc '
    set -eu

    artifact_root=/var/lib/social-monitor/artifacts/rolling-summary
    collection_source=ops/evals/reader-summary-clean-real-day-collection.v1.json
    collection_artifact="$artifact_root/rolling-summary.$ROLLING_RUN_ID.collection.v1.json"
    evidence_path="$artifact_root/rolling-summary.$ROLLING_RUN_ID.evidence.v1.json"
    frontend_path="$artifact_root/rolling-summary.$ROLLING_RUN_ID.frontend.v1.json"
    period_started_at="${ROLLING_COLLECTION_DATE}T00:00:00.000Z"
    required_providers=github-trending-page,hacker-news,reddit,rss,x-twitter

    mkdir -p "$artifact_root"
    collection_exit=0
    npm run run:reader-summary-clean-real-day-collection -- \
      --update \
      --date "$ROLLING_COLLECTION_DATE" \
      --providers "$required_providers" || collection_exit=$?

    node ops/deploy/production-runtime/rolling-summary-receipt.mjs \
      validate-collection "$collection_source" "$ROLLING_COLLECTION_DATE"
    cp "$collection_source" "$collection_artifact.next"
    chmod 0444 "$collection_artifact.next"
    mv "$collection_artifact.next" "$collection_artifact"
    rolling_observation_cutoff=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

    if [[ "$ROLLING_AUTH_READY" != true ]]; then
      echo "rolling collection saved; AI summary is pending an available subscription account" >&2
      exit 75
    fi

    export DURABLE_READER_SUMMARY_TENANT_ID=00000000-0000-7000-8000-000000006101
    export DURABLE_READER_SUMMARY_WORKSPACE_ID=00000000-0000-7000-8000-000000006102
    export DURABLE_READER_SUMMARY_CADENCE=daily
    export DURABLE_READER_SUMMARY_PERIOD_STARTED_AT="$period_started_at"
    export DURABLE_READER_SUMMARY_PERIOD_ENDED_AT="$(node -e '\''const day = new Date(`${process.argv[1]}T00:00:00.000Z`); day.setUTCDate(day.getUTCDate() + 1); process.stdout.write(day.toISOString());'\'' "$ROLLING_COLLECTION_DATE")"
    export DURABLE_READER_SUMMARY_LIVE_OBSERVATION_CUTOFF="$rolling_observation_cutoff"
    export DURABLE_READER_SUMMARY_MODEL=agent-runtime
    # Keep rolling publication available when one provider is partial. The
    # canonical daily pipeline uses the same deterministic topic-map path.
    export DURABLE_READER_SUMMARY_TOPIC_LABELER=deterministic
    export DURABLE_READER_SUMMARY_MAX_EVIDENCE_ITEMS=120
    export DURABLE_READER_SUMMARY_EVIDENCE_PATH="$evidence_path"
    export DURABLE_READER_SUMMARY_FRONTEND_FIXTURE_PATH="$frontend_path"
    npm run capture:durable-reader-summary

    node ops/deploy/production-runtime/rolling-summary-receipt.mjs \
      write-receipt "$ROLLING_RECEIPT_PATH" "$evidence_path" "$collection_artifact" \
      "$ROLLING_RUN_ID" "$ROLLING_COLLECTION_DATE" "$rolling_observation_cutoff" \
      "$collection_exit"
  '

node "$ROOT/integration/ops/deploy/production-runtime/rolling-summary-receipt.mjs" \
  validate-receipt "$receipt_host_path" "$run_id" "$collection_date"

echo "rolling summary published for $collection_date: $receipt_host_path"
