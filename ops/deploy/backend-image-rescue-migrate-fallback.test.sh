#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
LIBRARY=$SCRIPT_DIR/backend-image-rescue-lib.sh
HEALTH_LIBRARY=$SCRIPT_DIR/backend-runtime-health-lib.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/backend-image-rescue-migrate.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

PROJECT=fixture-project
STATE=$FIXTURE/state
REFS=$FIXTURE/refs.tsv
CONTAINERS=$FIXTURE/containers.tsv
SEQUENCES=$FIXTURE/compose-sequences.tsv
EVENT_LOG=$FIXTURE/events.log
export PROJECT STATE REFS CONTAINERS SEQUENCES EVENT_LOG

SHA=1111111111111111111111111111111111111111
ID_A=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ID_B=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
FAKE_BIN=$FIXTURE/bin
install -d "$FAKE_BIN"

cat > "$FAKE_BIN/docker" <<'SH'
#!/usr/bin/env bash
set -euo pipefail

ref_id() { awk -F '\t' -v ref="$1" '$1 == ref {print $2; exit}' "$REFS"; }
set_ref() {
  local ref=$1 image_id=$2 next=$REFS.next.$$
  awk -F '\t' -v ref="$ref" '$1 != ref' "$REFS" > "$next"
  printf '%s\t%s\n' "$ref" "$image_id" >> "$next"
  mv -f "$next" "$REFS"
}
remove_ref() {
  local ref=$1 next=$REFS.next.$$
  awk -F '\t' -v ref="$ref" '$1 != ref' "$REFS" > "$next"
  mv -f "$next" "$REFS"
}
log() { { printf docker; printf '\t%s' "$@"; printf '\n'; } >> "$EVENT_LOG"; }

log "$@"
case ${1:-}:${2:-} in
  image:inspect)
    image_id=$(ref_id "$3")
    [[ -n $image_id ]] || exit 1
    printf '%s\n' "$image_id"
    ;;
  image:tag)
    image_id=$(ref_id "$3")
    [[ -n $image_id ]] || exit 1
    set_ref "$4" "$image_id"
    ;;
  image:rm)
    [[ -n $(ref_id "$3") ]] || exit 1
    remove_ref "$3"
    ;;
  inspect:*)
    row=$(awk -F '\t' -v container="$2" '$2 == container {print; exit}' "$CONTAINERS")
    [[ -n $row ]] || exit 1
    image_id=${row##*$'\t'}
    case ${*: -1} in
      *'.State.Status'*) printf 'running|true|false|false|healthy\n' ;;
      *'.Image'*) printf '%s\n' "$image_id" ;;
      *) exit 90 ;;
    esac
    ;;
  *) exit 91 ;;
esac
SH
chmod 0755 "$FAKE_BIN/docker"
PATH=$FAKE_BIN:$PATH

take_sequence() {
  local service=$1 row next=$SEQUENCES.next.$$
  row=$(awk -F '\t' -v service="$service" '$1 == service {print; exit}' "$SEQUENCES")
  [[ -n $row ]] || return 1
  awk -F '\t' -v service="$service" \
    '$1 == service && !removed {removed=1; next} {print}' \
    "$SEQUENCES" > "$next"
  mv -f "$next" "$SEQUENCES"
  printf '%s\n' "${row#*$'\t'}"
}

fake_compose() {
  local service=${!#} container
  { printf compose; printf '\t%s' "$@"; printf '\n'; } >> "$EVENT_LOG"
  [[ $* == *' ps -q '* ]] || return 92
  if container=$(take_sequence "$service"); then
    [[ $container == missing ]] || printf '%s\n' "$container"
  else
    awk -F '\t' -v service="$service" '$1 == service {print $2}' "$CONTAINERS"
  fi
}

compose_image_name() { printf '%s-%s:latest\n' "$PROJECT" "$1"; }
marker_value() { :; }
COMPOSE=(fake_compose)

# shellcheck source=ops/deploy/backend-image-rescue-lib.sh
source "$LIBRARY"
# shellcheck source=ops/deploy/backend-runtime-health-lib.sh
source "$HEALTH_LIBRARY"

verify_backend_with_retry() {
  printf 'verify-backend\t%s\n' "$1" >> "$EVENT_LOG"
  [[ ${FAKE_VERIFY_STATUS:-0} == 0 ]]
}

reset_case() {
  STATE=$FIXTURE/$1/state
  install -d "$STATE"
  : > "$REFS"
  : > "$CONTAINERS"
  : > "$SEQUENCES"
  : > "$EVENT_LOG"
  unset FAKE_VERIFY_STATUS
}
add_ref() { printf '%s\t%s\n' "$1" "$2" >> "$REFS"; }
add_container() { printf '%s\t%s\t%s\n' "$1" "$2" "$3" >> "$CONTAINERS"; }
queue_container() { printf '%s\t%s\n' "$1" "$2" >> "$SEQUENCES"; }
ref_id() { awk -F '\t' -v ref="$1" '$1 == ref {print $2; exit}' "$REFS"; }

assert_fails() {
  set +e
  "$@"
  local status=$?
  set -e
  ((status != 0))
}
assert_no_dangling_rescue() {
  [[ -z $(ref_id "$(backend_image_rescue_tag "$SHA" migrate)") ]]
  ! compgen -G "$STATE/*" >/dev/null
}
assert_no_mutable_api_or_reconstruction() {
  if grep -F "$(compose_image_name api)" "$EVENT_LOG"; then
    return 1
  fi
  if grep -E $'docker\t(container\t(export|commit)|image\t(import|build)|build|commit)' "$EVENT_LOG"; then
    return 1
  fi
}
assert_verify_count() {
  [[ $(grep -c $'^verify-backend\tapi$' "$EVENT_LOG") == "$1" ]]
}

prepare_migrate() {
  state_file=$(backend_image_rescue_state_file "$SHA")
  backend_image_rescue_prepare "$SHA" "$state_file" migrate
}

reset_case positive
add_ref "$ID_A" "$ID_A"
add_container api verified-api "$ID_A"
prepare_migrate
rescue_tag=$(backend_image_rescue_tag "$SHA" migrate)
printf -v expected_manifest_row \
  'image\tmigrate\ttag-only-migrate\trunning-image\tverified-api\t%s\t%s' \
  "$ID_A" "$rescue_tag"
grep -Fx "$expected_manifest_row" "$state_file" >/dev/null
[[ $(ref_id "$rescue_tag") == "$ID_A" ]]
assert_verify_count 1
grep -Fx $'docker\timage\ttag\t'"$ID_A"$'\t'"$rescue_tag" "$EVENT_LOG" >/dev/null
assert_no_mutable_api_or_reconstruction
backend_image_rescue_cleanup "$state_file"
assert_no_dangling_rescue
reset_case missing-api
assert_fails prepare_migrate
assert_verify_count 0
assert_no_mutable_api_or_reconstruction
assert_no_dangling_rescue
reset_case multiple-api
add_container api first-api "$ID_A"
add_container api second-api "$ID_A"
assert_fails prepare_migrate
assert_verify_count 0
assert_no_mutable_api_or_reconstruction
assert_no_dangling_rescue
reset_case verify-fails
add_ref "$ID_A" "$ID_A"
add_container api verify-api "$ID_A"
FAKE_VERIFY_STATUS=73
assert_fails prepare_migrate
assert_verify_count 1
assert_no_mutable_api_or_reconstruction
assert_no_dangling_rescue
reset_case unstable-before-pin
add_ref "$ID_A" "$ID_A"
add_container api stable-api "$ID_A"
queue_container api stable-api
queue_container api replacement-api
assert_fails prepare_migrate
assert_verify_count 1
assert_no_mutable_api_or_reconstruction
assert_no_dangling_rescue
reset_case unstable-after-pin
add_ref "$ID_A" "$ID_A"
add_container api stable-api "$ID_A"
queue_container api stable-api
queue_container api stable-api
queue_container api replacement-api
assert_fails prepare_migrate
assert_verify_count 1
grep -Fx $'docker\timage\ttag\t'"$ID_A"$'\t'"$(backend_image_rescue_tag "$SHA" migrate)" "$EVENT_LOG" >/dev/null
assert_no_mutable_api_or_reconstruction
assert_no_dangling_rescue

reset_case missing-image
add_container api missing-image-api "$ID_A"
assert_fails prepare_migrate
assert_verify_count 1
assert_no_mutable_api_or_reconstruction
assert_no_dangling_rescue

reset_case wrong-image
add_ref "$ID_A" "$ID_B"
add_container api wrong-image-api "$ID_A"
assert_fails prepare_migrate
assert_verify_count 1
assert_no_mutable_api_or_reconstruction
assert_no_dangling_rescue

echo 'Backend image rescue migrate fallback tests passed'
