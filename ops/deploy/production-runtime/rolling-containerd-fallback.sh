#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
ROOT=${SOCIAL_MONITOR_ROOT:-/var/data/social-monitor}
CTR=${SOCIAL_MONITOR_CTR_COMMAND:-ctr}
DOCKER=${SOCIAL_MONITOR_DOCKER_COMMAND:-docker}
SYSTEMCTL=${SOCIAL_MONITOR_SYSTEMCTL_COMMAND:-systemctl}
X_TASK_ID=social-monitor-x-host-fallback

# The normal systemd timer remains authoritative whenever its manager answers.
# This makes the cron fallback self-disabling after a host recovery or reboot.
if timeout 5 "$SYSTEMCTL" show --property=ActiveState --value \
  social-monitor-rolling.timer 2>/dev/null | grep -Fx active >/dev/null; then
  exit 0
fi

x_task_running() {
  "$CTR" -n moby tasks ls 2>/dev/null |
    awk -v id="$X_TASK_ID" '$1 == id && $3 == "RUNNING" { found = 1 } END { exit !found }'
}

start_host_network_x_collector() {
  local runtime_env
  runtime_env=$(mktemp "$ROOT/runtime/x-host-fallback-env.XXXXXX")
  cleanup_x_env() {
    rm -f -- "$runtime_env"
  }
  trap cleanup_x_env RETURN
  chmod 0600 "$runtime_env"

  if "$CTR" -n moby tasks ls 2>/dev/null | awk -v id="$X_TASK_ID" \
    '$1 == id { found = 1 } END { exit !found }'; then
    "$CTR" -n moby tasks rm -f "$X_TASK_ID"
  fi
  if "$CTR" -n moby containers info "$X_TASK_ID" >/dev/null 2>&1; then
    "$CTR" -n moby containers rm "$X_TASK_ID"
  fi

  "$DOCKER" inspect social-monitor-prod-x-collector-1 |
    jq -r '.[0].Config.Env[]' |
    grep -v '^X_COLLECTOR_GRPC_BIND=' > "$runtime_env"
  printf '%s\n' 'X_COLLECTOR_GRPC_BIND=0.0.0.0:50051' >> "$runtime_env"

  "$CTR" -n moby run -d --null-io --net-host --user 1000:1000 \
    --cwd /app/apps/x-collector \
    --env-file "$runtime_env" \
    --mount type=bind,src="$ROOT/runtime/x-collector",dst=/var/lib/social-monitor-x,options=rbind:rw \
    --mount type=bind,src="$ROOT/secrets/x-collector",dst=/run/social-monitor-x,options=rbind:ro \
    --label social-monitor.project=social-monitor \
    --label social-monitor.purpose=x-collector-host-network-fallback \
    docker.io/library/social-monitor-prod-x-collector:latest "$X_TASK_ID"
}

if ! x_task_running; then
  start_host_network_x_collector
fi

for _ in {1..15}; do
  if x_task_running && ss -lnt | grep -Eq ':50051\b'; then
    break
  fi
  sleep 1
done
if ! x_task_running || ! ss -lnt | grep -Eq ':50051\b'; then
  echo 'rolling fallback could not start the host-network X collector' >&2
  exit 75
fi

export SOCIAL_MONITOR_ROLLING_RUNTIME=containerd
export SOCIAL_MONITOR_ROLLING_X_ADDRESS=127.0.0.1:50051
exec "$ROOT/control/rolling-run.sh"
