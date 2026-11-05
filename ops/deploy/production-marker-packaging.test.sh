#!/usr/bin/env bash
# Offline real-object regression. All writes stay in a disposable Git fixture.
set -euo pipefail
export GIT_NO_LAZY_FETCH=1 GIT_NO_REPLACE_OBJECTS=1
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
BASE=37b316728abc5e777109477ba1ce755fe69542b8
MARKER=16c1f3c289d620c2f47a04fcbc56e9596389c6de
ENTRYPOINT=ops/deploy/social-monitor-production-deploy.sh
OWNERSHIP=scripts/sql/reader-summary-publication-tenant-ownership.sql
fixture=$(mktemp -d "${TMPDIR:-/tmp}/marker-packaging.XXXXXX")
trap 'find "$fixture" -depth -delete' EXIT
git -c gc.autoDetach=false clone --shared --no-checkout -q "$PROJECT_ROOT" "$fixture/repo"
export GITHUB_WORKSPACE=$fixture/repo GIT_INDEX_FILE=$fixture/index
export GIT_AUTHOR_NAME=packaging-test GIT_AUTHOR_EMAIL=packaging@example.invalid
export GIT_COMMITTER_NAME=$GIT_AUTHOR_NAME GIT_COMMITTER_EMAIL=$GIT_AUTHOR_EMAIL
export GIT_AUTHOR_DATE=2026-09-09T00:00:00Z GIT_COMMITTER_DATE=2026-09-09T00:00:00Z
source "$SCRIPT_DIR/github-production-forward-bridge-client-lib.sh"
fail() { printf 'marker-packaging: %s\n' "$*" >&2; exit 1; }
# Explicit ownership list excludes unrelated work and includes new files.
owned=(
  "$ENTRYPOINT" "$OWNERSHIP"
  ops/deploy/reader-summary-publication-tenant-ownership.sql
  ops/deploy/production-backend-classification-lib.sh
  ops/deploy/reader-summary-publication-deploy-lib.sh
  ops/deploy/production-forward-stale-controller.test.sh
  ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh
  ops/deploy/postgres-pool-bootstrap-transition.test.sh
  ops/deploy/social-monitor-production-deploy.test.sh
  ops/deploy/production-marker-packaging.test.sh
  scripts/check-tenant-db-guards.mjs
  scripts/lib/reader-summary-active-model-route-migration-contract.test.mjs
  scripts/lib/tenant-db-guard-owner-binding.test.mjs
  scripts/lib/reader-summary-refresh-lock-capabilities.spec.ts
  scripts/lib/reader-summary-publication-bootstrap-sql.ts
  scripts/lib/reader-summary-publication-bootstrap-sql.spec.ts
)
production_forward_git read-tree "$BASE"
for path in "${owned[@]}"; do
  if [[ -f $PROJECT_ROOT/$path ]]; then
    [[ ! -L $PROJECT_ROOT/$path ]]
    mode=$(production_forward_git ls-tree "$BASE" -- "$path" | awk '{print $1}')
    mode=${mode:-100644}
    [[ $(stat -c %a "$PROJECT_ROOT/$path") == "${mode#100}" ]]
    blob=$(production_forward_git hash-object -w "$PROJECT_ROOT/$path")
    production_forward_git update-index --add --cacheinfo "$mode,$blob,$path"
  else
    [[ $path == ops/deploy/reader-summary-publication-tenant-ownership.sql ]]
    production_forward_git update-index --force-remove "$path"
  fi
done
tree=$(production_forward_git write-tree)
candidate=$(production_forward_git commit-tree "$tree" -p "$BASE" -m 'test: actual owned packaging candidate')
printf 'candidate=%s tree=%s parent=%s\n' "$candidate" "$tree" "$BASE"
[[ $(production_forward_git rev-parse "$candidate:$ENTRYPOINT") == d245faeac28a99be7c22ecec3d330698059fba12 ]]
cmp <(production_forward_git show "$BASE:ops/deploy/reader-summary-publication-tenant-ownership.sql") \
  "$PROJECT_ROOT/$OWNERSHIP"
verify_production_forward_target_identity "$candidate"
count=0
while IFS= read -r path; do
  [[ $(production_forward_git ls-tree "$MARKER" -- "$path") == \
    "$(production_forward_git ls-tree "$candidate" -- "$path")" ]]
  ((count += 1))
done < <(production_forward_controller_paths)
[[ $count == 11 ]]
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
capture_plan() {
  PLAN_FRONTEND=false PLAN_BACKEND=true PLAN_CONTROL=true PLAN_X_COLLECTOR=false
  PLAN_BACKEND_BASE=$MARKER PLAN_POSTGRES_POOL_BOOTSTRAP=postgres-pool-v1
  PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=$MARKER PLAN_POSTGRES_POOL_REPAIR=false
}
print_plan() { :; }
deploy_once() { fail 'unexpected bridge deploy'; }
(prepare_production_forward_bridge "$candidate")
if (prepare_production_forward_bridge "$BASE") > "$fixture/original.log" 2>&1; then
  fail 'original target admitted'
fi
grep -F 'production forward target is not an approved ordered marker plan' "$fixture/original.log"
capture_plan
for field in PLAN_BACKEND_BASE PLAN_POSTGRES_POOL_BOOTSTRAP_SHA; do
  for bad in 0000000000000000000000000000000000000000 "$PRODUCTION_FORWARD_MAIN_SHA" malformed; do
    capture_plan
    printf -v "$field" '%s' "$bad"
    if production_forward_bridge_is_installed "$PRODUCTION_FORWARD_ANCHOR" "$candidate"; then
      fail "bad marker admitted: $field $bad"
    fi
  done
done
capture_plan
PLAN_POSTGRES_POOL_REPAIR=true
if production_forward_bridge_is_installed "$PRODUCTION_FORWARD_ANCHOR" "$candidate"; then fail 'repair admitted'; fi
capture_plan
# Exercise actual tree entries, never override Git responses or marker guards.
while IFS= read -r path; do
  blob=$(production_forward_git rev-parse "$candidate:$path")
  for variant in wrong-byte missing symlink mode-drift; do
    production_forward_git read-tree "$candidate"
    case $variant in
      wrong-byte) bad_blob=$(printf 'unreviewed\n' | production_forward_git hash-object -w --stdin)
        production_forward_git update-index --cacheinfo "100644,$bad_blob,$path" ;;
      missing) production_forward_git update-index --force-remove "$path" ;;
      symlink) bad_blob=$(printf 'unreviewed-target' | production_forward_git hash-object -w --stdin)
        production_forward_git update-index --cacheinfo "120000,$bad_blob,$path" ;;
      mode-drift) production_forward_git update-index --cacheinfo "100755,$blob,$path" ;;
    esac
    bad_tree=$(production_forward_git write-tree)
    bad_target=$(production_forward_git commit-tree "$bad_tree" -p "$candidate" -m "test: $variant $path")
    if production_forward_bridge_is_installed "$PRODUCTION_FORWARD_ANCHOR" "$bad_target"; then
      fail "controller drift admitted: $variant $path"
    fi
  done
done < <(production_forward_controller_paths)
# Run the installed 16c1 top-level classifier unchanged on an ownership-only
# commit. Extract only declarations/functions to avoid entrypoint startup.
production_forward_git show "$MARKER:$ENTRYPOINT" > "$fixture/historical.sh"
python3 - "$fixture/historical.sh" "$fixture/classifier.sh" <<'PY'
import pathlib, re, sys
source = pathlib.Path(sys.argv[1]).read_text()
parts = []
for name in ('FRONTEND_PATHS', 'BACKEND_PATHS', 'CONTROL_PATHS'):
    parts.append(re.search(r'^' + name + r'=\([\s\S]*?^\)', source, re.M)[0])
for name in ('component_changed', 'print_plan', 'changed_between'):
    parts.append(re.search(r'^' + name + r'\(\) \{\n[\s\S]*?^\}', source, re.M)[0])
pathlib.Path(sys.argv[2]).write_text('\n'.join(parts) + '\n')
PY
production_forward_git read-tree "$candidate"
blob=$({ cat "$PROJECT_ROOT/$OWNERSHIP"; printf '\n-- ownership-only fixture\n'; } | production_forward_git hash-object -w --stdin)
production_forward_git update-index --cacheinfo "100644,$blob,$OWNERSHIP"
only_tree=$(production_forward_git write-tree)
only=$(production_forward_git commit-tree "$only_tree" -p "$candidate" -m 'test: ownership SQL only')
[[ $(production_forward_git diff-tree --no-commit-id --name-only -r "$only") == "$OWNERSHIP" ]]
source "$fixture/classifier.sh"
REPO=$GITHUB_WORKSPACE
fetch_main() { :; }
validate_main_commit() { production_forward_git merge-base --is-ancestor "$candidate" "$1"; }
marker_value() { printf '%s\n' "$candidate"; }
postgres_pool_bootstrap_installed() { return 1; }
print_plan "$only" > "$fixture/plan"
for expected in frontend=false backend=true control=false x_collector=false; do
  grep -Fx "$expected" "$fixture/plan"
done
source "$SCRIPT_DIR/production-backend-classification-lib.sh"
[[ $(backend_services "$candidate" "$only") == $'migrate\ndaily-runner' ]]
# Execute only the wrapper function with a fake Docker sink, never a daemon.
sed -n '/^reader_summary_publication_run_postgres_client() (/ , /^)/p' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" > "$fixture/client.sh"
source "$fixture/client.sh"
mkdir -p "$fixture/mount/ops/deploy" "$fixture/mount/scripts/sql"
pre=$fixture/mount/ops/deploy/reader-summary-publication-pre-migration.sql
include=$fixture/mount/$OWNERSHIP
cp "$SCRIPT_DIR/reader-summary-publication-pre-migration.sql" "$pre"
cp "$PROJECT_ROOT/$OWNERSHIP" "$include"
READER_SUMMARY_PUBLICATION_DATABASE_HOST=fixture.invalid
READER_SUMMARY_PUBLICATION_DATABASE_PORT=1 READER_SUMMARY_PUBLICATION_DATABASE=fixture
READER_SUMMARY_PUBLICATION_MIGRATOR_ROLE=fixture
READER_SUMMARY_PUBLICATION_PROVISIONER_ROLE=fixture READER_SUMMARY_TENANT_SYSTEM_RUNTIME_ROLE=fixture
reader_summary_publication_admin_pgpass() { printf 'fixture-only\n'; }
docker() { cat >/dev/null; printf '%s\n' "$@" > "$fixture/docker-args"; }
reader_summary_publication_run_postgres_client fixture fixture fixture bootstrap fixture '' "$pre"
grep -Fx "$fixture/mount/ops/deploy/../../$OWNERSHIP:/run/social-monitor-db/reader-summary-publication-tenant-ownership.sql:ro" \
  "$fixture/docker-args"
grep -Fx "$pre:/run/social-monitor-db/publication-migration.sql:ro" "$fixture/docker-args"
for variant in missing symlink; do
  rm -f "$include" "$fixture/docker-args"
  if [[ $variant == symlink ]]; then ln -s "$PROJECT_ROOT/$OWNERSHIP" "$include"; fi
  status=0
  reader_summary_publication_run_postgres_client fixture fixture fixture bootstrap fixture '' "$pre" || status=$?
  [[ $status == 64 && ! -e $fixture/docker-args ]]
done
printf 'PASS: candidate graph/seal, 11 controllers, installed incident, original/bad markers/repair, 44 drift negatives, SQL bytes, historical plan, migrate+daily-runner, fixed read-only mount and missing/symlink rejection\n'
