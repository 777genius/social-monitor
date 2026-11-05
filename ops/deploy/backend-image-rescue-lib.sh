#!/usr/bin/env bash
# Sourced by social-monitor-production-deploy.sh after project paths, Compose,
# and rollback verification helpers are defined. Rescue tags are deliberately
# project-scoped and release-scoped; this library never invokes Docker prune.
BACKEND_IMAGE_RESCUE_VERSION=social-monitor-backend-image-rescue-v1
BACKEND_IMAGE_RESCUE_PHASE_VERSION=social-monitor-backend-image-rescue-phase-v1
# These reviewed bounds overwrite inherited environment values. Focused tests
# shorten them only after sourcing this library.
BACKEND_IMAGE_RESCUE_POST_UNPAUSE_TIMEOUT_SECONDS=60
BACKEND_IMAGE_RESCUE_POST_UNPAUSE_POLL_SECONDS=3
backend_image_rescue_state_file() {
  local sha=$1
  # STATE is provided by the production deploy entrypoint that sources this file.
  # shellcheck disable=SC2153
  printf '%s/backend-image-rescue-%s.tsv\n' "$STATE" "$sha"
}
backend_image_rescue_phase_file() {
  local state_file=$1
  printf '%s.phase\n' "$state_file"
}
backend_image_rescue_tag() {
  local sha=$1
  local service=$2
  printf '%s-rollback-rescue:%s-%s\n' "$PROJECT" "$sha" "$service"
}

backend_image_rescue_policy() {
  case $1 in
    migrate) printf 'tag-only-migrate\n' ;;
    daily-runner) printf 'tag-only-daily-runner\n' ;;
    api|agent-runtime|ingestion-worker|intelligence-worker|delivery-service|event-relay|otel-collector|x-collector)
      printf 'recreate\n'
      ;;
    *) return 1 ;;
  esac
}

backend_image_rescue_known_services() {
  printf '%s\n' \
    migrate api agent-runtime ingestion-worker intelligence-worker \
    delivery-service event-relay daily-runner otel-collector x-collector
}
backend_image_rescue_operationally_absent() {
  local output
  local -a container_ids=()
  output=$("${COMPOSE[@]}" --profile app \
    --profile daily ps --all -q "$1") || return 1
  if [[ -n $output ]]; then
    mapfile -t container_ids <<< "$output"
  fi
  ((${#container_ids[@]} == 0))
}
backend_image_rescue_otel_config_path() {
  local sha=$1
  printf '%s/otel-collector-config-%s.yml\n' "$STATE" "$sha"
}

backend_image_rescue_snapshot_otel_config() (
  set -uo pipefail
  local from=$1
  local sha=$2
  local path partial
  path=$(backend_image_rescue_otel_config_path "$sha")
  partial=$path.partial
  rm -f "$partial"
  if [[ ! $from =~ ^[0-9a-f]{40}$ ]] || \
     ! git -C "$REPO" cat-file -e \
       "$from:ops/observability/otel-collector.yml" 2>/dev/null; then
    rm -f "$path"
    return 0
  fi
  umask 077
  git -C "$REPO" show \
    "$from:ops/observability/otel-collector.yml" > "$partial" || return 1
  [[ -s $partial && ! -L $partial ]] || return 1
  # Tracked public configuration is mounted read-only by the non-root collector.
  chmod 0644 "$partial" || return 1
  mv -f "$partial" "$path"
)

backend_image_rescue_cleanup_otel_config() {
  local state_file=$1
  [[ -e $state_file || -L $state_file ]] || return 0
  local sha path
  sha=$(backend_image_rescue_manifest_target "$state_file") || return 1
  path=$(backend_image_rescue_otel_config_path "$sha")
  [[ ! -L $path ]] || return 1
  rm -f "$path" "$path.partial"
}

backend_image_rescue_image_id() {
  docker image inspect "$1" --format '{{.Id}}' 2>/dev/null
}

backend_image_rescue_container_config() {
  docker inspect "$1" --format \
    '{{json .Config.Entrypoint}}|{{json .Config.Cmd}}|{{json .Config.WorkingDir}}|{{json .Config.User}}|{{json .Config.Healthcheck}}' \
    2>/dev/null
}

backend_image_rescue_image_config() {
  docker image inspect "$1" --format \
    '{{json .Config.Entrypoint}}|{{json .Config.Cmd}}|{{json .Config.WorkingDir}}|{{json .Config.User}}|{{json .Config.Healthcheck}}' \
    2>/dev/null
}

backend_image_rescue_image_env() {
  docker image inspect "$1" --format '{{json .Config.Env}}' 2>/dev/null
}

backend_image_rescue_expected_legacy_container_config() {
  case $1 in
    api|agent-runtime|ingestion-worker|intelligence-worker|delivery-service|event-relay)
      # The dollar expressions are part of the inspected legacy container JSON.
      # shellcheck disable=SC2016
      printf '%s\n' \
        '["docker-entrypoint.sh"]|["sh","-c","case \"$SERVICE\" in api) exec node dist/apps/api-gateway/src/main.js ;; agent-runtime) exec node dist/apps/agent-runtime/src/main.js ;; ingestion) exec node dist/apps/ingestion-worker/src/main.js ;; intelligence) exec node dist/apps/intelligence-worker/src/main.js ;; delivery) exec node dist/apps/delivery-service/src/main.js ;; event-relay) exec node dist/apps/event-relay/src/main.js ;; *) echo \"Unknown service: $SERVICE\" >&2; exit 64 ;; esac"]|"/app"|"node"|null'
      ;;
    x-collector)
      printf '%s\n' \
        "null|[\"python\",\"-m\",\"x_collector\"]|\"/app/apps/x-collector\"|\"1000:1000\"|{\"Test\":[\"CMD\",\"python\",\"-c\",\"import socket; s=socket.create_connection(('127.0.0.1',50051),2); s.close()\"],\"Interval\":15000000000,\"Timeout\":5000000000,\"StartPeriod\":30000000000,\"Retries\":20}"
      ;;
    *) return 1 ;;
  esac
}

backend_image_rescue_reconstructed_command() {
  case $1 in
    api) printf '["/usr/local/bin/node","dist/apps/api-gateway/src/main.js"]\n' ;;
    agent-runtime) printf '["/usr/local/bin/node","dist/apps/agent-runtime/src/main.js"]\n' ;;
    ingestion-worker) printf '["/usr/local/bin/node","dist/apps/ingestion-worker/src/main.js"]\n' ;;
    intelligence-worker) printf '["/usr/local/bin/node","dist/apps/intelligence-worker/src/main.js"]\n' ;;
    delivery-service) printf '["/usr/local/bin/node","dist/apps/delivery-service/src/main.js"]\n' ;;
    event-relay) printf '["/usr/local/bin/node","dist/apps/event-relay/src/main.js"]\n' ;;
    x-collector) printf '["python","-m","x_collector"]\n' ;;
    *) return 1 ;;
  esac
}

backend_image_rescue_reconstructed_image_config() {
  local service=$1 command
  command=$(backend_image_rescue_reconstructed_command "$service") || return 1
  if [[ $service == x-collector ]]; then
    printf 'null|%s|"/app/apps/x-collector"|"1000:1000"|null\n' "$command"
  else
    printf '["/usr/local/bin/docker-entrypoint.sh"]|%s|"/app"|"node"|null\n' \
      "$command"
  fi
}

backend_image_rescue_verify_running_container() {
  local container=$1
  local state
  state=$(docker inspect "$container" --format \
    '{{.State.Status}}|{{.State.Running}}|{{.State.Restarting}}|{{.State.OOMKilled}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    2>/dev/null) || return 1
  [[ $state == 'running|true|false|false|none' || \
     $state == 'running|true|false|false|healthy' ]]
}

backend_image_rescue_compose_container_id() {
  local service=$1
  local container

  container=$(
    "${COMPOSE[@]}" --profile app --profile daily ps -q "$service"
  ) || return 1
  [[ -n $container && $container != *[$'\t\r\n ']* ]] || return 1
  printf '%s\n' "$container"
}

backend_image_rescue_decimal_increment() {
  local value=$1
  local result='' digit next carry=1 index

  [[ $value =~ ^(0|[1-9][0-9]*)$ ]] || return 1
  for ((index = ${#value} - 1; index >= 0; index--)); do
    digit=${value:index:1}
    if ((carry == 1)); then
      if [[ $digit == 9 ]]; then
        next=0
      else
        next=$((digit + 1))
        carry=0
      fi
    else
      next=$digit
    fi
    result=$next$result
  done
  ((carry == 0)) || result=1$result
  printf '%s\n' "$result"
}

backend_image_rescue_capture_container_baseline() {
  local service=$1
  local expected_container=$2
  local expected_image=$3
  local container_name=$4
  local image_name=$5
  local restart_count_name=$6
  local container image restart_count

  container=$(backend_image_rescue_compose_container_id "$service") || return 1
  [[ $container == "$expected_container" ]] || return 1
  image=$(docker inspect "$container" --format '{{.Image}}' \
    2>/dev/null) || return 1
  restart_count=$(docker inspect "$container" --format '{{.RestartCount}}' \
    2>/dev/null) || return 1
  [[ $image == "$expected_image" && \
     $image =~ ^sha256:[0-9a-f]{64}$ && \
     $restart_count =~ ^(0|[1-9][0-9]*)$ ]] || return 1

  printf -v "$container_name" '%s' "$container"
  printf -v "$image_name" '%s' "$image"
  printf -v "$restart_count_name" '%s' "$restart_count"
}

backend_image_rescue_wait_running_container() {
  local service=$1
  local container=$2
  local expected_image=$3
  local baseline_restart_count=$4
  local timeout_seconds=$BACKEND_IMAGE_RESCUE_POST_UNPAUSE_TIMEOUT_SECONDS
  local poll_seconds=$BACKEND_IMAGE_RESCUE_POST_UNPAUSE_POLL_SECONDS
  local elapsed_seconds=0 stable_samples=0 stable_restart_count=
  local last_restart_count=$baseline_restart_count
  local allowed_restart_count compose_container sample
  local status running restarting oom_killed health image restart_count
  local sleep_seconds

  [[ $timeout_seconds =~ ^([1-9]|[1-5][0-9]|60)$ && \
     $poll_seconds =~ ^[1-9][0-9]*$ && \
     $baseline_restart_count =~ ^(0|[1-9][0-9]*)$ ]] || return 1
  ((poll_seconds <= timeout_seconds)) || return 1
  allowed_restart_count=$(
    backend_image_rescue_decimal_increment "$baseline_restart_count"
  ) || return 1

  while true; do
    compose_container=$(
      backend_image_rescue_compose_container_id "$service"
    ) || return 1
    [[ $compose_container == "$container" ]] || return 1
    sample=$(docker inspect "$container" --format \
      '{{.State.Status}}|{{.State.Running}}|{{.State.Restarting}}|{{.State.OOMKilled}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.Image}}|{{.RestartCount}}' \
      2>/dev/null) || return 1
    IFS='|' read -r status running restarting oom_killed health image \
      restart_count <<< "$sample"
    [[ $running == true || $running == false ]] || return 1
    [[ $restarting == true || $restarting == false ]] || return 1
    [[ $oom_killed == false ]] || return 1
    [[ $health == none || $health == healthy || $health == starting ]] || return 1
    [[ $image == "$expected_image" ]] || return 1
    [[ $restart_count =~ ^(0|[1-9][0-9]*)$ ]] || return 1
    [[ $restart_count == "$baseline_restart_count" || \
       $restart_count == "$allowed_restart_count" ]] || return 1
    if [[ $last_restart_count == "$allowed_restart_count" && \
          $restart_count == "$baseline_restart_count" ]]; then
      return 1
    fi
    last_restart_count=$restart_count

    if [[ $status == running && $running == true && \
          $restarting == false && $health != starting ]]; then
      if [[ $stable_restart_count == "$restart_count" ]]; then
        stable_samples=$((stable_samples + 1))
      else
        stable_samples=1
        stable_restart_count=$restart_count
      fi
      if ((stable_samples == 3)); then
        compose_container=$(
          backend_image_rescue_compose_container_id "$service"
        ) || return 1
        [[ $compose_container == "$container" ]] || return 1
        return 0
      fi
    elif [[ $status == restarting || $status == exited || \
            $status == starting || $restarting == true || \
            $health == starting ]]; then
      stable_samples=0
      stable_restart_count=
    else
      return 1
    fi

    ((elapsed_seconds < timeout_seconds)) || return 1
    sleep_seconds=$poll_seconds
    if ((elapsed_seconds + sleep_seconds > timeout_seconds)); then
      sleep_seconds=$((timeout_seconds - elapsed_seconds))
    fi
    sleep "$sleep_seconds" || return 1
    elapsed_seconds=$((elapsed_seconds + sleep_seconds))
  done
}

backend_image_rescue_load_pin_cleanup_library() {
  if [[ -n ${PRODUCTION_TRANSITION_PRELUDE_COMMIT:-} ]]; then
    declare -F production_transition_host_source_authorized_prelude \
      >/dev/null || return 1
    production_transition_host_source_authorized_prelude \
      ops/deploy/backend-image-rescue-pin-cleanup-lib.sh \
      'backend image rescue pin cleanup library'
    return
  fi

  local parent_source=${BASH_SOURCE[0]} library_path
  [[ $parent_source != /dev/fd/* && $parent_source == */* ]] || return 1
  library_path=${parent_source%/*}/backend-image-rescue-pin-cleanup-lib.sh
  [[ -f $library_path && ! -L $library_path && -r $library_path ]] || return 1
  # shellcheck source=ops/deploy/backend-image-rescue-pin-cleanup-lib.sh
  source "$library_path"
}
if ! backend_image_rescue_load_pin_cleanup_library ||
   ! declare -F backend_image_rescue_remove_tag >/dev/null ||
   ! declare -F backend_image_rescue_remove_manifest_tag >/dev/null; then
  unset -f backend_image_rescue_load_pin_cleanup_library
  return 1
fi
unset -f backend_image_rescue_load_pin_cleanup_library

backend_image_rescue_validate_structure() {
  local state_file=$1
  [[ -f $state_file && ! -L $state_file && -s $state_file ]] || return 1
  [[ $(stat -c '%a' "$state_file") == 600 ]] || return 1

  local record target_sha manifest_project expected_tag expected_policy
  local service policy source_kind source_ref image_id rescue_tag extra
  local line_number=0 complete_line=0 declared_count=-1 actual_count=0
  local saw_target=false saw_project=false saw_complete=false
  local -A seen_services=()
  while IFS=$'\t' read -r record service policy source_kind source_ref image_id rescue_tag extra; do
    line_number=$((line_number + 1))
    case $line_number:$record in
      1:"$BACKEND_IMAGE_RESCUE_VERSION")
        [[ -z $service$policy$source_kind$source_ref$image_id$rescue_tag$extra ]] || return 1
        ;;
      2:target)
        [[ $saw_target == false && $service =~ ^[0-9a-f]{40}$ && \
           -z $policy$source_kind$source_ref$image_id$rescue_tag$extra ]] || return 1
        target_sha=$service
        saw_target=true
        ;;
      3:project)
        [[ $saw_project == false && $service =~ ^[a-z0-9][a-z0-9_.-]*$ && \
           -z $policy$source_kind$source_ref$image_id$rescue_tag$extra ]] || return 1
        manifest_project=$service
        saw_project=true
        ;;
      *:image)
        [[ $saw_target == true && $saw_project == true && $saw_complete == false ]] || return 1
        [[ $service =~ ^[a-z0-9][a-z0-9-]*$ && \
           $source_kind =~ ^(running-image|container-export-import|compose-tag)$ && \
           $source_ref != *[$'\t\r\n ']* && \
           $image_id =~ ^sha256:[0-9a-f]{64}$ && -z $extra ]] || return 1
        [[ -z ${seen_services[$service]:-} ]] || return 1
        expected_policy=$(backend_image_rescue_policy "$service")
        [[ $policy == "$expected_policy" ]] || return 1
        expected_tag=$(backend_image_rescue_tag "$target_sha" "$service")
        [[ $rescue_tag == "$expected_tag" ]] || return 1
        if [[ $policy == recreate ]]; then
          [[ $source_kind == running-image || \
             ( $service == otel-collector && $source_kind == compose-tag ) || \
             $source_kind == container-export-import ]] || return 1
        fi
        seen_services[$service]=1
        actual_count=$((actual_count + 1))
        ;;
      *:absent)
        [[ $saw_target == true && $saw_project == true && $saw_complete == false ]] || return 1
        [[ $service =~ ^[a-z0-9][a-z0-9-]*$ && \
           -z $source_kind$source_ref$image_id$rescue_tag$extra ]] || return 1
        [[ -z ${seen_services[$service]:-} ]] || return 1
        expected_policy=$(backend_image_rescue_policy "$service")
        [[ $policy == "$expected_policy" ]] || return 1
        seen_services[$service]=1
        actual_count=$((actual_count + 1))
        ;;
      *:complete)
        [[ $saw_complete == false && $actual_count -gt 0 && \
           $service =~ ^[0-9]+$ && \
           -z $policy$source_kind$source_ref$image_id$rescue_tag$extra ]] || return 1
        declared_count=$service
        complete_line=$line_number
        saw_complete=true
        ;;
      *) return 1 ;;
    esac
  done < "$state_file"

  [[ $line_number -ge 5 && $complete_line -eq $line_number && \
     $saw_target == true && \
     $saw_project == true && $saw_complete == true && \
     $manifest_project == "$PROJECT" && $declared_count -eq $actual_count ]]
}

backend_image_rescue_manifest_target() {
  local state_file=$1
  backend_image_rescue_validate_structure "$state_file" || return 1
  awk -F '\t' '$1 == "target" {print $2; exit}' "$state_file"
}

backend_image_rescue_write_phase() (
  set -uo pipefail
  local state_file=$1
  local phase=$2
  local phase_file next manifest_name
  [[ $phase == prepared || $phase == replacement-started || \
     $phase == rollback-complete ]] || return 1
  backend_image_rescue_validate_structure "$state_file" || return 1
  phase_file=$(backend_image_rescue_phase_file "$state_file")
  [[ ! -L $phase_file ]] || return 1
  next=$phase_file.next.$$
  manifest_name=${state_file##*/}
  # Invoked through the EXIT trap below.
  # shellcheck disable=SC2317,SC2329
  cleanup_phase_next() {
    rm -f "$next"
  }
  trap cleanup_phase_next EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  umask 077
  {
    printf '%s\n' "$BACKEND_IMAGE_RESCUE_PHASE_VERSION"
    printf 'manifest\t%s\nphase\t%s\n' "$manifest_name" "$phase"
  } > "$next" || return 1
  chmod 0600 "$next" || return 1
  mv -f "$next" "$phase_file" || return 1
  trap - EXIT HUP INT TERM
)

backend_image_rescue_read_phase() {
  local state_file=$1
  local phase_file manifest_name version_record version_extra
  local manifest_record manifest_value manifest_extra
  local phase_record phase_value phase_extra _trailing
  backend_image_rescue_validate_structure "$state_file" || return 1
  phase_file=$(backend_image_rescue_phase_file "$state_file")
  [[ -f $phase_file && ! -L $phase_file && -s $phase_file ]] || return 1
  [[ $(stat -c '%a' "$phase_file") == 600 ]] || return 1
  manifest_name=${state_file##*/}
  {
    IFS=$'\t' read -r version_record version_extra || return 1
    IFS=$'\t' read -r manifest_record manifest_value manifest_extra || return 1
    IFS=$'\t' read -r phase_record phase_value phase_extra || return 1
    ! IFS= read -r _trailing || return 1
  } < "$phase_file"
  [[ $version_record == "$BACKEND_IMAGE_RESCUE_PHASE_VERSION" && \
     -z $version_extra && $manifest_record == manifest && \
     $manifest_value == "$manifest_name" && -z $manifest_extra && \
     $phase_record == phase && \
     $phase_value =~ ^(prepared|replacement-started|rollback-complete)$ && \
     -z $phase_extra ]] || return 1
  printf '%s\n' "$phase_value"
}

backend_image_rescue_mark_replacement_started() {
  local state_file=$1
  local phase
  phase=$(backend_image_rescue_read_phase "$state_file") || return 1
  [[ $phase == replacement-started ]] && return 0
  [[ $phase == prepared ]] || return 1
  backend_image_rescue_write_phase "$state_file" replacement-started
}

backend_image_rescue_validate() {
  local state_file=$1
  shift
  backend_image_rescue_validate_structure "$state_file" || return 1

  local record service policy source_kind source_ref image_id rescue_tag extra
  local actual_id
  local -A expected=() captured=()
  for service in "$@"; do
    [[ -z ${expected[$service]:-} ]] || return 1
    expected[$service]=1
  done
  while IFS=$'\t' read -r record service policy source_kind source_ref image_id rescue_tag extra; do
    [[ $record == image || $record == absent ]] || continue
    if [[ $record == image ]]; then
      actual_id=$(backend_image_rescue_image_id "$rescue_tag") || return 1
      [[ $actual_id == "$image_id" ]] || return 1
    fi
    captured[$service]=1
  done < "$state_file"
  if ((${#expected[@]} > 0)); then
    ((${#captured[@]} == ${#expected[@]})) || return 1
    for service in "${!expected[@]}"; do
      [[ -n ${captured[$service]:-} ]] || return 1
    done
  fi
}

backend_image_rescue_reconstruct_running_container() (
  set -uo pipefail
  local service=$1
  local container=$2
  local rescue_tag=$3
  local command expected_container_config actual_container_config
  local expected_image_config actual_image_config image_env imported_id inspected_id
  local recorded_image=$4
  local original_container baseline_image baseline_restart_count
  local paused=false unpause_status=0
  local -a import_changes

  command=$(backend_image_rescue_reconstructed_command "$service") || {
    printf 'deploy-error: missing-image rescue has no reviewed reconstruction for %s\n' \
      "$service" >&2
    return 1
  }
  expected_container_config=$(
    backend_image_rescue_expected_legacy_container_config "$service"
  ) || return 1
  actual_container_config=$(backend_image_rescue_container_config "$container") || return 1
  if [[ $actual_container_config != "$expected_container_config" ]]; then
    printf 'deploy-error: missing-image rescue config is not the reviewed legacy config for %s\n' \
      "$service" >&2
    return 1
  fi
  if [[ $service == x-collector ]]; then
    import_changes=(
      --change "CMD $command"
      --change 'WORKDIR /app/apps/x-collector'
      --change 'USER 1000:1000'
    )
  else
    import_changes=(
      --change 'ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]'
      --change "CMD $command"
      --change 'WORKDIR /app'
      --change 'USER node'
    )
  fi

  unpause_container() {
    [[ $paused == true ]] || return 0
    docker container unpause "$container" >/dev/null || return 1
    paused=false
  }
  # Invoked through the EXIT trap below.
  # shellcheck disable=SC2317,SC2329
  cleanup_paused_container() {
    unpause_container || true
  }
  trap cleanup_paused_container EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  backend_image_rescue_capture_container_baseline \
    "$service" "$container" "$recorded_image" \
    original_container baseline_image baseline_restart_count || return 1
  paused=true
  if ! docker container pause "$original_container" >/dev/null; then
    paused=false
    return 1
  fi
  if ! imported_id=$(
    docker container export "$original_container" | \
      docker image import \
        "${import_changes[@]}" \
        - "$rescue_tag"
  ); then
    unpause_container || unpause_status=$?
    ((unpause_status == 0)) || \
      printf 'deploy-error: missing-image rescue import and container unpause both failed for %s\n' \
        "$service" >&2
    return 1
  fi
  unpause_container || return 1
  trap - EXIT HUP INT TERM

  [[ $imported_id =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  inspected_id=$(backend_image_rescue_image_id "$rescue_tag") || return 1
  [[ $inspected_id == "$imported_id" ]] || return 1
  expected_image_config=$(
    backend_image_rescue_reconstructed_image_config "$service"
  ) || return 1
  actual_image_config=$(backend_image_rescue_image_config "$rescue_tag") || return 1
  [[ $actual_image_config == "$expected_image_config" ]] || return 1
  image_env=$(backend_image_rescue_image_env "$rescue_tag") || return 1
  [[ $image_env == null || $image_env == '[]' ]] || return 1
  backend_image_rescue_wait_running_container \
    "$service" "$original_container" "$baseline_image" \
    "$baseline_restart_count" || return 1
  printf 'backend-image-rescue: safely reconstructed missing running image for service %s\n' \
    "$service" >&2
)

backend_image_rescue_pin_running_container() {
  local service=$1
  local container=$2
  local rescue_tag=$3
  local source_kind_name=$4
  local image_id_name=$5
  local allow_legacy_reconstruction=${6:-true}
  local recorded_id inspected_id reconstructed_id

  [[ $allow_legacy_reconstruction == true || \
     $allow_legacy_reconstruction == false ]] || return 1
  backend_image_rescue_verify_running_container "$container" || return 1
  recorded_id=$(docker inspect "$container" --format '{{.Image}}' 2>/dev/null) || return 1
  [[ $recorded_id =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  inspected_id=$(backend_image_rescue_image_id "$recorded_id" || true)
  if [[ -n $inspected_id ]]; then
    [[ $inspected_id == "$recorded_id" ]] || return 1
    docker image tag "$recorded_id" "$rescue_tag" >/dev/null || return 1
    printf -v "$source_kind_name" '%s' running-image
    printf -v "$image_id_name" '%s' "$recorded_id"
    return 0
  fi

  [[ $allow_legacy_reconstruction == true ]] || return 1
  # The recorded object is gone, so preserve only the paused root filesystem.
  # Rebuild metadata from a reviewed, service-specific config with no Env.
  backend_image_rescue_reconstruct_running_container \
    "$service" "$container" "$rescue_tag" "$recorded_id" || return 1
  reconstructed_id=$(backend_image_rescue_image_id "$rescue_tag") || return 1
  [[ $reconstructed_id =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  printf -v "$source_kind_name" '%s' container-export-import
  printf -v "$image_id_name" '%s' "$reconstructed_id"
}

backend_image_rescue_pin_migrate_from_api_container() {
  local rescue_tag=$1 source_kind_name=$2 source_ref_name=$3 image_id_name=$4
  local migrate_containers api_container api_source_kind api_image_id
  migrate_containers=$("${COMPOSE[@]}" --profile app --profile daily \
    ps --all -q migrate) || return 1
  [[ -z $migrate_containers ]] || return 1
  api_container=$(backend_image_rescue_compose_container_id api) || return 1
  verify_backend_with_retry api || return 1
  [[ $(backend_image_rescue_compose_container_id api) == \
     "$api_container" ]] || return 1
  backend_image_rescue_pin_running_container \
    api "$api_container" "$rescue_tag" api_source_kind api_image_id false || return 1
  [[ $api_source_kind == running-image ]] || return 1
  [[ $(backend_image_rescue_compose_container_id api) == \
     "$api_container" ]] || return 1
  printf -v "$source_kind_name" '%s' "$api_source_kind"
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
    if pinned_id=$(backend_image_rescue_image_id "$compose_tag"); then
      [[ $pinned_id =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
      docker image tag "$compose_tag" "$rescue_tag" >/dev/null || return 1
      source_kind_value=compose-tag
      source_ref_value=$compose_tag
      image_id_value=$pinned_id
    else
      [[ $service == migrate && $policy == tag-only-migrate ]] || return 1
      backend_image_rescue_pin_migrate_from_api_container \
        "$rescue_tag" source_kind_value source_ref_value image_id_value || return 1
    fi
  fi
  pinned_id=$(backend_image_rescue_image_id "$rescue_tag") || return 1
  [[ $pinned_id == "$image_id_value" ]] || return 1
  printf -v "$source_kind_name" '%s' "$source_kind_value"
  printf -v "$source_ref_name" '%s' "$source_ref_value"
  printf -v "$image_id_name" '%s' "$image_id_value"
}

backend_image_rescue_cleanup_abandoned_partials() {
  local partial sha service rescue_tag phase_file status=0
  local -a partials=("$STATE"/backend-image-rescue-*.tsv.partial)
  [[ -e ${partials[0]} || -L ${partials[0]} ]] || return 0
  for partial in "${partials[@]}"; do
    if [[ $partial =~ /backend-image-rescue-([0-9a-f]{40})[.]tsv[.]partial$ ]]; then
      sha=${BASH_REMATCH[1]}
    else
      return 1
    fi
    while read -r service; do
      rescue_tag=$(backend_image_rescue_tag "$sha" "$service")
      backend_image_rescue_remove_tag "$rescue_tag" || status=1
    done < <(backend_image_rescue_known_services)
    phase_file=$(backend_image_rescue_phase_file "${partial%.partial}")
    ((status == 0)) && rm -f "$partial" "$phase_file"
  done
  return "$status"
}

backend_image_rescue_prepare() (
  set -uo pipefail
  local sha=$1
  local state_file=$2
  shift 2
  local -a services=("$@")
  local partial=$state_file.partial
  local other service policy source_kind source_ref image_id rescue_tag phase
  local backend_marker
  local snapshot_complete=false

  [[ $sha =~ ^[0-9a-f]{40}$ && ${#services[@]} -gt 0 ]] || return 1
  [[ $state_file == "$(backend_image_rescue_state_file "$sha")" ]] || return 1
  if [[ -e $state_file || -L $state_file ]]; then
    backend_image_rescue_validate "$state_file" "${services[@]}" || return 1
    phase=$(backend_image_rescue_read_phase "$state_file") || return 1
    if [[ $phase != prepared ]]; then
      printf 'deploy-error: backend image rescue requires rollback before release retry (phase=%s)\n' \
        "$phase" >&2
      return 1
    fi
    return 0
  fi
  backend_image_rescue_cleanup_abandoned_partials || return 1
  backend_marker=$(marker_value backend || true)
  local -a completed=("$STATE"/backend-image-rescue-*.tsv)
  if [[ -e ${completed[0]} || -L ${completed[0]} ]]; then
    for other in "${completed[@]}"; do
      [[ $other == "$state_file" ]] || {
        backend_image_rescue_reconcile_completed_state \
          "$other" "$backend_marker" || {
            printf 'deploy-error: unfinished backend image rescue snapshot blocks a different release: %s\n' \
              "$other" >&2
            return 1
          }
        [[ ! -e $other && ! -L $other ]] || {
          printf 'deploy-error: unfinished backend image rescue snapshot blocks a different release: %s\n' \
            "$other" >&2
          return 1
        }
      }
    done
  fi

  # Invoked through the EXIT trap below.
  # shellcheck disable=SC2317,SC2329
  cleanup_partial_snapshot() {
    local cleanup_service cleanup_tag phase_file
    [[ $snapshot_complete == false ]] || return 0
    for cleanup_service in "${services[@]}"; do
      cleanup_tag=$(backend_image_rescue_tag "$sha" "$cleanup_service")
      backend_image_rescue_remove_tag "$cleanup_tag" || true
    done
    phase_file=$(backend_image_rescue_phase_file "$state_file")
    rm -f "$partial" "$state_file" "$phase_file"
  }
  trap cleanup_partial_snapshot EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  install -d -m 0755 "$STATE" || return 1
  umask 077
  : > "$partial" || return 1
  chmod 0600 "$partial" || return 1
  printf '%s\n' "$BACKEND_IMAGE_RESCUE_VERSION" >> "$partial"
  printf 'target\t%s\nproject\t%s\n' "$sha" "$PROJECT" >> "$partial"
  for service in "${services[@]}"; do
    [[ $service =~ ^[a-z0-9][a-z0-9-]*$ ]] || return 1
    policy=$(backend_image_rescue_policy "$service")
    if [[ $policy == recreate ]] && \
       backend_image_rescue_operationally_absent "$service"; then
      printf 'absent\t%s\t%s\n' "$service" "$policy" >> "$partial"
      continue
    fi
    rescue_tag=$(backend_image_rescue_tag "$sha" "$service")
    backend_image_rescue_remove_tag "$rescue_tag" || return 1
    backend_image_rescue_pin_service \
      "$sha" "$service" "$policy" source_kind source_ref image_id || return 1
    printf 'image\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$service" "$policy" "$source_kind" "$source_ref" "$image_id" \
      "$rescue_tag" >> "$partial"
  done
  printf 'complete\t%d\n' "${#services[@]}" >> "$partial"
  backend_image_rescue_validate "$partial" "${services[@]}" || return 1

  trap '' HUP INT TERM
  mv -f "$partial" "$state_file" || return 1
  backend_image_rescue_write_phase "$state_file" prepared || return 1
  snapshot_complete=true
  trap - EXIT HUP INT TERM
)

backend_image_rescue_restore_tags() {
  local state_file=$1
  local record service policy source_kind source_ref image_id rescue_tag extra
  local restored_id status=0
  backend_image_rescue_validate "$state_file" || return 1
  while IFS=$'\t' read -r record service policy source_kind source_ref image_id rescue_tag extra; do
    [[ $record == image ]] || continue
    [[ $service != otel-collector ]] || continue
    if ! docker image tag "$rescue_tag" "$(compose_image_name "$service")" >/dev/null; then
      printf 'deploy-error: failed to restore Compose tag for %s from %s\n' \
        "$service" "$rescue_tag" >&2
      status=1
      continue
    fi
    restored_id=$(backend_image_rescue_image_id "$(compose_image_name "$service")" || true)
    if [[ $restored_id != "$image_id" ]]; then
      printf 'deploy-error: restored Compose tag validation failed for %s\n' \
        "$service" >&2
      status=1
    fi
  done < "$state_file"
  return "$status"
}

rollback_backend_images() {
  local state_file=$1
  [[ -e $state_file || -L $state_file ]] || return 0
  local record service policy source_kind source_ref image_id rescue_tag extra
  local phase target_sha api_rolled_back=false otel_image='' otel_config='' otel_mode
  local -a rollback_services=() remove_services=()

  phase=$(backend_image_rescue_read_phase "$state_file") || return 1
  target_sha=$(backend_image_rescue_manifest_target "$state_file") || return 1
  [[ $phase != rollback-complete ]] || return 0
  backend_image_rescue_restore_tags "$state_file" || return 1
  if [[ $phase == prepared ]]; then
    backend_image_rescue_cleanup_otel_config "$state_file" || return 1
    backend_image_rescue_write_phase "$state_file" rollback-complete
    return
  fi
  [[ $phase == replacement-started ]] || return 1
  while IFS=$'\t' read -r record service policy source_kind source_ref image_id rescue_tag extra; do
    if [[ $record == absent ]]; then
      remove_services+=("$service")
      continue
    fi
    [[ $record == image && $policy == recreate ]] || continue
    if [[ $service == otel-collector && $source_kind == compose-tag ]]; then
      remove_services+=("$service")
      continue
    fi
    rollback_services+=("$service")
    [[ $service == api ]] && api_rolled_back=true
    if [[ $service == otel-collector ]]; then
      otel_image=$rescue_tag
      otel_config=$(backend_image_rescue_otel_config_path \
        "$target_sha") || return 1
      [[ -f $otel_config && ! -L $otel_config && -s $otel_config ]] || return 1
      otel_mode=$(stat -c '%a' "$otel_config" 2>/dev/null) ||
        otel_mode=$(stat -f '%Lp' "$otel_config") || return 1
      [[ $otel_mode == 644 ]] || return 1
    fi
  done < "$state_file"
  if ((${#remove_services[@]} > 0)); then
    "${COMPOSE[@]}" --profile app --profile daily rm -sf \
      "${remove_services[@]}" || return 1
  fi
  if ((${#rollback_services[@]} > 0)); then
    stop_and_remove_database_services "${rollback_services[@]}" || return 1
    if [[ -n $otel_image ]]; then
      OTEL_COLLECTOR_IMAGE=$otel_image \
      OTEL_COLLECTOR_CONFIG_PATH=$otel_config \
        "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate \
          "${rollback_services[@]}" || return 1
    else
      "${COMPOSE[@]}" --profile app up -d --no-deps --force-recreate \
        "${rollback_services[@]}" || return 1
    fi
    verify_backend_with_retry "${rollback_services[@]}" || return 1
    if [[ $api_rolled_back == true ]]; then
      refresh_frontend_api_proxy || return 1
    fi
  fi
  # This durable terminal phase makes a successful backend rollback idempotent
  # even when runtime-control restoration later fails and the rescue is kept.
  # It also prevents a same-release retry from treating a restored rescue as a
  # fresh pre-replacement snapshot.
  backend_image_rescue_write_phase "$state_file" rollback-complete
}

rollback_backend_and_runtime_control() {
  local backend_required=$1
  local state_file=$2
  local runtime_control_backup=$3
  local backend_status=0 runtime_status=0 cleanup_status=0

  if [[ $backend_required == true ]]; then
    rollback_backend_images "$state_file" || backend_status=$?
  fi
  restore_postgres_runtime_control "$runtime_control_backup" || runtime_status=$?

  if ((backend_status != 0)); then
    printf 'deploy-error: backend image/container rollback failed (status=%d)\n' \
      "$backend_status" >&2
  fi
  if ((runtime_status != 0)); then
    printf 'deploy-error: PostgreSQL runtime-control rollback failed (status=%d)\n' \
      "$runtime_status" >&2
  fi
  if ((backend_status == 0 && runtime_status == 0)) && \
     [[ $backend_required == true ]]; then
    backend_image_rescue_cleanup "$state_file" || cleanup_status=$?
    if ((cleanup_status != 0)); then
      printf 'deploy-error: completed rollback could not remove exact rescue tags (status=%d)\n' \
        "$cleanup_status" >&2
    fi
  fi
  ((backend_status == 0 && runtime_status == 0 && cleanup_status == 0))
}

backend_image_rescue_cleanup() {
  local state_file=$1
  [[ -e $state_file || -L $state_file ]] || return 0
  backend_image_rescue_validate_structure "$state_file" || return 1
  local record service policy source_kind source_ref image_id rescue_tag extra
  local phase_file
  local status=0
  while IFS=$'\t' read -r record service policy source_kind source_ref image_id rescue_tag extra; do
    [[ $record == image ]] || continue
    backend_image_rescue_remove_manifest_tag \
      "$service" "$image_id" "$rescue_tag" || status=1
  done < "$state_file"
  if ((status == 0)); then
    phase_file=$(backend_image_rescue_phase_file "$state_file")
    rm -f "$state_file" "$state_file.partial" "$phase_file"
  fi
  return "$status"
}

backend_image_rescue_reconcile_completed_state() {
  local state_file=$1
  local backend_marker=$2
  local target phase

  backend_image_rescue_validate_structure "$state_file" || return 1
  phase=$(backend_image_rescue_read_phase "$state_file") || return 1
  target=$(backend_image_rescue_manifest_target "$state_file") || return 1
  if [[ -n $backend_marker && $target == "$backend_marker" ]]; then
    backend_image_rescue_cleanup "$state_file" || return 1
    return 0
  fi
  backend_image_rescue_validate "$state_file" || return 1
  case $phase in
    replacement-started)
      rollback_backend_images "$state_file" || return 1
      backend_image_rescue_cleanup "$state_file" || return 1
      ;;
    rollback-complete)
      backend_image_rescue_cleanup "$state_file" || return 1
      ;;
    prepared) return 1 ;;
    *) return 1 ;;
  esac
  return 0
}

reconcile_completed_backend_image_rescues() {
  local backend_marker state_file
  local -a state_files=("$STATE"/backend-image-rescue-*.tsv)
  [[ -e ${state_files[0]} || -L ${state_files[0]} ]] || return 0
  backend_marker=$(marker_value backend || true)
  for state_file in "${state_files[@]}"; do
    backend_image_rescue_reconcile_completed_state \
      "$state_file" "$backend_marker" || return 1
  done
}
