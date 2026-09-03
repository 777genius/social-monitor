#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
REPO=${PRODUCTION_RELEASE_B_TEST_SOURCE_REPO:-$PROJECT_ROOT}
CLIENT=$PROJECT_ROOT/ops/deploy/github-production-deploy-client.sh
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
A=7c4070f0b9ef1aac130284bcffac50551e20a4dd
A_TREE=72a67394bafd87ab7ed5b3024ddf66c6d040f096
F=6e65d37566c1fa898b3f318d2e997717282e584b
F_TREE=29bd04375ab548e999e1fba68030ee62c35263bc
B=e2218864fd5e75ae85bfd6562bdd38c5e777371e
B_TREE=8d180651bf216d2ff9084f1b5853a6962614d7c0
J=f209b8b351051463892e4090f09d1878ce3e75de
J_TREE=71e44fcb1c2280a1b8db7c3d34705ead4af205b2
BRIDGE_BLOB=4c0c957b532e3232493efc89b837c305dd439abc
CONTROL_BLOB=fd2d8095cd6e2428e02f6ca21942bab2ea10961b
FRONTEND_MARKER=09294b6bbff4442b42bf5bd84bd45ce18731e25b
POOL_MARKER=0be002ec1af2d1e0799f8507cb147a6f1406a428
FIXTURE_PARENT=$(cd "${TMPDIR:-/tmp}" && pwd -P)
FIXTURE=$(mktemp -d "$FIXTURE_PARENT/promotion-v2-h-guard.XXXXXX")
export GIT_AUTHOR_NAME='Promotion V2 fixture'
export GIT_AUTHOR_EMAIL=promotion-v2@example.invalid
export GIT_COMMITTER_NAME=$GIT_AUTHOR_NAME
export GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL

fail() { printf 'promotion-v2-test-error: %s\n' "$*" >&2; return 1; }
cleanup_fixture() {
  local status=$? parent base
  trap - EXIT
  parent=$(dirname "$FIXTURE")
  base=$(basename "$FIXTURE")
  [[ $parent == "$FIXTURE_PARENT" && -d $FIXTURE && ! -L $FIXTURE && \
     $base == promotion-v2-h-guard.?????? ]] || {
    printf 'fixture-cleanup-error: refusing unsafe path: %s\n' "$FIXTURE" >&2
    exit 1
  }
  rm -rf -- "$FIXTURE" || status=$?
  if ((status == 0)); then
    [[ ! -e $FIXTURE && ! -L $FIXTURE ]] || status=1
  fi
  exit "$status"
}
trap cleanup_fixture EXIT

assert_rejected() {
  local candidate=$1 label=$2
  if (GITHUB_WORKSPACE=$REPO verify_post_promotion_v2_target_identity \
      "$candidate") 2>/dev/null; then
    printf 'invalid promotion graph was admitted: %s\n' "$label" >&2
    exit 1
  fi
}

for identity in "$A:$A_TREE" "$F:$F_TREE" "$B:$B_TREE" "$J:$J_TREE"; do
  sha=${identity%%:*}; tree=${identity#*:}
  [[ $(git -C "$REPO" rev-parse "$sha^{tree}") == "$tree" ]]
done
[[ $(git -C "$REPO" rev-list --parents -n 1 "$B") == "$B $A" ]]
[[ $(git -C "$REPO" diff --name-only --no-renames "$A" "$B") == \
  $'ops/deploy/deploy-control-bridge-lib.sh\nops/deploy/deploy-control-lib.sh' ]]
[[ $(git -C "$REPO" ls-tree "$B" -- ops/deploy/deploy-control-bridge-lib.sh \
  ops/deploy/deploy-control-lib.sh) == \
  $'100644 blob '"$BRIDGE_BLOB"$'\tops/deploy/deploy-control-bridge-lib.sh\n100644 blob '"$CONTROL_BLOB"$'\tops/deploy/deploy-control-lib.sh' ]]
[[ $(git -C "$REPO" rev-list --parents -n 1 "$J") == "$J $F $B" ]]
[[ $(git -C "$REPO" diff --name-only --no-renames "$F" "$J") == \
  ops/deploy/deploy-control-bridge-lib.sh ]]

H_INDEX=$FIXTURE/h.index
GIT_INDEX_FILE=$H_INDEX git -C "$REPO" read-tree "$J"
while read -r mode path; do
  blob=$(git -C "$REPO" hash-object -w -- "$PROJECT_ROOT/$path")
  GIT_INDEX_FILE=$H_INDEX git -C "$REPO" update-index \
    --add --cacheinfo "$mode,$blob,$path"
done <<'PATHS'
100644 .github/workflows/production-deploy.yml
100755 ops/deploy/github-production-deploy-client.sh
100755 ops/deploy/github-production-deploy-client.test.sh
100644 ops/deploy/github-production-forward-bridge-client-lib.sh
100644 ops/deploy/production-forward-bridge-authority.blobs
100755 ops/deploy/production-forward-bridge.test.sh
100755 ops/deploy/production-release-a-transition.test.sh
100755 ops/deploy/production-release-b-bridge-order.test.sh
100644 ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh
PATHS
H_TREE=$(GIT_INDEX_FILE=$H_INDEX git -C "$REPO" write-tree)
H=$(printf 'test: exact nine-file H guard\n' | git -C "$REPO" commit-tree \
  "$H_TREE" -p "$J")
M=$(printf 'test: protected-main merge M\n' | git -C "$REPO" commit-tree \
  "$H_TREE" -p "$F" -p "$H")

# shellcheck source=ops/deploy/github-production-deploy-client.sh
source "$CLIENT"
GITHUB_WORKSPACE=$REPO verify_post_promotion_v2_target_identity "$M"
[[ $PROMOTION_V2_VERIFIED_H == "$H" && \
   $PROMOTION_V2_VERIFIED_TARGET == "$M" ]]

swapped=$(printf 'test: swapped protected-main parents\n' | \
  git -C "$REPO" commit-tree "$H_TREE" -p "$H" -p "$F")
squash=$(printf 'test: squashed protected-main result\n' | \
  git -C "$REPO" commit-tree "$H_TREE" -p "$F")
wrapper=$(printf 'test: wrapper around M\n' | \
  git -C "$REPO" commit-tree "$H_TREE" -p "$M")
rebased_h=$(printf 'test: rebased H\n' | \
  git -C "$REPO" commit-tree "$H_TREE" -p "$F")
rebased_m=$(printf 'test: merge with rebased H\n' | \
  git -C "$REPO" commit-tree "$H_TREE" -p "$F" -p "$rebased_h")
assert_rejected "$swapped" 'swapped M parents'
assert_rejected "$squash" 'squashed M'
assert_rejected "$wrapper" 'wrapper M'
assert_rejected "$rebased_m" 'rebased H'
assert_rejected "$F" 'wrong target SHA'

EXTRA_INDEX=$FIXTURE/extra.index
GIT_INDEX_FILE=$EXTRA_INDEX git -C "$REPO" read-tree "$H_TREE"
extra_blob=$(printf 'unreviewed\n' | git -C "$REPO" hash-object -w --stdin)
GIT_INDEX_FILE=$EXTRA_INDEX git -C "$REPO" update-index --add \
  --cacheinfo "100644,$extra_blob,unreviewed-promotion-path"
extra_tree=$(GIT_INDEX_FILE=$EXTRA_INDEX git -C "$REPO" write-tree)
extra_h=$(printf 'test: H with extra path\n' | git -C "$REPO" commit-tree \
  "$extra_tree" -p "$J")
extra_m=$(printf 'test: M with extra path\n' | git -C "$REPO" commit-tree \
  "$extra_tree" -p "$F" -p "$extra_h")
assert_rejected "$extra_m" 'extra H path'

MODE_INDEX=$FIXTURE/mode.index
GIT_INDEX_FILE=$MODE_INDEX git -C "$REPO" read-tree "$H_TREE"
client_blob=$(git -C "$REPO" rev-parse "$H:ops/deploy/github-production-deploy-client.sh")
GIT_INDEX_FILE=$MODE_INDEX git -C "$REPO" update-index \
  --cacheinfo "100644,$client_blob,ops/deploy/github-production-deploy-client.sh"
mode_tree=$(GIT_INDEX_FILE=$MODE_INDEX git -C "$REPO" write-tree)
mode_h=$(printf 'test: H with wrong mode\n' | git -C "$REPO" commit-tree \
  "$mode_tree" -p "$J")
mode_m=$(printf 'test: M with wrong mode\n' | git -C "$REPO" commit-tree \
  "$mode_tree" -p "$F" -p "$mode_h")
assert_rejected "$mode_m" 'wrong H mode'

# Override pins only inside subshells to prove immutable A/F trees and B blobs,
# modes, and SHA are checked rather than inferred from topology alone.
if (PROMOTION_V2_CONTROLLER_TREE=$F_TREE; \
    GITHUB_WORKSPACE=$REPO verify_post_promotion_v2_target_identity "$M") \
    2>/dev/null; then exit 1; fi
if (PROMOTION_V2_PRODUCT_MAIN_TREE=$A_TREE; \
    GITHUB_WORKSPACE=$REPO verify_post_promotion_v2_target_identity "$M") \
    2>/dev/null; then exit 1; fi
if (PROMOTION_V2_BRIDGE_SHA=$A; PROMOTION_V2_BRIDGE_TREE=$A_TREE; \
    GITHUB_WORKSPACE=$REPO verify_post_promotion_v2_target_identity "$M") \
    2>/dev/null; then exit 1; fi

BAD_B_INDEX=$FIXTURE/bad-b.index
GIT_INDEX_FILE=$BAD_B_INDEX git -C "$REPO" read-tree "$B"
wrong_blob=$(printf 'wrong bridge bytes\n' | git -C "$REPO" hash-object -w --stdin)
GIT_INDEX_FILE=$BAD_B_INDEX git -C "$REPO" update-index \
  --cacheinfo "100644,$wrong_blob,ops/deploy/deploy-control-bridge-lib.sh"
bad_b_tree=$(GIT_INDEX_FILE=$BAD_B_INDEX git -C "$REPO" write-tree)
bad_b=$(printf 'test: wrong B blob\n' | git -C "$REPO" commit-tree \
  "$bad_b_tree" -p "$A")
if (PROMOTION_V2_BRIDGE_SHA=$bad_b; PROMOTION_V2_BRIDGE_TREE=$bad_b_tree; \
    GITHUB_WORKSPACE=$REPO verify_post_promotion_v2_target_identity "$M") \
    2>/dev/null; then exit 1; fi
GIT_INDEX_FILE=$BAD_B_INDEX git -C "$REPO" update-index \
  --cacheinfo "100755,$BRIDGE_BLOB,ops/deploy/deploy-control-bridge-lib.sh"
bad_mode_tree=$(GIT_INDEX_FILE=$BAD_B_INDEX git -C "$REPO" write-tree)
bad_mode_b=$(printf 'test: wrong B mode\n' | git -C "$REPO" commit-tree \
  "$bad_mode_tree" -p "$A")
if (PROMOTION_V2_BRIDGE_SHA=$bad_mode_b; \
    PROMOTION_V2_BRIDGE_TREE=$bad_mode_tree; \
    GITHUB_WORKSPACE=$REPO verify_post_promotion_v2_target_identity "$M") \
    2>/dev/null; then exit 1; fi

REPO=$REPO
# shellcheck source=/dev/null
source <(git -C "$REPO" show "$B:ops/deploy/deploy-control-bridge-lib.sh")
deploy_control_reviewed_transition_matches "$B" "$M"
if deploy_control_reviewed_transition_matches "$A" "$M"; then
  echo 'direct A-to-M was admitted' >&2
  exit 1
fi
if deploy_control_reviewed_transition_matches "$B" "$J"; then
  echo 'B-to-J staging deploy was admitted' >&2
  exit 1
fi

prepare_runtime_fixture() {
  local repo=$FIXTURE/runtime/repo root=$FIXTURE/runtime/root
  git -c gc.autoDetach=false clone -q --shared "$REPO" "$repo"
  git -C "$repo" config gc.autoDetach false
  git -C "$repo" checkout -q "$A"
  git -C "$repo" update-ref refs/remotes/origin/main "$M"
  install -d "$root/control/deploy-state" "$root/runtime/deploy-staging" \
    "$root/runtime/frontend-releases" "$root/runtime/systemd"
  printf '%s\n' "$FRONTEND_MARKER" > "$root/control/deploy-state/frontend.sha"
  printf '%s\n' "$A" > "$root/control/deploy-state/backend.sha"
  printf '%s\n' "$A" > "$root/control/deploy-state/control.sha"
  printf '%s\n' "$POOL_MARKER" > \
    "$root/control/deploy-state/postgres-pool-bootstrap.sha"
}

run_actual_controller() (
  set -euo pipefail
  local repo=$1 root=$2 target=$3 expected_head=$4 event_log=$5
  local operation=${6:-deploy} state=$root/control/deploy-state
  [[ $(git -C "$repo" rev-parse HEAD) == "$expected_head" ]]
  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export SOCIAL_MONITOR_DEPLOY_ROOT=$root
  export SOCIAL_MONITOR_DEPLOY_REPO=$repo
  export SOCIAL_MONITOR_DEPLOY_CONTROL=$root/control
  export SOCIAL_MONITOR_DEPLOY_STATE=$state
  export SOCIAL_MONITOR_DEPLOY_STAGING=$root/runtime/deploy-staging
  export SOCIAL_MONITOR_DEPLOY_RELEASES=$root/runtime/frontend-releases
  export SOCIAL_MONITOR_DEPLOY_PROJECT=promotion-v2-controller-fixture
  # shellcheck source=ops/deploy/social-monitor-production-deploy.sh
  source "$repo/ops/deploy/social-monitor-production-deploy.sh"
  [[ $DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD == "$expected_head" ]]
  action=$operation
  postgres_pool_atomic_legacy_state() { return 1; }
  postgres_pool_bootstrap_installed() { return 0; }
  reconcile_current_postgres_pool_bootstrap() { :; }
  reconcile_completed_backend_image_rescues() { :; }
  acquire_postgres_admission_with_daily_priority() { :; }
  fetch_main() { :; }
  validate_main_commit() { [[ $1 == "$target" ]]; }
  reconcile_github_premidnight_capture_runtime_control() {
    printf '%s\n' "$1"
  }
  load_target_rabbitmq_quorum_backend_health() { :; }
  load_target_reader_summary_publication_deploy_library() { :; }
  sync_control_script() {
    local relative
    if [[ $target == "$M" ]]; then
      for relative in production-transition-admission.sh \
        production-transition-b0-host-control.sh \
        production-transition-canonical-lib.sh; do
        [[ -f $CONTROL/$relative && ! -L $CONTROL/$relative ]]
      done
      printf 'b0-installed=%s\n' "$target" >> "$event_log"
    fi
    printf 'sync=%s\n' "$target" >> "$event_log"
  }
  deploy_release_runtime_transaction() {
    printf 'runtime=%s backend=%s runtime_control=%s\n' \
      "$1" "$2" "$3" >> "$event_log"
    [[ $2 == false ]] || printf '%s\n' "$1" > "$state/backend.sha"
  }
  deploy_frontend() {
    printf 'frontend=%s\n' "$1" >> "$event_log"
    printf '%s\n' "$1" > "$state/frontend.sha"
  }
  commit_postgres_pool_bootstrap() {
    printf 'pool=%s\n' "$1" >> "$event_log"
    [[ $1 == "$B" ]] || printf '%s\n' "$1" > \
      "$state/postgres-pool-bootstrap.sha"
  }
  case $operation in
    deploy) deploy_release "$target" ;;
    plan) print_plan "$target" ;;
    *) return 1 ;;
  esac
)

state_digest() {
  find "$1" -maxdepth 1 -type f -name '*.sha' -print0 | \
    LC_ALL=C sort -z | xargs -0 sha256sum
}

prepare_runtime_fixture
runtime_repo=$FIXTURE/runtime/repo
runtime_root=$FIXTURE/runtime/root
runtime_state=$runtime_root/control/deploy-state
runtime_events=$FIXTURE/runtime/events
touch "$runtime_events"

expected_b_plan=$(cat <<EOF
frontend=false
backend=false
backend_base=$A
control=true
x_collector=false
postgres_pool_bootstrap=postgres-pool-v1
postgres_pool_bootstrap_sha=$POOL_MARKER
EOF
)
actual_b_plan=$(run_actual_controller "$runtime_repo" "$runtime_root" \
  "$B" "$A" "$runtime_events" plan)
[[ $actual_b_plan == "$expected_b_plan" ]]

before=$(state_digest "$runtime_state")
if run_actual_controller "$runtime_repo" "$runtime_root" \
    "$M" "$A" "$runtime_events" >/dev/null 2>&1; then
  fail 'the checked-in A controller admitted direct A-to-M'
fi
[[ $(git -C "$runtime_repo" rev-parse HEAD) == "$A" ]]
[[ $(state_digest "$runtime_state") == "$before" ]]
for path in production-transition-admission.sh \
  production-transition-b0-host-control.sh \
  production-transition-canonical-lib.sh; do
  [[ ! -e $runtime_root/control/$path && ! -L $runtime_root/control/$path ]]
done

run_actual_controller "$runtime_repo" "$runtime_root" \
  "$B" "$A" "$runtime_events" >/dev/null
[[ $(git -C "$runtime_repo" rev-parse HEAD) == "$B" ]]
[[ $(<"$runtime_state/frontend.sha") == "$FRONTEND_MARKER" ]]
[[ $(<"$runtime_state/backend.sha") == "$A" ]]
[[ $(<"$runtime_state/control.sha") == "$B" ]]
[[ $(<"$runtime_state/postgres-pool-bootstrap.sha") == "$POOL_MARKER" ]]

before=$(state_digest "$runtime_state")
if run_actual_controller "$runtime_repo" "$runtime_root" \
    "$J" "$B" "$runtime_events" >/dev/null 2>&1; then
  fail 'the fresh B controller admitted B-to-J staging'
fi
[[ $(git -C "$runtime_repo" rev-parse HEAD) == "$B" ]]
[[ $(state_digest "$runtime_state") == "$before" ]]

pending_m_plan=$(run_actual_controller "$runtime_repo" "$runtime_root" \
  "$M" "$B" "$runtime_events" plan)
expected_pending_m_plan=$(cat <<EOF
frontend=true
backend=true
backend_base=$A
control=true
x_collector=false
postgres_pool_bootstrap=postgres-pool-v1
postgres_pool_bootstrap_sha=$POOL_MARKER
EOF
)
[[ $pending_m_plan == "$expected_pending_m_plan" ]]
run_actual_controller "$runtime_repo" "$runtime_root" \
  "$M" "$B" "$runtime_events" >/dev/null
[[ $(git -C "$runtime_repo" rev-parse HEAD) == "$M" ]]
[[ $(<"$runtime_state/backend.sha") == "$M" ]]
[[ $(<"$runtime_state/control.sha") == "$M" ]]
[[ $(<"$runtime_state/postgres-pool-bootstrap.sha") == "$M" ]]
[[ $(git -C "$runtime_repo" rev-parse refs/remotes/origin/main) == "$M" ]]

python3 - "$runtime_events" "$M" <<'PY'
import pathlib, sys
events = pathlib.Path(sys.argv[1]).read_text().splitlines()
target = sys.argv[2]
ordered = [f"b0-installed={target}", f"sync={target}", f"runtime={target} "]
cursor = 0
for item in ordered:
    cursor = next(i + 1 for i in range(cursor, len(events))
                  if events[i].startswith(item))
PY

complete_plan=$(run_actual_controller "$runtime_repo" "$runtime_root" \
  "$M" "$M" "$runtime_events" plan)
expected_complete_plan=$(cat <<EOF
frontend=false
backend=false
backend_base=$M
control=false
x_collector=false
postgres_pool_bootstrap=postgres-pool-v1
postgres_pool_bootstrap_sha=$M
EOF
)
[[ $complete_plan == "$expected_complete_plan" ]]
before=$(state_digest "$runtime_state")
run_actual_controller "$runtime_repo" "$runtime_root" \
  "$M" "$M" "$runtime_events" >/dev/null
[[ $(state_digest "$runtime_state") == "$before" ]]
[[ $(git -C "$runtime_repo" rev-parse HEAD) == "$M" ]]

python3 - "$WORKFLOW" <<'PY'
import pathlib, sys
w = pathlib.Path(sys.argv[1]).read_text()
for forbidden in ("prepare-release-b-bridge",
                  "plan_is_admitted_post_release_b_forward_" + "state",
                  "8b4aeb31e855ed379349a4e4827600009e" + "174132",
                  "b89950632b0cefa4f7b58b687cdfd6e6cd" + "912a04",
                  "05744f99b2d13e47a64a7ff12ea2ab8893" + "f5e88a"):
    if forbidden in w:
        raise SystemExit(f"historical operational fallback remains: {forbidden}")
ordered = [
    'verify-post-promotion-v2-target "$GITHUB_SHA"',
    'prepare-post-promotion-v2-bridge "$RELEASE_B" "$JOIN_SHA" "$TARGET_SHA"',
    "run: bash ops/deploy/github-production-deploy-client.sh cleanup",
    'plan-post-promotion-v2-target "$TARGET_SHA"',
    'run: bash ops/deploy/github-production-deploy-client.sh deploy "$GITHUB_SHA"',
    'accept-post-promotion-v2-target "$GITHUB_SHA"',
]
cursor = 0
for value in ordered:
    cursor = w.index(value, cursor) + len(value)
if w.count("          bash ops/deploy/production-release-b-bridge-order.test.sh") != 1:
    raise SystemExit("nine-file topology fixture must run exactly once")
PY

printf 'Exact nine-file post-promotion V2 H guard tests passed\n'
