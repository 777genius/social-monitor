#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
BASE=$(
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["adoptionBaseCommit"])' \
    "$SCRIPT_DIR/postgres-pool-release-contract.json"
)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/postgres-pool-bootstrap-transition.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
ORIGIN=$FIXTURE/origin.git
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
INSTALLED=$CONTROL/github-production-deploy.sh
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
LEGACY_RUNTIME=$CONTROL/postgres-runtime-releases/legacy-runtime
SYSTEMD_UNIT=$ROOT/runtime/systemd/social-monitor-prod.service
DAILY_RUNNER=$CONTROL/daily-run.sh
RUNNING_CONTAINER_SENTINEL=$ROOT/runtime/running-containers.sentinel
RUNTIME_SENTINEL=$LEGACY_RUNTIME/runtime.sentinel
NON_ACTIVATING_SNAPSHOT=$FIXTURE/release-a-non-activating-before

git -C "$PROJECT_ROOT" show "$BASE:ops/deploy/social-monitor-production-deploy.sh" \
  > "$FIXTURE/legacy-entrypoint.sh"
# Adapt only the legacy entrypoint's root-vs-test path selection so this
# production-free contract test can run in rootful CI sandboxes. All planning,
# marker, component, and sync behavior below that preamble remains byte-for-byte
# from the recorded main commit.
python3 - "$FIXTURE/legacy-entrypoint.sh" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
source = path.read_text(encoding="utf-8")
needle = "if ((EUID == 0)); then"
replacement = """if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
  ROOT=${SOCIAL_MONITOR_DEPLOY_ROOT:?test root is required}
  REPO=${SOCIAL_MONITOR_DEPLOY_REPO:?test repo is required}
  CONTROL=${SOCIAL_MONITOR_DEPLOY_CONTROL:?test control root is required}
  STATE=${SOCIAL_MONITOR_DEPLOY_STATE:-$CONTROL/deploy-state}
  STAGING=${SOCIAL_MONITOR_DEPLOY_STAGING:-$ROOT/runtime/deploy-staging}
  RELEASES=${SOCIAL_MONITOR_DEPLOY_RELEASES:-$ROOT/runtime/frontend-releases}
  PROJECT=${SOCIAL_MONITOR_DEPLOY_PROJECT:-social-monitor-prod}
elif ((EUID == 0)); then"""
if source.count(needle) < 1:
    raise SystemExit("legacy entrypoint root preamble was not found")
path.write_text(source.replace(needle, replacement, 1), encoding="utf-8")
source = path.read_text(encoding="utf-8")
policy = "verify_host_policy() {\n"
if policy not in source:
    raise SystemExit("legacy host-policy function was not found")
source = source.replace(
    policy,
    policy + "  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] && return 0\n",
    1,
)
compose = "verify_compose_scope() (\n"
if compose not in source:
    raise SystemExit("legacy Compose verifier was not found")
source = source.replace(
    compose,
    compose + "  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] && return 0\n",
    1,
)
sync = "sync_control_script() {\n"
if sync not in source:
    raise SystemExit("legacy control sync was not found")
source = source.replace(
    sync,
    sync
    + "  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && "
    + "! -e $STATE/legacy-sync-failed-once ]]; then\n"
    + "    : > $STATE/legacy-sync-failed-once\n"
    + "    return 91\n"
    + "  fi\n",
    1,
)
path.write_text(source, encoding="utf-8")
PY
legacy_marker_line=$(grep -nF 'printf '\''%s\n'\'' "$sha" > "$STATE/control.sha"' \
  "$FIXTURE/legacy-entrypoint.sh" | cut -d: -f1)
legacy_sync_line=$(grep -nF 'sync_control_script' "$FIXTURE/legacy-entrypoint.sh" | tail -1 | cut -d: -f1)
((legacy_marker_line < legacy_sync_line))

git init --bare -q "$ORIGIN"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Pool Bootstrap Contract'
git -C "$REPO" config user.email bootstrap-contract@example.invalid
git -C "$REPO" remote add origin "$ORIGIN"
install -d "$REPO/ops/deploy" "$REPO/apps/api-gateway" "$STATE" \
  "$ROOT/runtime/systemd" "$LEGACY_RUNTIME" "$NON_ACTIVATING_SNAPSHOT" \
  "$FIXTURE/bin"
cp "$FIXTURE/legacy-entrypoint.sh" "$REPO/ops/deploy/social-monitor-production-deploy.sh"
printf 'base\n' > "$REPO/README.md"
git -C "$REPO" add .
git -C "$REPO" commit -qm 'test: installed legacy main'
git -C "$REPO" push -q -u origin main
BASE_SHA=$(git -C "$REPO" rev-parse HEAD)
for component in frontend backend control; do
  printf '%s\n' "$BASE_SHA" > "$STATE/$component.sha"
done
printf 'legacy-runtime\n' > "$LEGACY_RUNTIME/READY"
printf 'runtime-process=legacy-running\n' > "$RUNTIME_SENTINEL"
printf 'api=legacy-container-id image=legacy-image-id restarts=0\n' \
  > "$RUNNING_CONTAINER_SENTINEL"
printf '[Unit]\nDescription=legacy production runtime\n' > "$SYSTEMD_UNIT"
printf '#!/usr/bin/env bash\nprintf legacy-daily-runner\\n\n' > "$DAILY_RUNNER"
chmod 0755 "$DAILY_RUNNER"
ln -s "$LEGACY_RUNTIME" "$POSTGRES_RUNTIME_CURRENT"
cp "$STATE/backend.sha" "$NON_ACTIVATING_SNAPSHOT/backend.sha"
cp "$SYSTEMD_UNIT" "$NON_ACTIVATING_SNAPSHOT/social-monitor-prod.service"
cp "$DAILY_RUNNER" "$NON_ACTIVATING_SNAPSHOT/daily-run.sh"
cp "$RUNNING_CONTAINER_SENTINEL" \
  "$NON_ACTIVATING_SNAPSHOT/running-containers.sentinel"
cp "$RUNTIME_SENTINEL" "$NON_ACTIVATING_SNAPSHOT/runtime.sentinel"
cp "$LEGACY_RUNTIME/READY" "$NON_ACTIVATING_SNAPSHOT/runtime-ready"
readlink "$POSTGRES_RUNTIME_CURRENT" \
  > "$NON_ACTIVATING_SNAPSHOT/postgres-runtime-current.target"
# Any accidental container command makes this production-free test fail. The
# byte sentinels below separately prove that pre-existing runtime state stays
# unchanged even across the injected legacy failure and repair attempts.
printf '#!/usr/bin/env bash\nexit 98\n' > "$FIXTURE/bin/docker"
chmod 0755 "$FIXTURE/bin/docker"

cp "$PROJECT_ROOT/ops/deploy/social-monitor-production-deploy.sh" \
  "$REPO/ops/deploy/social-monitor-production-deploy.sh"
cp "$PROJECT_ROOT/ops/deploy/postgres-runtime-deploy-lib.sh" "$REPO/ops/deploy/"
cp "$PROJECT_ROOT/ops/deploy/verify-postgres-runtime-topology.py" "$REPO/ops/deploy/"
cp -R "$PROJECT_ROOT/ops/deploy/production-runtime" "$REPO/ops/deploy/"
# Compose rendering is an external prerequisite for this transition test. Stub
# only that verifier in the fixture copy; deployment planning, marker ordering,
# integration advance, control sync, and bootstrap commit execute unchanged.
python3 - "$REPO/ops/deploy/social-monitor-production-deploy.sh" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
source = path.read_text(encoding="utf-8")
needle = "verify_compose_scope() (\n"
if needle not in source:
    raise SystemExit("new Compose verifier was not found")
path.write_text(
    source.replace(
        needle,
        needle + "  [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] && return 0\n",
        1,
    ),
    encoding="utf-8",
)
PY
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: Release A control bootstrap'
git -C "$REPO" push -q origin main
TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
printf '[safe]\n\tdirectory = %s\n' "$REPO" > "$FIXTURE/gitconfig"
chmod -R a+rwX "$FIXTURE"

assert_release_a_non_activation() {
  cmp -s "$NON_ACTIVATING_SNAPSHOT/backend.sha" "$STATE/backend.sha"
  [[ -L $POSTGRES_RUNTIME_CURRENT ]]
  [[ $(readlink "$POSTGRES_RUNTIME_CURRENT") == \
    $(< "$NON_ACTIVATING_SNAPSHOT/postgres-runtime-current.target") ]]
  cmp -s "$NON_ACTIVATING_SNAPSHOT/social-monitor-prod.service" "$SYSTEMD_UNIT"
  cmp -s "$NON_ACTIVATING_SNAPSHOT/daily-run.sh" "$DAILY_RUNNER"
  cmp -s "$NON_ACTIVATING_SNAPSHOT/running-containers.sentinel" \
    "$RUNNING_CONTAINER_SENTINEL"
  cmp -s "$NON_ACTIVATING_SNAPSHOT/runtime.sentinel" \
    "$POSTGRES_RUNTIME_CURRENT/runtime.sentinel"
  cmp -s "$NON_ACTIVATING_SNAPSHOT/runtime-ready" \
    "$POSTGRES_RUNTIME_CURRENT/READY"
  [[ ! -e $CONTROL/postgres-runtime-releases/$TARGET_SHA ]]
}

run_entrypoint() {
  local entrypoint=$1
  local action=$2
  local -a environment=(
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
    SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT"
    SOCIAL_MONITOR_DEPLOY_REPO="$REPO"
    SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL"
    SOCIAL_MONITOR_DEPLOY_STATE="$STATE"
    GIT_CONFIG_GLOBAL="$FIXTURE/gitconfig"
    PATH="$FIXTURE/bin:/usr/local/bin:/usr/bin:/bin"
    HOME="$FIXTURE"
  )
  /usr/bin/env "${environment[@]}" /usr/bin/bash "$entrypoint" \
    "$action" "$TARGET_SHA"
}

legacy_plan=$(run_entrypoint "$FIXTURE/legacy-entrypoint.sh" plan)
grep -Fx 'backend=false' <<< "$legacy_plan" >/dev/null
grep -Fx 'control=true' <<< "$legacy_plan" >/dev/null
if grep -q '^postgres_pool_bootstrap=' <<< "$legacy_plan"; then
  echo 'legacy entrypoint unexpectedly claimed bootstrap support' >&2
  exit 1
fi

# Attempt 1 executes the actual old main entrypoint. The injected one-shot
# process failure occurs at its real marker-before-sync boundary.
set +e
run_entrypoint "$FIXTURE/legacy-entrypoint.sh" deploy >/dev/null
first_status=$?
set -e
((first_status == 91))
[[ $(cat "$STATE/control.sha") == "$TARGET_SHA" ]]
[[ ! -e $INSTALLED && ! -e $STATE/postgres-pool-bootstrap.sha ]]
assert_release_a_non_activation

# Attempt 2 executes old main again. Because integration and control.sha already
# advanced, it repairs the old poison window by reaching the real atomic sync.
run_entrypoint "$FIXTURE/legacy-entrypoint.sh" deploy >/dev/null
cmp -s "$INSTALLED" "$REPO/ops/deploy/social-monitor-production-deploy.sh"
assert_release_a_non_activation
uncommitted_plan=$(run_entrypoint "$INSTALLED" plan)
grep -Fx 'postgres_pool_bootstrap=uninstalled' <<< "$uncommitted_plan" >/dev/null

# Attempt 3 executes the new entrypoint and atomically commits the independent
# bootstrap marker. Only now may a later Release B be planned.
run_entrypoint "$INSTALLED" deploy >/dev/null
assert_release_a_non_activation
committed_plan=$(run_entrypoint "$INSTALLED" plan)
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' <<< "$committed_plan" >/dev/null
grep -Fx "postgres_pool_bootstrap_sha=$TARGET_SHA" <<< "$committed_plan" >/dev/null

WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
grep -F 'for bootstrap_attempt in 1 2 3' "$WORKFLOW" >/dev/null
grep -F 'post_bootstrap == postgres-pool-v1' "$WORKFLOW" >/dev/null
echo 'Legacy-main to overlap-safe bootstrap transition tests passed'
