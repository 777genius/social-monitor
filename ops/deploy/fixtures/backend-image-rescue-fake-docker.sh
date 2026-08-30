#!/usr/bin/env bash
set -euo pipefail

lookup_ref() {
  awk -F '\t' -v ref="$1" '$1 == ref {print $2; exit}' "$FAKE_DOCKER_REFS"
}

lookup_ref_config() {
  awk -F '\t' -v ref="$1" '$1 == ref {print $3; exit}' "$FAKE_DOCKER_REFS"
}

lookup_ref_env() {
  awk -F '\t' -v ref="$1" '$1 == ref {print $4; exit}' "$FAKE_DOCKER_REFS"
}

set_ref() {
  local ref=$1 image_id=$2 config=$3 env=${4:-null}
  local next=$FAKE_DOCKER_REFS.next.$$
  awk -F '\t' -v ref="$ref" '$1 != ref' "$FAKE_DOCKER_REFS" > "$next"
  printf '%s\t%s\t%s\t%s\n' "$ref" "$image_id" "$config" "$env" >> "$next"
  mv -f "$next" "$FAKE_DOCKER_REFS"
}

remove_ref() {
  local ref=$1 next=$FAKE_DOCKER_REFS.next.$$
  awk -F '\t' -v ref="$ref" '$1 != ref' "$FAKE_DOCKER_REFS" > "$next"
  mv -f "$next" "$FAKE_DOCKER_REFS"
}

append_docker_event() {
  local row=docker argument
  for argument in "$@"; do
    printf -v row '%s\t%s' "$row" "$argument"
  done
  {
    flock 9
    printf '%s\n' "$row" >&9
  } 9>> "$EVENT_LOG"
}

take_container_state() {
  local container=$1 row next=$FAKE_DOCKER_CONTAINER_STATES.next.$$
  row=$(awk -F '\t' -v container="$container" \
    '$1 == container {print; exit}' "$FAKE_DOCKER_CONTAINER_STATES")
  [[ -n $row ]] || return 1
  awk -F '\t' -v container="$container" \
    '$1 == container && !removed {removed=1; next} {print}' \
    "$FAKE_DOCKER_CONTAINER_STATES" > "$next"
  mv -f "$next" "$FAKE_DOCKER_CONTAINER_STATES"
  printf '%s\n' "${row#*$'\t'}"
}

append_docker_event "$@"

case ${1:-}:${2:-} in
  image:inspect)
    image_id=$(lookup_ref "$3")
    [[ -n $image_id ]] || exit 1
    if [[ ${*: -1} == *'.Id'* ]]; then
      printf '%s\n' "$image_id"
    elif [[ ${*: -1} == *'.Config.Env'* ]]; then
      lookup_ref_env "$3"
    else
      lookup_ref_config "$3"
    fi
    ;;
  image:tag)
    image_id=$(lookup_ref "$3")
    [[ -n $image_id ]] || exit 1
    config=$(lookup_ref_config "$3")
    env=$(lookup_ref_env "$3")
    set_ref "$4" "$image_id" "$config" "$env"
    if [[ ${FAKE_DOCKER_SIGNAL_TAG:-} == "$4" ]]; then
      kill -TERM "$PPID"
    fi
    ;;
  image:rm)
    [[ -n $(lookup_ref "$3") ]] || exit 1
    remove_ref "$3"
    ;;
  inspect:*)
    container=$2
    row=$(awk -F '\t' -v container="$container" \
      '$1 == container {print; exit}' "$FAKE_DOCKER_CONTAINERS")
    [[ -n $row ]] || exit 1
    IFS=$'\t' read -r _ image_id state config env restart_count <<< "$row"
    restart_count=${restart_count:-0}
    case ${*: -1} in
      *'.State.Status'*)
        state=$(take_container_state "$container" || printf '%s\n' "$state")
        [[ $state != missing ]] || exit 1
        IFS='|' read -r status running restarting oom_killed health \
          sampled_image sampled_restart_count <<< "$state"
        sampled_image=${sampled_image:-$image_id}
        sampled_restart_count=${sampled_restart_count:-$restart_count}
        if [[ ${*: -1} == *'.RestartCount'* ]]; then
          printf '%s|%s|%s|%s|%s|%s|%s\n' \
            "$status" "$running" "$restarting" "$oom_killed" "$health" \
            "$sampled_image" "$sampled_restart_count"
        else
          printf '%s|%s|%s|%s|%s\n' \
            "$status" "$running" "$restarting" "$oom_killed" "$health"
        fi
        ;;
      *'.Image'*'.RestartCount'*)
        printf '%s|%s\n' "$image_id" "$restart_count"
        ;;
      *'.Image'*) printf '%s\n' "$image_id" ;;
      *'.RestartCount'*) printf '%s\n' "$restart_count" ;;
      *) printf '%s\n' "$config" ;;
    esac
    ;;
  container:pause|container:unpause)
    [[ -n ${3:-} ]]
    ;;
  container:export)
    [[ -n ${3:-} ]]
    printf 'fixture-root-filesystem:%s\n' "$3"
    ;;
  image:import)
    cat >/dev/null
    [[ ${FAKE_IMPORT_STATUS:-0} == 0 ]] || exit "$FAKE_IMPORT_STATUS"
    rescue_tag=${*: -1}
    set_ref "$rescue_tag" "$FAKE_DOCKER_IMPORT_STORED_ID" \
      "$FAKE_DOCKER_IMPORT_CONFIG" "$FAKE_DOCKER_IMPORT_ENV"
    printf '%s\n' "$FAKE_DOCKER_IMPORT_ID"
    ;;
  *) exit 90 ;;
esac
