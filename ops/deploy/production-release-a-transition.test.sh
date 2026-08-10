#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
SOURCE_BASE=9adb8eca792c6208c1477576f72487dc4224c4cf
FRONTEND_TARGET=683c6ff94e964a2f268041fda462a2aa1c9eb2e2
FAILED_TARGET=bb76b205fb9ee77a016cf62b4905a1be53988ed3
BACKEND_BASE=4bb8f6d4969b8449726a10859202b23e2bfb4366
SNAPSHOT=libs/contracts/rest/openapi.snapshot.json
FIXTURE=$(mktemp -d /tmp/social-monitor-release-transition.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo

git clone -q --shared "$PROJECT_ROOT" "$REPO"
git -C "$REPO" config user.name 'Release Transition Test'
git -C "$REPO" config user.email release-transition@example.invalid

manifest_digest() {
  LC_ALL=C git -C "$REPO" diff-tree --no-commit-id -r --full-index \
    --no-renames "$1" | sha256sum | awk '{print $1}'
}

commit_b_with_trailers() {
  local message=$1
  git -C "$REPO" commit -qm "$message"
  local release_b a_manifest b_manifest
  release_b=$(git -C "$REPO" rev-parse HEAD)
  a_manifest=$(manifest_digest "$(git -C "$REPO" rev-parse "$release_b^")")
  b_manifest=$(manifest_digest "$release_b")
  git -C "$REPO" commit --amend -qm "$message

Recovery-A-Manifest-SHA256: $a_manifest
Recovery-B-Manifest-SHA256: $b_manifest"
  git -C "$REPO" rev-parse HEAD
}

write_plan() {
  local path=$1 frontend=$2 backend=$3 backend_base=$4 control=$5 collector=$6 marker=$7
  printf 'frontend=%s\nbackend=%s\nbackend_base=%s\ncontrol=%s\nx_collector=%s\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\npostgres_pool_repair=false\n' \
    "$frontend" "$backend" "$backend_base" "$control" "$collector" "$marker" > "$path"
}

assert_fails() {
  if "$@" >/dev/null 2>&1; then
    printf 'command unexpectedly succeeded: %s\n' "$*" >&2
    exit 1
  fi
}

git -C "$REPO" checkout -q --detach "$SOURCE_BASE"
git -C "$REPO" checkout -q "$FAILED_TARGET" -- "$SNAPSHOT"
mkdir -p "$REPO/ops/deploy"
printf 'frozen-a-control\n' > "$REPO/ops/deploy/recovery-transition-fixture.txt"
git -C "$REPO" add "$SNAPSHOT" ops/deploy/recovery-transition-fixture.txt
git -C "$REPO" commit -qm 'test: frozen Release A'
RELEASE_A=$(git -C "$REPO" rev-parse HEAD)

git -C "$REPO" checkout -q "$FRONTEND_TARGET" -- apps/frontend "$SNAPSHOT"
git -C "$REPO" add apps/frontend "$SNAPSHOT"
RELEASE_B=$(commit_b_with_trailers 'test: frozen Release B')

cd "$REPO"
bash "$SCRIPT_DIR/production-release-a-transition.sh" validate "$RELEASE_B" |
  grep -Fx "release_a=$RELEASE_A" >/dev/null

write_plan "$FIXTURE/a.plan" false true "$BACKEND_BASE" true false "$RELEASE_A"
write_plan "$FIXTURE/b-pending.plan" true false "$RELEASE_A" false false "$RELEASE_A"
write_plan "$FIXTURE/b-complete.plan" false false "$RELEASE_A" false false "$RELEASE_A"
[[ $(bash "$SCRIPT_DIR/production-release-a-transition.sh" \
  state "$RELEASE_B" A "$FIXTURE/a.plan") == transition_state=pre-A ]]
[[ $(bash "$SCRIPT_DIR/production-release-a-transition.sh" \
  state "$RELEASE_B" B "$FIXTURE/b-pending.plan") == transition_state=A-complete ]]
[[ $(bash "$SCRIPT_DIR/production-release-a-transition.sh" \
  state "$RELEASE_B" B "$FIXTURE/b-complete.plan") == transition_state=B-complete ]]
# A replay observes the same durable B-complete state and performs no mutation.
[[ $(bash "$SCRIPT_DIR/production-release-a-transition.sh" \
  state "$RELEASE_B" B "$FIXTURE/b-complete.plan") == transition_state=B-complete ]]

sed 's/postgres-pool-v1/uninstalled/' "$FIXTURE/b-pending.plan" > "$FIXTURE/no-bootstrap.plan"
assert_fails bash "$SCRIPT_DIR/production-release-a-transition.sh" \
  state "$RELEASE_B" B "$FIXTURE/no-bootstrap.plan"

# A wrong B parent cannot masquerade as the frozen graph.
git -C "$REPO" checkout -q --detach "$SOURCE_BASE"
printf 'wrong-parent\n' > "$REPO/wrong-parent.txt"
git -C "$REPO" add wrong-parent.txt
git -C "$REPO" commit -qm 'test: wrong intermediate parent'
git -C "$REPO" checkout -q "$FRONTEND_TARGET" -- apps/frontend "$SNAPSHOT"
git -C "$REPO" add apps/frontend "$SNAPSHOT"
WRONG_PARENT_B=$(commit_b_with_trailers 'test: wrong-parent B')
assert_fails bash "$SCRIPT_DIR/production-release-a-transition.sh" validate "$WRONG_PARENT_B"

# An extra B path fails the exact 34-path manifest before deployment.
git -C "$REPO" checkout -q --detach "$RELEASE_A"
git -C "$REPO" checkout -q "$FRONTEND_TARGET" -- apps/frontend "$SNAPSHOT"
printf 'extra\n' > "$REPO/extra-public-path.txt"
git -C "$REPO" add apps/frontend "$SNAPSHOT" extra-public-path.txt
EXTRA_B=$(commit_b_with_trailers 'test: extra-path B')
assert_fails bash "$SCRIPT_DIR/production-release-a-transition.sh" validate "$EXTRA_B"

# A reviewed path with the wrong bytes fails even with internally consistent trailers.
git -C "$REPO" checkout -q --detach "$RELEASE_A"
git -C "$REPO" checkout -q "$FRONTEND_TARGET" -- apps/frontend "$SNAPSHOT"
wrong_frontend=$(git -C "$REPO" diff --name-only "$SOURCE_BASE" "$FRONTEND_TARGET" -- \
  apps/frontend | head -n 1)
printf '\nwrong-reviewed-byte\n' >> "$REPO/$wrong_frontend"
git -C "$REPO" add apps/frontend "$SNAPSHOT"
WRONG_HASH_B=$(commit_b_with_trailers 'test: wrong-hash B')
assert_fails bash "$SCRIPT_DIR/production-release-a-transition.sh" validate "$WRONG_HASH_B"

# Both commit-message path/hash manifests fail closed when either digest is forged.
git -C "$REPO" checkout -q --detach "$RELEASE_B"
git -C "$REPO" commit --amend -qm 'test: forged manifests

Recovery-A-Manifest-SHA256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Recovery-B-Manifest-SHA256: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
FORGED_B=$(git -C "$REPO" rev-parse HEAD)
assert_fails bash "$SCRIPT_DIR/production-release-a-transition.sh" validate "$FORGED_B"

WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
grep -F 'inspect-plan "$GITHUB_SHA"' "$WORKFLOW" >/dev/null
grep -F "needs.plan.outputs.recovery_transition == 'true'" "$WORKFLOW" >/dev/null
grep -F 'Deploy and reconcile Release A through the installed wrapper' "$WORKFLOW" >/dev/null
grep -F 'Open fresh SSH through the Release A wrapper' "$WORKFLOW" >/dev/null
grep -F 'Accept only B-complete durable state' "$WORKFLOW" >/dev/null
python3 - "$WORKFLOW" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
jobs = [
    "  plan:",
    "  verify_reader_summary_publication:",
    "  verify_backend:",
    "  build_frontend:",
    "  release_a:",
    "  deploy:",
    "  acceptance:",
]
positions = [workflow.index(job) for job in jobs]
if positions != sorted(positions):
    raise SystemExit("recovery workflow jobs are not ordered gates -> A -> B -> acceptance")
release_a = workflow[positions[4]:positions[5]]
for dependency in ("plan", "verify_reader_summary_publication", "verify_backend", "build_frontend"):
    if f"      - {dependency}\n" not in release_a:
        raise SystemExit(f"Release A mutation is not gated by {dependency}")
if 'github-production-deploy-client.sh plan "$GITHUB_SHA"' in workflow:
    raise SystemExit("recovery preflight must use read-only inspect-plan")
PY

echo 'Frozen Release A/B transition tests passed'
