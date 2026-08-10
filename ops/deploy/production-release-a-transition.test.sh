#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
TRANSITION=$SCRIPT_DIR/production-release-a-transition.sh
INTEGRATION_BASE=bb76b205fb9ee77a016cf62b4905a1be53988ed3
APPROVED_A=cb6790a93122d138bae61f3155133ce926a88874
APPROVED_B=140e73127376452103bd7a5a4b8a9103a24537c0
BACKEND_BASE=4bb8f6d4969b8449726a10859202b23e2bfb4366
ENTRYPOINT=ops/deploy/social-monitor-production-deploy.sh
SNAPSHOT=libs/contracts/rest/openapi.snapshot.json
FIXTURE=$(mktemp -d /tmp/social-monitor-release-transition.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
REFUSAL_COUNT=0

OWNED_PATHS=(
  .github/workflows/production-deploy.yml
  ops/deploy/production-release-a-transition.sh
  ops/deploy/production-release-a-transition.test.sh
  ops/deploy/rabbitmq-quorum-health.sh
  ops/deploy/rabbitmq-quorum-health.test.sh
  ops/deploy/rabbitmq-quorum-recovery.sh
  ops/deploy/rabbitmq-quorum-recovery.test.sh
)

git clone -q --shared "$PROJECT_ROOT" "$REPO"
git -C "$REPO" config user.name 'Release Transition Test'
git -C "$REPO" config user.email release-transition@example.invalid

manifest_digest() {
  LC_ALL=C git -C "$REPO" diff-tree --no-commit-id -r --full-index \
    --no-renames "$1" | sha256sum | awk '{print $1}'
}

make_e_commit() {
  local tree=$1 parent=$2 message=$3 provisional digest
  provisional=$(printf '%s\n' "$message" | git -C "$REPO" commit-tree "$tree" -p "$parent")
  digest=$(manifest_digest "$provisional")
  {
    printf '%s\n\n' "$message"
    printf 'Recovery-E-Manifest-SHA256: %s\n' "$digest"
  } | git -C "$REPO" commit-tree "$tree" -p "$parent"
}

make_a_commit() {
  local tree=$1 release_e=$2 message=$3 provisional e_digest a_digest
  provisional=$(printf '%s\n' "$message" | git -C "$REPO" commit-tree "$tree" -p "$release_e")
  e_digest=$(manifest_digest "$release_e")
  a_digest=$(manifest_digest "$provisional")
  {
    printf '%s\n\n' "$message"
    printf 'Recovery-E-Manifest-SHA256: %s\n' "$e_digest"
    printf 'Recovery-A-Manifest-SHA256: %s\n' "$a_digest"
  } | git -C "$REPO" commit-tree "$tree" -p "$release_e"
}

make_b_commit() {
  local tree=$1 release_a=$2 message=$3 provisional release_e
  local e_digest a_digest b_digest
  provisional=$(printf '%s\n' "$message" | git -C "$REPO" commit-tree "$tree" -p "$release_a")
  release_e=$(git -C "$REPO" rev-parse "$release_a^")
  e_digest=$(manifest_digest "$release_e")
  a_digest=$(manifest_digest "$release_a")
  b_digest=$(manifest_digest "$provisional")
  {
    printf '%s\n\n' "$message"
    printf 'Recovery-E-Manifest-SHA256: %s\n' "$e_digest"
    printf 'Recovery-A-Manifest-SHA256: %s\n' "$a_digest"
    printf 'Recovery-B-Manifest-SHA256: %s\n' "$b_digest"
  } | git -C "$REPO" commit-tree "$tree" -p "$release_a"
}

write_plan() {
  local path=$1 frontend=$2 backend=$3 backend_base=$4 control=$5 collector=$6 marker=$7
  printf 'frontend=%s\nbackend=%s\nbackend_base=%s\ncontrol=%s\nx_collector=%s\npostgres_pool_bootstrap=postgres-pool-v1\npostgres_pool_bootstrap_sha=%s\npostgres_pool_repair=false\n' \
    "$frontend" "$backend" "$backend_base" "$control" "$collector" "$marker" > "$path"
}

assert_refuses() {
  local expected=$1
  shift
  REFUSAL_COUNT=$((REFUSAL_COUNT + 1))
  local stderr=$FIXTURE/refusal-$REFUSAL_COUNT.stderr
  if "$@" > "$FIXTURE/refusal-$REFUSAL_COUNT.stdout" 2> "$stderr"; then
    printf 'command unexpectedly succeeded: %s\n' "$*" >&2
    exit 1
  fi
  grep -F "$expected" "$stderr" >/dev/null || {
    printf 'command failed without expected diagnostic: %s\n' "$expected" >&2
    cat "$stderr" >&2
    exit 1
  }
}

derive_a_tree() {
  local e_tree=$1
  git -C "$REPO" read-tree --reset -u "$e_tree"
  git -C "$REPO" checkout -q "$APPROVED_A" -- "$ENTRYPOINT"
  git -C "$REPO" add "$ENTRYPOINT"
  git -C "$REPO" write-tree
}

derive_b_tree() {
  local a_tree=$1
  git -C "$REPO" read-tree --reset -u "$a_tree"
  git -C "$REPO" checkout -q "$APPROVED_B" -- apps/frontend "$SNAPSHOT"
  git -C "$REPO" add apps/frontend "$SNAPSHOT"
  git -C "$REPO" write-tree
}

[[ $(stat -c '%a' "$TRANSITION") == 755 ]]
[[ $(cd "$PROJECT_ROOT" && bash "$TRANSITION" worktree) == transition_state=pre-E ]]

# E is the reviewed A tree with the old sealed entrypoint and fresh orchestration bytes.
git -C "$REPO" read-tree --reset -u "$APPROVED_A"
git -C "$REPO" checkout -q "$INTEGRATION_BASE" -- "$ENTRYPOINT"
for path in "${OWNED_PATHS[@]}"; do
  case $path in
    .github/workflows/production-deploy.yml) mode=0644 ;;
    *.sh) mode=0755 ;;
    *) printf 'owned fixture path has no declared mode: %s\n' "$path" >&2; exit 1 ;;
  esac
  install -m "$mode" "$PROJECT_ROOT/$path" "$REPO/$path"
done
git -C "$REPO" add -A
E_TREE=$(git -C "$REPO" write-tree)
RELEASE_E=$(make_e_commit "$E_TREE" "$INTEGRATION_BASE" 'test: frozen Release E')

# A changes only the sealed entrypoint; B changes only the reviewed public paths.
A_TREE=$(derive_a_tree "$E_TREE")
RELEASE_A=$(make_a_commit "$A_TREE" "$RELEASE_E" 'test: frozen Release A')
B_TREE=$(derive_b_tree "$A_TREE")
RELEASE_B=$(make_b_commit "$B_TREE" "$RELEASE_A" 'test: frozen Release B')

cd "$REPO"
expected_graph=$(printf 'release_e=%s\nrelease_a2=%s\nrelease_b2=%s' \
  "$RELEASE_E" "$RELEASE_A" "$RELEASE_B")
[[ $(bash "$TRANSITION" validate "$RELEASE_B") == "$expected_graph" ]]

# The four durable states use exact phase-specific plans; B-complete is replay-safe.
write_plan "$FIXTURE/e-pending.plan" false true "$BACKEND_BASE" true false "$RELEASE_E"
write_plan "$FIXTURE/e-retry.plan" false false "$RELEASE_E" true false "$RELEASE_E"
write_plan "$FIXTURE/e-complete.plan" false false "$RELEASE_E" false false "$RELEASE_E"
write_plan "$FIXTURE/a-pending.plan" false false "$RELEASE_E" true false "$RELEASE_E"
write_plan "$FIXTURE/b-pending.plan" true false "$RELEASE_E" false false "$RELEASE_E"
write_plan "$FIXTURE/b-complete.plan" false false "$RELEASE_E" false false "$RELEASE_E"
[[ $(bash "$TRANSITION" state "$RELEASE_B" E "$FIXTURE/e-pending.plan") == transition_state=pre-E ]]
[[ $(bash "$TRANSITION" state "$RELEASE_B" E "$FIXTURE/e-retry.plan") == transition_state=pre-E ]]
[[ $(bash "$TRANSITION" state "$RELEASE_B" E "$FIXTURE/e-complete.plan") == transition_state=E-complete ]]
[[ $(bash "$TRANSITION" state "$RELEASE_B" A2 "$FIXTURE/a-pending.plan") == transition_state=E-complete ]]
[[ $(bash "$TRANSITION" state "$RELEASE_B" B2 "$FIXTURE/b-pending.plan") == transition_state=A-complete ]]
[[ $(bash "$TRANSITION" state "$RELEASE_B" B2 "$FIXTURE/b-complete.plan") == transition_state=B-complete ]]
[[ $(bash "$TRANSITION" state "$RELEASE_B" B2 "$FIXTURE/b-complete.plan") == transition_state=B-complete ]]

# Nearby or all-false A plans cannot masquerade as the required control-only phase.
assert_refuses 'Release A2 plan is not the exact control-only state' \
  bash "$TRANSITION" state "$RELEASE_B" A2 "$FIXTURE/b-complete.plan"
write_plan "$FIXTURE/wrong-e.plan" true true "$BACKEND_BASE" true false "$RELEASE_E"
assert_refuses 'Release E plan is neither its exact pending, retry, nor complete state' \
  bash "$TRANSITION" state "$RELEASE_B" E "$FIXTURE/wrong-e.plan"
write_plan "$FIXTURE/wrong-b.plan" true false "$RELEASE_E" true false "$RELEASE_E"
assert_refuses 'Release B2 plan is neither pending nor complete' \
  bash "$TRANSITION" state "$RELEASE_B" B2 "$FIXTURE/wrong-b.plan"
write_plan "$FIXTURE/wrong-base.plan" false false "$BACKEND_BASE" true false "$RELEASE_E"
assert_refuses 'Release A2 backend_base is not Release E' \
  bash "$TRANSITION" state "$RELEASE_B" A2 "$FIXTURE/wrong-base.plan"
write_plan "$FIXTURE/wrong-b-base.plan" true false "$BACKEND_BASE" false false "$RELEASE_E"
assert_refuses 'Release B2 backend_base is not Release E' \
  bash "$TRANSITION" state "$RELEASE_B" B2 "$FIXTURE/wrong-b-base.plan"
write_plan "$FIXTURE/wrong-x.plan" true false "$RELEASE_E" false true "$RELEASE_E"
assert_refuses 'Release B2 plan is neither pending nor complete' \
  bash "$TRANSITION" state "$RELEASE_B" B2 "$FIXTURE/wrong-x.plan"
sed 's/postgres-pool-v1/uninstalled/' "$FIXTURE/b-pending.plan" > "$FIXTURE/no-bootstrap.plan"
assert_refuses 'plan PostgreSQL pool bootstrap is not postgres-pool-v1' \
  bash "$TRANSITION" state "$RELEASE_B" B2 "$FIXTURE/no-bootstrap.plan"
sed 's/^postgres_pool_bootstrap_sha=.*/postgres_pool_bootstrap_sha=0000000000000000000000000000000000000000/' \
  "$FIXTURE/b-pending.plan" > "$FIXTURE/zero-bootstrap.plan"
assert_refuses 'plan bootstrap SHA is invalid' \
  bash "$TRANSITION" state "$RELEASE_B" B2 "$FIXTURE/zero-bootstrap.plan"
sed 's/postgres_pool_repair=false/postgres_pool_repair=true/' \
  "$FIXTURE/b-pending.plan" > "$FIXTURE/repair.plan"
assert_refuses 'inspect-plan must never report a repair' \
  bash "$TRANSITION" state "$RELEASE_B" B2 "$FIXTURE/repair.plan"

# A graph with the right trees but the wrong E parent is rejected.
WRONG_PARENT=$(git rev-parse "$INTEGRATION_BASE^")
WRONG_PARENT_E=$(make_e_commit "$E_TREE" "$WRONG_PARENT" 'test: wrong-parent E')
WRONG_PARENT_A=$(make_a_commit "$A_TREE" "$WRONG_PARENT_E" 'test: wrong-parent A')
WRONG_PARENT_B=$(make_b_commit "$B_TREE" "$WRONG_PARENT_A" 'test: wrong-parent B')
assert_refuses 'Release E is not a direct child of the fixed integration base' \
  bash "$TRANSITION" validate "$WRONG_PARENT_B"

# E cannot install the new entrypoint early.
git read-tree --reset -u "$E_TREE"
git checkout -q "$APPROVED_A" -- "$ENTRYPOINT"
git add "$ENTRYPOINT"
EARLY_ENTRYPOINT_TREE=$(git write-tree)
EARLY_ENTRYPOINT_E=$(make_e_commit "$EARLY_ENTRYPOINT_TREE" "$INTEGRATION_BASE" 'test: early entrypoint E')
EARLY_ENTRYPOINT_A=$(make_a_commit "$A_TREE" "$EARLY_ENTRYPOINT_E" 'test: early entrypoint A')
EARLY_ENTRYPOINT_B=$(make_b_commit "$B_TREE" "$EARLY_ENTRYPOINT_A" 'test: early entrypoint B')
assert_refuses 'Release E entrypoint is not the sealed old bridge' \
  bash "$TRANSITION" validate "$EARLY_ENTRYPOINT_B"

# A must change exactly the approved entrypoint and must use its approved blob.
git read-tree --reset -u "$E_TREE"
printf 'wrong-entrypoint\n' > "$ENTRYPOINT"
git add "$ENTRYPOINT"
WRONG_A_TREE=$(git write-tree)
WRONG_A=$(make_a_commit "$WRONG_A_TREE" "$RELEASE_E" 'test: wrong entrypoint A')
WRONG_A_B_TREE=$(derive_b_tree "$WRONG_A_TREE")
WRONG_A_B=$(make_b_commit "$WRONG_A_B_TREE" "$WRONG_A" 'test: wrong entrypoint B')
assert_refuses 'Release A2/B2 entrypoint is not the approved controller' \
  bash "$TRANSITION" validate "$WRONG_A_B"

git read-tree --reset -u "$A_TREE"
printf 'extra-a-path\n' > extra-a-path.txt
git add extra-a-path.txt
EXTRA_A_TREE=$(git write-tree)
EXTRA_A=$(make_a_commit "$EXTRA_A_TREE" "$RELEASE_E" 'test: extra-path A')
EXTRA_A_B_TREE=$(derive_b_tree "$EXTRA_A_TREE")
EXTRA_A_B=$(make_b_commit "$EXTRA_A_B_TREE" "$EXTRA_A" 'test: extra-path A B')
assert_refuses 'Release A2 does not change exactly the sealed entrypoint' \
  bash "$TRANSITION" validate "$EXTRA_A_B"

# Reviewed bytes and exact public path sets are immutable.
git read-tree --reset -u "$E_TREE"
printf '\nwrong-reviewed-byte\n' >> ops/deploy/README.md
git add ops/deploy/README.md
WRONG_E_TREE=$(git write-tree)
WRONG_E=$(make_e_commit "$WRONG_E_TREE" "$INTEGRATION_BASE" 'test: wrong-byte E')
WRONG_E_A_TREE=$(derive_a_tree "$WRONG_E_TREE")
WRONG_E_A=$(make_a_commit "$WRONG_E_A_TREE" "$WRONG_E" 'test: wrong-byte A')
WRONG_E_B_TREE=$(derive_b_tree "$WRONG_E_A_TREE")
WRONG_E_B=$(make_b_commit "$WRONG_E_B_TREE" "$WRONG_E_A" 'test: wrong-byte B')
assert_refuses 'Release E does not match its approved tree outside reviewed exclusions' \
  bash "$TRANSITION" validate "$WRONG_E_B"

git read-tree --reset -u "$B_TREE"
printf 'extra-public-path\n' > extra-public-path.txt
git add extra-public-path.txt
EXTRA_B_TREE=$(git write-tree)
EXTRA_B=$(make_b_commit "$EXTRA_B_TREE" "$RELEASE_A" 'test: extra-path B')
assert_refuses 'Release B2 does not change exactly the 34 reviewed public paths' \
  bash "$TRANSITION" validate "$EXTRA_B"

# Mode drift in the executable transition source fails the immutable tree guard.
git read-tree --reset -u "$E_TREE"
chmod 0644 ops/deploy/production-release-a-transition.sh
git add ops/deploy/production-release-a-transition.sh
MODE_E_TREE=$(git write-tree)
MODE_E=$(make_e_commit "$MODE_E_TREE" "$INTEGRATION_BASE" 'test: mode-drift E')
MODE_A_TREE=$(derive_a_tree "$MODE_E_TREE")
MODE_A=$(make_a_commit "$MODE_A_TREE" "$MODE_E" 'test: mode-drift A')
MODE_B_TREE=$(derive_b_tree "$MODE_A_TREE")
MODE_B=$(make_b_commit "$MODE_B_TREE" "$MODE_A" 'test: mode-drift B')
assert_refuses 'Release E owned path has an invalid mode or type: ops/deploy/production-release-a-transition.sh' \
  bash "$TRANSITION" validate "$MODE_B"

# Stable E/A/B manifest trailers fail closed independently at every phase.
{
  printf 'test: forged E manifest\n\n'
  printf 'Recovery-E-Manifest-SHA256: %064d\n' 0
} | git commit-tree "$E_TREE" -p "$INTEGRATION_BASE" > "$FIXTURE/forged-e.sha"
FORGED_E=$(< "$FIXTURE/forged-e.sha")
FORGED_E_A=$(make_a_commit "$A_TREE" "$FORGED_E" 'test: forged-E A')
FORGED_E_B=$(make_b_commit "$B_TREE" "$FORGED_E_A" 'test: forged-E B')
assert_refuses 'Release E Recovery-E-Manifest-SHA256 path/hash manifest does not match' \
  bash "$TRANSITION" validate "$FORGED_E_B"

{
  printf 'test: forged A manifest\n\n'
  printf 'Recovery-E-Manifest-SHA256: %s\n' "$(manifest_digest "$RELEASE_E")"
  printf 'Recovery-A-Manifest-SHA256: %064d\n' 0
} | git commit-tree "$A_TREE" -p "$RELEASE_E" > "$FIXTURE/forged-a.sha"
FORGED_A=$(< "$FIXTURE/forged-a.sha")
FORGED_A_B=$(make_b_commit "$B_TREE" "$FORGED_A" 'test: forged-A B')
assert_refuses 'Release A2 Recovery-A-Manifest-SHA256 path/hash manifest does not match' \
  bash "$TRANSITION" validate "$FORGED_A_B"

{
  printf 'test: forged B manifest\n\n'
  printf 'Recovery-E-Manifest-SHA256: %s\n' "$(manifest_digest "$RELEASE_E")"
  printf 'Recovery-A-Manifest-SHA256: %s\n' "$(manifest_digest "$RELEASE_A")"
  printf 'Recovery-B-Manifest-SHA256: %064d\n' 0
} | git commit-tree "$B_TREE" -p "$RELEASE_A" > "$FIXTURE/forged-b.sha"
FORGED_B=$(< "$FIXTURE/forged-b.sha")
assert_refuses 'Recovery-B-Manifest-SHA256 path/hash manifest does not match' \
  bash "$TRANSITION" validate "$FORGED_B"

# Workflow order is local validation -> E -> fresh proof -> A -> fresh proof -> B -> acceptance.
python3 - "$PROJECT_ROOT/.github/workflows/production-deploy.yml" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
ordered = [
    "Validate frozen three-phase graph before production SSH",
    "Freshly inspect B then A then E before mutation",
    "Deploy and reconcile Release E through the installed wrapper",
    "Open fresh SSH after Release E",
    "Prove E-complete through the Release A plan",
    "Deploy and reconcile Release A through the installed wrapper",
    "Open fresh SSH after Release A",
    "Prove A-complete through the Release B plan",
    "Freshly require A-complete or B-complete",
    "Upload immutable frontend release",
    "Deploy changed components",
    "Accept only B-complete durable state",
]
positions = [workflow.index(marker) for marker in ordered]
if positions != sorted(positions):
    raise SystemExit("three-phase workflow order is not E -> A -> B -> acceptance")
release_job = workflow[workflow.index("  release_a:"):workflow.index("  deploy:")]
deploy_job = workflow[workflow.index("  deploy:"):workflow.index("  acceptance:")]
acceptance_job = workflow[workflow.index("  acceptance:"):]
for dependency in ("plan", "verify_reader_summary_publication", "verify_backend", "build_frontend"):
    if f"      - {dependency}\n" not in release_job:
        raise SystemExit(f"transition mutation is not gated by {dependency}")
if "      - release_a\n" not in deploy_job:
    raise SystemExit("Release B deployment does not depend on E/A reconciliation")
if "      - deploy\n" not in acceptance_job:
    raise SystemExit("acceptance does not depend on Release B deployment")
post_e = release_job[
    release_job.index("Open fresh SSH after Release E"):
    release_job.index("Deploy and reconcile Release A through the installed wrapper")
]
for proof in ('inspect-plan "$release_e"', 'state "$GITHUB_SHA" E "$plan"',
              '[[ $state == transition_state=E-complete ]]'):
    if proof not in post_e:
        raise SystemExit(f"fresh post-E session omits convergence proof: {proof}")
for phase in ('E "$e_plan"', 'A2 "$a_plan"', 'B2 "$b_plan"'):
    if phase not in workflow:
        raise SystemExit(f"missing host fallback phase {phase}")
for state in ("pre-E", "E-complete", "A-complete", "B-complete"):
    if state not in workflow:
        raise SystemExit(f"workflow omits transition state {state}")
if "A2" + "-complete" in workflow or "B2" + "-complete" in workflow:
    raise SystemExit("workflow changed public A/B state names")
if 'github-production-deploy-client.sh plan "$GITHUB_SHA"' in workflow:
    raise SystemExit("recovery preflight must remain read-only")
PY

echo 'Frozen E/A/B three-phase transition tests passed'
