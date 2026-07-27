#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after Compose and fail() are
# defined. Collector replacement must prove a real successful export because
# application readiness intentionally permits only a short startup grace.

BACKEND_HEALTH_STARTUP_GRACE_SECONDS=${BACKEND_HEALTH_STARTUP_GRACE_SECONDS:-240}
OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS=${OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS:-600}
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

backend_health_sanitize_diagnostic_value() {
  local value=${1:-unavailable}
  local lower
  value=${value//$'\r'/ }
  value=${value//$'\n'/ }
  value=${value//$'\t'/ }
  value=$(printf '%s' "$value" | LC_ALL=C tr -cd '[:alnum:] ._:/@%+=,-')
  value=${value:0:160}
  [[ -n $value ]] || value=empty
  lower=${value,,}
  case $lower in
    *authorization*|*bearer*|*credential*|*password*|*passwd*|*secret*|*token*|*api_key*|*apikey*|*key=*)
      value=redacted
      ;;
  esac
  printf '%s\n' "$value"
}

backend_health_http_diagnostic() {
  local label=$1 url=$2 body_file=${3:-/dev/null}
  local http_code curl_status
  if http_code=$(curl -sS -o "$body_file" -w '%{http_code}' \
    --max-time 15 "$url" 2>/dev/null); then
    curl_status=0
  else
    curl_status=$?
  fi
  [[ -n $http_code ]] || http_code=000
  printf 'deploy-error: backend health final diagnostics: %s_http curl_exit=%s http_status=%s\n' \
    "$label" "$curl_status" "$http_code" >&2
}

backend_health_ready_json_diagnostic() {
  local ready_body=$1 summary
  if [[ ! -s $ready_body ]]; then
    printf 'deploy-error: backend health final diagnostics: ready_json parse=unavailable exportState=unavailable lastExportAt=unavailable\n' >&2
    return 0
  fi
  if summary=$(python3 - "$ready_body" <<'PY' 2>/dev/null
import json
import re
import sys

try:
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        payload = json.load(handle)
except Exception:
    print("parse=failed exportState=unavailable lastExportAt=unavailable")
    raise SystemExit(0)

metrics = payload.get("runtime", {}).get("metrics", {})
export_state = metrics.get("exportState")
if isinstance(export_state, str):
    if re.fullmatch(r"[A-Za-z0-9_.:-]{1,64}", export_state):
        export_state_summary = export_state
    else:
        export_state_summary = "redacted"
elif export_state is None:
    export_state_summary = "missing"
else:
    export_state_summary = "non_string"

last_export_summary = "present" if metrics.get("lastExportAt") else "missing"
print(
    f"parse=ok exportState={export_state_summary} "
    f"lastExportAt={last_export_summary}"
)
PY
  ); then
    printf 'deploy-error: backend health final diagnostics: ready_json %s\n' \
      "$summary" >&2
  else
    printf 'deploy-error: backend health final diagnostics: ready_json parse=unavailable exportState=unavailable lastExportAt=unavailable\n' >&2
  fi
}

backend_health_container_diagnostic() {
  local service=$1 container status oom exit_code state_error
  if [[ $service == migrate || $service == daily-runner ]]; then
    printf 'deploy-error: backend health final diagnostics: service=%s container=skipped status=job_service oom=unavailable exit=unavailable state_error=unavailable\n' \
      "$service" >&2
    return 0
  fi
  if ! container=$("${COMPOSE[@]}" --profile app ps -q "$service" 2>/dev/null); then
    printf 'deploy-error: backend health final diagnostics: service=%s container=unavailable status=compose_ps_failed oom=unavailable exit=unavailable state_error=unavailable\n' \
      "$service" >&2
    return 0
  fi
  if [[ -z $container || $container == *[$'\t\r\n ']* ]]; then
    printf 'deploy-error: backend health final diagnostics: service=%s container=unavailable status=container_id_unavailable oom=unavailable exit=unavailable state_error=unavailable\n' \
      "$service" >&2
    return 0
  fi
  if ! status=$(docker inspect "$container" --format '{{.State.Status}}' 2>/dev/null); then
    status=unavailable
  fi
  if ! oom=$(docker inspect "$container" --format '{{.State.OOMKilled}}' 2>/dev/null); then
    oom=unavailable
  fi
  if ! exit_code=$(docker inspect "$container" --format '{{.State.ExitCode}}' 2>/dev/null); then
    exit_code=unavailable
  fi
  if ! state_error=$(docker inspect "$container" --format '{{.State.Error}}' 2>/dev/null); then
    state_error=unavailable
  fi
  printf 'deploy-error: backend health final diagnostics: service=%s container=%s status=%s oom=%s exit=%s state_error=%s\n' \
    "$(backend_health_sanitize_diagnostic_value "$service")" \
    "$(backend_health_sanitize_diagnostic_value "$container")" \
    "$(backend_health_sanitize_diagnostic_value "$status")" \
    "$(backend_health_sanitize_diagnostic_value "$oom")" \
    "$(backend_health_sanitize_diagnostic_value "$exit_code")" \
    "$(backend_health_sanitize_diagnostic_value "$state_error")" >&2
}

backend_health_emit_final_diagnostics() {
  local temp_dir ready_body service
  temp_dir=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-backend-health.XXXXXX") || {
    printf 'deploy-error: backend health final diagnostics: unavailable temporary directory unavailable\n' >&2
    return 0
  }
  ready_body=$temp_dir/ready.json
  backend_health_http_diagnostic healthz \
    http://127.0.0.1:13000/healthz "$temp_dir/healthz.body" || true
  backend_health_http_diagnostic ready \
    http://127.0.0.1:13000/ready "$ready_body" || true
  backend_health_ready_json_diagnostic "$ready_body" || true
  for service in "$@"; do
    backend_health_container_diagnostic "$service" || true
  done
  rm -rf "$temp_dir"
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
        "$(backend_health_sanitize_diagnostic_value "$service")" \
        "$(backend_health_sanitize_diagnostic_value "$container")" \
        "$(backend_health_sanitize_diagnostic_value "$status")" \
        "$(backend_health_sanitize_diagnostic_value "$oom")" \
        "$(backend_health_sanitize_diagnostic_value "$exit_code")" \
        "$(backend_health_sanitize_diagnostic_value "$state_error")" >&2
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
    if ((attempt == attempts)); then
      backend_health_emit_final_diagnostics "$@"
      break
    fi
    sleep "$sleep_seconds"
  done
  return 1
}
