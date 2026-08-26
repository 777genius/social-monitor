#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_REPO=${PRODUCTION_RELEASE_B_TEST_SOURCE_REPO:-$PROJECT_ROOT}
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
CLIENT=$PROJECT_ROOT/ops/deploy/github-production-deploy-client.sh
BASE=8b4aeb31e855ed379349a4e4827600009e174132
REJECTED=68d6910f7874be89e2d5418dede5be6129e8af3a
REJECTED_BRIDGE=85c5d22febf1e7ce5fa5967d2460ccb73ca96a9d
BRIDGE=b3c51bcd5e98c90f6a0a384f19e1c811d7f89fb3
BRIDGE_TREE=02e84aebaf70c32a7127efcd08bd76ac9d5b094f
BRIDGE_BLOB=988b9f1c20766fd550c8db2f1c2a553e35275aee
BACKEND_MARKER=09a79687e042e36d4ec9c1f33f0367527f044181
CONTROL_MARKER=3f4a561e9fd6626bbd1a1e1ca73f2ec7eb34c8f8
FRONTEND_MARKER=eaac8ad433bc9741f493e61354b3dfe1c3161224
POOL_MARKER=6fefa9da5446d5e467badcc7239fdc5a6170a756
BRIDGE_PATH=ops/deploy/deploy-control-bridge-lib.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/release-b-bridge-order.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
GRAPH_REPO=$FIXTURE/graph

git clone -q --shared "$SOURCE_REPO" "$GRAPH_REPO"
TARGET=$(git -C "$GRAPH_REPO" rev-parse HEAD)
for commit in "$BASE" "$REJECTED" "$REJECTED_BRIDGE" "$BRIDGE" "$TARGET"; do
  git -C "$GRAPH_REPO" cat-file -e "$commit^{commit}"
done

# The repair is an exact side bridge from the controller that is actually
# installed in production, followed by one target merge of the rejected tree
# and that bridge. The bridge commit changes one regular 0644 blob only.
read -r -a bridge_parents <<< "$(git -C "$GRAPH_REPO" \
  rev-list --parents -n 1 "$BRIDGE")"
[[ ${#bridge_parents[@]} == 2 && \
   ${bridge_parents[0]} == "$BRIDGE" && \
   ${bridge_parents[1]} == "$BASE" ]]
[[ $(git -C "$GRAPH_REPO" rev-parse "$BRIDGE^{tree}") == "$BRIDGE_TREE" ]]
[[ $(git -C "$GRAPH_REPO" diff --name-only --no-renames \
     "$BASE" "$BRIDGE") == "$BRIDGE_PATH" ]]
read -r bridge_mode bridge_type bridge_blob bridge_path <<< "$(
  git -C "$GRAPH_REPO" ls-tree "$BRIDGE" -- "$BRIDGE_PATH"
)"
[[ $bridge_mode == 100644 && $bridge_type == blob && \
   $bridge_blob == "$BRIDGE_BLOB" && $bridge_path == "$BRIDGE_PATH" ]]

read -r -a target_parents <<< "$(git -C "$GRAPH_REPO" \
  rev-list --parents -n 1 "$TARGET")"
[[ ${#target_parents[@]} == 3 && \
   ${target_parents[1]} == "$REJECTED" && \
   ${target_parents[2]} == "$BRIDGE" ]]
git -C "$GRAPH_REPO" merge-base --is-ancestor "$BRIDGE" "$TARGET"
[[ $(git -C "$GRAPH_REPO" rev-parse "$TARGET:$BRIDGE_PATH") == \
   "$BRIDGE_BLOB" ]]

expected_target_delta=$(printf '%s\n' \
  .github/workflows/production-deploy.yml \
  ops/deploy/deploy-control-bridge-lib.sh \
  ops/deploy/github-production-deploy-client.sh \
  ops/deploy/github-production-deploy-client.test.sh \
  ops/deploy/production-release-b-bridge-order.test.sh \
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh | \
  LC_ALL=C sort)
actual_target_delta=$(git -C "$GRAPH_REPO" diff --name-only --no-renames \
  "$REJECTED" "$TARGET" | LC_ALL=C sort)
[[ $actual_target_delta == "$expected_target_delta" ]]
while IFS= read -r path; do
  expected_mode=100644
  case $path in
    ops/deploy/github-production-deploy-client.sh|ops/deploy/github-production-deploy-client.test.sh|ops/deploy/production-release-b-bridge-order.test.sh)
      expected_mode=100755
      ;;
  esac
  entry=$(git -C "$GRAPH_REPO" ls-tree "$TARGET" -- "$path")
  read -r mode type object tree_path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == "$expected_mode" && $type == blob && \
     $object =~ ^[0-9a-f]{40}$ && $tree_path == "$path" ]]
done <<< "$expected_target_delta"

[[ $(grep -Fxc \
  'RELEASE_B_CONTROLLER_SHA=8b4aeb31e855ed379349a4e4827600009e174132' \
  "$CLIENT") == 1 ]]
[[ $(grep -Fxc \
  'RELEASE_B_BRIDGE_SHA=b3c51bcd5e98c90f6a0a384f19e1c811d7f89fb3' \
  "$CLIENT") == 1 ]]
[[ $(grep -Fo \
  'controller_release=8b4aeb31e855ed379349a4e4827600009e174132' \
  "$WORKFLOW" | wc -l) == 1 ]]
[[ $(grep -Fo \
  'bridge_release=b3c51bcd5e98c90f6a0a384f19e1c811d7f89fb3' \
  "$WORKFLOW" | wc -l) == 1 ]]

python3 - "$WORKFLOW" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
commands = [
    'bash "$client" reconcile-release-b-controller "$controller_release" "$bridge_release"',
    'bash "$client" cleanup; bash "$client" configure',
    'bash "$client" install-release-b-bridge "$bridge_release"',
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
  local repo=$FIXTURE/$1/repo root=$FIXTURE/$1/root
  git clone -q --shared "$SOURCE_REPO" "$repo"
  git -C "$repo" checkout -q "$BASE"
  install -d "$root/control/deploy-state" "$root/runtime/deploy-staging" \
    "$root/runtime/frontend-releases" "$root/runtime/systemd"
  printf '%s\n' "$FRONTEND_MARKER" > \
    "$root/control/deploy-state/frontend.sha"
  printf '%s\n' "$BACKEND_MARKER" > \
    "$root/control/deploy-state/backend.sha"
  printf '%s\n' "$CONTROL_MARKER" > \
    "$root/control/deploy-state/control.sha"
  printf '%s\n' "$POOL_MARKER" > \
    "$root/control/deploy-state/postgres-pool-bootstrap.sha"
}

run_actual_controller() (
  set -euo pipefail
  local repo=$1 root=$2 target=$3 expected_head=$4 event_log=$5
  local state=$root/control/deploy-state current_head current_control_blob
  current_head=$(git -C "$repo" rev-parse HEAD)
  current_control_blob=$(git -C "$repo" rev-parse \
    "HEAD:ops/deploy/deploy-control-lib.sh")
  [[ $current_head == "$expected_head" ]]
  printf 'controller=%s control_blob=%s target=%s\n' \
    "$current_head" "$current_control_blob" "$target" >> "$event_log"

  export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
  export SOCIAL_MONITOR_DEPLOY_ROOT=$root
  export SOCIAL_MONITOR_DEPLOY_REPO=$repo
  export SOCIAL_MONITOR_DEPLOY_CONTROL=$root/control
  export SOCIAL_MONITOR_DEPLOY_STATE=$state
  export SOCIAL_MONITOR_DEPLOY_STAGING=$root/runtime/deploy-staging
  export SOCIAL_MONITOR_DEPLOY_RELEASES=$root/runtime/frontend-releases
  export SOCIAL_MONITOR_DEPLOY_PROJECT=release-b-controller-regression
  # shellcheck source=ops/deploy/social-monitor-production-deploy.sh
  source "$repo/ops/deploy/social-monitor-production-deploy.sh"

  [[ $DEPLOY_CONTROL_BRIDGE_INITIALIZED_HEAD == "$expected_head" ]]
  postgres_pool_atomic_legacy_state() { return 1; }
  postgres_pool_bootstrap_installed() { return 0; }
  reconcile_current_postgres_pool_bootstrap() { :; }
  reconcile_completed_backend_image_rescues() { :; }
  acquire_postgres_admission_with_daily_priority() { :; }
  fetch_main() { :; }
  validate_main_commit() {
    [[ $1 == "$target" ]]
    git -C "$repo" cat-file -e "$1^{commit}"
  }
  reconcile_github_premidnight_capture_runtime_control() {
    printf '%s\n' "$1"
  }
  load_target_rabbitmq_quorum_backend_health() { :; }
  load_target_reader_summary_publication_deploy_library() { :; }
  sync_control_script() { :; }
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
    printf '%s\n' "$1" > "$state/postgres-pool-bootstrap.sha"
  }

  deploy_release "$target"
)

# Reproduce the rejected topology with the real 8b4 deploy-control code. The
# ancestor bridge is a server-side no-op, then the rejected target fails before
# integration advancement because the old bridge verifier is still loaded.
prepare_runtime_repo rejected
rejected_repo=$FIXTURE/rejected/repo
rejected_root=$FIXTURE/rejected/root
rejected_events=$FIXTURE/rejected/events
run_actual_controller "$rejected_repo" "$rejected_root" \
  "$REJECTED_BRIDGE" "$BASE" "$rejected_events" >/dev/null
[[ $(git -C "$rejected_repo" rev-parse HEAD) == "$BASE" ]]
set +e
rejected_error=$(run_actual_controller "$rejected_repo" "$rejected_root" \
  "$REJECTED" "$BASE" "$rejected_events" 2>&1)
rejected_status=$?
set -e
((rejected_status != 0))
grep -F 'deploy control changed with backend or runtime assets; deploy the bridge release first' \
  <<< "$rejected_error" >/dev/null
[[ $(git -C "$rejected_repo" rev-parse HEAD) == "$BASE" ]]

# Reconcile the exact old controller first. Its actual deploy-control code then
# admits the direct bridge through the ordinary control-only path. A fresh
# invocation loads the bridge commit's controller and advances the patched
# target once, with backend/frontend identities left unchanged.
prepare_runtime_repo repaired
repaired_repo=$FIXTURE/repaired/repo
repaired_root=$FIXTURE/repaired/root
repaired_state=$repaired_root/control/deploy-state
repaired_events=$FIXTURE/repaired/events
run_actual_controller "$repaired_repo" "$repaired_root" \
  "$BASE" "$BASE" "$repaired_events" >/dev/null
for marker in frontend backend control postgres-pool-bootstrap; do
  [[ $(<"$repaired_state/$marker.sha") == "$BASE" ]]
done
run_actual_controller "$repaired_repo" "$repaired_root" \
  "$BRIDGE" "$BASE" "$repaired_events" >/dev/null
[[ $(git -C "$repaired_repo" rev-parse HEAD) == "$BRIDGE" ]]
[[ $(<"$repaired_state/backend.sha") == "$BASE" ]]
[[ $(<"$repaired_state/frontend.sha") == "$BASE" ]]
[[ $(<"$repaired_state/control.sha") == "$BRIDGE" ]]
run_actual_controller "$repaired_repo" "$repaired_root" \
  "$TARGET" "$BRIDGE" "$repaired_events" >/dev/null
[[ $(git -C "$repaired_repo" rev-parse HEAD) == "$TARGET" ]]
[[ $(<"$repaired_state/backend.sha") == "$BASE" ]]
[[ $(<"$repaired_state/frontend.sha") == "$BASE" ]]
[[ $(<"$repaired_state/control.sha") == "$TARGET" ]]
[[ $(<"$repaired_state/postgres-pool-bootstrap.sha") == "$TARGET" ]]
[[ $(grep -cF "controller=$BASE " "$repaired_events") == 2 ]]
[[ $(grep -cF "controller=$BRIDGE " "$repaired_events") == 1 ]]
