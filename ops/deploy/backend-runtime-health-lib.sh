#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after Compose and fail() are
# defined. Collector replacement must prove a real successful export because
# application readiness intentionally permits only a short startup grace.

if [[ -n ${PRODUCTION_TRANSITION_PRELUDE_COMMIT:-} ]]; then
  BACKEND_RUNTIME_HEALTH_SCRIPT_DIR=$REPO/ops/deploy
else
  BACKEND_RUNTIME_HEALTH_SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
fi
BACKEND_RABBITMQ_QUORUM_HEALTH_SCRIPT=$BACKEND_RUNTIME_HEALTH_SCRIPT_DIR/rabbitmq-quorum-health.sh
BACKEND_RABBITMQ_QUORUM_RECOVERY_SCRIPT=$BACKEND_RUNTIME_HEALTH_SCRIPT_DIR/rabbitmq-quorum-recovery.sh
BACKEND_HEALTH_STARTUP_GRACE_SECONDS=${BACKEND_HEALTH_STARTUP_GRACE_SECONDS:-240}
OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS=${OTEL_COLLECTOR_HEALTH_STARTUP_GRACE_SECONDS:-600}
BACKEND_HEALTH_RETRY_SLEEP_SECONDS=${BACKEND_HEALTH_RETRY_SLEEP_SECONDS:-3}

backend_health_load_rabbitmq_quorum_recovery() {
  local script

  if declare -F rabbitmq_quorum_recovery_ensure_steady >/dev/null && \
    declare -F rabbitmq_quorum_health_verify_worker_container >/dev/null; then
    return 0
  fi
  if [[ -n ${PRODUCTION_TRANSITION_PRELUDE_COMMIT:-} ]]; then
    declare -F rabbitmq_quorum_health_verify_worker_container >/dev/null || \
      production_transition_host_source_authorized_prelude \
        ops/deploy/rabbitmq-quorum-health.sh 'RabbitMQ quorum health library'
    declare -F rabbitmq_quorum_recovery_ensure_steady >/dev/null || \
      production_transition_host_source_authorized_prelude \
        ops/deploy/rabbitmq-quorum-recovery.sh 'RabbitMQ quorum recovery library'
    return
  fi
  for script in "$BACKEND_RABBITMQ_QUORUM_HEALTH_SCRIPT" \
    "$BACKEND_RABBITMQ_QUORUM_RECOVERY_SCRIPT"; do
    [[ -f $script && ! -L $script && -r $script ]] || {
      printf 'deploy-error: RabbitMQ quorum runtime asset is missing or unsafe\n' >&2
      return 1
    }
  done
  if ! declare -F rabbitmq_quorum_health_verify_worker_container >/dev/null; then
    # shellcheck source=ops/deploy/rabbitmq-quorum-health.sh
    source "$BACKEND_RABBITMQ_QUORUM_HEALTH_SCRIPT" || return 1
  fi
  if ! declare -F rabbitmq_quorum_recovery_ensure_steady >/dev/null; then
    # shellcheck source=ops/deploy/rabbitmq-quorum-recovery.sh
    source "$BACKEND_RABBITMQ_QUORUM_RECOVERY_SCRIPT" || return 1
  fi
  declare -F rabbitmq_quorum_recovery_ensure_steady >/dev/null && \
    declare -F rabbitmq_quorum_health_verify_worker_container >/dev/null
}

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
  lower=$(printf '%s' "$value" | LC_ALL=C tr '[:upper:]' '[:lower:]')
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

backend_health_ready_json_valid() {
  python3 -c 'import json,sys
try:
    payload = json.load(sys.stdin)
except Exception:
    raise SystemExit(1)
if not isinstance(payload, dict):
    raise SystemExit(1)
runtime = payload.get("runtime")
if not isinstance(runtime, dict):
    raise SystemExit(1)
metrics = runtime.get("metrics")
if not isinstance(metrics, dict):
    raise SystemExit(1)
' >/dev/null 2>&1
}

backend_health_container_diagnostic() {
  local service=$1 container status oom exit_code state_error
  if [[ $service == migrate || $service == daily-runner ]]; then
    printf 'deploy-error: backend health final diagnostics: service=%s container=skipped status=job_service oom=unavailable exit=unavailable state_error=unavailable\n' \
      "$service" >&2
    return 0
  fi
  if ! container=$("${COMPOSE[@]}" --profile app ps --no-trunc -q "$service" 2>/dev/null); then
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
  local require_ready_json=false ready_json
  backend_health_load_rabbitmq_quorum_recovery || return 1
  rabbitmq_quorum_recovery_ensure_steady || return 1
  curl -fsS --max-time 15 http://127.0.0.1:13000/healthz \
    >/dev/null 2>&1 || return 1
  for service in "$@"; do
    [[ $service != otel-collector ]] || require_ready_json=true
  done
  if [[ $require_ready_json == true ]]; then
    ready_json=$(
      curl -fsS --max-time 15 http://127.0.0.1:13000/ready 2>/dev/null
    ) || return 1
    backend_health_ready_json_valid <<< "$ready_json" || return 1
  else
    curl -fsS --max-time 15 http://127.0.0.1:13000/ready \
      >/dev/null 2>&1 || return 1
  fi
  for service in "$@"; do
    [[ $service == migrate || $service == daily-runner ]] && continue
    container=$("${COMPOSE[@]}" --profile app ps --no-trunc -q "$service") || return 1
    [[ $container =~ ^[0-9a-f]{64}$ ]] || return 1
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
    rabbitmq_quorum_health_verify_worker_container "$service" "$container" || return 1
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

backend_health_pin_migrate_from_running_api() {
  local service=$1
  local policy=$2
  local rescue_tag=$3
  local source_kind_name=$4
  local source_ref_name=$5
  local image_id_name=$6
  local migrate_containers api_container verified_api_container final_api_container
  local api_image_id inspected_image_id pinned_id final_api_image_id

  [[ $service == migrate && $policy == tag-only-migrate ]] || return 1
  migrate_containers=$("${COMPOSE[@]}" --profile app --profile daily ps -q migrate) || return 1
  [[ -z $migrate_containers ]] || return 1
  api_container=$(backend_image_rescue_compose_container_id api) || return 1
  verify_backend_with_retry api || return 1
  verified_api_container=$(backend_image_rescue_compose_container_id api) || return 1
  [[ $verified_api_container == "$api_container" ]] || return 1
  backend_image_rescue_verify_running_container "$api_container" || return 1
  api_image_id=$(docker inspect "$api_container" --format '{{.Image}}' 2>/dev/null) || return 1
  [[ $api_image_id =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  inspected_image_id=$(backend_image_rescue_image_id "$api_image_id") || return 1
  [[ $inspected_image_id == "$api_image_id" ]] || return 1
  docker image tag "$api_image_id" "$rescue_tag" >/dev/null || return 1
  pinned_id=$(backend_image_rescue_image_id "$rescue_tag") || return 1
  [[ $pinned_id == "$api_image_id" ]] || return 1
  final_api_container=$(backend_image_rescue_compose_container_id api) || return 1
  [[ $final_api_container == "$api_container" ]] || return 1
  backend_image_rescue_verify_running_container "$api_container" || return 1
  final_api_image_id=$(docker inspect "$api_container" --format '{{.Image}}' 2>/dev/null) || return 1
  [[ $final_api_image_id == "$api_image_id" ]] || return 1
  printf -v "$source_kind_name" '%s' running-image
  printf -v "$source_ref_name" '%s' "$api_container"
  printf -v "$image_id_name" '%s' "$api_image_id"
}

backend_image_rescue_pin_service() {
  local sha=$1
  local service=$2
  local policy=$3
  local source_kind_name=$4
  local source_ref_name=$5
  local image_id_name=$6
  local rescue_tag compose_tag pinned_id
  local source_kind_value source_ref_value image_id_value
  local -a container_ids=()

  rescue_tag=$(backend_image_rescue_tag "$sha" "$service")
  mapfile -t container_ids < <(
    "${COMPOSE[@]}" --profile app --profile daily ps -q "$service"
  )
  ((${#container_ids[@]} <= 1)) || return 1
  if ((${#container_ids[@]} == 0)) && \
    [[ $service == migrate && $policy == tag-only-migrate ]]; then
    backend_health_pin_migrate_from_running_api \
      "$service" "$policy" "$rescue_tag" \
      source_kind_value source_ref_value image_id_value || return 1
    pinned_id=$(backend_image_rescue_image_id "$rescue_tag") || return 1
    [[ $pinned_id == "$image_id_value" ]] || return 1
    printf -v "$source_kind_name" '%s' "$source_kind_value"
    printf -v "$source_ref_name" '%s' "$source_ref_value"
    printf -v "$image_id_name" '%s' "$image_id_value"
    return 0
  fi
  if ((${#container_ids[@]} == 1)); then
    source_ref_value=${container_ids[0]}
    verify_backend_with_retry "$service" || return 1
    backend_image_rescue_pin_running_container \
      "$service" "$source_ref_value" "$rescue_tag" \
      source_kind_value image_id_value || return 1
  else
    if [[ $service == otel-collector && $policy == recreate ]]; then
      compose_tag=${PINNED_OTEL_COLLECTOR_IMAGE:?}
    else
      [[ $policy != recreate ]] || return 1
      compose_tag=$(compose_image_name "$service")
    fi
    pinned_id=$(backend_image_rescue_image_id "$compose_tag") || return 1
    [[ $pinned_id =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
    docker image tag "$compose_tag" "$rescue_tag" >/dev/null || return 1
    source_kind_value=compose-tag
    source_ref_value=$compose_tag
    image_id_value=$pinned_id
  fi
  pinned_id=$(backend_image_rescue_image_id "$rescue_tag") || return 1
  [[ $pinned_id == "$image_id_value" ]] || return 1
  printf -v "$source_kind_name" '%s' "$source_kind_value"
  printf -v "$source_ref_name" '%s' "$source_ref_value"
  printf -v "$image_id_name" '%s' "$image_id_value"
}
