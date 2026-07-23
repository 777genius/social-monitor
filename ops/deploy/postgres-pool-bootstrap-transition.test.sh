#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
BASE=$(
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["adoptionBaseCommit"])' \
    "$SCRIPT_DIR/postgres-pool-release-contract.json"
)
RELEASE_A_COMMIT=83f6932eaaa87a49c64b9f8b07ada5052d47a7b4
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/postgres-pool-bootstrap-transition.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

TEST_PHASE=fixture-setup
report_error() {
  local status=$1
  local line=$2
  local command=$3
  printf 'bootstrap-transition-error: phase=%s line=%s status=%s command=%q\n' \
    "$TEST_PHASE" "$line" "$status" "$command" >&2
}
trap 'report_error "$?" "$LINENO" "$BASH_COMMAND"' ERR

REPO=$FIXTURE/repo
ORIGIN=$FIXTURE/origin.git
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
INSTALLED=$CONTROL/github-production-deploy.sh
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
LEGACY_RUNTIME=$CONTROL/postgres-runtime-releases/legacy-runtime
SYSTEMD_UNIT=$ROOT/runtime/systemd/social-monitor-prod.service
DAILY_RUNNER=$CONTROL/daily-run.sh
RUNNING_CONTAINER_SENTINEL=$ROOT/runtime/running-containers.sentinel
RUNTIME_SENTINEL=$LEGACY_RUNTIME/runtime.sentinel
NON_ACTIVATING_SNAPSHOT=$FIXTURE/release-a-non-activating-before

git -C "$PROJECT_ROOT" show "$BASE:ops/deploy/social-monitor-production-deploy.sh" \
  > "$FIXTURE/legacy-entrypoint.sh"
# Adapt only the legacy entrypoint's root-vs-test path selection so this
# production-free contract test can run in rootful CI sandboxes. Planning,
# marker, component, and atomic sync ordering remain from the recorded main
# commit; the fixture-only ownership adaptation is explicit below.
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
# The production entrypoint must retain its root-owned install. This fixture
# executes that same atomic sync as the unprivileged GitHub runner, so remove
# only the ownership request from the generated test copy.
root_install = 'install -m 0755 -o root -g root "$source" "$destination.next"'
if source.count(root_install) != 1:
    raise SystemExit("legacy root-owned control install was not found exactly once")
source = source.replace(
    root_install,
    'install -m 0755 "$source" "$destination.next"',
    1,
)
path.write_text(source, encoding="utf-8")
PY
legacy_marker_line=$(grep -nF "printf '%s\n' \"\$sha\" > \"\$STATE/control.sha\"" \
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
cp "$PROJECT_ROOT/ops/deploy/reader-summary-publication-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/reader-summary-publication-pre-migration.sql" \
  "$PROJECT_ROOT/ops/deploy/reader-summary-publication-post-migration.sql" \
  "$REPO/ops/deploy/"
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

# This is a historical Release A transition. Later control bridges must not be
# spliced into its exact 18-path producer fixture.
git -C "$PROJECT_ROOT" show \
  "$RELEASE_A_COMMIT:ops/deploy/social-monitor-production-deploy.sh" \
  > "$REPO/ops/deploy/social-monitor-production-deploy.sh"
cp "$PROJECT_ROOT/ops/deploy/postgres-runtime-deploy-lib.sh" "$REPO/ops/deploy/"
cp "$PROJECT_ROOT/ops/deploy/reader-summary-publication-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/reader-summary-publication-pre-migration.sql" \
  "$PROJECT_ROOT/ops/deploy/reader-summary-publication-post-migration.sql" \
  "$REPO/ops/deploy/"
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
source = path.read_text(encoding="utf-8")
root_install = 'install -m 0755 -o root -g root "$source" "$destination.next"'
if source.count(root_install) != 1:
    raise SystemExit("new root-owned control install was not found exactly once")
path.write_text(
    source.replace(
        root_install,
        'install -m 0755 "$source" "$destination.next"',
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
  local target=${3:-$TARGET_SHA}
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
    "$action" "$target"
}

run_current_deploy() {
  local target=${1:-$TARGET_SHA}
  local -a environment=(
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
    SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT"
    SOCIAL_MONITOR_DEPLOY_REPO="$REPO"
    SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL"
    SOCIAL_MONITOR_DEPLOY_STATE="$STATE"
    GIT_CONFIG_GLOBAL="$FIXTURE/gitconfig"
  )
  /usr/bin/env "${environment[@]}" /usr/bin/bash -c '
    source "$1"
    advance_integration() {
      printf "integration\n" >> "$2"
      return 97
    }
    sync_control_script() {
      printf "control\n" >> "$2"
      return 97
    }
    deploy_release_runtime_transaction() {
      printf "backend-or-runtime\n" >> "$2"
      return 97
    }
    deploy_frontend() {
      printf "frontend\n" >> "$2"
      return 97
    }
    deploy_release "$3"
  ' _ "$INSTALLED" "$RECOVERY_ACTIVATION_LOG" "$target"
}

TEST_PHASE=legacy-plan
legacy_plan=$(run_entrypoint "$FIXTURE/legacy-entrypoint.sh" plan)
grep -Fx 'backend=false' <<< "$legacy_plan" >/dev/null
grep -Fx 'control=true' <<< "$legacy_plan" >/dev/null
if grep -q '^postgres_pool_bootstrap=' <<< "$legacy_plan"; then
  echo 'legacy entrypoint unexpectedly claimed bootstrap support' >&2
  exit 1
fi

# Attempt 1 executes the actual old main entrypoint. The injected one-shot
# process failure occurs at its real marker-before-sync boundary.
TEST_PHASE=legacy-poison-window
trap - ERR
set +e
run_entrypoint "$FIXTURE/legacy-entrypoint.sh" deploy >/dev/null
first_status=$?
set -e
trap 'report_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
((first_status == 91))
[[ $(cat "$STATE/control.sha") == "$TARGET_SHA" ]]
[[ ! -e $INSTALLED && ! -e $STATE/postgres-pool-bootstrap.sha ]]
assert_release_a_non_activation

# Attempt 2 executes old main again. Because integration and control.sha already
# advanced, it repairs the old poison window by reaching the real atomic sync.
TEST_PHASE=legacy-repair
run_entrypoint "$FIXTURE/legacy-entrypoint.sh" deploy >/dev/null
cmp -s "$INSTALLED" "$REPO/ops/deploy/social-monitor-production-deploy.sh"
[[ $(stat -c '%a' "$INSTALLED") == 755 ]]
assert_release_a_non_activation
uncommitted_plan=$(run_entrypoint "$INSTALLED" plan)
grep -Fx 'postgres_pool_bootstrap=uninstalled' <<< "$uncommitted_plan" >/dev/null

# Attempt 3 executes the new entrypoint and atomically commits the independent
# bootstrap marker. Only now may a later Release B be planned.
TEST_PHASE=bootstrap-commit
run_entrypoint "$INSTALLED" deploy >/dev/null
assert_release_a_non_activation
committed_plan=$(run_entrypoint "$INSTALLED" plan)
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' <<< "$committed_plan" >/dev/null
grep -Fx "postgres_pool_bootstrap_sha=$TARGET_SHA" <<< "$committed_plan" >/dev/null

TEST_PHASE=already-newer-fixture
cp "$PROJECT_ROOT/ops/deploy/social-monitor-production-deploy.sh" \
  "$PROJECT_ROOT/ops/deploy/deploy-control-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/postgres-runtime-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/backend-image-rescue-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/x-collector-image-deploy-lib.sh" \
  "$REPO/ops/deploy/"
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: current integration Release B'
git -C "$REPO" push -q origin main
CURRENT_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" merge-base --is-ancestor "$TARGET_SHA" "$CURRENT_SHA"
cp "$REPO/ops/deploy/social-monitor-production-deploy.sh" "$INSTALLED"
chmod 0755 "$INSTALLED"
cp "$INSTALLED" "$FIXTURE/installed-entrypoint-before-recovery"
rm -f "$STATE/postgres-pool-bootstrap.sha"
RECOVERY_ACTIVATION_LOG=$FIXTURE/already-newer-activation.log

# Recovery remains behind the deployment and PostgreSQL admission locks. A
# waiting daily run therefore wins before an already-newer bootstrap can
# commit any marker.
TEST_PHASE=already-newer-daily-priority
exec {daily_priority_fd}>"$DAILY_SINGLETON_LOCK"
flock -n "$daily_priority_fd"
trap - ERR
set +e
daily_priority_output=$(run_current_deploy 2>&1)
daily_priority_status=$?
set -e
trap 'report_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
flock -u "$daily_priority_fd"
exec {daily_priority_fd}>&-
((daily_priority_status != 0))
grep -F 'daily run has PostgreSQL admission priority' \
  <<< "$daily_priority_output" >/dev/null
if grep -q '^already-deployed-or-newer=' <<< "$daily_priority_output"; then
  echo 'daily-priority failure reported already-deployed success' >&2
  exit 1
fi
[[ ! -e $STATE/postgres-pool-bootstrap.sha ]]

# Requesting ancestor A while integration is already at B repairs only the
# missing bootstrap marker. Existing application/runtime bytes and the
# installed entrypoint remain untouched.
TEST_PHASE=already-newer-bootstrap-recovery
recovery_output=$(run_current_deploy)
grep -Fx "already-deployed-or-newer=$CURRENT_SHA" \
  <<< "$recovery_output" >/dev/null
[[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$CURRENT_SHA" ]]
cmp -s "$FIXTURE/installed-entrypoint-before-recovery" "$INSTALLED"
assert_release_a_non_activation
[[ ! -e $CONTROL/postgres-runtime-releases/$CURRENT_SHA ]]
recovered_plan=$(run_entrypoint "$INSTALLED" plan "$CURRENT_SHA")
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' \
  <<< "$recovered_plan" >/dev/null
grep -Fx "postgres_pool_bootstrap_sha=$CURRENT_SHA" \
  <<< "$recovered_plan" >/dev/null
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]

# A valid installed ancestor marker is historical evidence. Recovery must not
# rewrite it merely to make the marker equal the newer integration checkout.
TEST_PHASE=already-newer-installed-marker
printf '%s\n' "$TARGET_SHA" > "$STATE/postgres-pool-bootstrap.sha"
touch -d '2001-01-01 00:00:00 UTC' \
  "$STATE/postgres-pool-bootstrap.sha"
cp "$STATE/postgres-pool-bootstrap.sha" "$FIXTURE/installed-marker-before"
installed_marker_identity=$(
  stat -c '%d:%i:%s:%Y' "$STATE/postgres-pool-bootstrap.sha"
)
installed_output=$(run_current_deploy)
grep -Fx "already-deployed-or-newer=$CURRENT_SHA" \
  <<< "$installed_output" >/dev/null
cmp -s "$FIXTURE/installed-marker-before" \
  "$STATE/postgres-pool-bootstrap.sha"
[[ $(stat -c '%d:%i:%s:%Y' "$STATE/postgres-pool-bootstrap.sha") == \
  "$installed_marker_identity" ]]
cmp -s "$FIXTURE/installed-entrypoint-before-recovery" "$INSTALLED"
assert_release_a_non_activation
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]

# Existing malformed or non-ancestor markers are never overwritten with B.
# Both cases fail before the already-deployed success line.
TEST_PHASE=already-newer-invalid-marker
printf 'invalid-marker\n' > "$STATE/postgres-pool-bootstrap.sha"
cp "$STATE/postgres-pool-bootstrap.sha" "$FIXTURE/invalid-marker-before"
trap - ERR
set +e
invalid_marker_output=$(run_current_deploy 2>&1)
invalid_marker_status=$?
set -e
trap 'report_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
((invalid_marker_status != 0))
grep -F 'existing PostgreSQL bootstrap marker is invalid' \
  <<< "$invalid_marker_output" >/dev/null
if grep -q '^already-deployed-or-newer=' <<< "$invalid_marker_output"; then
  echo 'invalid bootstrap marker reported already-deployed success' >&2
  exit 1
fi
cmp -s "$FIXTURE/invalid-marker-before" \
  "$STATE/postgres-pool-bootstrap.sha"

git -C "$REPO" checkout -qb divergent-marker "$BASE_SHA"
printf 'divergent marker\n' > "$REPO/divergent-marker.txt"
git -C "$REPO" add divergent-marker.txt
git -C "$REPO" commit -qm 'test: divergent bootstrap marker'
DIVERGENT_MARKER_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" checkout -q main
if git -C "$REPO" merge-base --is-ancestor \
  "$DIVERGENT_MARKER_SHA" "$CURRENT_SHA"; then
  echo 'divergent bootstrap fixture unexpectedly became an ancestor' >&2
  exit 1
fi
printf '%s\n' "$DIVERGENT_MARKER_SHA" \
  > "$STATE/postgres-pool-bootstrap.sha"
cp "$STATE/postgres-pool-bootstrap.sha" "$FIXTURE/divergent-marker-before"
TEST_PHASE=already-newer-non-ancestor-marker
trap - ERR
set +e
non_ancestor_output=$(run_current_deploy 2>&1)
non_ancestor_status=$?
set -e
trap 'report_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
((non_ancestor_status != 0))
grep -F 'existing PostgreSQL bootstrap marker is invalid' \
  <<< "$non_ancestor_output" >/dev/null
if grep -q '^already-deployed-or-newer=' <<< "$non_ancestor_output"; then
  echo 'non-ancestor bootstrap marker reported already-deployed success' >&2
  exit 1
fi
cmp -s "$FIXTURE/divergent-marker-before" \
  "$STATE/postgres-pool-bootstrap.sha"
cmp -s "$FIXTURE/installed-entrypoint-before-recovery" "$INSTALLED"
assert_release_a_non_activation
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]

# Invalid requested commits and unvalidated local descendants cannot use the
# recovery path to mint a bootstrap marker or report already-deployed success.
TEST_PHASE=already-newer-invalid-request
rm -f "$STATE/postgres-pool-bootstrap.sha"
INVALID_REQUEST_SHA=0000000000000000000000000000000000000000
trap - ERR
set +e
invalid_request_output=$(run_current_deploy "$INVALID_REQUEST_SHA" 2>&1)
invalid_request_status=$?
set -e
trap 'report_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
((invalid_request_status != 0))
grep -F 'commit is unavailable' <<< "$invalid_request_output" >/dev/null
if grep -q '^already-deployed-or-newer=' <<< "$invalid_request_output"; then
  echo 'invalid requested commit reported already-deployed success' >&2
  exit 1
fi
[[ ! -e $STATE/postgres-pool-bootstrap.sha ]]

git -C "$REPO" checkout -qb unvalidated-current "$CURRENT_SHA"
printf 'unvalidated current\n' > "$REPO/unvalidated-current.txt"
git -C "$REPO" add unvalidated-current.txt
git -C "$REPO" commit -qm 'test: unvalidated current integration'
UNVALIDATED_CURRENT_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" merge-base --is-ancestor \
  "$CURRENT_SHA" "$UNVALIDATED_CURRENT_SHA"
TEST_PHASE=already-newer-unvalidated-current
trap - ERR
set +e
unvalidated_current_output=$(run_current_deploy 2>&1)
unvalidated_current_status=$?
set -e
trap 'report_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
((unvalidated_current_status != 0))
grep -F 'commit is not on origin/main' \
  <<< "$unvalidated_current_output" >/dev/null
if grep -q '^already-deployed-or-newer=' <<< "$unvalidated_current_output"; then
  echo 'unvalidated current commit reported already-deployed success' >&2
  exit 1
fi
[[ ! -e $STATE/postgres-pool-bootstrap.sha ]]
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]
git -C "$REPO" checkout -q main

git -C "$REPO" checkout -qb non-ancestor-current "$TARGET_SHA"
cp "$PROJECT_ROOT/ops/deploy/social-monitor-production-deploy.sh" \
  "$PROJECT_ROOT/ops/deploy/deploy-control-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/postgres-runtime-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/backend-image-rescue-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/x-collector-image-deploy-lib.sh" \
  "$REPO/ops/deploy/"
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: non-ancestor current integration'
NON_ANCESTOR_CURRENT_SHA=$(git -C "$REPO" rev-parse HEAD)
if git -C "$REPO" merge-base --is-ancestor \
  "$CURRENT_SHA" "$NON_ANCESTOR_CURRENT_SHA"; then
  echo 'non-ancestor current fixture unexpectedly contains Release B' >&2
  exit 1
fi
cp "$REPO/ops/deploy/social-monitor-production-deploy.sh" "$INSTALLED"
chmod 0755 "$INSTALLED"
TEST_PHASE=non-ancestor-current
trap - ERR
set +e
non_ancestor_current_output=$(run_current_deploy "$CURRENT_SHA" 2>&1)
non_ancestor_current_status=$?
set -e
trap 'report_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
((non_ancestor_current_status != 0))
if grep -q '^already-deployed-or-newer=' \
  <<< "$non_ancestor_current_output"; then
  echo 'non-ancestor current commit reported already-deployed success' >&2
  exit 1
fi
[[ ! -e $STATE/postgres-pool-bootstrap.sha ]]
if [[ -e $RECOVERY_ACTIVATION_LOG ]]; then
  [[ $(cat "$RECOVERY_ACTIVATION_LOG") == integration ]]
fi
rm -f "$RECOVERY_ACTIVATION_LOG"
git -C "$REPO" checkout -q main

TEST_PHASE=workflow-contract
WORKFLOW=$PROJECT_ROOT/.github/workflows/production-deploy.yml
python3 - "$WORKFLOW" <<'PY'
import pathlib
import sys

workflow = pathlib.Path(sys.argv[1])
lines = workflow.read_text(encoding="utf-8").splitlines()
step_header = "      - name: Deploy changed components"
step_indexes = [index for index, line in enumerate(lines) if line == step_header]
if len(step_indexes) != 1:
    raise SystemExit("workflow must contain exactly one deploy-components step")

step_start = step_indexes[0]
step_end = next(
    (
        index
        for index in range(step_start + 1, len(lines))
        if lines[index].startswith("      - name: ")
    ),
    len(lines),
)
step = lines[step_start:step_end]
run_indexes = [index for index, line in enumerate(step) if line == "        run: >-"]
if len(run_indexes) != 1:
    raise SystemExit("deploy-components step must contain exactly one folded run command")

command_lines = []
for line in step[run_indexes[0] + 1 :]:
    if not line.startswith("          "):
        break
    stripped = line.strip()
    if stripped:
        command_lines.append(stripped)
command = " ".join(command_lines)
expected = (
    'bash ops/deploy/github-production-deploy-client.sh deploy "$GITHUB_SHA" '
    '"$CONTROL_CHANGED" "$POSTGRES_POOL_BOOTSTRAP"'
)
if command != expected:
    raise SystemExit(
        f"deploy-components step does not delegate the exact bootstrap contract: {command!r}"
    )
PY
echo 'Legacy-main to overlap-safe bootstrap transition tests passed'
