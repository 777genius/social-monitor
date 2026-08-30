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
write_target_quorum_health_fixture() {
  local repository=$1
  local script=$repository/ops/deploy/rabbitmq-quorum-health.sh
  local recovery_script=$repository/ops/deploy/rabbitmq-quorum-recovery.sh
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'rabbitmq_quorum_health_probe() { :; }' > "$script"
  chmod 0755 "$script"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'rabbitmq_quorum_recovery_probe() { :; }' > "$recovery_script"
  chmod 0755 "$recovery_script"
}
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
# Adapt only root-vs-test path selection for rootful CI; recorded planning,
# marker, component, and atomic-sync ordering remain unchanged.
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
# Remove only root ownership from the fixture's otherwise identical atomic sync.
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
  "$PROJECT_ROOT/ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh" \
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
# Any container command fails; byte sentinels prove runtime state stays unchanged.
printf '#!/usr/bin/env bash\nexit 98\n' > "$FIXTURE/bin/docker"
chmod 0755 "$FIXTURE/bin/docker"
# Keep later control bridges out of the historical 18-path Release A fixture.
git -C "$PROJECT_ROOT" show \
  "$RELEASE_A_COMMIT:ops/deploy/social-monitor-production-deploy.sh" \
  > "$REPO/ops/deploy/social-monitor-production-deploy.sh"
cp "$PROJECT_ROOT/ops/deploy/postgres-runtime-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/postgres-runtime-asset-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/postgres-runtime-weekly-timer-state-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/postgres-runtime-activation-boundary-lib.sh" \
  "$REPO/ops/deploy/"
cp "$PROJECT_ROOT/ops/deploy/reader-summary-publication-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/reader-summary-publication-pre-migration.sql" \
  "$PROJECT_ROOT/ops/deploy/reader-summary-publication-post-migration.sql" \
  "$REPO/ops/deploy/"
cp "$PROJECT_ROOT/ops/deploy/verify-postgres-runtime-topology.py" "$REPO/ops/deploy/"
cp -R "$PROJECT_ROOT/ops/deploy/production-runtime" "$REPO/ops/deploy/"
# Stub only external Compose rendering; transition ordering executes unchanged.
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
    RECOVERY_SYNC_MODE="${RECOVERY_SYNC_MODE:-success}"
    RECOVERY_RACE_SHA="${RECOVERY_RACE_SHA:-$TARGET_SHA}"
    EXPECT_MISSING_SYNC_ENTRYPOINT="${EXPECT_MISSING_SYNC_ENTRYPOINT:-false}"
  )
  # Positional parameters and log paths expand only in the isolated child shell.
  # shellcheck disable=SC2016
  /usr/bin/env "${environment[@]}" /usr/bin/bash -c '
    recovery_event_log=$2
    source "$1"
    [[ $EXPECT_MISSING_SYNC_ENTRYPOINT != true ]] || ! declare -F sync_control_entrypoint >/dev/null
    advance_integration() {
      printf "integration\n" >> "$recovery_event_log"
      return 97
    }
    if [[ $RECOVERY_SYNC_MODE != success ]]; then
      sync_control_entrypoint() {
        printf "entrypoint\n" >> "$recovery_event_log"
        [[ $RECOVERY_SYNC_MODE != fail ]] || return 97
        source_path=$SOCIAL_MONITOR_DEPLOY_REPO/ops/deploy/social-monitor-production-deploy.sh
        destination=$SOCIAL_MONITOR_DEPLOY_CONTROL/github-production-deploy.sh
        install -m 0755 "$source_path" "$destination.next"
        mv -f "$destination.next" "$destination"
        case $RECOVERY_SYNC_MODE in
          dirty)
            printf "raced\n" > "$SOCIAL_MONITOR_DEPLOY_REPO/recovery-race.untracked"
            ;;
          head-race)
            git -C "$SOCIAL_MONITOR_DEPLOY_REPO" update-ref \
              refs/heads/main "$RECOVERY_RACE_SHA"
            ;;
          marker-race)
            printf "%s\n" "$RECOVERY_RACE_SHA" \
              > "$SOCIAL_MONITOR_DEPLOY_STATE/postgres-pool-bootstrap.sha.next"
            mv -f "$SOCIAL_MONITOR_DEPLOY_STATE/postgres-pool-bootstrap.sha.next" \
              "$SOCIAL_MONITOR_DEPLOY_STATE/postgres-pool-bootstrap.sha"
            ;;
          control-marker-race)
            printf "%s\n" "$RECOVERY_RACE_SHA" \
              > "$SOCIAL_MONITOR_DEPLOY_STATE/control.sha.next"
            mv -f "$SOCIAL_MONITOR_DEPLOY_STATE/control.sha.next" \
              "$SOCIAL_MONITOR_DEPLOY_STATE/control.sha"
            ;;
          installed-race)
            printf "\n# raced installed control\n" >> "$destination"
            ;;
          dormant-asset-race)
            printf "\n# raced dormant asset\n" >> \
              "$SOCIAL_MONITOR_DEPLOY_REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
            ;;
          *) return 96 ;;
        esac
      }
    fi
    sync_control_script() {
      printf "broad-control\n" >> "$recovery_event_log"
      return 97
    }
    deploy_release_runtime_transaction() {
      printf "backend-or-runtime\n" >> "$recovery_event_log"
      return 97
    }
    deploy_frontend() {
      printf "frontend\n" >> "$recovery_event_log"
      return 97
    }
    deploy_release "$3"
  ' _ "$INSTALLED" "$RECOVERY_ACTIVATION_LOG" "$target"
}
run_current_control_deploy() {
  local -a environment=(
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
    SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT"
    SOCIAL_MONITOR_DEPLOY_REPO="$REPO"
    SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL"
    SOCIAL_MONITOR_DEPLOY_STATE="$STATE"
    GIT_CONFIG_GLOBAL="$FIXTURE/gitconfig"
  )
  # The transaction callback records classification without activating the
  # fixture's dormant runtime assets.
  # shellcheck disable=SC2016
  /usr/bin/env "${environment[@]}" /usr/bin/bash -c '
    normal_event_log=$2
    normal_target=$3
    source "$1"
    advance_integration() {
      printf "integration\n" >> "$normal_event_log"
      [[ $(git -C "$SOCIAL_MONITOR_DEPLOY_REPO" rev-parse HEAD) == "$normal_target" ]]
    }
    sync_control_script() {
      printf "control\n" >> "$normal_event_log"
    }
    load_target_reader_summary_publication_deploy_library() {
      printf "load-backend\n" >> "$normal_event_log"
    }
    deploy_release_runtime_transaction() {
      printf "transaction:%s:%s\n" "$2" "$3" >> "$normal_event_log"
    }
    deploy_frontend() {
      printf "frontend\n" >> "$normal_event_log"
      return 97
    }
    deploy_release "$normal_target"
  ' _ "$INSTALLED" "$NORMAL_CONTROL_LOG" "$CURRENT_SHA"
}
TEST_PHASE=legacy-plan
legacy_plan=$(run_entrypoint "$FIXTURE/legacy-entrypoint.sh" plan)
grep -Fx 'backend=false' <<< "$legacy_plan" >/dev/null
grep -Fx 'control=true' <<< "$legacy_plan" >/dev/null
if grep -q '^postgres_pool_bootstrap=' <<< "$legacy_plan"; then
  echo 'legacy entrypoint unexpectedly claimed bootstrap support' >&2
  exit 1
fi
# Attempt 1 fails old main at its real marker-before-sync boundary.
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
# Attempt 2 repairs the old poison window through the real atomic sync.
TEST_PHASE=legacy-repair
run_entrypoint "$FIXTURE/legacy-entrypoint.sh" deploy >/dev/null
cmp -s "$INSTALLED" "$REPO/ops/deploy/social-monitor-production-deploy.sh"
[[ $(stat -c '%a' "$INSTALLED") == 755 ]]
assert_release_a_non_activation
uncommitted_plan=$(run_entrypoint "$INSTALLED" plan)
grep -Fx 'postgres_pool_bootstrap=uninstalled' <<< "$uncommitted_plan" >/dev/null
# Attempt 3 atomically commits the bootstrap marker that admits Release B.
TEST_PHASE=bootstrap-commit
run_entrypoint "$INSTALLED" deploy >/dev/null
assert_release_a_non_activation
committed_plan=$(run_entrypoint "$INSTALLED" plan)
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' <<< "$committed_plan" >/dev/null
grep -Fx "postgres_pool_bootstrap_sha=$TARGET_SHA" <<< "$committed_plan" >/dev/null
TEST_PHASE=already-newer-fixture
# Model the independently advanced marker with the delegated sync shape that
# predates the local entrypoint compatibility helper.
cp "$PROJECT_ROOT/ops/deploy/social-monitor-production-deploy.sh" \
  "$REPO/ops/deploy/"
python3 - "$REPO/ops/deploy/social-monitor-production-deploy.sh" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
source = path.read_text(encoding="utf-8")
start = source.index("sync_control_entrypoint() {")
end = source.index("\n}\n\ncommit_postgres_pool_bootstrap() {", start) + 2
helper = source[start:end]
compatibility_reference = "  : sync_control_entrypoint\n"
if source.count(compatibility_reference) != 1:
    raise SystemExit("entrypoint compatibility reference was not found exactly once")
source = source.replace(compatibility_reference, "", 1)
source = source.replace(helper + "\n\n", "", 1)
path.write_text(source, encoding="utf-8")
PY
if grep -q '^sync_control_entrypoint()' "$REPO/ops/deploy/social-monitor-production-deploy.sh"; then
  echo 'historical control fixture unexpectedly defines the split helper' >&2
  exit 1
fi
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
git -C "$REPO" commit -qm 'test: historical installed control'
git -C "$REPO" push -q origin main
HISTORICAL_CONTROL_SHA=$(git -C "$REPO" rev-parse HEAD)
# Reproduce a backend gap before the entrypoint-only installed-blob introduction.
printf 'legitimate backend gap\n' \
  > "$REPO/apps/api-gateway/stale-control-gap.txt"
git -C "$REPO" add apps/api-gateway/stale-control-gap.txt
git -C "$REPO" commit -qm 'test: backend gap before installed control'
cp "$PROJECT_ROOT/ops/deploy/social-monitor-production-deploy.sh" \
  "$REPO/ops/deploy/"
git -C "$REPO" add ops/deploy/social-monitor-production-deploy.sh
git -C "$REPO" commit -qm 'test: installed control-only entrypoint'
STALE_CONTROL_SHA=$(git -C "$REPO" rev-parse HEAD)
[[ $(git -C "$REPO" diff --name-only \
  "$STALE_CONTROL_SHA^" "$STALE_CONTROL_SHA" --) == \
  ops/deploy/social-monitor-production-deploy.sh ]]
git -C "$REPO" diff --name-only "$BASE_SHA" "$STALE_CONTROL_SHA" -- \
  | grep -Fx 'apps/api-gateway/stale-control-gap.txt' >/dev/null
cp "$PROJECT_ROOT/ops/deploy/social-monitor-production-deploy.sh" \
  "$PROJECT_ROOT/ops/deploy/deploy-control-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/deploy-control-bridge-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/postgres-runtime-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/backend-runtime-health-lib.sh" \
  "$PROJECT_ROOT/ops/deploy"/backend-image-rescue-{lib,pin-cleanup-lib}.sh \
  "$PROJECT_ROOT/ops/deploy/docker-maintenance-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/daily-runner-image-bootstrap-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/x-collector-image-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/reader-summary-recovery-maintenance-lib.sh" \
  "$REPO/ops/deploy/"
write_target_quorum_health_fixture "$REPO"
# Adapt only the committed fallback copy; this matches literal reviewed shell.
# shellcheck disable=SC2016
sed -i -e 's/install -m 0755 -o root -g root "$source" "$temporary"/install -m 0755 "$source" "$temporary"/' \
  -e "s/== 0:0:755/== $(id -u):$(id -g):755/g" \
  "$REPO/ops/deploy/deploy-control-lib.sh"
git -C "$REPO" add ops/deploy
git -C "$REPO" commit -qm 'test: current integration Release B'
git -C "$REPO" push -q origin main
CURRENT_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" merge-base --is-ancestor "$TARGET_SHA" "$CURRENT_SHA"
git -C "$REPO" merge-base --is-ancestor \
  "$HISTORICAL_CONTROL_SHA" "$CURRENT_SHA"
cp "$REPO/ops/deploy/social-monitor-production-deploy.sh" "$INSTALLED"
chmod 0755 "$INSTALLED"
[[ $(git -C "$REPO" hash-object --no-filters "$INSTALLED") == \
  $(git -C "$REPO" rev-parse \
    "$STALE_CONTROL_SHA:ops/deploy/social-monitor-production-deploy.sh") ]]
cp "$INSTALLED" "$FIXTURE/installed-entrypoint-before-recovery"
rm -f "$STATE/postgres-pool-bootstrap.sha"
RECOVERY_ACTIVATION_LOG=$FIXTURE/already-newer-activation.log

# A waiting daily run wins before already-newer recovery can commit a marker.
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
# missing bootstrap marker. The stale control and backend markers stay intact.
TEST_PHASE=already-newer-bootstrap-recovery
stale_backend_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/backend.sha")
stale_control_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha")
recovery_output=$(run_current_deploy)
grep -Fx "already-deployed-or-newer=$CURRENT_SHA" \
  <<< "$recovery_output" >/dev/null
[[ $(cat "$STATE/postgres-pool-bootstrap.sha") == "$CURRENT_SHA" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/backend.sha") == \
  "$stale_backend_identity" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha") == \
  "$stale_control_identity" ]]
cmp -s "$FIXTURE/installed-entrypoint-before-recovery" "$INSTALLED"
assert_release_a_non_activation
[[ ! -e $CONTROL/postgres-runtime-releases/$CURRENT_SHA ]]
recovered_plan=$(run_entrypoint "$INSTALLED" plan "$CURRENT_SHA")
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' \
  <<< "$recovered_plan" >/dev/null
grep -Fx "postgres_pool_bootstrap_sha=$CURRENT_SHA" \
  <<< "$recovered_plan" >/dev/null
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]

install_historical_control_entrypoint() {
  rm -f "$INSTALLED"
  git -C "$REPO" show \
    "$HISTORICAL_CONTROL_SHA:ops/deploy/social-monitor-production-deploy.sh" \
    > "$INSTALLED"
  chmod 0755 "$INSTALLED"
}

assert_current_recovery_fails() {
  local expected=$1
  local target=${2:-$TARGET_SHA}
  local output status

  trap - ERR
  set +e
  output=$(run_current_deploy "$target" 2>&1)
  status=$?
  set -e
  trap 'report_error "$?" "$LINENO" "$BASH_COMMAND"' ERR
  ((status != 0))
  grep -F "$expected" <<< "$output" >/dev/null
  if grep -q '^already-deployed-or-newer=' <<< "$output"; then
    echo 'failed bootstrap reconciliation reported already-deployed success' >&2
    exit 1
  fi
}

assert_recovery_control_only() {
  if [[ -e $RECOVERY_ACTIVATION_LOG ]] && \
     grep -Ev '^entrypoint$' "$RECOVERY_ACTIVATION_LOG" >/dev/null; then
    echo 'bootstrap reconciliation attempted runtime activation' >&2
    exit 1
  fi
  assert_release_a_non_activation
  [[ ! -e $CONTROL/postgres-runtime-releases/$CURRENT_SHA ]]
}

prepare_historical_reconciliation() {
  rm -f "$STATE/postgres-pool-bootstrap.sha" "$STATE/control.sha" \
    "$RECOVERY_ACTIVATION_LOG"
  printf '%s\n' "$TARGET_SHA" > "$STATE/postgres-pool-bootstrap.sha"
  printf '%s\n' "$HISTORICAL_CONTROL_SHA" > "$STATE/control.sha"
  install_historical_control_entrypoint
  RECOVERY_SYNC_MODE=success
  RECOVERY_RACE_SHA=$TARGET_SHA
}

# Historical reconciliation authenticates the exact control-marker blob.
TEST_PHASE=already-newer-historical-reconciliation
printf '%s\n' "$TARGET_SHA" > "$STATE/postgres-pool-bootstrap.sha"
printf '%s\n' "$HISTORICAL_CONTROL_SHA" > "$STATE/control.sha"
install_historical_control_entrypoint
cmp -s "$INSTALLED" \
  <(git -C "$REPO" show \
    "$HISTORICAL_CONTROL_SHA:ops/deploy/social-monitor-production-deploy.sh")
cp "$STATE/postgres-pool-bootstrap.sha" "$FIXTURE/historical-marker-before"
historical_pool_identity=$(stat -c '%d:%i:%f:%s:%y:%z' \
  "$STATE/postgres-pool-bootstrap.sha")
historical_control_identity=$(stat -c '%d:%i:%f:%s:%y:%z' \
  "$STATE/control.sha")
printf 'unrelated-control-state\n' > "$CONTROL/recovery-unrelated.sentinel"
cp "$CONTROL/recovery-unrelated.sentinel" "$FIXTURE/recovery-unrelated-before"
unrelated_control_identity=$(stat -c '%d:%i:%f:%s:%y:%z' \
  "$CONTROL/recovery-unrelated.sentinel")
rm -f "$RECOVERY_ACTIVATION_LOG"
RECOVERY_SYNC_MODE=success
EXPECT_MISSING_SYNC_ENTRYPOINT=true
historical_output=$(run_current_deploy)
EXPECT_MISSING_SYNC_ENTRYPOINT=false
grep -Fx "already-deployed-or-newer=$CURRENT_SHA" \
  <<< "$historical_output" >/dev/null
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$CURRENT_SHA" ]]
[[ $(<"$STATE/control.sha") == "$HISTORICAL_CONTROL_SHA" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/postgres-pool-bootstrap.sha") != \
  "$historical_pool_identity" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha") == \
  "$historical_control_identity" ]]
cmp -s "$INSTALLED" "$REPO/ops/deploy/social-monitor-production-deploy.sh"
[[ $(stat -c '%a' "$INSTALLED") == 755 ]]
[[ $(stat -c '%u:%g' "$INSTALLED") == "$(id -u):$(id -g)" ]]
[[ ! -e $INSTALLED.next && ! -L $INSTALLED.next ]]
cmp -s "$FIXTURE/recovery-unrelated-before" \
  "$CONTROL/recovery-unrelated.sentinel"
[[ $(stat -c '%d:%i:%f:%s:%y:%z' \
  "$CONTROL/recovery-unrelated.sentinel") == "$unrelated_control_identity" ]]
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]
assert_recovery_control_only

# Historical replay uses the no-sync, no-activation fast path.
TEST_PHASE=already-newer-historical-replay
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]
replay_installed_identity=$(stat -c '%d:%i:%f:%s:%y:%z' "$INSTALLED")
replay_output=$(run_current_deploy)
grep -Fx "already-deployed-or-newer=$CURRENT_SHA" \
  <<< "$replay_output" >/dev/null
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$INSTALLED") == "$replay_installed_identity" ]]
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$CURRENT_SHA" ]]
assert_recovery_control_only

# A stale control marker still makes current planning select control deployment.
TEST_PHASE=already-newer-staged-plan
staged_plan=$(run_entrypoint "$INSTALLED" plan "$CURRENT_SHA")
grep -Fx 'control=true' <<< "$staged_plan" >/dev/null
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' \
  <<< "$staged_plan" >/dev/null
grep -Fx "postgres_pool_bootstrap_sha=$CURRENT_SHA" \
  <<< "$staged_plan" >/dev/null
[[ $(<"$STATE/control.sha") == "$HISTORICAL_CONTROL_SHA" ]]

# A recorder proves the later normal control path without runtime activation.
TEST_PHASE=already-newer-normal-control-deploy
NORMAL_CONTROL_LOG=$FIXTURE/normal-control.log
normal_control_output=$(run_current_control_deploy)
grep -F "deployed=$CURRENT_SHA" <<< "$normal_control_output" >/dev/null
grep -F 'backend=true' <<< "$normal_control_output" >/dev/null
grep -F 'control=true' <<< "$normal_control_output" >/dev/null
[[ $(sed -n '1p' "$NORMAL_CONTROL_LOG") == integration ]]
[[ $(sed -n '2p' "$NORMAL_CONTROL_LOG") == load-backend ]]
[[ $(sed -n '3p' "$NORMAL_CONTROL_LOG") == control ]]
grep -Ex 'transaction:true:(true|false)' "$NORMAL_CONTROL_LOG" >/dev/null
[[ $(wc -l < "$NORMAL_CONTROL_LOG") == 4 ]]
[[ $(<"$STATE/control.sha") == "$CURRENT_SHA" ]]
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$CURRENT_SHA" ]]
assert_release_a_non_activation
[[ ! -e $CONTROL/postgres-runtime-releases/$CURRENT_SHA ]]

# Non-marker installed bytes fail before sync or marker movement.
TEST_PHASE=already-newer-control-marker-mismatch
printf '%s\n' "$TARGET_SHA" > "$STATE/postgres-pool-bootstrap.sha"
printf '%s\n' "$HISTORICAL_CONTROL_SHA" > "$STATE/control.sha"
cp "$REPO/ops/deploy/social-monitor-production-deploy.sh" "$INSTALLED"
printf '\n# mismatched installed control\n' >> "$INSTALLED"
chmod 0755 "$INSTALLED"
if cmp -s "$INSTALLED" \
  <(git -C "$REPO" show \
    "$HISTORICAL_CONTROL_SHA:ops/deploy/social-monitor-production-deploy.sh"); then
  echo 'mismatched installed control fixture unexpectedly matched marker' >&2
  exit 1
fi
cp "$STATE/postgres-pool-bootstrap.sha" "$FIXTURE/mismatch-marker-before"
rm -f "$RECOVERY_ACTIVATION_LOG"
assert_current_recovery_fails \
  'installed deploy entrypoint blob has no introducing commit'
cmp -s "$FIXTURE/mismatch-marker-before" \
  "$STATE/postgres-pool-bootstrap.sha"
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]

# Invalid marker identities leave the pool marker unchanged.
TEST_PHASE=already-newer-missing-control-marker
install_historical_control_entrypoint
rm -f "$STATE/control.sha"
cp "$STATE/postgres-pool-bootstrap.sha" \
  "$FIXTURE/missing-control-pool-marker-before"
assert_current_recovery_fails \
  'control marker is not a regular non-symlink file'
cmp -s "$FIXTURE/missing-control-pool-marker-before" \
  "$STATE/postgres-pool-bootstrap.sha"

TEST_PHASE=already-newer-invalid-marker
printf 'invalid-marker\n' > "$STATE/postgres-pool-bootstrap.sha"
printf '%s\n' "$HISTORICAL_CONTROL_SHA" > "$STATE/control.sha"
cp "$STATE/postgres-pool-bootstrap.sha" "$FIXTURE/invalid-marker-before"
assert_current_recovery_fails 'PostgreSQL bootstrap marker is malformed'
cmp -s "$FIXTURE/invalid-marker-before" \
  "$STATE/postgres-pool-bootstrap.sha"

TEST_PHASE=already-newer-uppercase-marker
prepare_historical_reconciliation
printf '%s\n' "${TARGET_SHA^^}" > "$STATE/postgres-pool-bootstrap.sha"
cp "$STATE/postgres-pool-bootstrap.sha" "$FIXTURE/uppercase-marker-before"
assert_current_recovery_fails 'PostgreSQL bootstrap marker is malformed'
cmp -s "$FIXTURE/uppercase-marker-before" \
  "$STATE/postgres-pool-bootstrap.sha"

TEST_PHASE=already-newer-malformed-control-marker
prepare_historical_reconciliation
printf 'malformed-control\n' > "$STATE/control.sha"
cp "$STATE/postgres-pool-bootstrap.sha" \
  "$FIXTURE/malformed-control-pool-before"
assert_current_recovery_fails 'control marker is malformed'
cmp -s "$FIXTURE/malformed-control-pool-before" \
  "$STATE/postgres-pool-bootstrap.sha"

TEST_PHASE=already-newer-unavailable-pool-marker
prepare_historical_reconciliation
UNAVAILABLE_SHA=1111111111111111111111111111111111111111
if git -C "$REPO" cat-file -e "$UNAVAILABLE_SHA^{commit}" 2>/dev/null; then
  echo 'unavailable marker fixture unexpectedly names a commit' >&2
  exit 1
fi
printf '%s\n' "$UNAVAILABLE_SHA" > "$STATE/postgres-pool-bootstrap.sha"
assert_current_recovery_fails \
  'PostgreSQL bootstrap marker commit is unavailable'
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$UNAVAILABLE_SHA" ]]

TEST_PHASE=already-newer-unavailable-control-marker
prepare_historical_reconciliation
printf '%s\n' "$UNAVAILABLE_SHA" > "$STATE/control.sha"
assert_current_recovery_fails 'control marker commit is unavailable'
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]

TEST_PHASE=already-newer-pool-marker-symlink
prepare_historical_reconciliation
printf '%s\n' "$TARGET_SHA" > "$FIXTURE/symlink-pool-target"
rm -f "$STATE/postgres-pool-bootstrap.sha"
ln -s "$FIXTURE/symlink-pool-target" \
  "$STATE/postgres-pool-bootstrap.sha"
assert_current_recovery_fails \
  'PostgreSQL bootstrap marker is not a regular non-symlink file'
[[ -L $STATE/postgres-pool-bootstrap.sha ]]

TEST_PHASE=already-newer-control-marker-symlink
prepare_historical_reconciliation
printf '%s\n' "$HISTORICAL_CONTROL_SHA" \
  > "$FIXTURE/symlink-control-target"
rm -f "$STATE/control.sha"
ln -s "$FIXTURE/symlink-control-target" "$STATE/control.sha"
assert_current_recovery_fails \
  'control marker is not a regular non-symlink file'
[[ -L $STATE/control.sha ]]
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]

TEST_PHASE=already-newer-installed-entrypoint-symlink
prepare_historical_reconciliation
git -C "$REPO" show \
  "$HISTORICAL_CONTROL_SHA:ops/deploy/social-monitor-production-deploy.sh" \
  > "$FIXTURE/symlink-installed-target"
rm -f "$INSTALLED"
ln -s "$FIXTURE/symlink-installed-target" "$INSTALLED"
assert_current_recovery_fails \
  'installed deploy entrypoint is not a regular non-symlink file'
[[ -L $INSTALLED ]]
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]

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
printf '%s\n' "$HISTORICAL_CONTROL_SHA" > "$STATE/control.sha"
install_historical_control_entrypoint
cp "$STATE/postgres-pool-bootstrap.sha" "$FIXTURE/divergent-marker-before"
TEST_PHASE=already-newer-non-ancestor-marker
assert_current_recovery_fails \
  'PostgreSQL bootstrap marker commit is not an ancestor'
cmp -s "$FIXTURE/divergent-marker-before" \
  "$STATE/postgres-pool-bootstrap.sha"
assert_recovery_control_only

TEST_PHASE=already-newer-non-ancestor-control-marker
prepare_historical_reconciliation
printf '%s\n' "$DIVERGENT_MARKER_SHA" > "$STATE/control.sha"
assert_current_recovery_fails \
  'control marker commit is not an ancestor'
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
assert_recovery_control_only

# Every dormant asset is byte-bound to current before sync.
TEST_PHASE=already-newer-dormant-asset-divergence
prepare_historical_reconciliation
dormant_asset=ops/deploy/postgres-runtime-deploy-lib.sh
git -C "$REPO" update-index --assume-unchanged "$dormant_asset"
printf '\n# hidden divergent dormant asset\n' >> "$REPO/$dormant_asset"
[[ -z $(git -C "$REPO" status --porcelain) ]]
assert_current_recovery_fails \
  "current PostgreSQL bootstrap source $dormant_asset differs from reviewed commit"
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
[[ ! -e $RECOVERY_ACTIVATION_LOG ]]
cp "$PROJECT_ROOT/$dormant_asset" "$REPO/$dormant_asset"
git -C "$REPO" update-index --no-assume-unchanged "$dormant_asset"
[[ -z $(git -C "$REPO" status --porcelain) ]]

# Sync failure preserves the old marker and installed ancestor bytes.
TEST_PHASE=already-newer-sync-failure
printf '%s\n' "$TARGET_SHA" > "$STATE/postgres-pool-bootstrap.sha"
printf '%s\n' "$HISTORICAL_CONTROL_SHA" > "$STATE/control.sha"
install_historical_control_entrypoint
cp "$INSTALLED" "$FIXTURE/installed-before-sync-failure"
cp "$STATE/postgres-pool-bootstrap.sha" "$FIXTURE/marker-before-sync-failure"
rm -f "$RECOVERY_ACTIVATION_LOG"
RECOVERY_SYNC_MODE=fail
assert_current_recovery_fails \
  'PostgreSQL bootstrap recovery could not sync current control'
cmp -s "$FIXTURE/installed-before-sync-failure" "$INSTALLED"
cmp -s "$FIXTURE/marker-before-sync-failure" \
  "$STATE/postgres-pool-bootstrap.sha"
assert_recovery_control_only

# Dirty, HEAD, and marker races are detected before pool-marker commit.
TEST_PHASE=already-newer-dirty-race
RECOVERY_SYNC_MODE=dirty
install_historical_control_entrypoint
assert_current_recovery_fails \
  'integration worktree is dirty during PostgreSQL bootstrap recovery'
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
rm -f "$REPO/recovery-race.untracked"
git -C "$REPO" status --porcelain | grep -q . && {
  echo 'dirty recovery fixture did not restore a clean integration' >&2
  exit 1
}

TEST_PHASE=already-newer-head-race
RECOVERY_SYNC_MODE=head-race
install_historical_control_entrypoint
assert_current_recovery_fails \
  'current integration changed during PostgreSQL bootstrap recovery'
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
git -C "$REPO" update-ref refs/heads/main "$CURRENT_SHA"
[[ $(git -C "$REPO" rev-parse HEAD) == "$CURRENT_SHA" ]]

TEST_PHASE=already-newer-marker-race
RECOVERY_SYNC_MODE=marker-race
RECOVERY_RACE_SHA=$TARGET_SHA
printf '%s\n' "$TARGET_SHA" > "$STATE/postgres-pool-bootstrap.sha"
install_historical_control_entrypoint
marker_identity_before_race=$(stat -c '%d:%i:%f:%s:%y:%z' \
  "$STATE/postgres-pool-bootstrap.sha")
assert_current_recovery_fails \
  'PostgreSQL bootstrap marker changed during control reconciliation'
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/postgres-pool-bootstrap.sha") != \
  "$marker_identity_before_race" ]]
assert_recovery_control_only

TEST_PHASE=already-newer-control-marker-race
RECOVERY_SYNC_MODE=control-marker-race
RECOVERY_RACE_SHA=$HISTORICAL_CONTROL_SHA
install_historical_control_entrypoint
control_identity_before_race=$(stat -c '%d:%i:%f:%s:%y:%z' \
  "$STATE/control.sha")
assert_current_recovery_fails \
  'control marker changed during PostgreSQL bootstrap reconciliation'
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
[[ $(<"$STATE/control.sha") == "$HISTORICAL_CONTROL_SHA" ]]
[[ $(stat -c '%d:%i:%f:%s:%y:%z' "$STATE/control.sha") != \
  "$control_identity_before_race" ]]
assert_recovery_control_only

TEST_PHASE=already-newer-installed-entrypoint-race
RECOVERY_SYNC_MODE=installed-race
install_historical_control_entrypoint
assert_current_recovery_fails \
  'installed deploy entrypoint differs from reviewed commit'
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
assert_recovery_control_only

TEST_PHASE=already-newer-dormant-asset-race
RECOVERY_SYNC_MODE=dormant-asset-race
install_historical_control_entrypoint
assert_current_recovery_fails \
  'integration worktree is dirty during PostgreSQL bootstrap recovery'
[[ $(<"$STATE/postgres-pool-bootstrap.sha") == "$TARGET_SHA" ]]
cp "$PROJECT_ROOT/ops/deploy/postgres-runtime-deploy-lib.sh" \
  "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
[[ -z $(git -C "$REPO" status --porcelain) ]]
assert_recovery_control_only

RECOVERY_SYNC_MODE=success
RECOVERY_RACE_SHA=$TARGET_SHA
rm -f "$RECOVERY_ACTIVATION_LOG"

# Invalid requests and unvalidated descendants cannot mint bootstrap state.
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
  "$PROJECT_ROOT/ops/deploy/deploy-control-bridge-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/postgres-runtime-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/backend-runtime-health-lib.sh" \
  "$PROJECT_ROOT/ops/deploy"/backend-image-rescue-{lib,pin-cleanup-lib}.sh \
  "$PROJECT_ROOT/ops/deploy/docker-maintenance-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/daily-runner-image-bootstrap-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/x-collector-image-deploy-lib.sh" \
  "$PROJECT_ROOT/ops/deploy/reader-summary-recovery-maintenance-lib.sh" \
  "$REPO/ops/deploy/"
write_target_quorum_health_fixture "$REPO"
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
expected = (
    '        run: bash ops/deploy/github-production-deploy-client.sh '
    'deploy "$GITHUB_SHA"'
)
if step.count(expected) != 1:
    raise SystemExit("deploy-components step must contain one exact ordinary deploy")
if any("CONTROL_CHANGED" in line or "POSTGRES_POOL_BOOTSTRAP" in line for line in step):
    raise SystemExit("ordinary deploy must not receive stale bootstrap arguments")
PY
echo 'Legacy-main to overlap-safe bootstrap transition tests passed'
