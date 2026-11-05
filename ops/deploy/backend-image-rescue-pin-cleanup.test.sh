#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "${BASH_SOURCE[0]%/*}" && pwd)
LIBRARY=$SCRIPT_DIR/backend-image-rescue-lib.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/backend-image-rescue-pin-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
umask 077

PROJECT=fixture-project
STATE=$FIXTURE/state
EVENT_LOG=$FIXTURE/docker-events.log
SHA=1111111111111111111111111111111111111111
IMAGE_A=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
IMAGE_B=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
PIN_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
UNRELATED_ID=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
BLOCKER_ID=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
PIN_NAME=$PROJECT-daily-runner-image-pin

declare -A REF_IDS=()
declare -A CONTAINER_NAMES=()
declare -A CONTAINER_STATUSES=()
declare -A CONTAINER_RUNNING=()
declare -A CONTAINER_RESTARTING=()
declare -A CONTAINER_IMAGES=()

PIN_LOOKUP_NAME=$PIN_NAME
PIN_RETURNED_NAME=/$PIN_NAME
PIN_PROJECT_LABEL=social-monitor
PIN_PURPOSE_LABEL=daily-runner-image-retention
PIN_REMOVED=false
FAIL_RETRY=false

fail() {
  printf 'test failure: %s\n' "$*" >&2
  exit 1
}

log_docker_event() {
  local row=docker argument
  for argument in "$@"; do
    printf -v row '%s\t%s' "$row" "$argument"
  done
  printf '%s\n' "$row" >> "$EVENT_LOG"
}

container_exists_for_image() {
  local expected_image=$1 container_id
  for container_id in "${!CONTAINER_IMAGES[@]}"; do
    [[ ${CONTAINER_IMAGES[$container_id]} == "$expected_image" ]] && return 0
  done
  return 1
}

remove_ref() {
  local ref=$1
  unset 'REF_IDS[$ref]'
}

remove_container() {
  local container_id=$1
  unset 'CONTAINER_NAMES[$container_id]'
  unset 'CONTAINER_STATUSES[$container_id]'
  unset 'CONTAINER_RUNNING[$container_id]'
  unset 'CONTAINER_RESTARTING[$container_id]'
  unset 'CONTAINER_IMAGES[$container_id]'
}

# This shell function is the only Docker implementation visible to the sourced
# library, so the test cannot reach a host daemon.
docker() {
  log_docker_event "$@"

  case ${1:-}:${2:-} in
    image:inspect)
      local ref=${3:-} image_id=${REF_IDS[${3:-}]:-}
      [[ -n $ref && -n $image_id ]] || return 1
      printf '%s\n' "$image_id"
      ;;
    image:rm)
      local ref=${3:-} image_id=${REF_IDS[${3:-}]:-}
      [[ -n $ref && -n $image_id ]] || return 1
      if container_exists_for_image "$image_id"; then
        return 1
      fi
      if [[ $FAIL_RETRY == true && $PIN_REMOVED == true ]]; then
        return 75
      fi
      remove_ref "$ref"
      ;;
    inspect:*)
      local lookup=${2:-} container_id
      [[ $lookup == "$PIN_LOOKUP_NAME" ]] || return 1
      for container_id in "${!CONTAINER_NAMES[@]}"; do
        [[ $container_id == "$PIN_ID" ]] || continue
        printf '%s|%s|%s|%s|%s|%s|%s|%s\n' \
          "$container_id" "$PIN_RETURNED_NAME" \
          "${CONTAINER_STATUSES[$container_id]}" \
          "${CONTAINER_RUNNING[$container_id]}" \
          "${CONTAINER_RESTARTING[$container_id]}" \
          "${CONTAINER_IMAGES[$container_id]}" \
          "$PIN_PROJECT_LABEL" "$PIN_PURPOSE_LABEL"
        return 0
      done
      return 1
      ;;
    container:rm)
      local container_id=${3:-}
      [[ $# == 3 && -n ${CONTAINER_NAMES[$container_id]:-} ]] || return 1
      [[ ${CONTAINER_RUNNING[$container_id]} == false && \
         ${CONTAINER_RESTARTING[$container_id]} == false ]] || return 1
      remove_container "$container_id"
      if [[ $container_id == "$PIN_ID" ]]; then
        PIN_REMOVED=true
      fi
      ;;
    *) return 90 ;;
  esac
}

# shellcheck source=ops/deploy/backend-image-rescue-lib.sh
source "$LIBRARY"

add_container() {
  local container_id=$1 name=$2 status=$3 running=$4 restarting=$5 image=$6
  CONTAINER_NAMES["$container_id"]=$name
  CONTAINER_STATUSES["$container_id"]=$status
  CONTAINER_RUNNING["$container_id"]=$running
  CONTAINER_RESTARTING["$container_id"]=$restarting
  CONTAINER_IMAGES["$container_id"]=$image
}

add_default_pin() {
  add_container "$PIN_ID" "/$PIN_NAME" created false false "$IMAGE_A"
}

add_unrelated_state() {
  REF_IDS[unrelated:keep]=$IMAGE_B
  add_container "$UNRELATED_ID" /unrelated-retention exited false false "$IMAGE_B"
}

reset_case() {
  rm -rf "$STATE"
  mkdir -p "$STATE"
  : > "$EVENT_LOG"
  REF_IDS=()
  CONTAINER_NAMES=()
  CONTAINER_STATUSES=()
  CONTAINER_RUNNING=()
  CONTAINER_RESTARTING=()
  CONTAINER_IMAGES=()
  PIN_ID=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  PIN_LOOKUP_NAME=$PIN_NAME
  PIN_RETURNED_NAME=/$PIN_NAME
  PIN_PROJECT_LABEL=social-monitor
  PIN_PURPOSE_LABEL=daily-runner-image-retention
  PIN_REMOVED=false
  FAIL_RETRY=false
  add_unrelated_state
}

write_manifest() {
  local service=$1 manifest_image=$2 current_tag_image
  local state_file rescue_tag policy source_kind=compose-tag
  current_tag_image=${3:-$manifest_image}
  state_file=$(backend_image_rescue_state_file "$SHA")
  rescue_tag=$(backend_image_rescue_tag "$SHA" "$service")
  policy=$(backend_image_rescue_policy "$service")
  [[ $policy != recreate ]] || source_kind=running-image
  REF_IDS["$rescue_tag"]=$current_tag_image
  {
    printf '%s\n' "$BACKEND_IMAGE_RESCUE_VERSION"
    printf 'target\t%s\n' "$SHA"
    printf 'project\t%s\n' "$PROJECT"
    printf 'image\t%s\t%s\t%s\tfixture-source\t%s\t%s\n' \
      "$service" "$policy" "$source_kind" "$manifest_image" "$rescue_tag"
    printf 'complete\t1\n'
  } > "$state_file"
  MANIFEST_STATE_FILE=$state_file
}

ref_id() {
  printf '%s\n' "${REF_IDS[$1]:-}"
}

assert_unrelated_preserved() {
  [[ $(ref_id unrelated:keep) == "$IMAGE_B" ]] || \
    fail 'unrelated image reference changed'
  [[ ${CONTAINER_NAMES[$UNRELATED_ID]:-} == /unrelated-retention ]] || \
    fail 'unrelated container changed'
}

assert_event_exact() {
  local expected=$1 event
  while IFS= read -r event; do
    [[ $event == "$expected" ]] && return 0
  done < "$EVENT_LOG"
  fail "missing exact Docker event: $expected"
}

assert_no_event_containing() {
  local fragment=$1 event
  while IFS= read -r event; do
    [[ $event != *"$fragment"* ]] || \
      fail "unexpected Docker event containing '$fragment': $event"
  done < "$EVENT_LOG"
}

event_count() {
  local count=0 event
  while IFS= read -r event; do
    count=$((count + 1))
  done < "$EVENT_LOG"
  printf '%d\n' "$count"
}

expect_cleanup_failure() {
  local state_file=$1 rescue_tag=$2 expected_tag_image=${3:-$IMAGE_A}
  if backend_image_rescue_cleanup "$state_file"; then
    fail 'cleanup unexpectedly succeeded'
  fi
  [[ -e $state_file ]] || fail 'failed cleanup removed the immutable ledger'
  [[ $(ref_id "$rescue_tag") == "$expected_tag_image" ]] || \
    fail 'failed cleanup removed or changed the rescue tag'
  assert_unrelated_preserved
}

# A production-shaped image conflict is recovered only through the exact,
# stopped, labeled retention pin. The retry removes the tag and ledger while
# preserving unrelated Docker state.
reset_case
add_default_pin
write_manifest daily-runner "$IMAGE_A"
success_state=$MANIFEST_STATE_FILE
success_tag=$(backend_image_rescue_tag "$SHA" daily-runner)
backend_image_rescue_cleanup "$success_state"
[[ ! -e $success_state ]] || fail 'successful cleanup retained the ledger'
[[ -z $(ref_id "$success_tag") ]] || fail 'successful cleanup retained the tag'
[[ -z ${CONTAINER_NAMES[$PIN_ID]:-} ]] || fail 'stale pin was not removed'
assert_unrelated_preserved
assert_event_exact $'docker\tinspect\tfixture-project-daily-runner-image-pin\t--format\t{{.Id}}|{{.Name}}|{{.State.Status}}|{{.State.Running}}|{{.State.Restarting}}|{{.Image}}|{{index .Config.Labels "social-monitor.project"}}|{{index .Config.Labels "social-monitor.purpose"}}'
assert_event_exact "docker"$'\tcontainer\trm\t'"$PIN_ID"
assert_no_event_containing $'\tcontainer\trm\t-f'
assert_no_event_containing $'\tcontainer\trm\t--force'

# A completed cleanup is a zero-op when replayed.
events_before_replay=$(event_count)
backend_image_rescue_cleanup "$success_state"
[[ $(event_count) == "$events_before_replay" ]] || \
  fail 'cleanup replay called Docker'
assert_unrelated_preserved

# A release-success cleanup remains replayable when a prior process removed the
# exact rescue tag but died before deleting the immutable ledger.
reset_case
write_manifest api "$IMAGE_A"
interrupted_state=$MANIFEST_STATE_FILE
interrupted_tag=$(backend_image_rescue_tag "$SHA" api)
remove_ref "$interrupted_tag"
backend_image_rescue_cleanup "$interrupted_state"
[[ ! -e $interrupted_state ]] || \
  fail 'interrupted cleanup retry retained the immutable ledger'
assert_unrelated_preserved

# The fallback is daily-runner-only. A conflicting API rescue does not inspect
# or remove the retention pin.
reset_case
add_default_pin
write_manifest api "$IMAGE_A"
api_state=$MANIFEST_STATE_FILE
api_tag=$(backend_image_rescue_tag "$SHA" api)
expect_cleanup_failure "$api_state" "$api_tag"
[[ -n ${CONTAINER_NAMES[$PIN_ID]:-} ]] || fail 'non-daily cleanup removed pin'
assert_no_event_containing $'docker\tinspect\tfixture-project-daily-runner-image-pin'

# The current rescue tag must still equal the immutable manifest image.
reset_case
add_container "$PIN_ID" "/$PIN_NAME" created false false "$IMAGE_B"
write_manifest daily-runner "$IMAGE_A" "$IMAGE_B"
tag_mismatch_state=$MANIFEST_STATE_FILE
tag_mismatch_tag=$(backend_image_rescue_tag "$SHA" daily-runner)
expect_cleanup_failure "$tag_mismatch_state" "$tag_mismatch_tag" "$IMAGE_B"
[[ -n ${CONTAINER_NAMES[$PIN_ID]:-} ]] || fail 'tag mismatch removed pin'
assert_no_event_containing $'docker\tinspect\tfixture-project-daily-runner-image-pin'

# The inspected pin image must equal both matching manifest and tag IDs.
reset_case
add_container "$PIN_ID" "/$PIN_NAME" created false false "$IMAGE_B"
add_container "$BLOCKER_ID" /unrelated-blocker exited false false "$IMAGE_A"
write_manifest daily-runner "$IMAGE_A"
image_mismatch_state=$MANIFEST_STATE_FILE
image_mismatch_tag=$(backend_image_rescue_tag "$SHA" daily-runner)
expect_cleanup_failure "$image_mismatch_state" "$image_mismatch_tag"
[[ -n ${CONTAINER_NAMES[$PIN_ID]:-} ]] || fail 'image mismatch removed pin'
[[ -n ${CONTAINER_NAMES[$BLOCKER_ID]:-} ]] || fail 'image mismatch touched blocker'

# An absent exact pin fails closed even if another container caused the image
# conflict.
reset_case
add_container "$BLOCKER_ID" /unrelated-blocker exited false false "$IMAGE_A"
write_manifest daily-runner "$IMAGE_A"
missing_pin_state=$MANIFEST_STATE_FILE
missing_pin_tag=$(backend_image_rescue_tag "$SHA" daily-runner)
expect_cleanup_failure "$missing_pin_state" "$missing_pin_tag"
[[ -n ${CONTAINER_NAMES[$BLOCKER_ID]:-} ]] || fail 'missing pin touched blocker'

# Both required labels must be present and exact.
for label_case in missing-project wrong-project missing-purpose wrong-purpose; do
  reset_case
  add_default_pin
  case $label_case in
    missing-project) PIN_PROJECT_LABEL= ;;
    wrong-project) PIN_PROJECT_LABEL=fixture-project ;;
    missing-purpose) PIN_PURPOSE_LABEL= ;;
    wrong-purpose) PIN_PURPOSE_LABEL=daily-runner ;;
  esac
  write_manifest daily-runner "$IMAGE_A"
  label_state=$MANIFEST_STATE_FILE
  label_tag=$(backend_image_rescue_tag "$SHA" daily-runner)
  expect_cleanup_failure "$label_state" "$label_tag"
  [[ -n ${CONTAINER_NAMES[$PIN_ID]:-} ]] || \
    fail "$label_case removed the retention pin"
done

# Running, restarting, and non-stopped status records are never removed.
for state_case in running restarting dead; do
  reset_case
  case $state_case in
    running)
      add_container "$PIN_ID" "/$PIN_NAME" running true false "$IMAGE_A"
      ;;
    restarting)
      add_container "$PIN_ID" "/$PIN_NAME" restarting true true "$IMAGE_A"
      ;;
    dead)
      add_container "$PIN_ID" "/$PIN_NAME" dead false false "$IMAGE_A"
      ;;
  esac
  write_manifest daily-runner "$IMAGE_A"
  unsafe_state=$MANIFEST_STATE_FILE
  unsafe_tag=$(backend_image_rescue_tag "$SHA" daily-runner)
  expect_cleanup_failure "$unsafe_state" "$unsafe_tag"
  [[ -n ${CONTAINER_NAMES[$PIN_ID]:-} ]] || \
    fail "$state_case retention pin was removed"
done

# Docker must return the exact expected name and a full 64-hex container ID.
reset_case
add_default_pin
PIN_RETURNED_NAME=/different-daily-runner-image-pin
write_manifest daily-runner "$IMAGE_A"
wrong_name_state=$MANIFEST_STATE_FILE
wrong_name_tag=$(backend_image_rescue_tag "$SHA" daily-runner)
expect_cleanup_failure "$wrong_name_state" "$wrong_name_tag"
[[ -n ${CONTAINER_NAMES[$PIN_ID]:-} ]] || fail 'different name removed pin'

reset_case
PIN_ID=short-container-id
add_container "$PIN_ID" "/$PIN_NAME" created false false "$IMAGE_A"
write_manifest daily-runner "$IMAGE_A"
short_id_state=$MANIFEST_STATE_FILE
short_id_tag=$(backend_image_rescue_tag "$SHA" daily-runner)
expect_cleanup_failure "$short_id_state" "$short_id_tag"
[[ -n ${CONTAINER_NAMES[$PIN_ID]:-} ]] || fail 'short ID removed pin'

# If exact tag deletion still fails after the valid pin is removed, cleanup
# preserves the rescue tag and immutable ledger for a later retry.
reset_case
add_default_pin
FAIL_RETRY=true
write_manifest daily-runner "$IMAGE_A"
retry_state=$MANIFEST_STATE_FILE
retry_tag=$(backend_image_rescue_tag "$SHA" daily-runner)
expect_cleanup_failure "$retry_state" "$retry_tag"
[[ -z ${CONTAINER_NAMES[$PIN_ID]:-} ]] || fail 'valid stale pin was retained'
assert_event_exact "docker"$'\tcontainer\trm\t'"$PIN_ID"
assert_no_event_containing $'\tcontainer\trm\t-f'
assert_no_event_containing $'\tcontainer\trm\t--force'

printf 'Backend image rescue daily-runner pin cleanup tests passed\n'
