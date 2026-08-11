#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after Compose and fail() are
# defined. Collector replacement must prove a real successful export because
# application readiness intentionally permits only a short startup grace.

verify_backend() {
  local service container status oom require_export=false
  curl -fsS --max-time 15 http://127.0.0.1:13000/healthz >/dev/null || return 1
  for service in "$@"; do
    [[ $service != otel-collector ]] || require_export=true
  done
  if [[ $require_export == true ]]; then
    curl -fsS --max-time 15 http://127.0.0.1:13000/ready | \
      python3 -c 'import json,sys; h=json.load(sys.stdin)["runtime"]["metrics"]; raise SystemExit(0 if h["exportState"] == "succeeded" and h.get("lastExportAt") else 1)' || return 1
  else
    curl -fsS --max-time 15 http://127.0.0.1:13000/ready >/dev/null || return 1
  fi
  for service in "$@"; do
    [[ $service == migrate || $service == daily-runner ]] && continue
    container=$("${COMPOSE[@]}" --profile app ps -q "$service") || return 1
    [[ -n $container && $container != *[$'\t\r\n ']* ]] || return 1
    status=$(docker inspect "$container" --format '{{.State.Status}}')
    oom=$(docker inspect "$container" --format '{{.State.OOMKilled}}')
    if [[ $status != running || $oom != false ]]; then
      printf 'deploy-error: %s failed runtime verification\n' "$service" >&2
      return 1
    fi
  done
}

verify_backend_with_retry() {
  local attempts=20 service attempt
  for service in "$@"; do
    [[ $service != otel-collector ]] || attempts=40
  done
  for ((attempt = 0; attempt < attempts; attempt++)); do
    verify_backend "$@" && return 0
    sleep 3
  done
  return 1
}
