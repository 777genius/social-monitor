#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after Compose and fail() are
# defined. Collector replacement must prove a real successful export because
# application readiness intentionally permits only a short startup grace.

BACKEND_HEALTH_STARTUP_GRACE_SECONDS=${BACKEND_HEALTH_STARTUP_GRACE_SECONDS:-240}
OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS=${OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS:-300}
BACKEND_HEALTH_RETRY_SLEEP_SECONDS=${BACKEND_HEALTH_RETRY_SLEEP_SECONDS:-3}

backend_health_positive_integer() {
  [[ $1 =~ ^[1-9][0-9]*$ ]]
}

backend_health_retry_attempts() {
  local grace_seconds=$1 sleep_seconds=$2
  backend_health_positive_integer "$grace_seconds" || return 1
  backend_health_positive_integer "$sleep_seconds" || return 1
  printf '%d\n' $(((grace_seconds + sleep_seconds - 1) / sleep_seconds + 1))
}

backend_health_grace_seconds_for_services() {
  local normal_grace=$BACKEND_HEALTH_STARTUP_GRACE_SECONDS
  local collector_grace=$OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS
  local grace_seconds=$normal_grace service
  backend_health_positive_integer "$normal_grace" || return 1
  backend_health_positive_integer "$collector_grace" || return 1
  for service in "$@"; do
    if [[ $service == otel-collector ]]; then
      if ((collector_grace < normal_grace)); then
        grace_seconds=$normal_grace
      else
        grace_seconds=$collector_grace
      fi
    fi
  done
  printf '%s\n' "$grace_seconds"
}

verify_backend() {
  local service container status oom exit_code state_error
  local require_export=false ready_json
  curl -fsS --max-time 15 http://127.0.0.1:13000/healthz \
    >/dev/null 2>&1 || return 1
  for service in "$@"; do
    [[ $service != otel-collector ]] || require_export=true
  done
  if [[ $require_export == true ]]; then
    ready_json=$(
      curl -fsS --max-time 15 http://127.0.0.1:13000/ready 2>/dev/null
    ) || return 1
    python3 -c 'import json,sys; h=json.load(sys.stdin)["runtime"]["metrics"]; raise SystemExit(0 if h["exportState"] == "succeeded" and h.get("lastExportAt") else 1)' \
      <<< "$ready_json" >/dev/null 2>&1 || return 1
  else
    curl -fsS --max-time 15 http://127.0.0.1:13000/ready \
      >/dev/null 2>&1 || return 1
  fi
  for service in "$@"; do
    [[ $service == migrate || $service == daily-runner ]] && continue
    container=$("${COMPOSE[@]}" --profile app ps -q "$service") || return 1
    [[ -n $container && $container != *[$'\t\r\n ']* ]] || return 1
    status=$(docker inspect "$container" --format '{{.State.Status}}')
    oom=$(docker inspect "$container" --format '{{.State.OOMKilled}}')
    if [[ $status != running || $oom != false ]]; then
      exit_code=$(docker inspect "$container" --format '{{.State.ExitCode}}' 2>/dev/null || printf 'unavailable')
      state_error=$(docker inspect "$container" --format '{{.State.Error}}' 2>/dev/null || printf 'unavailable')
      printf 'deploy-error: %s failed runtime verification (container=%s status=%s oom=%s exit=%s state_error=%s)\n' \
        "$service" "$container" "$status" "$oom" "$exit_code" "$state_error" >&2
      return 1
    fi
  done
}

verify_backend_with_retry() {
  local sleep_seconds=$BACKEND_HEALTH_RETRY_SLEEP_SECONDS
  local grace_seconds attempts attempt
  if ! backend_health_positive_integer "$sleep_seconds"; then
    printf 'deploy-error: backend health retry sleep is invalid\n' >&2
    return 1
  fi
  if ! grace_seconds=$(backend_health_grace_seconds_for_services "$@"); then
    printf 'deploy-error: backend health startup grace is invalid\n' >&2
    return 1
  fi
  if ! attempts=$(backend_health_retry_attempts "$grace_seconds" "$sleep_seconds"); then
    printf 'deploy-error: backend health retry attempts are invalid\n' >&2
    return 1
  fi
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    verify_backend "$@" && return 0
    ((attempt == attempts)) && break
    sleep "$sleep_seconds"
  done
  return 1
}
