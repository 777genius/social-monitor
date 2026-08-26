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
    if [[ ${SOCIAL_MONITOR_ROLLING_RUN_TEST_MODE:-} == 1 ]]; then
      install -d -m 0700 "$ROOT/runtime/subscription-runtime/sessions"
    else
      install -d -m 0700 -o 1000 -g 1000 \
        "$ROOT/runtime/subscription-runtime/sessions"
    fi
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

container_body='exec sh ops/deploy/production-runtime/rolling-summary-container-run.sh'

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
