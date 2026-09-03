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
cleanup_fixture() { local rc=$?; trap - EXIT; find "$FIXTURE" -depth -delete || :; exit "$rc"; }
trap cleanup_fixture EXIT
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
write_plan "$FIXTURE/post-rollback-uninstalled-target.plan" true true \
  "$BACKEND_BASE" true false uninstalled "$ZERO_SHA"
[[ $(bash "$TRANSITION" state "$TARGET" E "$FIXTURE/e-pending.plan") == transition_state=pre-E ]]
[[ $(bash "$TRANSITION" state "$TARGET" E "$FIXTURE/e-complete.plan") == transition_state=E-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" A2 "$FIXTURE/a-pending.plan") == transition_state=E-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" B2 "$FIXTURE/b-pending.plan") == transition_state=A-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" B2 "$FIXTURE/b-complete.plan") == transition_state=B-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/target-pending.plan") == transition_state=target-pending ]]
[[ $(bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/target-complete.plan") == transition_state=target-complete ]]
[[ $(bash "$TRANSITION" state "$TARGET" TARGET "$FIXTURE/post-rollback-target.plan") == transition_state=target-pending ]]
[[ $(bash "$TRANSITION" state "$TARGET" TARGET \
  "$FIXTURE/post-rollback-uninstalled-target.plan") == transition_state=repair-required ]]
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
write_plan "$FIXTURE/post-rollback-uninstalled-control-complete.plan" true true \
  "$BACKEND_BASE" false false uninstalled "$ZERO_SHA"
assert_refuses 'current target plan does not prove the fixed phases complete' \
  bash "$TRANSITION" state "$TARGET" TARGET \
    "$FIXTURE/post-rollback-uninstalled-control-complete.plan"
write_plan "$FIXTURE/post-rollback-uninstalled-wrong-base.plan" true true \
  "$FIXED_A2" true false uninstalled "$ZERO_SHA"
assert_refuses 'current target plan does not prove the fixed phases complete' \
  bash "$TRANSITION" state "$TARGET" TARGET \
    "$FIXTURE/post-rollback-uninstalled-wrong-base.plan"
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

# The production workflow now uses the reviewed post-promotion V2 bridge.  The
# bridge is prepared once, the connection is closed, and the ordinary target
# plan/deploy/acceptance path runs only after the fresh inspection.
python3 - "$PROJECT_ROOT/.github/workflows/production-deploy.yml" <<'PY'
import pathlib, sys
w = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
for fragment in (
    'verify-post-promotion-v2-target "$GITHUB_SHA"',
    'prepare-post-promotion-v2-bridge "$RELEASE_B" "$JOIN_SHA" "$TARGET_SHA"',
    'run: bash ops/deploy/github-production-deploy-client.sh cleanup',
    'plan-post-promotion-v2-target "$TARGET_SHA"',
    'run: bash ops/deploy/github-production-deploy-client.sh deploy "$GITHUB_SHA"',
    'accept-post-promotion-v2-target "$GITHUB_SHA"',
):
    if fragment not in w:
        raise SystemExit(f"V2 workflow omits required transition step: {fragment}")
if 'verify-forward-target "$GITHUB_SHA"' in w:
    raise SystemExit("legacy forward verifier remains in production workflow")
deploy = w[w.index("  deploy:"):w.index("  acceptance:")]
acceptance = w[w.index("  acceptance:"):]
if "      - verify_reader_summary_publication\n" not in deploy:
    raise SystemExit("target deploy is not gated by reader-summary publication")
for dependency in ("plan", "verify_reader_summary_publication", "verify_backend", "build_frontend"):
    if f"      - {dependency}\n" not in deploy:
        raise SystemExit(f"target deploy is not gated by {dependency}")
if "      - deploy\n" not in acceptance:
    raise SystemExit("acceptance does not depend on target deployment")
if "recovery_transition: 'true'" not in w:
    raise SystemExit("V2 plan does not publish the recovery transition gate")
PY

echo 'Canonical E/A2/B2 target transition tests passed'

# A target descendant is valid before predecessor markers are installed. The
# client must install only the reviewed bridge, then let the normal target
# deploy own the descendant itself.
source "$PROJECT_ROOT/ops/deploy/github-production-forward-bridge-client-lib.sh"
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
verify_production_forward_target_identity() {
  PRODUCTION_FORWARD_ANCHOR=anchor
  PRODUCTION_FORWARD_DERIVED_BRIDGE=bridge
}
production_forward_bridge_is_installed() { return 1; }
capture_plan() {
  local requested=$1
  PLAN_FRONTEND=true PLAN_BACKEND=true PLAN_CONTROL=true PLAN_X_COLLECTOR=false
  PLAN_BACKEND_BASE=$PRODUCTION_FORWARD_BACKEND_SHA
  PLAN_POSTGRES_POOL_BOOTSTRAP=$POSTGRES_POOL_BOOTSTRAP_VERSION
  PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$PRODUCTION_FORWARD_POOL_SHA
  PLAN_POSTGRES_POOL_REPAIR=false
  if [[ $requested == bridge ]]; then
    PLAN_FRONTEND=false
    PLAN_BACKEND=false
  fi
}
print_plan() { :; }
bridge_deployments=0
deploy_once() {
  [[ ${1:-} == bridge ]] || { echo 'descendant was deployed before bridge' >&2; exit 1; }
  bridge_deployments=$((bridge_deployments + 1))
}
prepare_production_forward_bridge descendant
[[ $bridge_deployments == 1 ]] || {
  echo "expected one pre-forward bridge deployment, got $bridge_deployments" >&2
  exit 1
}
echo 'Forward descendant pre-bridge preparation test passed'

# If the bridge was installed by an earlier interrupted run, the bridge plan
# is fully reconciled and must be accepted idempotently without redeploying B.
capture_plan() {
  local requested=$1
  PLAN_FRONTEND=true PLAN_BACKEND=true PLAN_CONTROL=true PLAN_X_COLLECTOR=false
  PLAN_BACKEND_BASE=$PRODUCTION_FORWARD_BACKEND_SHA
  PLAN_POSTGRES_POOL_BOOTSTRAP=$POSTGRES_POOL_BOOTSTRAP_VERSION
  PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$PRODUCTION_FORWARD_POOL_SHA
  PLAN_POSTGRES_POOL_REPAIR=false
  if [[ $requested == bridge ]]; then
    PLAN_FRONTEND=false
    PLAN_BACKEND=false
    PLAN_CONTROL=false
  fi
}
print_plan() { :; }
bridge_deployments=0
deploy_once() { bridge_deployments=$((bridge_deployments + 1)); }
prepare_production_forward_bridge descendant
[[ $bridge_deployments == 0 ]] || {
  echo "already-installed bridge was deployed again: $bridge_deployments" >&2
  exit 1
}
echo 'Installed bridge idempotency test passed'
