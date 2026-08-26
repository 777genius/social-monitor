#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_REPO=${PRODUCTION_RELEASE_B_TEST_SOURCE_REPO:-$PROJECT_ROOT}
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
CLIENT=$PROJECT_ROOT/ops/deploy/github-production-deploy-client.sh
BASE=8b4aeb31e855ed379349a4e4827600009e174132
CURRENT_MAIN=d7d0fc88e6a7bcd8e9929e35efd74002a7601449
REJECTED=68d6910f7874be89e2d5418dede5be6129e8af3a
REJECTED_BRIDGE=85c5d22febf1e7ce5fa5967d2460ccb73ca96a9d
BRIDGE=db4537fea87a5c184a9f926867a6e6aa763ff9bd
BRIDGE_TREE=f998252edb25e6e2411ddc351806ba8170114c61
BRIDGE_BLOB=70a87f730ff47c1071a7855a1177fd5d1601ee5c
BRIDGE_PATH=ops/deploy/deploy-control-bridge-lib.sh
BACKEND_MARKER=09a79687e042e36d4ec9c1f33f0367527f044181
CONTROL_MARKER=3f4a561e9fd6626bbd1a1e1ca73f2ec7eb34c8f8
FRONTEND_MARKER=eaac8ad433bc9741f493e61354b3dfe1c3161224
POOL_MARKER=6fefa9da5446d5e467badcc7239fdc5a6170a756
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/release-b-current-main.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
GRAPH_REPO=$FIXTURE/graph

git clone -q --shared "$SOURCE_REPO" "$GRAPH_REPO"
git -C "$GRAPH_REPO" config user.name 'Release B Current Main Test'
git -C "$GRAPH_REPO" config user.email release-b-current-main@example.invalid
TARGET=$(git -C "$GRAPH_REPO" rev-parse HEAD)
for commit in "$BASE" "$CURRENT_MAIN" "$REJECTED" "$REJECTED_BRIDGE" \
  "$BRIDGE" "$TARGET"; do
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

# The deploy target is a real current-main integration, not a wrapper around
# the rejected sibling or the approved target's obsolete graph.
read -r -a target_parents <<< "$(git -C "$GRAPH_REPO" \
  rev-list --parents -n 1 "$TARGET")"
[[ ${#target_parents[@]} == 3 && \
   ${target_parents[1]} == "$CURRENT_MAIN" && \
   ${target_parents[2]} == "$BRIDGE" ]]
git -C "$GRAPH_REPO" merge-base --is-ancestor "$CURRENT_MAIN" "$TARGET"
git -C "$GRAPH_REPO" merge-base --is-ancestor "$BRIDGE" "$TARGET"
if git -C "$GRAPH_REPO" merge-base --is-ancestor "$REJECTED" "$TARGET"; then
  echo 'rejected Release B sibling is an ancestor of the candidate' >&2
  exit 1
fi
[[ $(git -C "$GRAPH_REPO" rev-parse "$TARGET:$BRIDGE_PATH") == \
   "$BRIDGE_BLOB" ]]
expected_target_delta=$(printf '%s\n' \
  .github/workflows/production-deploy.yml \
  ops/deploy/deploy-control-bridge-lib.sh \
  ops/deploy/github-production-deploy-client.sh \
  ops/deploy/github-production-deploy-client.test.sh \
  ops/deploy/production-release-b-bridge-order.test.sh \
  ops/ingestion/source-provider-certification.json \
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh | \
  LC_ALL=C sort)
actual_target_delta=$(git -C "$GRAPH_REPO" diff --name-only --no-renames \
  "$CURRENT_MAIN" "$TARGET" | LC_ALL=C sort)
[[ $actual_target_delta == "$expected_target_delta" ]]

# Exercise the bridge acceptance policy against the real graph and negative
# stale/rejected topologies.
REPO=$GRAPH_REPO
fail() { printf 'test-error: %s\n' "$*" >&2; return 1; }
# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$GRAPH_REPO/ops/deploy/deploy-control-bridge-lib.sh"
deploy_control_reviewed_transition_matches "$BRIDGE" "$TARGET"
if deploy_control_reviewed_transition_matches "$REJECTED_BRIDGE" "$REJECTED"; then
  echo 'rejected sibling topology was admitted' >&2
  exit 1
fi
stale_target=$(printf 'test: stale current-main target\n' | git -C "$GRAPH_REPO" \
  commit-tree "$TARGET^{tree}" -p "$BASE" -p "$BRIDGE")
if deploy_control_reviewed_transition_matches "$BRIDGE" "$stale_target"; then
  echo 'stale current-main topology was admitted' >&2
  exit 1
fi
extra_blob=$(printf 'extra target drift\n' | git -C "$GRAPH_REPO" hash-object -w --stdin)
extra_index=$FIXTURE/extra.index
GIT_INDEX_FILE=$extra_index git -C "$GRAPH_REPO" read-tree "$TARGET"
GIT_INDEX_FILE=$extra_index git -C "$GRAPH_REPO" update-index \
  --add --cacheinfo "100644,$extra_blob,unreviewed-release-b-drift"
extra_tree=$(GIT_INDEX_FILE=$extra_index git -C "$GRAPH_REPO" write-tree)
extra_target=$(printf 'test: extra path target\n' | git -C "$GRAPH_REPO" \
  commit-tree "$extra_tree" -p "$CURRENT_MAIN" -p "$BRIDGE")
if deploy_control_reviewed_transition_matches "$BRIDGE" "$extra_target"; then
  echo 'extra-path current-main topology was admitted' >&2
  exit 1
fi

for exact_pin in \
  "RELEASE_B_CONTROLLER_SHA=$BASE" \
  "RELEASE_B_CURRENT_MAIN_SHA=$CURRENT_MAIN" \
  "RELEASE_B_BRIDGE_SHA=$BRIDGE" \
  "RELEASE_B_BRIDGE_TREE=$BRIDGE_TREE" \
  "RELEASE_B_BRIDGE_BLOB=$BRIDGE_BLOB"; do
  grep -Fqx "$exact_pin" "$CLIENT"
done
[[ $(grep -Fo "controller_release=$BASE" "$WORKFLOW" | wc -l) == 1 ]]
[[ $(grep -Fo "current_main=$CURRENT_MAIN" "$WORKFLOW" | wc -l) == 1 ]]
[[ $(grep -Fo "bridge_release=$BRIDGE" "$WORKFLOW" | wc -l) == 1 ]]

python3 - "$WORKFLOW" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
commands = [
    'bash "$client" prepare-release-b-bridge "$controller_release" "$bridge_release" "$current_main" "$GITHUB_SHA"',
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
  git clone -q --shared "$SOURCE_REPO" "$repo"
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
  local state=$root/control/deploy-state
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
)

# The real old controller rejects the obsolete sibling after its old bridge.
prepare_runtime_repo rejected "$BASE"
rejected_repo=$FIXTURE/rejected/repo
rejected_root=$FIXTURE/rejected/root
run_actual_controller "$rejected_repo" "$rejected_root" \
  "$REJECTED_BRIDGE" "$BASE" "$FIXTURE/rejected/events" >/dev/null
set +e
rejected_error=$(run_actual_controller "$rejected_repo" "$rejected_root" \
  "$REJECTED" "$BASE" "$FIXTURE/rejected/events" 2>&1)
rejected_status=$?
set -e
((rejected_status != 0))
grep -F 'deploy control changed with backend or runtime assets; deploy the bridge release first' \
  <<< "$rejected_error" >/dev/null
[[ $(git -C "$rejected_repo" rev-parse HEAD) == "$BASE" ]]

# Real 8b4 controller -> exact bridge -> current-main-descendant target.
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
  "$TARGET" "$BRIDGE" "$repaired_events" >/dev/null
[[ $(git -C "$repaired_repo" rev-parse HEAD) == "$TARGET" ]]
[[ $(<"$repaired_state/backend.sha") == "$TARGET" ]]
[[ $(<"$repaired_state/frontend.sha") == "$BASE" ]]
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
  "$TARGET" "$CURRENT_MAIN" "$FIXTURE/advanced/events" >/dev/null
[[ $(git -C "$advanced_repo" rev-parse HEAD) == "$TARGET" ]]
[[ $(<"$advanced_state/backend.sha") == "$CURRENT_MAIN" ]]
[[ $(<"$advanced_state/frontend.sha") == "$CURRENT_MAIN" ]]
[[ $(<"$advanced_state/control.sha") == "$TARGET" ]]

printf 'Production Release B current-main topology tests passed\n'
