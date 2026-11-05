#!/usr/bin/env bash
# Sourced by backend-image-rescue-lib.test.sh after the fake Docker and rescue
# helpers are defined.

prepare_reconcile_state() {
  local sha=$1 phase=$2 container=$3 state
  # ID_A is fixture state provided by backend-image-rescue-lib.test.sh.
  # shellcheck disable=SC2154
  add_ref "$ID_A" "$ID_A"
  add_container api "$container" "$ID_A"
  state=$(backend_image_rescue_state_file "$sha")
  backend_image_rescue_prepare "$sha" "$state" api
  case $phase in
    prepared) ;;
    replacement-started) backend_image_rescue_mark_replacement_started "$state" ;;
    rollback-complete) backend_image_rescue_write_phase "$state" rollback-complete ;;
    *) return 1 ;;
  esac
  printf '%s\n' "$state"
}
