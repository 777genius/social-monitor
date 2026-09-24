#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
if [[ ${SOCIAL_MONITOR_X_LAUNCH_TEST_MODE:-} == 1 && \
      ${BASH_SOURCE[0]} == /var/data/social-monitor/* ]]; then
  echo 'installed fallback cannot use test mode' >&2
  exit 75
fi
if [[ ${SOCIAL_MONITOR_X_LAUNCH_TEST_MODE:-} == 1 ]]; then
  ROOT=${SOCIAL_MONITOR_X_LAUNCH_TEST_ROOT:?test root required}
  ROOT=$(realpath -e -- "$ROOT" 2>/dev/null) || exit 64
  [[ -d $ROOT && $ROOT == /tmp/* ]] || exit 64
  CTR=${SOCIAL_MONITOR_X_LAUNCH_TEST_CTR:?test ctr required}
  DOCKER=${SOCIAL_MONITOR_X_LAUNCH_TEST_DOCKER:?test Docker required}
  SYSTEMCTL=${SOCIAL_MONITOR_X_LAUNCH_TEST_SYSTEMCTL:?test systemctl required}
else
  ROOT=/var/data/social-monitor
  CTR=ctr
  DOCKER=docker
  SYSTEMCTL=systemctl
  unset SOCIAL_MONITOR_ROOT SOCIAL_MONITOR_CTR_COMMAND \
    SOCIAL_MONITOR_DOCKER_COMMAND SOCIAL_MONITOR_SYSTEMCTL_COMMAND \
    SOCIAL_MONITOR_X_LAUNCH_TEST_ROOT SOCIAL_MONITOR_X_LAUNCH_TEST_CTR \
    SOCIAL_MONITOR_X_LAUNCH_TEST_DOCKER SOCIAL_MONITOR_X_LAUNCH_TEST_SYSTEMCTL
fi
X_LAUNCH_GUARD=$ROOT/control/postgres-runtime-current/x-launch-guard.py
guard_owner=0
[[ ${SOCIAL_MONITOR_X_LAUNCH_TEST_MODE:-} != 1 ]] || guard_owner=$(id -u)
[[ -f $X_LAUNCH_GUARD && ! -L $X_LAUNCH_GUARD && \
   $(stat -c '%a:%u' "$X_LAUNCH_GUARD" 2>/dev/null) == "644:$guard_owner" ]] || {
  echo 'X launch guard is missing or unsafe' >&2
  exit 75
}
X_TASK_ID=social-monitor-x-host-fallback
AGENT_TASK_ID=social-monitor-agent-runtime-host-fallback
MODE=${1:-run}

case "$MODE" in
  run | --agent-runtime-only | --restart-agent-runtime) ;;
  *)
    echo "unsupported rolling fallback mode: $MODE" >&2
    exit 64
    ;;
esac
if [[ $MODE == run ]]; then
  python3 "$X_LAUNCH_GUARD" check || exit 75
fi

# The normal systemd timer remains authoritative whenever its manager answers.
# This makes the cron fallback self-disabling after a host recovery or reboot.
if [[ $MODE == run ]] && timeout 5 "$SYSTEMCTL" show --property=ActiveState --value \
  social-monitor-rolling.timer 2>/dev/null | grep -Fx active >/dev/null; then
  exit 0
fi

task_running() {
  local task_id=$1
  "$CTR" -n moby tasks ls 2>/dev/null |
    awk -v id="$task_id" '$1 == id && $3 == "RUNNING" { found = 1 } END { exit !found }'
}

remove_task() {
  local task_id=$1
  if "$CTR" -n moby tasks ls 2>/dev/null | awk -v id="$task_id" \
    '$1 == id { found = 1 } END { exit !found }'; then
    "$CTR" -n moby tasks rm -f "$task_id"
  fi
  if "$CTR" -n moby containers info "$task_id" >/dev/null 2>&1; then
    "$CTR" -n moby containers rm "$task_id"
  fi
}

start_host_network_x_collector() (
  local runtime_env
  runtime_env=$(mktemp "$ROOT/runtime/x-host-fallback-env.XXXXXX")
  trap 'rm -f -- "$runtime_env"' EXIT
  chmod 0600 "$runtime_env"

  remove_task "$X_TASK_ID"

  "$DOCKER" inspect social-monitor-prod-x-collector-1 |
    jq -r '.[0].Config.Env[]' |
    grep -v '^X_COLLECTOR_GRPC_BIND=' > "$runtime_env"
  printf '%s\n' 'X_COLLECTOR_GRPC_BIND=0.0.0.0:50051' >> "$runtime_env"

  python3 "$X_LAUNCH_GUARD" run "$CTR" -n moby run -d --null-io --net-host --user 1000:1000 \
    --cwd /app/apps/x-collector \
    --env-file "$runtime_env" \
    --mount type=bind,src="$ROOT/runtime/x-collector",dst=/var/lib/social-monitor-x,options=rbind:rw \
    --mount type=bind,src="$ROOT/secrets/x-collector",dst=/run/social-monitor-x,options=rbind:ro \
    --mount type=bind,src="$ROOT/control/deploy-state",dst=/run/social-monitor-x-launch-state,options=rbind:ro \
    --mount type=bind,src="$X_LAUNCH_GUARD",dst=/run/social-monitor-x-launch-guard.py,options=rbind:ro \
    --label social-monitor.project=social-monitor \
    --label social-monitor.purpose=x-collector-host-network-fallback \
    docker.io/library/social-monitor-prod-x-collector:latest "$X_TASK_ID" \
    python /run/social-monitor-x-launch-guard.py container-exec python -m x_collector
)

start_host_network_agent_runtime() (
  local runtime_env
  runtime_env=$(mktemp "$ROOT/runtime/agent-host-fallback-env.XXXXXX")
  trap 'rm -f -- "$runtime_env"' EXIT
  chmod 0600 "$runtime_env"

  remove_task "$AGENT_TASK_ID"
  "$DOCKER" inspect social-monitor-prod-agent-runtime-1 |
    jq -r '.[0].Config.Env[]' |
    grep -v '^AGENT_RUNTIME_GRPC_BIND=' > "$runtime_env"
  printf '%s\n' 'AGENT_RUNTIME_GRPC_BIND=0.0.0.0:50052' >> "$runtime_env"

  "$CTR" -n moby run -d --null-io --net-host --user 1000:1000 \
    --cwd /app \
    --env-file "$runtime_env" \
    --mount type=bind,src="$ROOT/runtime/subscription-runtime",dst=/var/lib/subscription-runtime,options=rbind:rw \
    --mount type=bind,src="$ROOT/auth-current",dst=/run/social-monitor-codex-auth,options=rbind:ro \
    --mount type=bind,src="$ROOT/secrets/db/ca-certificate.crt",dst=/run/social-monitor-db/ca-certificate.crt,options=rbind:ro \
    --mount type=bind,src="$ROOT/auth-pool",dst=/run/social-monitor-codex-auth-pool,options=rbind:ro \
    --label social-monitor.project=social-monitor \
    --label social-monitor.purpose=agent-runtime-host-network-fallback \
    docker.io/library/social-monitor-prod-agent-runtime:latest "$AGENT_TASK_ID"
)

if [[ $MODE == run ]] && ! task_running "$X_TASK_ID"; then
  start_host_network_x_collector
fi
if [[ $MODE == --restart-agent-runtime ]] || \
   ! task_running "$AGENT_TASK_ID"; then
  start_host_network_agent_runtime
fi

for _ in {1..15}; do
  if task_running "$AGENT_TASK_ID" && ss -lnt | grep -Eq ':50052\b' && \
    { [[ $MODE != run ]] || \
      { task_running "$X_TASK_ID" && ss -lnt | grep -Eq ':50051\b'; }; }; then
    break
  fi
  sleep 1
done
if ! task_running "$AGENT_TASK_ID" || ! ss -lnt | grep -Eq ':50052\b'; then
  echo 'rolling fallback could not start the host-network agent runtime' >&2
  exit 75
fi
if [[ $MODE == run ]] && \
   { ! task_running "$X_TASK_ID" || ! ss -lnt | grep -Eq ':50051\b'; }; then
  echo 'rolling fallback could not start its host-network runtimes' >&2
  exit 75
fi

if [[ $MODE == --agent-runtime-only || $MODE == --restart-agent-runtime ]]; then
  exit 0
fi

export SOCIAL_MONITOR_ROLLING_RUNTIME=containerd
export SOCIAL_MONITOR_ROLLING_AGENT_RUNTIME_IP=127.0.0.1
export SOCIAL_MONITOR_ROLLING_AGENT_RUNTIME_RESTART_SCRIPT=$ROOT/control/rolling-containerd-fallback.sh
export SOCIAL_MONITOR_ROLLING_X_ADDRESS=127.0.0.1:50051
exec "$ROOT/control/rolling-run.sh"
