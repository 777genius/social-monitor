#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_REPO=${PRODUCTION_RELEASE_B_TEST_SOURCE_REPO:-$PROJECT_ROOT}
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
CLIENT=$PROJECT_ROOT/ops/deploy/github-production-deploy-client.sh
BASE=8b4aeb31e855ed379349a4e4827600009e174132
CURRENT_MAIN=77313ea03a3bac7d2298f4021d58124c810d291f
OLD_CURRENT_MAIN=d7d0fc88e6a7bcd8e9929e35efd74002a7601449
OLD_BRIDGE=db4537fea87a5c184a9f926867a6e6aa763ff9bd
OLD_TARGET=bce12683c9309e037614f4808a0fc75caddc9864
BRIDGE=b89950632b0cefa4f7b58b687cdfd6e6cd912a04
BRIDGE_TREE=0f2edeb95bbb658cebdb1aecdcda24026eca7d19
BRIDGE_BLOB=e02f7b7684f75121521065b43148708d545ab806
BRIDGE_TARGET=05744f99b2d13e47a64a7ff12ea2ab8893f5e88a
BRIDGE_TARGET_TREE=237c34068c057d2dfb5efaf9d606028cdaf18525
CANONICAL_RELEASE_B2=e3b5b5d89b3586668e36f987f03672415b5a0f37
REVIEW_PARENT=187335ca1881c0974218560d6147a21bcad8aa0c
BRIDGE_PATH=ops/deploy/deploy-control-bridge-lib.sh
BACKEND_MARKER=09a79687e042e36d4ec9c1f33f0367527f044181
CONTROL_MARKER=3f4a561e9fd6626bbd1a1e1ca73f2ec7eb34c8f8
FRONTEND_MARKER=eaac8ad433bc9741f493e61354b3dfe1c3161224
POOL_MARKER=6fefa9da5446d5e467badcc7239fdc5a6170a756
FIXTURE_TEMP_PARENT=$(cd "${TMPDIR:-/tmp}" && pwd -P)
FIXTURE=$(mktemp -d "$FIXTURE_TEMP_PARENT/release-b-current-main.XXXXXX")
declare -a FIXTURE_CHILD_PIDS=() FIXTURE_CHILD_GROUPS=()
declare -a FIXTURE_CHILD_LABELS=()

register_fixture_child() {
  local pid=$1 group=$2 label=$3
  [[ $pid =~ ^[1-9][0-9]*$ && $group =~ ^[1-9][0-9]*$ ]] || {
    printf 'fixture-cleanup-error: invalid child identity for %s\n' "$label" >&2
    return 1
  }
  FIXTURE_CHILD_PIDS+=("$pid")
  FIXTURE_CHILD_GROUPS+=("$group")
  FIXTURE_CHILD_LABELS+=("$label")
}

wait_for_fixture_children() {
  local index pid group label child_status deadline
  for index in "${!FIXTURE_CHILD_PIDS[@]}"; do
    pid=${FIXTURE_CHILD_PIDS[$index]}
    group=${FIXTURE_CHILD_GROUPS[$index]}
    label=${FIXTURE_CHILD_LABELS[$index]}
    if ! timeout 10 tail --pid="$pid" -f /dev/null; then
      printf 'fixture-cleanup-error: timed out waiting for %s (pid=%s pgid=%s)\n' \
        "$label" "$pid" "$group" >&2
      return 1
    fi
    if wait "$pid"; then
      child_status=0
    else
      child_status=$?
    fi
    if ((child_status != 0)); then
      printf 'fixture-cleanup-error: %s exited with status %s (pid=%s pgid=%s)\n' \
        "$label" "$child_status" "$pid" "$group" >&2
      return 1
    fi
    deadline=$((SECONDS + 10))
    while kill -0 -- "-$group" 2>/dev/null; do
      if ((SECONDS >= deadline)); then
        printf 'fixture-cleanup-error: timed out waiting for %s process group %s\n' \
          "$label" "$group" >&2
        return 1
      fi
      sleep 0.1
    done
  done
  FIXTURE_CHILD_PIDS=()
  FIXTURE_CHILD_GROUPS=()
  FIXTURE_CHILD_LABELS=()
}

remove_fixture_tree() {
  local fixture=$1 prefix=$2 parent base
  parent=$(dirname "$fixture")
  base=$(basename "$fixture")
  [[ $parent == "$FIXTURE_TEMP_PARENT" && -d $fixture && ! -L $fixture ]] || {
    printf 'fixture-cleanup-error: refusing unvalidated fixture path: %s\n' \
      "$fixture" >&2
    return 1
  }
  case "$base" in
    "$prefix".[[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]][[:alnum:]]) ;;
    *)
      printf 'fixture-cleanup-error: refusing unexpected fixture name: %s\n' \
        "$fixture" >&2
      return 1
      ;;
  esac
  rm -rf -- "$fixture" || {
    printf 'fixture-cleanup-error: could not remove fixture tree: %s\n' \
      "$fixture" >&2
    return 1
  }
  [[ ! -e $fixture && ! -L $fixture ]] || {
    printf 'fixture-cleanup-error: fixture tree still exists after removal: %s\n' \
      "$fixture" >&2
    return 1
  }
}

cleanup_fixture() {
  local test_status=$? cleanup_status=0
  trap - EXIT
  wait_for_fixture_children || cleanup_status=$?
  if ((cleanup_status == 0)); then
    remove_fixture_tree "$FIXTURE" release-b-current-main || cleanup_status=$?
  else
    printf 'fixture-cleanup-error: retaining fixture after child failure: %s\n' \
      "$FIXTURE" >&2
  fi
  if ((test_status == 0 && cleanup_status != 0)); then
    test_status=$cleanup_status
  fi
  exit "$test_status"
}

configure_fixture_repository() {
  local repository=$1
  # Fast-forward merges run automatic maintenance. Keep its GC attached so the
  # owning Git process cannot return while a detached writer still uses repo.
  git -C "$repository" config gc.autoDetach false
  [[ $(git -C "$repository" config --bool gc.autoDetach) == false ]]
}

exercise_fixture_cleanup_race() {
  local race_fixture completion child_pid
  race_fixture=$(mktemp -d \
    "$FIXTURE_TEMP_PARENT/release-b-cleanup-race.XXXXXX")
  completion=$FIXTURE/cleanup-race-child-complete
  # The group leader exits before its delayed writer. Removing first recreates
  # the old race deterministically; group-aware cleanup waits, then removes.
  # shellcheck disable=SC2016 # Positional parameters expand in the child shell.
  setsid bash -c '
    (
      sleep 0.1
      install -d "$1/repo"
      printf "%s\n" complete > "$1/repo/maintenance-complete"
      : > "$2"
    ) &
  ' release-b-cleanup-child "$race_fixture" "$completion" &
  child_pid=$!
  register_fixture_child "$child_pid" "$child_pid" \
    'deterministic concurrent fixture mutator'
  wait_for_fixture_children
  remove_fixture_tree "$race_fixture" release-b-cleanup-race
  [[ -f $completion && ! -e $race_fixture && ! -L $race_fixture ]]
}

trap cleanup_fixture EXIT
exercise_fixture_cleanup_race
GRAPH_REPO=$FIXTURE/graph

TARGET=$(git -C "$SOURCE_REPO" rev-parse HEAD)
git -c gc.autoDetach=false clone -q --shared "$SOURCE_REPO" "$GRAPH_REPO"
configure_fixture_repository "$GRAPH_REPO"
git -C "$GRAPH_REPO" config user.name 'Release B Current Main Test'
git -C "$GRAPH_REPO" config user.email release-b-current-main@example.invalid
for commit in "$BASE" "$CURRENT_MAIN" "$OLD_CURRENT_MAIN" "$OLD_BRIDGE" \
  "$OLD_TARGET" "$BRIDGE" "$BRIDGE_TARGET" "$CANONICAL_RELEASE_B2" "$TARGET"; do
  git -C "$GRAPH_REPO" cat-file -e "$commit^{commit}"
done

# The bridge is one immutable policy blob directly on the old controller.
read -r -a bridge_parents <<< "$(git -C "$GRAPH_REPO" \
  rev-list --parents -n 1 "$BRIDGE")"
[[ ${#bridge_parents[@]} == 2 && ${bridge_parents[0]} == "$BRIDGE" && \
   ${bridge_parents[1]} == "$BASE" ]]
[[ $(git -C "$GRAPH_REPO" rev-parse "$BRIDGE^{tree}") == "$BRIDGE_TREE" ]]
[[ $(git -C "$GRAPH_REPO" diff --name-only --no-renames \
     "$BASE" "$BRIDGE") == "$BRIDGE_PATH" ]]
read -r bridge_mode bridge_type bridge_blob bridge_path bridge_extra <<< "$(
  git -C "$GRAPH_REPO" ls-tree "$BRIDGE" -- "$BRIDGE_PATH"
)"
[[ -z ${bridge_extra:-} && $bridge_mode == 100644 && \
   $bridge_type == blob && $bridge_blob == "$BRIDGE_BLOB" && \
   $bridge_path == "$BRIDGE_PATH" ]]

# The bridge target is the exact cleanup-preserving two-parent integration.
read -r -a target_parents <<< "$(git -C "$GRAPH_REPO" \
  rev-list --parents -n 1 "$BRIDGE_TARGET")"
[[ ${#target_parents[@]} == 3 && ${target_parents[0]} == "$BRIDGE_TARGET" && \
   ${target_parents[1]} == "$CURRENT_MAIN" && \
   ${target_parents[2]} == "$BRIDGE" ]]
[[ $(git -C "$GRAPH_REPO" rev-parse "$BRIDGE_TARGET^{tree}") == \
   "$BRIDGE_TARGET_TREE" ]]
git -C "$GRAPH_REPO" merge-base --is-ancestor "$CURRENT_MAIN" "$BRIDGE_TARGET"
git -C "$GRAPH_REPO" merge-base --is-ancestor "$BRIDGE" "$BRIDGE_TARGET"
git -C "$GRAPH_REPO" rev-list --first-parent "$BRIDGE_TARGET" | \
  grep -Fx "$CANONICAL_RELEASE_B2" >/dev/null
[[ $(git -C "$GRAPH_REPO" rev-parse "$BRIDGE_TARGET:$BRIDGE_PATH") == \
   "$BRIDGE_BLOB" ]]
expected_target_delta=$(printf '%s\n' \
  .github/workflows/production-deploy.yml \
  ops/deploy/deploy-control-bridge-lib.sh \
  ops/deploy/github-production-deploy-client.sh \
  ops/deploy/github-production-deploy-client.test.sh \
  ops/deploy/production-release-b-bridge-order.test.sh \
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh | LC_ALL=C sort)
actual_target_delta=$(git -C "$GRAPH_REPO" diff --name-only --no-renames \
  "$CURRENT_MAIN" "$BRIDGE_TARGET" | LC_ALL=C sort)
[[ $actual_target_delta == "$expected_target_delta" ]]
inherited_path=ops/ingestion/source-provider-certification.json
[[ $(git -C "$GRAPH_REPO" rev-parse "$CURRENT_MAIN:$inherited_path") == \
   $(git -C "$GRAPH_REPO" rev-parse "$BRIDGE_TARGET:$inherited_path") ]]

# The requested target is distinct and must retain the reviewed target on its
# first-parent history; its later ordinary-controller delta is not bridge policy.
git -C "$GRAPH_REPO" rev-list --first-parent "$TARGET" | \
  grep -Fx "$BRIDGE_TARGET" >/dev/null
expected_review_delta=$(printf '%s\n' \
  .github/workflows/production-deploy.yml \
  .github/workflows/pull-request.yml \
  ops/deploy/github-production-deploy-client.test.sh \
  ops/deploy/production-deploy-shell-files.sh \
  ops/deploy/production-deploy-shell-files.test.sh \
  ops/deploy/production-release-b-bridge-order.test.sh \
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh | LC_ALL=C sort)
actual_review_delta=$(git -C "$GRAPH_REPO" diff --name-only --no-renames \
  "$REVIEW_PARENT" "$TARGET" | LC_ALL=C sort)
[[ $actual_review_delta == "$expected_review_delta" ]]

# Exercise the bridge acceptance policy against the real graph and negative
# stale/rejected topologies.
REPO=$GRAPH_REPO
# shellcheck disable=SC2317 # Called indirectly by sourced deploy helpers.
fail() { printf 'test-error: %s\n' "$*" >&2; return 1; }
# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$GRAPH_REPO/ops/deploy/deploy-control-bridge-lib.sh"
deploy_control_reviewed_transition_matches "$BRIDGE" "$BRIDGE_TARGET"
if deploy_control_reviewed_transition_matches "$OLD_BRIDGE" "$OLD_TARGET"; then
  echo 'obsolete bce/db topology was admitted by the new bridge' >&2
  exit 1
fi
if deploy_control_reviewed_transition_matches "$OLD_BRIDGE" "$BRIDGE_TARGET"; then
  echo 'obsolete bridge was admitted for the new target' >&2
  exit 1
fi
if deploy_control_reviewed_transition_matches "$BRIDGE" "$CURRENT_MAIN"; then
  echo 'direct current-main commit was admitted as the new target' >&2
  exit 1
fi
swapped_target=$(printf 'test: swapped Release B parents\n' | \
  git -C "$GRAPH_REPO" commit-tree "$BRIDGE_TARGET^{tree}" \
    -p "$BRIDGE" -p "$CURRENT_MAIN")
if deploy_control_reviewed_transition_matches "$BRIDGE" "$swapped_target"; then
  echo 'swapped target parents were admitted' >&2
  exit 1
fi
wrapper_target=$(printf 'test: wrapped Release B target\n' | \
  git -C "$GRAPH_REPO" commit-tree "$BRIDGE_TARGET^{tree}" -p "$BRIDGE_TARGET")
if deploy_control_reviewed_transition_matches "$BRIDGE" "$wrapper_target"; then
  echo 'wrapper target was admitted' >&2
  exit 1
fi
extra_blob=$(printf 'extra target drift\n' | git -C "$GRAPH_REPO" hash-object -w --stdin)
extra_index=$FIXTURE/extra.index
GIT_INDEX_FILE=$extra_index git -C "$GRAPH_REPO" read-tree "$BRIDGE_TARGET"
GIT_INDEX_FILE=$extra_index git -C "$GRAPH_REPO" update-index \
  --add --cacheinfo "100644,$extra_blob,unreviewed-release-b-drift"
extra_tree=$(GIT_INDEX_FILE=$extra_index git -C "$GRAPH_REPO" write-tree)
extra_target=$(printf 'test: extra path target\n' | git -C "$GRAPH_REPO" \
  commit-tree "$extra_tree" -p "$CURRENT_MAIN" -p "$BRIDGE")
if deploy_control_reviewed_transition_matches "$BRIDGE" "$extra_target"; then
  echo 'extra-path current-main topology was admitted' >&2
  exit 1
fi
drift_blob=$(printf 'allowlisted byte drift\n' | \
  git -C "$GRAPH_REPO" hash-object -w --stdin)
drift_index=$FIXTURE/drift.index
GIT_INDEX_FILE=$drift_index git -C "$GRAPH_REPO" read-tree "$BRIDGE_TARGET"
GIT_INDEX_FILE=$drift_index git -C "$GRAPH_REPO" update-index --cacheinfo \
  "100644,$drift_blob,.github/workflows/production-deploy.yml"
drift_tree=$(GIT_INDEX_FILE=$drift_index git -C "$GRAPH_REPO" write-tree)
drift_target=$(printf 'test: allowlisted target byte drift\n' | \
  git -C "$GRAPH_REPO" commit-tree "$drift_tree" \
    -p "$CURRENT_MAIN" -p "$BRIDGE")

# The client independently pins the reviewed target and rejects requested
# commits that contain it only through a side parent.
DEPLOY_SSH_DIRECTORY=$FIXTURE/client-ssh
# shellcheck source=ops/deploy/github-production-deploy-client.sh
source "$CLIENT"
GITHUB_WORKSPACE=$GRAPH_REPO verify_release_b_reviewed_target_identity \
  "$BRIDGE_TARGET" "$BRIDGE_TARGET"
GITHUB_WORKSPACE=$GRAPH_REPO verify_release_b_reviewed_target_identity \
  "$BRIDGE_TARGET" "$TARGET"
if (GITHUB_WORKSPACE=$GRAPH_REPO verify_release_b_reviewed_target_identity \
    "$drift_target" "$TARGET") 2>/dev/null; then
  echo 'allowlisted-byte drift was admitted' >&2
  exit 1
fi
side_parent_target=$(printf 'test: side-parent-only requested target\n' | \
  git -C "$GRAPH_REPO" commit-tree "$BRIDGE_TARGET^{tree}" \
    -p "$CURRENT_MAIN" -p "$BRIDGE_TARGET")
if (GITHUB_WORKSPACE=$GRAPH_REPO verify_release_b_reviewed_target_identity \
    "$BRIDGE_TARGET" "$side_parent_target") 2>/dev/null; then
  echo 'side-parent-only requested target was admitted' >&2
  exit 1
fi
if (GITHUB_WORKSPACE=$GRAPH_REPO verify_release_b_reviewed_target_identity \
    "$BRIDGE_TARGET" "$CURRENT_MAIN") 2>/dev/null; then
  echo 'requested sibling of the reviewed target was admitted' >&2
  exit 1
fi

for exact_pin in \
  "RELEASE_B_CONTROLLER_SHA=$BASE" \
  "RELEASE_B_CURRENT_MAIN_SHA=$CURRENT_MAIN" \
  "RELEASE_B_BRIDGE_SHA=$BRIDGE" \
  "RELEASE_B_BRIDGE_TREE=$BRIDGE_TREE" \
  "RELEASE_B_BRIDGE_BLOB=$BRIDGE_BLOB" \
  "RELEASE_B_REVIEWED_TARGET_SHA=$BRIDGE_TARGET" \
  "RELEASE_B_REVIEWED_TARGET_TREE=$BRIDGE_TARGET_TREE"; do
  grep -Fqx "$exact_pin" "$CLIENT"
done
[[ $(grep -Fo "controller_release=$BASE" "$WORKFLOW" | wc -l) == 1 ]]
[[ $(grep -Fo "current_main=$CURRENT_MAIN" "$WORKFLOW" | wc -l) == 1 ]]
[[ $(grep -Fo "bridge_release=$BRIDGE" "$WORKFLOW" | wc -l) == 1 ]]
[[ $(grep -Fo "bridge_target=$BRIDGE_TARGET" "$WORKFLOW" | wc -l) == 1 ]]

python3 - "$WORKFLOW" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
local_gate = 'run: bash ops/deploy/github-production-deploy-client.sh verify-release-b-target "$GITHUB_SHA"'
if workflow.count(local_gate) != 2:
    raise SystemExit("local Release B identity gate must cover both workflow roots")

def job(name, next_name):
    start = workflow.index(f"  {name}:\n")
    end = workflow.index(f"  {next_name}:\n", start)
    return workflow[start:end]

for root_name, next_name in (("production_maintenance", "plan"),
                             ("plan", "verify_reader_summary_publication")):
    root = job(root_name, next_name)
    if root.count(local_gate) != 1:
        raise SystemExit(f"{root_name} must execute exactly one local identity gate")
    configure = "run: bash ops/deploy/github-production-deploy-client.sh configure"
    if root.index(local_gate) > root.index(configure):
        raise SystemExit(f"{root_name} contacts production before identity verification")

release_a = job("release_a", "deploy")
if "      - plan\n" not in release_a:
    raise SystemExit("Release A production mutation is not gated by the verified plan job")
commands = [
    'bash "$client" prepare-release-b-bridge "$controller_release" "$bridge_release" "$current_main" "$bridge_target" "$GITHUB_SHA"',
    'bash "$client" cleanup; bash "$client" configure',
    'inspect-plan "$GITHUB_SHA"',
    'bash ops/deploy/github-production-deploy-client.sh deploy "$GITHUB_SHA"',
]
cursor = 0
for command in commands:
    cursor = workflow.index(command, cursor) + len(command)
test_command = "          bash ops/deploy/production-release-b-bridge-order.test.sh"
if workflow.count(test_command) != 1:
    raise SystemExit("Release B topology regression is not executed exactly once")
if workflow.index(test_command) < workflow.index("shellcheck -S warning -x"):
    raise SystemExit("Release B topology regression appears only in static checks")
PY

prepare_runtime_repo() {
  local label=$1 head=$2
  local repo=$FIXTURE/$label/repo root=$FIXTURE/$label/root
  git -c gc.autoDetach=false clone -q --shared "$SOURCE_REPO" "$repo"
  configure_fixture_repository "$repo"
  git -C "$repo" checkout -q "$head"
  install -d "$root/control/deploy-state" "$root/runtime/deploy-staging" \
    "$root/runtime/frontend-releases" "$root/runtime/systemd"
  printf '%s\n' "$FRONTEND_MARKER" > \
    "$root/control/deploy-state/frontend.sha"
  printf '%s\n' "$BACKEND_MARKER" > "$root/control/deploy-state/backend.sha"
  printf '%s\n' "$CONTROL_MARKER" > "$root/control/deploy-state/control.sha"
  printf '%s\n' "$POOL_MARKER" > \
    "$root/control/deploy-state/postgres-pool-bootstrap.sha"
}

run_actual_controller() (
  set -euo pipefail
  local repo=$1 root=$2 target=$3 expected_head=$4 event_log=$5
  local expected_frontend_change=${6:-}
  local expected_backend_change=${7:-}
  local state=$root/control/deploy-state
  local starting_frontend expected_frontend expected_backend expected_control
  [[ $(git -C "$repo" rev-parse HEAD) == "$expected_head" ]]
  printf 'controller=%s target=%s\n' "$expected_head" "$target" >> "$event_log"
  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export SOCIAL_MONITOR_DEPLOY_ROOT=$root
  export SOCIAL_MONITOR_DEPLOY_REPO=$repo
  export SOCIAL_MONITOR_DEPLOY_CONTROL=$root/control
  export SOCIAL_MONITOR_DEPLOY_STATE=$state
  export SOCIAL_MONITOR_DEPLOY_STAGING=$root/runtime/deploy-staging
  export SOCIAL_MONITOR_DEPLOY_RELEASES=$root/runtime/frontend-releases
  export SOCIAL_MONITOR_DEPLOY_PROJECT=release-b-current-main-test
  # shellcheck source=ops/deploy/social-monitor-production-deploy.sh
  source "$repo/ops/deploy/social-monitor-production-deploy.sh"
  [[ $DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD == "$expected_head" ]]
  expected_component_marker() {
    local component=$1 requested_target=$2 starting_marker
    shift 2
    starting_marker=$(marker_value "$component")
    if component_changed "$component" "$requested_target" "$@"; then
      printf '%s\n' "$requested_target"
    else
      printf '%s\n' "$starting_marker"
    fi
  }
  starting_frontend=$(marker_value frontend)
  expected_frontend=$(expected_component_marker \
    frontend "$target" "${FRONTEND_PATHS[@]}")
  expected_backend=$(expected_component_marker \
    backend "$target" "${BACKEND_PATHS[@]}")
  expected_control=$(expected_component_marker \
    control "$target" "${CONTROL_PATHS[@]}")
  case $expected_frontend_change in
    true) [[ $expected_frontend == "$target" && $starting_frontend != "$target" ]] ;;
    false) [[ $expected_frontend == "$starting_frontend" ]] ;;
    '') ;;
    *) fail 'test frontend marker expectation is invalid' ;;
  esac
  case $expected_backend_change in
    true) [[ $expected_backend == "$target" ]] ;;
    false) [[ $expected_backend == "$(marker_value backend)" ]] ;;
    '') ;;
    *) fail 'test backend marker expectation is invalid' ;;
  esac
  postgres_pool_atomic_legacy_state() { return 1; }
  postgres_pool_bootstrap_installed() { return 0; }
  reconcile_current_postgres_pool_bootstrap() { :; }
  reconcile_completed_backend_image_rescues() { :; }
  acquire_postgres_admission_with_daily_priority() { :; }
  fetch_main() { :; }
  validate_main_commit() { [[ $1 == "$target" ]]; }
  reconcile_github_premidnight_capture_runtime_control() { printf '%s\n' "$1"; }
  load_target_rabbitmq_quorum_backend_health() { :; }
  load_target_reader_summary_publication_deploy_library() { :; }
  sync_control_script() { :; }
  deploy_release_runtime_transaction() {
    printf 'runtime=%s backend=%s runtime_control=%s\n' \
      "$1" "$2" "$3" >> "$event_log"
    [[ $2 == false ]] || printf '%s\n' "$1" > "$state/backend.sha"
  }
  deploy_frontend() { printf '%s\n' "$1" > "$state/frontend.sha"; }
  commit_postgres_pool_bootstrap() {
    printf '%s\n' "$1" > "$state/postgres-pool-bootstrap.sha"
  }
  deploy_release "$target"
  [[ $(marker_value frontend) == "$expected_frontend" ]]
  [[ $(marker_value backend) == "$expected_backend" ]]
  [[ $(marker_value control) == "$expected_control" ]]
  [[ $(marker_value postgres-pool-bootstrap) == "$target" ]]
)

assert_review_patch_component_classification() (
  set -euo pipefail
  local root=$FIXTURE/review-classification/root
  local state=$root/control/deploy-state
  install -d "$state" "$root/runtime/deploy-staging" \
    "$root/runtime/frontend-releases"
  for component in frontend backend control; do
    printf '%s\n' "$REVIEW_PARENT" > "$state/$component.sha"
  done
  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export SOCIAL_MONITOR_DEPLOY_ROOT=$root
  export SOCIAL_MONITOR_DEPLOY_REPO=$GRAPH_REPO
  export SOCIAL_MONITOR_DEPLOY_CONTROL=$root/control
  export SOCIAL_MONITOR_DEPLOY_STATE=$state
  export SOCIAL_MONITOR_DEPLOY_STAGING=$root/runtime/deploy-staging
  export SOCIAL_MONITOR_DEPLOY_RELEASES=$root/runtime/frontend-releases
  export SOCIAL_MONITOR_DEPLOY_PROJECT=release-b-review-classification-test
  # shellcheck source=ops/deploy/social-monitor-production-deploy.sh
  source "$GRAPH_REPO/ops/deploy/social-monitor-production-deploy.sh"
  if component_changed frontend "$TARGET" "${FRONTEND_PATHS[@]}"; then
    fail 'final review patch was frontend classified'
  fi
  if component_changed backend "$TARGET" "${BACKEND_PATHS[@]}"; then
    fail 'final review patch was backend classified'
  fi
  component_changed control "$TARGET" "${CONTROL_PATHS[@]}" ||
    fail 'final review patch was not control classified'
)

assert_review_patch_component_classification

# The obsolete bridge can still serve only its historical target; it cannot be
# used as the operational bridge for this new graph.
prepare_runtime_repo obsolete "$OLD_BRIDGE"
obsolete_repo=$FIXTURE/obsolete/repo
obsolete_root=$FIXTURE/obsolete/root
set +e
obsolete_error=$(run_actual_controller "$obsolete_repo" "$obsolete_root" \
  "$TARGET" "$OLD_BRIDGE" "$FIXTURE/obsolete/events" 2>&1)
obsolete_status=$?
set -e
((obsolete_status != 0))
grep -F 'deploy control changed with backend or runtime assets; deploy the bridge release first' \
  <<< "$obsolete_error" >/dev/null
[[ $(git -C "$obsolete_repo" rev-parse HEAD) == "$OLD_BRIDGE" ]]

# Real 8b4 controller -> exact bridge -> reviewed target -> requested target.
prepare_runtime_repo repaired "$BASE"
repaired_repo=$FIXTURE/repaired/repo
repaired_root=$FIXTURE/repaired/root
repaired_state=$repaired_root/control/deploy-state
repaired_events=$FIXTURE/repaired/events
run_actual_controller "$repaired_repo" "$repaired_root" \
  "$BASE" "$BASE" "$repaired_events" >/dev/null
for component in frontend backend control postgres-pool-bootstrap; do
  [[ $(<"$repaired_state/$component.sha") == "$BASE" ]]
done
run_actual_controller "$repaired_repo" "$repaired_root" \
  "$BRIDGE" "$BASE" "$repaired_events" >/dev/null
[[ $(git -C "$repaired_repo" rev-parse HEAD) == "$BRIDGE" ]]
[[ $(<"$repaired_state/backend.sha") == "$BASE" ]]
[[ $(<"$repaired_state/frontend.sha") == "$BASE" ]]
run_actual_controller "$repaired_repo" "$repaired_root" \
  "$BRIDGE_TARGET" "$BRIDGE" "$repaired_events" false >/dev/null
[[ $(git -C "$repaired_repo" rev-parse HEAD) == "$BRIDGE_TARGET" ]]
# The reviewed target has no frontend delta from the exact starting marker;
# run_actual_controller derives and verifies that the marker does not advance.
run_actual_controller "$repaired_repo" "$repaired_root" \
  "$TARGET" "$BRIDGE_TARGET" "$repaired_events" true false >/dev/null
[[ $(git -C "$repaired_repo" rev-parse HEAD) == "$TARGET" ]]
[[ $(<"$repaired_state/backend.sha") == "$BRIDGE_TARGET" ]]
[[ $(<"$repaired_state/control.sha") == "$TARGET" ]]
[[ $(<"$repaired_state/postgres-pool-bootstrap.sha") == "$TARGET" ]]

# If the host already reached current main, the same target is a direct
# control-only fast-forward and does not need the side bridge installed.
prepare_runtime_repo advanced "$CURRENT_MAIN"
advanced_repo=$FIXTURE/advanced/repo
advanced_root=$FIXTURE/advanced/root
advanced_state=$advanced_root/control/deploy-state
for component in frontend backend control postgres-pool-bootstrap; do
  printf '%s\n' "$CURRENT_MAIN" > "$advanced_state/$component.sha"
done
run_actual_controller "$advanced_repo" "$advanced_root" \
  "$BRIDGE_TARGET" "$CURRENT_MAIN" "$FIXTURE/advanced/events" false >/dev/null
[[ $(git -C "$advanced_repo" rev-parse HEAD) == "$BRIDGE_TARGET" ]]
# The descendant has a real frontend delta from the reviewed target;
# run_actual_controller derives and verifies that the marker advances.
run_actual_controller "$advanced_repo" "$advanced_root" \
  "$TARGET" "$BRIDGE_TARGET" "$FIXTURE/advanced/events" true false >/dev/null
[[ $(git -C "$advanced_repo" rev-parse HEAD) == "$TARGET" ]]
[[ $(<"$advanced_state/backend.sha") == "$CURRENT_MAIN" ]]
[[ $(<"$advanced_state/control.sha") == "$TARGET" ]]
[[ $(<"$advanced_state/postgres-pool-bootstrap.sha") == "$TARGET" ]]

printf 'Production Release B exact cleanup-preserving topology tests passed\n'
