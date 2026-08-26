#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_REPO=${PRODUCTION_RELEASE_B_TEST_SOURCE_REPO:-$PROJECT_ROOT}
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
BASE=72e17ded1e54ebd77772929fd5047ef6816dded2
FAILED_RELEASE=92afd97328c5412324c99be635de2c41db589d53
BRIDGE=85c5d22febf1e7ce5fa5967d2460ccb73ca96a9d
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
    'bash "$client" deploy "$bridge_release"',
    'bash "$client" cleanup',
    'bash "$client" configure',
)
cursor = 0
for command in commands:
    cursor = bridge_step.index(command, cursor) + len(command)
if deploy.index('deploy "$bridge_release"') > deploy.index('deploy "$GITHUB_SHA"'):
    raise SystemExit("Release B target runs before its reviewed control bridge")
PY

printf 'Production Release B bridge ordering tests passed\n'
