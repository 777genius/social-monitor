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
  CTR_COMMAND=${SOCIAL_MONITOR_ROLLING_RUN_TEST_CTR:-ctr}
  FLOCK_COMMAND=${SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK:-flock}
  NOW=${SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW:-2026-08-15T08:15:00.000Z}
else
  ROOT=/var/data/social-monitor
  DOCKER_COMMAND=docker
  CTR_COMMAND=ctr
  FLOCK_COMMAND=flock
  NOW=
  unset SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE \
    SOCIAL_MONITOR_ROLLING_RUN_TEST_ROOT \
    SOCIAL_MONITOR_ROLLING_RUN_TEST_DOCKER \
    SOCIAL_MONITOR_ROLLING_RUN_TEST_CTR \
    SOCIAL_MONITOR_ROLLING_RUN_TEST_FLOCK \
    SOCIAL_MONITOR_ROLLING_RUN_TEST_NOW
fi
unset DATABASE_URL

ROLLING_RUNTIME=${SOCIAL_MONITOR_ROLLING_RUNTIME:-docker}
case "$ROLLING_RUNTIME" in
  docker | containerd) ;;
  *)
    echo "unsupported rolling runtime: $ROLLING_RUNTIME" >&2
    exit 64
    ;;
esac

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
    if [[ $ROLLING_RUNTIME == docker ]]; then
      "${COMPOSE[@]}" restart agent-runtime
      rm -f "$ROOT/runtime/auth-account-changed"
      sleep 3
    else
      restart_script=${SOCIAL_MONITOR_ROLLING_AGENT_RUNTIME_RESTART_SCRIPT:-}
      if [[ -x $restart_script ]] && \
         "$restart_script" --restart-agent-runtime; then
        rm -f "$ROOT/runtime/auth-account-changed"
        sleep 3
      else
        auth_ready=false
      fi
    fi
  fi
  if [[ $ROLLING_RUNTIME == docker ]]; then
    "${COMPOSE[@]}" --profile app up -d --no-deps agent-runtime
  fi
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

# The quoted heredoc expands only inside the daily runner container.
# shellcheck disable=SC2016
container_body=$(cat <<'ROLLING_CONTAINER_BODY'
    set -eu

    artifact_root=/var/lib/social-monitor/artifacts/rolling-summary
    collection_directory="$artifact_root/collections"
    collection_staging_directory="$collection_directory/runs/$ROLLING_RUN_ID"
    collection_source="$collection_directory/reader-summary-clean-real-day-collection.$ROLLING_COLLECTION_DATE.v1.json"
    collection_staging_source="$collection_staging_directory/reader-summary-clean-real-day-collection.$ROLLING_COLLECTION_DATE.v1.json"
    collection_artifact="$artifact_root/rolling-summary.$ROLLING_RUN_ID.collection.v1.json"
    evidence_path="$artifact_root/rolling-summary.$ROLLING_RUN_ID.evidence.v1.json"
    frontend_path="$artifact_root/rolling-summary.$ROLLING_RUN_ID.frontend.v1.json"
    period_started_at="${ROLLING_COLLECTION_DATE}T00:00:00.000Z"
    required_providers=github-trending-page,hacker-news,reddit,rss,x-twitter

    mkdir -p "$collection_staging_directory"
    rm -f "$collection_staging_source" \
      "$collection_source.next.$ROLLING_RUN_ID" \
      "$collection_artifact.next"
    collection_exit=0
    npm run run:reader-summary-clean-real-day-collection -- \
      --update \
      --date "$ROLLING_COLLECTION_DATE" \
      --exact-date-artifact-directory "$collection_staging_directory" \
      --providers "$required_providers" || collection_exit=$?

    if [ "$collection_exit" -ne 0 ]; then
      echo "rolling collection failed for current pass $ROLLING_RUN_ID (exit $collection_exit)" >&2
      exit "$collection_exit"
    fi

    node ops/deploy/production-runtime/rolling-summary-receipt.mjs \
      validate-collection "$collection_staging_source" "$ROLLING_COLLECTION_DATE"
    cp "$collection_staging_source" "$collection_source.next.$ROLLING_RUN_ID"
    chmod 0444 "$collection_source.next.$ROLLING_RUN_ID"
    mv "$collection_source.next.$ROLLING_RUN_ID" "$collection_source"
    cp "$collection_staging_source" "$collection_artifact.next"
    chmod 0444 "$collection_artifact.next"
    mv "$collection_artifact.next" "$collection_artifact"
    rm -f "$collection_staging_source"
    rmdir "$collection_staging_directory" 2>/dev/null || true
    rolling_observation_cutoff=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)

    if [ "$ROLLING_AUTH_READY" != true ]; then
      echo "rolling collection saved; AI summary is pending an available subscription account" >&2
      exit 75
    fi

    export DURABLE_READER_SUMMARY_TENANT_ID=00000000-0000-7000-8000-000000006101
    export DURABLE_READER_SUMMARY_WORKSPACE_ID=00000000-0000-7000-8000-000000006102
    export DURABLE_READER_SUMMARY_CADENCE=daily
    export DURABLE_READER_SUMMARY_PERIOD_STARTED_AT="$period_started_at"
    export DURABLE_READER_SUMMARY_PERIOD_ENDED_AT="$(node -e 'const day = new Date(`${process.argv[1]}T00:00:00.000Z`); day.setUTCDate(day.getUTCDate() + 1); process.stdout.write(day.toISOString());' "$ROLLING_COLLECTION_DATE")"
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
ROLLING_CONTAINER_BODY
)

if [[ $ROLLING_RUNTIME == docker ]]; then
  "${COMPOSE[@]}" --profile daily run --rm --no-deps \
    -e "ROLLING_RUN_ID=$run_id" \
    -e "ROLLING_COLLECTION_DATE=$collection_date" \
    -e "ROLLING_PERIOD_ENDED_AT=$NOW" \
    -e "ROLLING_RECEIPT_PATH=$receipt_container_path" \
    -e "ROLLING_AUTH_READY=$auth_ready" \
    daily-runner sh -lc "$container_body"
else
  runtime_env=$(mktemp "$ROOT/runtime/rolling-containerd-env.XXXXXX")
  rendered_env=$(mktemp "$ROOT/runtime/rolling-containerd-rendered-env.XXXXXX")
  cleanup_containerd_env() {
    rm -f -- "$runtime_env" "$rendered_env"
  }
  trap cleanup_containerd_env EXIT
  chmod 0600 "$runtime_env" "$rendered_env"

  "${COMPOSE[@]}" --profile app --profile daily config --format json |
    jq -r '.services["daily-runner"].environment | to_entries[] | "\(.key)=\(.value)"' > "$rendered_env"

  agent_ip=${SOCIAL_MONITOR_ROLLING_AGENT_RUNTIME_IP:-$(
    "$DOCKER_COMMAND" inspect --format \
      '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
      social-monitor-prod-agent-runtime-1
  )}
  redis_ip=${SOCIAL_MONITOR_ROLLING_REDIS_IP:-$(
    "$DOCKER_COMMAND" inspect --format \
      '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
      social-monitor-prod-redis-1
  )}
  rabbitmq_ip=${SOCIAL_MONITOR_ROLLING_RABBITMQ_IP:-$(
    "$DOCKER_COMMAND" inspect --format \
      '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' \
      social-monitor-prod-rabbitmq-1
  )}
  x_address=${SOCIAL_MONITOR_ROLLING_X_ADDRESS:-127.0.0.1:50051}
  [[ $agent_ip =~ ^[0-9.]+$ && $redis_ip =~ ^[0-9.]+$ &&
    $rabbitmq_ip =~ ^[0-9.]+$ && $x_address =~ ^[A-Za-z0-9.:-]+$ ]] || {
    echo 'rolling containerd fallback resolved an invalid service address' >&2
    exit 75
  }

  while IFS='=' read -r key value; do
    case "$key" in
      AGENT_RUNTIME_GRPC_ADDRESS) value="$agent_ip:50052" ;;
      X_COLLECTOR_GRPC_ADDRESS) value=$x_address ;;
      REDIS_URL) value=${value//redis:6379/$redis_ip:6379} ;;
      RABBITMQ_URL)
        value=${value/rabbitmq:/$rabbitmq_ip:}
        ;;
    esac
    printf '%s=%s\n' "$key" "$value" >> "$runtime_env"
  done < "$rendered_env"

  "$CTR_COMMAND" -n moby run --rm --net-host \
    --env-file "$runtime_env" \
    --env "ROLLING_RUN_ID=$run_id" \
    --env "ROLLING_COLLECTION_DATE=$collection_date" \
    --env "ROLLING_PERIOD_ENDED_AT=$NOW" \
    --env "ROLLING_RECEIPT_PATH=$receipt_container_path" \
    --env "ROLLING_AUTH_READY=$auth_ready" \
    --mount type=bind,src="$ROOT/artifacts",dst=/var/lib/social-monitor/artifacts,options=rbind:rw \
    --mount type=bind,src="$ROOT/artifacts/evals",dst=/app/ops/evals,options=rbind:rw \
    --mount type=bind,src="$ROOT/runtime/x-collector",dst=/app/apps/x-collector/var/x-collector,options=rbind:rw \
    --mount type=bind,src="$ROOT/secrets/db/ca-certificate.crt",dst=/run/social-monitor-db/ca-certificate.crt,options=rbind:ro \
    docker.io/library/social-monitor-prod-daily-runner:latest \
    "social-monitor-rolling-$run_id" sh -lc "$container_body"
fi

node "$ROOT/integration/ops/deploy/production-runtime/rolling-summary-receipt.mjs" \
  validate-receipt "$receipt_host_path" "$run_id" "$collection_date"

echo "rolling summary published for $collection_date: $receipt_host_path"
