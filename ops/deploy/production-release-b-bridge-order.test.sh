#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_REPO=${PRODUCTION_RELEASE_B_TEST_SOURCE_REPO:-$PROJECT_ROOT}
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
BASE=72e17ded1e54ebd77772929fd5047ef6816dded2
FAILED_RELEASE=92afd97328c5412324c99be635de2c41db589d53
BRIDGE=85c5d22febf1e7ce5fa5967d2460ccb73ca96a9d
BACKEND_MARKER=09a79687e042e36d4ec9c1f33f0367527f044181
CONTROL_MARKER=3f4a561e9fd6626bbd1a1e1ca73f2ec7eb34c8f8
FRONTEND_MARKER=eaac8ad433bc9741f493e61354b3dfe1c3161224
POOL_MARKER=6fefa9da5446d5e467badcc7239fdc5a6170a756
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/release-b-bridge-order.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo

git clone -q --shared "$SOURCE_REPO" "$REPO"
git -C "$REPO" config user.name 'Release B Bridge Test'
git -C "$REPO" config user.email release-b-bridge@example.invalid
SOURCE_TIP=$(git -C "$REPO" rev-parse HEAD)
read -r -a source_tip_ancestry <<< "$(git -C "$REPO" \
  rev-list --parents -n 1 "$SOURCE_TIP")"
REVIEWED_HEAD=$SOURCE_TIP
if [[ ${#source_tip_ancestry[@]} == 3 && \
      ${source_tip_ancestry[1]} == "$FAILED_RELEASE" && \
      $(git -C "$REPO" rev-parse "$SOURCE_TIP^{tree}") == \
        $(git -C "$REPO" rev-parse "${source_tip_ancestry[2]}^{tree}") ]]; then
  REVIEWED_HEAD=${source_tip_ancestry[2]}
fi

# The pinned side parent must be obtainable from the reviewed repository, not
# merely present in the current object's incidental local cache.
git -C "$REPO" fetch -q "$SOURCE_REPO" "$BRIDGE"
[[ $(git -C "$REPO" rev-parse FETCH_HEAD) == "$BRIDGE" ]]
for commit in "$BASE" "$FAILED_RELEASE" "$BRIDGE" "$REVIEWED_HEAD"; do
  git -C "$REPO" cat-file -e "$commit^{commit}"
done

# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$SCRIPT_DIR/deploy-control-bridge-lib.sh"
fail() {
  printf 'deploy-error: %s\n' "$*" >&2
  return 1
}
deploy_control_file_digest() {
  sha256sum "$1" | awk '{print $1}'
}
deploy_control_git_blob_digest() {
  git -C "$REPO" show "$1:$2" | sha256sum | awk '{print $1}'
}
read -r -a head_ancestry <<< "$(git -C "$REPO" \
  rev-list --parents -n 1 "$REVIEWED_HEAD")"
[[ ${#head_ancestry[@]} == 2 ]]
JOIN=${head_ancestry[1]}
read -r -a join_ancestry <<< "$(git -C "$REPO" \
  rev-list --parents -n 1 "$JOIN")"
[[ ${#join_ancestry[@]} == 3 && \
   ${join_ancestry[1]} == "$FAILED_RELEASE" && \
   ${join_ancestry[2]} == "$BRIDGE" ]]
read -r -a bridge_ancestry <<< "$(git -C "$REPO" \
  rev-list --parents -n 1 "$BRIDGE")"
[[ ${#bridge_ancestry[@]} == 2 && ${bridge_ancestry[1]} == "$BASE" ]]
[[ $(git -C "$REPO" diff --name-only --no-renames "$BASE" "$BRIDGE") == \
   ops/deploy/deploy-control-bridge-lib.sh ]]
[[ $(git -C "$REPO" diff --name-only --no-renames \
     "$FAILED_RELEASE" "$JOIN") == \
   ops/deploy/deploy-control-bridge-lib.sh ]]
expected_head_delta=$(printf '%s\n' \
  .github/workflows/production-deploy.yml \
  ops/deploy/production-release-b-bridge-order.test.sh \
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh | LC_ALL=C sort)
actual_head_delta=$(git -C "$REPO" diff --name-only --no-renames \
  "$JOIN" "$REVIEWED_HEAD" | LC_ALL=C sort)
[[ $actual_head_delta == "$expected_head_delta" ]]
[[ $(git -C "$REPO" ls-tree "$BRIDGE" -- \
     ops/deploy/deploy-control-bridge-lib.sh | awk '{print $1, $2}') == \
   '100644 blob' ]]
git -C "$REPO" merge-base --is-ancestor "$BRIDGE" "$REVIEWED_HEAD"

# Reproduce the exact staggered production marker state. These classifications
# force target bridge validation even though the bridge itself changes only the
# deploy-control bridge library.
path_declarations=$(git -C "$REPO" show \
  "$BRIDGE:ops/deploy/social-monitor-production-deploy.sh" | sed -n \
  -e '/^FRONTEND_PATHS=(/,/^)/p' \
  -e '/^BACKEND_PATHS=(/,/^)/p' \
  -e '/^CONTROL_PATHS=(/,/^)/p' \
  -e '/^RUNTIME_CONTROL_PATHS=(/,/^)/p')
eval "$path_declarations"
marker_paths_changed() {
  local marker=$1 target=$2
  shift 2
  git -C "$REPO" merge-base --is-ancestor "$marker" "$target" &&
    ! git -C "$REPO" diff --quiet "$marker" "$target" -- "$@"
}
marker_paths_changed "$FRONTEND_MARKER" "$BRIDGE" "${FRONTEND_PATHS[@]}"
marker_paths_changed "$BACKEND_MARKER" "$BRIDGE" "${BACKEND_PATHS[@]}"
marker_paths_changed "$CONTROL_MARKER" "$BRIDGE" "${CONTROL_PATHS[@]}"
marker_paths_changed "$BACKEND_MARKER" "$BRIDGE" \
  apps/x-collector ops/deploy/production-runtime/x-collector.Dockerfile
if marker_paths_changed \
    "$CONTROL_MARKER" "$BRIDGE" "${RUNTIME_CONTROL_PATHS[@]}"; then
  echo 'staggered control marker unexpectedly classifies runtime control' >&2
  exit 1
fi
git -C "$REPO" merge-base --is-ancestor "$POOL_MARKER" "$BRIDGE"
if marker_paths_changed "$POOL_MARKER" "$BRIDGE" \
    ops/deploy/postgres-pool-atomic-bootstrap-lib.sh \
    ops/deploy/postgres-runtime-deploy-lib.sh \
    ops/deploy/verify-postgres-runtime-topology.py \
    ops/deploy/production-runtime/compose.postgres-runtime.yml; then
  echo 'staggered pool marker unexpectedly classifies pool assets' >&2
  exit 1
fi

# Pin all of the side bridge's independent identities, then prove commits that
# preserve only a subset of them remain closed.
[[ $(git -C "$REPO" rev-parse "$BRIDGE^{tree}") == \
   "$DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE_TREE" ]]
[[ $(git -C "$REPO" rev-parse \
     "$BRIDGE:$DEPLOY_CONTROL_BRIDGE_SELF_PATH") == \
   "$DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE_BLOB" ]]
deploy_control_is_exact_failed_idle_release_bridge "$BRIDGE"

candidate_index=$FIXTURE/candidate.index
unrelated_blob=$(printf 'unrelated Release B candidate\n' | \
  git -C "$REPO" hash-object -w --stdin)
rm -f "$candidate_index"
GIT_INDEX_FILE=$candidate_index git -C "$REPO" read-tree "$BASE"
GIT_INDEX_FILE=$candidate_index git -C "$REPO" update-index \
  --add --cacheinfo "100644,$unrelated_blob,unrelated-release-b-candidate"
unrelated_tree=$(GIT_INDEX_FILE=$candidate_index git -C "$REPO" write-tree)
UNRELATED_BRIDGE=$(printf 'test: unrelated bridge candidate\n' | \
  git -C "$REPO" commit-tree "$unrelated_tree" -p "$BASE")

tampered_blob=$({
  git -C "$REPO" show "$BRIDGE:$DEPLOY_CONTROL_BRIDGE_SELF_PATH"
  printf '\n# tampered bridge candidate\n'
} | git -C "$REPO" hash-object -w --stdin)
rm -f "$candidate_index"
GIT_INDEX_FILE=$candidate_index git -C "$REPO" read-tree "$BASE"
GIT_INDEX_FILE=$candidate_index git -C "$REPO" update-index \
  --cacheinfo "100644,$tampered_blob,$DEPLOY_CONTROL_BRIDGE_SELF_PATH"
tampered_tree=$(GIT_INDEX_FILE=$candidate_index git -C "$REPO" write-tree)
TAMPERED_BRIDGE=$(printf 'test: tampered bridge candidate\n' | \
  git -C "$REPO" commit-tree "$tampered_tree" -p "$BASE")

rm -f "$candidate_index"
GIT_INDEX_FILE=$candidate_index git -C "$REPO" read-tree "$BASE"
GIT_INDEX_FILE=$candidate_index git -C "$REPO" update-index \
  --cacheinfo \
  "100755,$DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE_BLOB,$DEPLOY_CONTROL_BRIDGE_SELF_PATH"
wrong_mode_tree=$(GIT_INDEX_FILE=$candidate_index git -C "$REPO" write-tree)
WRONG_MODE_BRIDGE=$(printf 'test: wrong-mode bridge candidate\n' | \
  git -C "$REPO" commit-tree "$wrong_mode_tree" -p "$BASE")

MIXED_BRIDGE=$(printf 'test: mixed bridge candidate\n' | \
  git -C "$REPO" commit-tree "$JOIN^{tree}" -p "$BASE")
WRONG_PARENT_BRIDGE=$(printf 'test: wrong-parent bridge candidate\n' | \
  git -C "$REPO" commit-tree "$BRIDGE^{tree}" -p "$FAILED_RELEASE")
for rejected in \
  "$UNRELATED_BRIDGE" "$TAMPERED_BRIDGE" \
  "$WRONG_MODE_BRIDGE" "$MIXED_BRIDGE" "$WRONG_PARENT_BRIDGE"; do
  if deploy_control_is_exact_failed_idle_release_bridge "$rejected" || \
     deploy_control_reviewed_transition_matches "$BASE" "$rejected"; then
    echo "unreviewed side bridge candidate was admitted: $rejected" >&2
    exit 1
  fi
done

# Exercise the independent pins after allowing each candidate through the SHA
# and, where needed, tree checks. This proves rejection is not only SHA-based.
reviewed_bridge_pin=$DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE
reviewed_tree_pin=$DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE_TREE
assert_rejected_after_candidate_pins() {
  local candidate=$1 candidate_tree=$2 reason=$3
  DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE=$candidate
  DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE_TREE=$candidate_tree
  if deploy_control_is_exact_failed_idle_release_bridge "$candidate"; then
    echo "side bridge bypassed its $reason pin" >&2
    exit 1
  fi
  DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE=$reviewed_bridge_pin
  DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE_TREE=$reviewed_tree_pin
}
assert_rejected_after_candidate_pins \
  "$WRONG_PARENT_BRIDGE" "$reviewed_tree_pin" parent
assert_rejected_after_candidate_pins \
  "$UNRELATED_BRIDGE" "$unrelated_tree" path
assert_rejected_after_candidate_pins \
  "$TAMPERED_BRIDGE" "$tampered_tree" blob
assert_rejected_after_candidate_pins \
  "$WRONG_MODE_BRIDGE" "$wrong_mode_tree" mode

# With only the SHA pin relaxed, the tampered tree remains independently shut.
DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE=$TAMPERED_BRIDGE
if deploy_control_is_exact_failed_idle_release_bridge "$TAMPERED_BRIDGE"; then
  echo 'side bridge bypassed its tree pin' >&2
  exit 1
fi
DEPLOY_CONTROL_FAILED_IDLE_RELEASE_BRIDGE=$reviewed_bridge_pin

# The historical controller reproduces run 32920718523's fail-closed error.
# The current admission accepts the same immutable bridge before checkout,
# after checkout, and again after reinitialization (crash-resume/retry).
git -C "$REPO" checkout -q "$BASE"
historical_controller=$FIXTURE/historical-deploy-control-bridge-lib.sh
git -C "$REPO" show "$BASE:$DEPLOY_CONTROL_BRIDGE_SELF_PATH" > \
  "$historical_controller"
if historical_error=$(
  (
    fail() {
      printf 'deploy-error: %s\n' "$*" >&2
      exit 1
    }
    # shellcheck source=/dev/null
    source "$historical_controller"
    initialize_deploy_control_bridge
    verify_deploy_control_bridge_target_compatibility "$BRIDGE"
  ) 2>&1
); then
  echo 'historical controller unexpectedly admitted the reviewed bridge' >&2
  exit 1
fi
grep -F 'deploy control changed with backend or runtime assets; deploy the bridge release first' \
  <<< "$historical_error" >/dev/null

initialize_deploy_control_bridge
verify_deploy_control_bridge_target_compatibility "$BRIDGE"
git -C "$REPO" checkout -q "$BRIDGE"
verify_deploy_control_bridge_compatibility
initialize_deploy_control_bridge
verify_deploy_control_bridge_target_compatibility "$BRIDGE"
verify_deploy_control_bridge_compatibility

TARGET=$(printf 'test: simulate exact GitHub merge\n' | git -C "$REPO" \
  commit-tree "$(git -C "$REPO" rev-parse "$REVIEWED_HEAD^{tree}")" \
  -p "$FAILED_RELEASE" -p "$REVIEWED_HEAD")
if deploy_control_reviewed_transition_matches "$BASE" "$TARGET"; then
  echo 'failed Release B unexpectedly bypasses its required bridge' >&2
  exit 1
fi
if deploy_control_reviewed_transition_matches "$BRIDGE" "$REVIEWED_HEAD"; then
  echo 'failed-idle bridge admitted the unmerged reviewed head' >&2
  exit 1
fi
deploy_control_reviewed_transition_matches "$BRIDGE" "$TARGET"
git -C "$REPO" merge-base --is-ancestor "$FAILED_RELEASE" "$TARGET"
git -C "$REPO" merge-base --is-ancestor "$BRIDGE" "$TARGET"
read -r -a target_ancestry <<< "$(git -C "$REPO" \
  rev-list --parents -n 1 "$TARGET")"
[[ ${#target_ancestry[@]} == 3 && \
   ${target_ancestry[1]} == "$FAILED_RELEASE" && \
   ${target_ancestry[2]} == "$REVIEWED_HEAD" ]]
[[ $(git -C "$REPO" rev-parse "$TARGET^{tree}") == \
   $(git -C "$REPO" rev-parse "$REVIEWED_HEAD^{tree}") ]]

if [[ $SOURCE_TIP != "$REVIEWED_HEAD" ]]; then
  deploy_control_reviewed_transition_matches "$BRIDGE" "$SOURCE_TIP"
fi

git -C "$REPO" checkout -q "$TARGET"
printf '\n# unreviewed same-path drift\n' >> \
  "$REPO/.github/workflows/production-deploy.yml"
git -C "$REPO" add .github/workflows/production-deploy.yml
git -C "$REPO" commit -qm 'test: add same-path Release B drift'
SAME_PATH_DRIFT_TARGET=$(git -C "$REPO" rev-parse HEAD)
if deploy_control_reviewed_transition_matches \
    "$BRIDGE" "$SAME_PATH_DRIFT_TARGET"; then
  echo 'failed-idle bridge admitted same-allowlisted-path drift' >&2
  exit 1
fi

git -C "$REPO" checkout -q "$TARGET"
printf 'unreviewed Release B drift\n' > "$REPO/unreviewed-release-b-drift"
git -C "$REPO" add unreviewed-release-b-drift
git -C "$REPO" commit -qm 'test: add unreviewed Release B drift'
DRIFT_TARGET=$(git -C "$REPO" rev-parse HEAD)
if deploy_control_reviewed_transition_matches "$BRIDGE" "$DRIFT_TARGET"; then
  echo 'failed-idle bridge admitted unreviewed Release B drift' >&2
  exit 1
fi

WRONG_TOPOLOGY_TARGET=$(printf 'test: wrong GitHub parent order\n' | \
  git -C "$REPO" commit-tree \
  "$(git -C "$REPO" rev-parse "$REVIEWED_HEAD^{tree}")" \
  -p "$REVIEWED_HEAD" -p "$FAILED_RELEASE")
if deploy_control_reviewed_transition_matches \
    "$BRIDGE" "$WRONG_TOPOLOGY_TARGET"; then
  echo 'failed-idle bridge admitted the wrong GitHub parent topology' >&2
  exit 1
fi

python3 - "$WORKFLOW" "$BRIDGE" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
bridge = sys.argv[2]
if "ops/deploy/production-release-b-bridge-order.test.sh" not in workflow:
    raise SystemExit("Release B exact-topology regression is absent from CI")
deploy = workflow[workflow.index("  deploy:"):workflow.index("  acceptance:")]
bridge_step = deploy[
    deploy.index("Deploy reviewed bridge and reopen restricted SSH"):
    deploy.index("Freshly require A-complete or B-complete")
]
commands = (
    f"bridge_release={bridge}",
    'bash "$client" configure',
    'bash "$client" install-release-b-bridge "$bridge_release"',
    'bash "$client" cleanup',
    'bash "$client" configure',
)
cursor = 0
for command in commands:
    cursor = bridge_step.index(command, cursor) + len(command)
if deploy.index('install-release-b-bridge "$bridge_release"') > deploy.index('deploy "$GITHUB_SHA"'):
    raise SystemExit("Release B target runs before its reviewed control bridge")
PY

printf 'Production Release B bridge ordering tests passed\n'
