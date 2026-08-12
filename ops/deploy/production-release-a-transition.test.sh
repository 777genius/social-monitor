#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
TRANSITION=$SCRIPT_DIR/production-release-a-transition.sh
FIXED_E=889d50f50328c89e25b3ef898e552df631b3222f
FIXED_A2=c64c3b46b6b6ba5c7ac7b04028932e09dae2116a
FIXED_B2=e3b5b5d89b3586668e36f987f03672415b5a0f37
BACKEND_BASE=4bb8f6d4969b8449726a10859202b23e2bfb4366
ZERO_SHA=0000000000000000000000000000000000000000
FIXTURE=$(mktemp -d /tmp/social-monitor-release-transition.XXXXXX)
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$FIXTURE/repo
REFUSAL_COUNT=0

git clone -q --shared "$PROJECT_ROOT" "$REPO"
git -C "$REPO" config user.name 'Release Transition Test'
git -C "$REPO" config user.email release-transition@example.invalid

assert_refuses() {
  local expected=$1 stderr
  shift
  REFUSAL_COUNT=$((REFUSAL_COUNT + 1))
  stderr=$FIXTURE/refusal-$REFUSAL_COUNT.stderr
  if "$@" > "$FIXTURE/refusal-$REFUSAL_COUNT.stdout" 2> "$stderr"; then
    printf 'command unexpectedly succeeded: %s\n' "$*" >&2
    exit 1
  fi
  grep -F "$expected" "$stderr" >/dev/null || {
    printf 'command failed without expected diagnostic: %s\n' "$expected" >&2
    sed -n '1,120p' "$stderr" >&2
    exit 1
  }
}

write_plan() {
  local path=$1 frontend=$2 backend=$3 backend_base=$4 control=$5 collector=$6
  local bootstrap=${7:-postgres-pool-v1} marker=${8:-$FIXED_E} repair=${9:-false}
  printf 'frontend=%s\nbackend=%s\nbackend_base=%s\ncontrol=%s\nx_collector=%s\npostgres_pool_bootstrap=%s\npostgres_pool_bootstrap_sha=%s\npostgres_pool_repair=%s\n' \
    "$frontend" "$backend" "$backend_base" "$control" "$collector" \
    "$bootstrap" "$marker" "$repair" > "$path"
}

cd "$REPO"
for path in \
  ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh \
  ops/deploy/postgres-runtime-weekly-timer-state-lib.sh \
  ops/deploy/production-runtime/reader-summary-daily-c1.readiness \
  ops/deploy/production-runtime/social-monitor-daily.timer; do
  [[ $(grep -Fxc "  $path" "$TRANSITION") == 1 ]]
  grep -F " $path" "$SCRIPT_DIR/social-monitor-production-deploy.sh" >/dev/null
done
TARGET=$(printf 'test: target descendant\n' |
  git commit-tree "$(git rev-parse "$FIXED_B2^{tree}")" -p "$FIXED_B2")
expected=$(printf 'release_e=%s\nrelease_a2=%s\nrelease_b2=%s\ntarget=%s' \
  "$FIXED_E" "$FIXED_A2" "$FIXED_B2" "$TARGET")
[[ $(bash "$TRANSITION" validate "$TARGET") == "$expected" ]]

# Exact fixed phases remain restart-safe while a current backend marker on the
# canonical first-parent chain supersedes all three fixed recovery phases.
write_plan "$FIXTURE/e-pending.plan" false true "$BACKEND_BASE" true false
write_plan "$FIXTURE/e-complete.plan" false false "$FIXED_E" false false
write_plan "$FIXTURE/a-pending.plan" false false "$FIXED_E" true false
write_plan "$FIXTURE/b-pending.plan" true false "$FIXED_E" false false
write_plan "$FIXTURE/b-complete.plan" false false "$FIXED_E" false false
write_plan "$FIXTURE/target-pending.plan" true true "$FIXED_B2" true false
write_plan "$FIXTURE/target-complete.plan" false false "$TARGET" false false
write_plan "$FIXTURE/post-rollback-target.plan" false true "$BACKEND_BASE" true false \
  postgres-pool-v1 e7b19bc805815af310f1e5096d3fec5789129ddb
[[ $(bash "$TRANSITION" state "$TARGET" E "$FIXTURE/e-pending.plan") == transition_state=pre-E ]]
[[ $(bash "$TRANSITION" state "$TARGET" E "$FIXTURE/e-complete.plan") == transition_state=E-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" A2 "$FIXTURE/a-pending.plan") == transition_state=E-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" B2 "$FIXTURE/b-pending.plan") == transition_state=A-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" B2 "$FIXTURE/b-complete.plan") == transition_state=B-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/target-pending.plan") == transition_state=target-pending ]]
[[ $(bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/target-complete.plan") == transition_state=target-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/post-rollback-target.plan") == transition_state=target-pending ]]
write_plan "$FIXTURE/post-rollback-descendant-bootstrap.plan" false true \
  "$BACKEND_BASE" true false postgres-pool-v1 "$TARGET"
[[ $(bash "$TRANSITION" state "$TARGET" TARGET \
  "$FIXTURE/post-rollback-descendant-bootstrap.plan") == transition_state=target-pending ]]
write_plan "$FIXTURE/post-rollback-descendant-backend.plan" false true \
  "$FIXED_A2" true false postgres-pool-v1 "$TARGET"
[[ $(bash "$TRANSITION" state "$TARGET" TARGET \
  "$FIXTURE/post-rollback-descendant-backend.plan") == transition_state=target-pending ]]
write_plan "$FIXTURE/post-rollback-frontend-target.plan" true true "$BACKEND_BASE" true false \
  postgres-pool-v1 e7b19bc805815af310f1e5096d3fec5789129ddb
[[ $(bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/post-rollback-frontend-target.plan") == transition_state=target-pending ]]

# Bootstrap absence and an already reported repair are explicit A2 states.
write_plan "$FIXTURE/uninstalled.plan" false false "$FIXED_E" true false uninstalled "$ZERO_SHA"
write_plan "$FIXTURE/repair.plan" false false "$FIXED_E" true false postgres-pool-v1 "$FIXED_A2" true
[[ $(bash "$TRANSITION" state "$TARGET" A2 "$FIXTURE/uninstalled.plan") == transition_state=repair-required ]]
[[ $(bash "$TRANSITION" state "$TARGET" A2 "$FIXTURE/repair.plan") == transition_state=repair-required ]]

# Execute the confirmed kill window: integration is A2, control remains pending,
# and the bootstrap marker is absent. The bounded client may report failure
# after its one reconciliation attempt; only the fresh plan is authoritative.
HOST_BOOTSTRAP=uninstalled
DEPLOY_CALLS=0
DEPLOY_LOG=$FIXTURE/deploy.log
inspect_a2() {
  if [[ $HOST_BOOTSTRAP == uninstalled ]]; then
    write_plan "$1" false false "$FIXED_E" true false uninstalled "$ZERO_SHA"
  else
    write_plan "$1" false false "$FIXED_E" true false postgres-pool-v1 "$FIXED_A2"
  fi
}
bounded_client_deploy() {
  local requested=$1
  DEPLOY_CALLS=$((DEPLOY_CALLS + 1))
  printf '%s\n' "$requested" >> "$DEPLOY_LOG"
  [[ $requested == "$FIXED_A2" ]] || return 70
  HOST_BOOTSTRAP=installed
  return 1
}
inspect_a2 "$FIXTURE/interrupted.plan"
write_plan "$FIXTURE/interrupted-b2.plan" true false "$FIXED_E" true false uninstalled "$ZERO_SHA"
assert_refuses 'Release B2 plan is neither pending nor complete' \
  bash "$TRANSITION" state "$TARGET" B2 "$FIXTURE/interrupted-b2.plan"
[[ $(bash "$TRANSITION" state "$TARGET" A2 "$FIXTURE/interrupted.plan") == transition_state=repair-required ]]
repair_status=0
bounded_client_deploy "$FIXED_A2" || repair_status=$?
[[ $repair_status == 1 && $HOST_BOOTSTRAP == installed ]]
inspect_a2 "$FIXTURE/post-repair.plan"
[[ $(bash "$TRANSITION" state "$TARGET" A2 "$FIXTURE/post-repair.plan") == transition_state=E-complete ]]
# The older E probe now sees the newer A2 marker as absent. The next workflow
# proof must therefore use A2 again rather than treating this stale view as a
# second repair request.
write_plan "$FIXTURE/stale-e-after-a2-repair.plan" false false "$FIXED_E" false false uninstalled "$ZERO_SHA"
[[ $(bash "$TRANSITION" state "$TARGET" E "$FIXTURE/stale-e-after-a2-repair.plan") == transition_state=repair-required ]]
# Replay and the next A2 handoff proof do not loop or broad-deploy TARGET.
[[ $(bash "$TRANSITION" state "$TARGET" A2 "$FIXTURE/post-repair.plan") == transition_state=E-complete ]]
[[ $DEPLOY_CALLS == 1 && $(< "$DEPLOY_LOG") == "$FIXED_A2" ]]

# Compact parser and phase classifiers fail closed on malformed or nearby data.
sed 's/^frontend=.*/frontend=maybe/' "$FIXTURE/target-pending.plan" > "$FIXTURE/bad-boolean.plan"
assert_refuses 'plan key frontend is not boolean' \
  bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/bad-boolean.plan"
printf 'frontend=true\nfrontend=false\n' > "$FIXTURE/duplicate.plan"
assert_refuses 'plan contains duplicate key frontend' \
  bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/duplicate.plan"
write_plan "$FIXTURE/wrong-a.plan" false false "$BACKEND_BASE" true false
assert_refuses 'Release A2 backend_base is not Release E' \
  bash "$TRANSITION" state "$TARGET" A2 "$FIXTURE/wrong-a.plan"
write_plan "$FIXTURE/post-rollback-wrong-bootstrap.plan" false true "$BACKEND_BASE" true false \
  postgres-pool-v1 "$FIXED_E"
assert_refuses 'current target plan does not prove the fixed phases complete' \
  bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/post-rollback-wrong-bootstrap.plan"
write_plan "$FIXTURE/wrong-b.plan" true false "$FIXED_E" true false
assert_refuses 'Release B2 plan is neither pending nor complete' \
  bash "$TRANSITION" state "$TARGET" B2 "$FIXTURE/wrong-b.plan"
write_plan "$FIXTURE/bad-bootstrap.plan" false false "$FIXED_E" false false uninstalled "$FIXED_E"
assert_refuses 'uninstalled bootstrap must use the zero marker' \
  bash "$TRANSITION" state "$TARGET" B2 "$FIXTURE/bad-bootstrap.plan"

# Sibling ancestry and B2 appearing only through a merge's second parent are
# both rejected, even when their trees match the canonical release.
SIBLING=$(printf 'test: sibling\n' |
  git commit-tree "$(git rev-parse "$FIXED_B2^{tree}")" -p "$FIXED_A2")
SECOND_PARENT_ONLY=$(printf 'test: second-parent only\n' |
  git commit-tree "$(git rev-parse "$FIXED_B2^{tree}")" -p "$SIBLING" -p "$FIXED_B2")
assert_refuses 'target commit does not first-parent-contain canonical Release B2' \
  bash "$TRANSITION" validate "$SIBLING"
assert_refuses 'target commit does not first-parent-contain canonical Release B2' \
  bash "$TRANSITION" validate "$SECOND_PARENT_ONLY"

# Tampering with the fixed B2 object through a replacement ref must trip its
# immutable manifest before any target state can be accepted.
FORGED_B2=$(printf 'test: forged B2 manifest\n\nRecovery-E-Manifest-SHA256: %064d\nRecovery-A-Manifest-SHA256: %064d\nRecovery-B-Manifest-SHA256: %064d\n' 0 0 0 |
  git commit-tree "$(git rev-parse "$FIXED_B2^{tree}")" -p "$FIXED_A2")
git replace "$FIXED_B2" "$FORGED_B2"
assert_refuses 'Release B2 Recovery-E-Manifest-SHA256 path/hash manifest does not match' \
  bash "$TRANSITION" validate "$TARGET"
git replace -d "$FIXED_B2" >/dev/null

# Workflow preserves job-scoped dependencies, repair ordering, a fresh proof,
# fixed anchors and deployment of the current target.
python3 - "$PROJECT_ROOT/.github/workflows/production-deploy.yml" <<'PY'
import pathlib, sys
w = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
for anchor in (
    "889d50f50328c89e25b3ef898e552df631b3222f",
    "c64c3b46b6b6ba5c7ac7b04028932e09dae2116a",
    "e3b5b5d89b3586668e36f987f03672415b5a0f37",
):
    if anchor not in w:
        raise SystemExit(f"workflow omits canonical anchor {anchor}")
release = w[w.index("  release_a:"):w.index("  deploy:")]
deploy = w[w.index("  deploy:"):w.index("  acceptance:")]
acceptance = w[w.index("  acceptance:"):]
plan = w[w.index("  plan:"):w.index("  verify_reader_summary_publication:")]
for dependency in ("plan", "verify_reader_summary_publication", "verify_backend", "build_frontend"):
    if f"      - {dependency}\n" not in release:
        raise SystemExit(f"transition mutation is not gated by {dependency}")
ordered = ["Repair PostgreSQL bootstrap after verification", "Freshly inspect after bounded repair"]
if [release.index(x) for x in ordered] != sorted(release.index(x) for x in ordered):
    raise SystemExit("repair is not followed by a fresh inspection")
e_proof = release[
    release.index("Prove E-complete through the Release A plan"):
    release.index("Deploy and reconcile Release A through the installed wrapper")
]
if 'inspect-plan "$release_e"' in e_proof or ' state "$GITHUB_SHA" E ' in e_proof:
    raise SystemExit("post-repair E-complete proof still probes stale fixed E")
for fragment in ('inspect-plan "$release_a2"', 'state "$GITHUB_SHA" A2 "$plan"'):
    if fragment not in e_proof:
        raise SystemExit(f"post-repair E-complete proof omits exact A2 evidence: {fragment}")
for fragment in (
    "if: needs.plan.outputs.transition_state == 'repair-required'",
    'DEPLOY_RECONCILE_ATTEMPTS: 1',
    'github-production-deploy-client.sh deploy "$REPAIR_ANCHOR"',
):
    if fragment not in release:
        raise SystemExit(f"bounded repair contract omits {fragment}")
for forbidden in (' plan "$GITHUB_SHA"', ' deploy "$GITHUB_SHA"'):
    if forbidden in plan:
        raise SystemExit("read-only plan job performs a mutation")
if 'repair_anchor: ${{ steps.plan.outputs.repair_anchor }}' not in plan:
    raise SystemExit("plan job does not publish the fixed repair anchor")
if 'deploy "$GITHUB_SHA"' not in deploy:
    raise SystemExit("deploy job does not deploy the current target")
if "      - release_a\n" not in deploy:
    raise SystemExit("target deploy does not depend on fixed-phase reconciliation")
if "      - deploy\n" not in acceptance:
    raise SystemExit("acceptance does not depend on target deployment")
if "postgres_pool_repair != 'true'" in deploy:
    raise SystemExit("post-repair target deploy is still incorrectly suppressed")
PY

echo 'Canonical E/A2/B2 target transition tests passed'
