#!/usr/bin/env bash
# Sourced by backend-image-rescue-lib.sh after image identity helpers are
# defined. Cleanup removes only the manifest tag and the reviewed daily-runner
# retention pin that can keep that exact image alive.

backend_image_rescue_remove_tag() {
  local rescue_tag=$1
  if ! backend_image_rescue_image_id "$rescue_tag" >/dev/null; then
    return 0
  fi
  docker image rm "$rescue_tag" >/dev/null || return 1
  ! backend_image_rescue_image_id "$rescue_tag" >/dev/null
}

backend_image_rescue_remove_manifest_tag() {
  local service=$1
  local expected_image_id=$2
  local rescue_tag=$3
  local pin_name pin_record current_rescue_id
  local pin_id pin_container_name status running restarting pin_image_id
  local project_label purpose_label extra

  if ! current_rescue_id=$(backend_image_rescue_image_id "$rescue_tag"); then
    return 0
  fi
  [[ $expected_image_id =~ ^sha256:[0-9a-f]{64}$ && \
     $current_rescue_id == "$expected_image_id" ]] || return 1
  backend_image_rescue_remove_tag "$rescue_tag" && return 0
  [[ $service == daily-runner ]] || return 1

  # PROJECT is provided by the production deploy entrypoint.
  # shellcheck disable=SC2153
  pin_name=${PROJECT}-daily-runner-image-pin
  pin_record=$(docker inspect "$pin_name" --format \
    '{{.Id}}|{{.Name}}|{{.State.Status}}|{{.State.Running}}|{{.State.Restarting}}|{{.Image}}|{{index .Config.Labels "social-monitor.project"}}|{{index .Config.Labels "social-monitor.purpose"}}' \
    2>/dev/null) || return 1
  [[ $pin_record != *$'\n'* ]] || return 1
  IFS='|' read -r pin_id pin_container_name status running restarting \
    pin_image_id project_label purpose_label extra <<< "$pin_record"
  [[ $pin_id =~ ^[0-9a-f]{64}$ && \
     $pin_container_name == "/$pin_name" && \
     ($status == created || $status == exited) && \
     $running == false && $restarting == false && \
     $pin_image_id == "$expected_image_id" && \
     $project_label == social-monitor && \
     $purpose_label == daily-runner-image-retention && \
     -z $extra ]] || return 1

  docker container rm "$pin_id" >/dev/null || return 1
  current_rescue_id=$(backend_image_rescue_image_id "$rescue_tag") || return 1
  [[ $current_rescue_id == "$expected_image_id" ]] || return 1
  docker image rm "$rescue_tag" >/dev/null || return 1
  ! backend_image_rescue_image_id "$rescue_tag" >/dev/null
}
