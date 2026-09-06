#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d /tmp/rabbitmq-authorized-prelude-test.XXXXXX)
cleanup() {
  if [[ ${RABBITMQ_PRELUDE_TEST_KEEP_FIXTURE:-0} == 1 ]]; then
    printf 'fixture=%s\n' "$FIXTURE"
  else
    rm -rf "$FIXTURE"
  fi
}
trap cleanup EXIT
HEALTH=ops/deploy/rabbitmq-quorum-health.sh
RECOVERY=ops/deploy/rabbitmq-quorum-recovery.sh
ASSETS=(deploy-control-lib.sh deploy-control-bridge-lib.sh
  backend-runtime-health-lib.sh backend-image-rescue-lib.sh
  backend-image-rescue-pin-cleanup-lib.sh rabbitmq-quorum-health.sh
  rabbitmq-quorum-recovery.sh)

fail() { printf 'prelude-test-error: %s\n' "$*" >&2; exit 1; }

prepare_case() {
  local name=$1 asset
  REPO=$FIXTURE/$name/repo
  STATE=$FIXTURE/$name/state
  CONTROL=$FIXTURE/$name/control
  EVENTS=$FIXTURE/$name/events
  SENTINEL=$FIXTURE/$name/unauthorized-executed
  TRACE=$FIXTURE/$name/trace
  # Consumed by the real libraries sourced through authorized Git blobs.
  # shellcheck disable=SC2034
  PROJECT=rabbitmq-prelude-test
  install -d "$REPO/ops/deploy" "$STATE" "$CONTROL"
  : > "$EVENTS"
  git init -q -b main "$REPO"
  git -C "$REPO" config user.name 'RabbitMQ Prelude Test'
  git -C "$REPO" config user.email prelude@example.invalid
  for asset in "${ASSETS[@]}"; do cp "$SCRIPT_DIR/$asset" "$REPO/ops/deploy/$asset"; done
  chmod 0644 "$REPO/ops/deploy/"*-lib.sh
  chmod 0755 "$REPO/$HEALTH" "$REPO/$RECOVERY"
  git -C "$REPO" add .
  git -C "$REPO" commit -qm 'test: authorized predecessor'
  BASE=$(git -C "$REPO" rev-parse HEAD)
  printf '\nprelude_fixture_health_version() { printf target-health; }\n' >> "$REPO/$HEALTH"
  printf '\nprelude_fixture_recovery_version() { printf target-recovery; }\n' >> "$REPO/$RECOVERY"
  git -C "$REPO" add .
  git -C "$REPO" commit -qm 'test: next backend target'
  TARGET=$(git -C "$REPO" rev-parse HEAD)
  git -C "$REPO" checkout -q "$BASE"
}

load_authorized_predecessor() {
  local asset
  # Use the real authority, never the entrypoint's source-only TEST shortcut.
  # shellcheck source=ops/deploy/production-transition-b0-host-control.sh
  source "$SCRIPT_DIR/production-transition-b0-host-control.sh"
  production_transition_host_seal_prelude_commit "$BASE"
  readonly PRODUCTION_TRANSITION_PRELUDE_COMMIT
  for asset in deploy-control-lib.sh deploy-control-bridge-lib.sh \
    backend-runtime-health-lib.sh backend-image-rescue-lib.sh; do
    production_transition_host_source_authorized_prelude "ops/deploy/$asset" "$asset"
  done
  ! declare -F rabbitmq_quorum_health_verify_worker_container >/dev/null
  ! declare -F rabbitmq_quorum_recovery_ensure_steady >/dev/null
  # shellcheck disable=SC2034
  DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD=$BASE
  # This synthetic two-commit history is an ordinary fast-forward, not B0/R/H/W.
  production_forward_derive_graph() { return 1; }
}

install_runtime_fakes() {
  CONTAINER=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  IMAGE=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  # Only transport/image effects are faked. Rescue preparation, pin_service,
  # verify_backend_with_retry, verify_backend and the lazy loader remain real.
  fake_compose() {
    [[ " $* " == *' ps '* && ${*: -1} == api ]] || fail "unexpected Compose call: $*"
    printf '%s\n' "$CONTAINER"
  }
  # shellcheck disable=SC2034
  COMPOSE=(fake_compose)
  docker() {
    [[ $1 == inspect && $2 == "$CONTAINER" ]] || fail "unexpected Docker call: $*"
    case ${3:-} in
      --format)
        case $4 in
          '{{.State.Status}}') printf 'running\n' ;;
          '{{.State.OOMKilled}}') printf 'false\n' ;;
          *) fail "unexpected Docker format: $4" ;;
        esac ;;
      '') printf '[{"Id":"%s","State":{"Status":"running","OOMKilled":false},"RestartCount":0}]\n' "$CONTAINER" ;;
      *) fail "unexpected Docker inspect: $*" ;;
    esac
  }
  curl() { printf 'http-health\n' >> "$EVENTS"; }
  sleep() { fail 'healthy fixture must not retry'; }
  marker_value() { printf '%s\n' "$BASE"; }
  backend_image_rescue_remove_tag() { :; }
  backend_image_rescue_image_id() { printf '%s\n' "$IMAGE"; }
  backend_image_rescue_pin_running_container() {
    printf -v "$4" '%s' running-image
    printf -v "$5" '%s' "$IMAGE"
    printf 'image-pinned\n' >> "$EVENTS"
  }
  # The real steady-recovery entrypoint runs with an isolated state root;
  # broker identification and probing are deterministic transport substitutes.
  # shellcheck disable=SC2034
  RABBITMQ_QUORUM_RECOVERY_STATE_ROOT=$CONTROL/quorum-test
  rabbitmq_quorum_health_identify_target() { :; }
  rabbitmq_quorum_health_probe_target() { printf 'quorum-probe\n' >> "$EVENTS"; }
}

run_transition() (
  local variant=$1 asset
  prepare_case "$variant"
  load_authorized_predecessor
  if [[ $variant == preloaded ]]; then
    for asset in "$HEALTH" "$RECOVERY"; do
      production_transition_host_source_authorized_prelude "$asset" predecessor-quorum
    done
  fi
  deploy_control_after_reviewed_library_stage() {
    printf 'reviewed:%s\n' "$1" >> "$EVENTS"
    [[ $(git -C "$REPO" rev-parse HEAD) == "$TARGET" ]]
    [[ $PRODUCTION_TRANSITION_PRELUDE_COMMIT == "$BASE" ]]
    if [[ $variant == staged-mutation && ($1 == "$HEALTH" || $1 == "$RECOVERY") ]]; then
      printf '\nprintf unsafe > "%s"\n' "$SENTINEL" >> "$REPO/$1"
    fi
  }
  # Record the real function stack, including rescue -> pin -> retry -> health
  # -> lazy loader. An old bridge fails here before any health or image effect.
  exec 6>"$TRACE"
  BASH_XTRACEFD=6
  PS4='+${FUNCNAME[*]}: '
  set -x
  advance_integration "$TARGET"
  load_target_rabbitmq_quorum_backend_health "$TARGET"
  install_runtime_fakes
  backend_image_rescue_prepare "$TARGET" "$(backend_image_rescue_state_file "$TARGET")" api
  set +x
  unset BASH_XTRACEFD
  [[ $PRODUCTION_TRANSITION_PRELUDE_COMMIT == "$BASE" && $BASE != "$TARGET" ]]
  [[ $(git -C "$REPO" rev-parse HEAD) == "$TARGET" ]]
  [[ $(prelude_fixture_health_version) == target-health ]]
  [[ $(prelude_fixture_recovery_version) == target-recovery ]]
  [[ ! -e $SENTINEL ]]
  [[ $(backend_image_rescue_read_phase "$(backend_image_rescue_state_file "$TARGET")") == prepared ]]
  [[ $(cat "$EVENTS") == \
    $'reviewed:'"$HEALTH"$'\nreviewed:'"$RECOVERY"$'\nreviewed:ops/deploy/backend-runtime-health-lib.sh\nquorum-probe\nhttp-health\nhttp-health\nimage-pinned' ]]
  grep -F 'backend_health_load_rabbitmq_quorum_recovery verify_backend verify_backend_with_retry backend_image_rescue_pin_service backend_image_rescue_prepare' "$TRACE" >/dev/null
  printf 'PASS %s: predecessor authority -> target advance -> reviewed target libraries -> real rescue health; pin unchanged\n' "$variant"
)

assert_rejected() {
  local expected=$1 status output
  shift
  set +e
  output=$("$@" 2>&1)
  status=$?
  set -e
  ((status != 0)) || fail "unexpected acceptance: $*"
  grep -F "$expected" <<< "$output" >/dev/null || fail "unexpected rejection: $output"
  printf 'PASS rejection: %s\n' "$expected"
}

reject_authorized_source() (
  local variant=$1 asset=$2
  prepare_case "authorized-$variant-${asset##*/}"
  load_authorized_predecessor
  case $variant in
    changed-head) advance_integration "$TARGET" ;;
    missing-blob) asset=ops/deploy/unauthorized.sh
      printf 'printf unsafe > "%s"\n' "$SENTINEL" > "$REPO/$asset" ;;
  esac
  production_transition_host_source_authorized_prelude "$asset" quorum
)

reject_target_asset() (
  local variant=$1 asset=$2
  prepare_case "target-$variant-${asset##*/}"
  load_authorized_predecessor
  advance_integration "$TARGET"
  case $variant in
    changed-blob) printf '\nprintf unsafe > "%s"\n' "$SENTINEL" >> "$REPO/$asset" ;;
    symlink) mv "$REPO/$asset" "$REPO/$asset.real"; ln -s "${asset##*/}.real" "$REPO/$asset" ;;
    committed-symlink)
      mv "$REPO/$asset" "$REPO/$asset.real"
      ln -s "${asset##*/}.real" "$REPO/$asset"
      git -C "$REPO" add .
      git -C "$REPO" commit -qm 'test: unauthorized symlink blob'
      TARGET=$(git -C "$REPO" rev-parse HEAD)
      # A regular working file cannot disguise a symlink in the reviewed tree.
      rm "$REPO/$asset"
      mv "$REPO/$asset.real" "$REPO/$asset" ;;
  esac
  load_target_rabbitmq_quorum_backend_health "$TARGET"
)

reject_unsealed_or_symlink_prelude() (
  local variant=$1 asset=$2
  prepare_case "prelude-$variant-${asset##*/}"
  # shellcheck source=ops/deploy/production-transition-b0-host-control.sh
  source "$SCRIPT_DIR/production-transition-b0-host-control.sh"
  unset PRODUCTION_TRANSITION_PRELUDE_COMMIT
  if [[ $variant == symlink ]]; then
    mv "$REPO/$asset" "$REPO/$asset.real"
    ln -s "${asset##*/}.real" "$REPO/$asset"
    git -C "$REPO" add .
    git -C "$REPO" commit -qm 'test: symlink prelude blob'
    production_transition_host_seal_prelude_commit "$(git -C "$REPO" rev-parse HEAD)"
  fi
  production_transition_host_source_authorized_prelude "$asset" quorum
)

# Pin the fixture sequence to the production call sites as well as exercising
# the real loading/rescue functions. No deploy entrypoint is executed here.
python3 - "$SCRIPT_DIR" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
entry = (root / 'social-monitor-production-deploy.sh').read_text()
control = (root / 'deploy-control-lib.sh').read_text().split('deploy_release() {', 1)[1]
assert entry.index('production_transition_host_preflight_prelude "') < entry.index("ops/deploy/backend-runtime-health-lib.sh 'backend runtime health library'")
assert control.index('advance_integration "$sha"') < control.index('load_target_rabbitmq_quorum_backend_health "$sha"') < control.index('deploy_release_runtime_transaction "$sha"')
backend = entry.split('deploy_backend() (', 1)[1]
assert backend.index('backend_image_rescue_prepare "$sha"') < backend.index('build "$service"')
PY

run_transition cold
[[ ${1:-} != --transition-only ]] || exit 0
run_transition preloaded
run_transition staged-mutation
for asset in "$HEALTH" "$RECOVERY"; do
  assert_rejected 'has no stable authorized prelude commit' reject_authorized_source changed-head "$asset"
  assert_rejected 'is not an authorized regular blob' reject_authorized_source missing-blob "$asset"
  assert_rejected 'has no stable authorized prelude commit' reject_unsealed_or_symlink_prelude unsealed "$asset"
  assert_rejected 'is not an authorized regular blob' reject_unsealed_or_symlink_prelude symlink "$asset"
  assert_rejected 'differs from reviewed target' reject_target_asset changed-blob "$asset"
  assert_rejected 'is not a regular non-symlink file' reject_target_asset symlink "$asset"
  assert_rejected 'is not a regular blob at reviewed target' reject_target_asset committed-symlink "$asset"
done
[[ -z $(find "$FIXTURE" -name unauthorized-executed -print -quit) ]]
printf '%s\n' 'RabbitMQ authorized prelude transition tests passed'
