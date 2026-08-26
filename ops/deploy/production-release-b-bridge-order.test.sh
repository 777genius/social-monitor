#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_REPO=${PRODUCTION_RELEASE_B_TEST_SOURCE_REPO:-$PROJECT_ROOT}
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
BASE=72e17ded1e54ebd77772929fd5047ef6816dded2
FAILED_RELEASE=92afd97328c5412324c99be635de2c41db589d53
BRIDGE=cbd78b45e8ca9d30f496dc47eab7b7288073ea65
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/release-b-bridge-order.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo

git clone -q --shared "$SOURCE_REPO" "$REPO"
TARGET=$(git -C "$REPO" rev-parse HEAD)
for commit in "$BASE" "$FAILED_RELEASE" "$BRIDGE" "$TARGET"; do
  git -C "$REPO" cat-file -e "$commit^{commit}"
done

# shellcheck source=ops/deploy/deploy-control-bridge-lib.sh
source "$SCRIPT_DIR/deploy-control-bridge-lib.sh"
if deploy_control_reviewed_transition_matches "$BASE" "$TARGET"; then
  echo 'failed Release B unexpectedly bypasses its required bridge' >&2
  exit 1
fi
deploy_control_reviewed_transition_matches "$BRIDGE" "$TARGET"
git -C "$REPO" merge-base --is-ancestor "$FAILED_RELEASE" "$TARGET"
git -C "$REPO" merge-base --is-ancestor "$BRIDGE" "$TARGET"
[[ $(git -C "$REPO" diff --name-only --no-renames "$BASE" "$BRIDGE") == \
   ops/deploy/deploy-control-bridge-lib.sh ]]
[[ $(git -C "$REPO" ls-tree "$BRIDGE" -- \
     ops/deploy/deploy-control-bridge-lib.sh | awk '{print $1, $2}') == \
   '100644 blob' ]]

git -C "$REPO" config user.name 'Release B Bridge Test'
git -C "$REPO" config user.email release-b-bridge@example.invalid
printf 'unreviewed Release B drift\n' > "$REPO/unreviewed-release-b-drift"
git -C "$REPO" add unreviewed-release-b-drift
git -C "$REPO" commit -qm 'test: add unreviewed Release B drift'
DRIFT_TARGET=$(git -C "$REPO" rev-parse HEAD)
if deploy_control_reviewed_transition_matches "$BRIDGE" "$DRIFT_TARGET"; then
  echo 'failed-idle bridge admitted unreviewed Release B drift' >&2
  exit 1
fi

python3 - "$WORKFLOW" "$BRIDGE" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
bridge = sys.argv[2]
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
