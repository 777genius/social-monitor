#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/backend-rescue-absent.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

PROJECT=fixture-project
STATE=$FIXTURE/state
EVENT_LOG=$FIXTURE/events.log
SHA=1111111111111111111111111111111111111111
install -d "$STATE"
: > "$EVENT_LOG"

fake_compose() {
  printf 'compose' >> "$EVENT_LOG"
  printf '\t%s' "$@" >> "$EVENT_LOG"
  printf '\n' >> "$EVENT_LOG"
  if [[ $* == *' ps --all -q '* ]]; then
    [[ -z ${EXISTING_CONTAINER:-} ]] || printf '%s\n' "$EXISTING_CONTAINER"
    return 0
  fi
  [[ $* == *' rm -sf '* ]]
}
COMPOSE=(fake_compose)

marker_value() { printf '%040d\n' 1; }
backend_image_rescue_image_id() { return 1; }
backend_image_rescue_remove_tag() { :; }
backend_image_rescue_cleanup_abandoned_partials() { :; }
backend_image_rescue_reconcile_completed_state() { return 1; }
compose_image_name() { printf '%s-%s:latest\n' "$PROJECT" "$1"; }
stop_and_remove_database_services() { printf 'unexpected-recreate\n' >> "$EVENT_LOG"; }
verify_backend_with_retry() { printf 'unexpected-verify\n' >> "$EVENT_LOG"; }
refresh_frontend_api_proxy() { printf 'unexpected-proxy\n' >> "$EVENT_LOG"; }

# shellcheck source=ops/deploy/backend-image-rescue-lib.sh
source "$SCRIPT_DIR/backend-image-rescue-lib.sh"

# A stale Compose image tag does not mean the service was operational. The
# exact pre-release container set is the rollback baseline.
backend_image_rescue_image_id() {
  [[ $1 == "$(compose_image_name agent-runtime)" ]] && \
    printf 'sha256:%064d\n' 9
}
state_file=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$state_file" agent-runtime
grep -Fx $'absent\tagent-runtime\trecreate' "$state_file" >/dev/null
backend_image_rescue_mark_replacement_started "$state_file"
: > "$EVENT_LOG"
rollback_backend_images "$state_file"
grep -Fx \
  $'compose\t--profile\tapp\t--profile\tdaily\trm\t-sf\tagent-runtime' \
  "$EVENT_LOG" >/dev/null
if grep -E 'unexpected-(recreate|verify|proxy)' "$EVENT_LOG" >/dev/null; then
  echo 'absent service rollback entered image recreation' >&2
  exit 1
fi

rm -f "$state_file" "$(backend_image_rescue_phase_file "$state_file")"
EXISTING_CONTAINER=preexisting-agent
export EXISTING_CONTAINER
if backend_image_rescue_prepare "$SHA" "$state_file" agent-runtime; then
  echo 'preexisting service container was accepted as absent baseline' >&2
  exit 1
fi
[[ ! -e $state_file && ! -e $state_file.partial ]]
grep -F \
  $'compose\t--profile\tapp\t--profile\tdaily\tps\t--all\t-q\tagent-runtime' \
  "$EVENT_LOG" >/dev/null

echo 'Backend absent-service rescue tests passed'
