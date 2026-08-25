#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin

fail() { printf 'deploy-error: %s\n' "$*" >&2; exit 1; }
[[ $# == 5 ]] || fail 'expected target, parent, tree, driver blob, and driver mode'
target=$1 expected_parent=$2 expected_tree=$3 expected_driver_blob=$4 expected_driver_mode=$5
[[ $target =~ ^[0-9a-f]{40}$ && $expected_parent =~ ^[0-9a-f]{40}$ && \
   $expected_tree =~ ^[0-9a-f]{40}$ && $expected_driver_blob =~ ^[0-9a-f]{40}$ && \
   $expected_driver_mode == 100755 ]] || fail 'external-auth manifest is malformed'
driver=${PRODUCTION_CONTROL_BRIDGE_DRIVER_PATH:-}
[[ -n $driver ]] || driver=$(readlink -f "${BASH_SOURCE[0]}")
checkout=$(git -C "$(dirname "$driver")" rev-parse --show-toplevel)
relative=ops/deploy/production-control-bridge-preinstall-driver.sh
entry=$(git -C "$checkout" ls-tree "$target" -- "$relative")
read -r mode type blob path extra <<< "$entry"
((EUID == 0)) || [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]] || \
  fail 'preinstall driver requires root'
[[ -z ${extra:-} && -f $driver && ! -L $driver && \
   ( ( ${PRODUCTION_CONTROL_BRIDGE_LOCK_FDS_READY:-} == 1 && \
       ${BASH_SOURCE[0]} == /dev/fd/19 ) || \
     ( ${PRODUCTION_CONTROL_BRIDGE_LOCK_FDS_READY:-} != 1 && \
       ${BASH_SOURCE[0]} == "$driver" ) ) && \
   $driver == "$checkout/$relative" && $mode == "$expected_driver_mode" && \
   $type == blob && $blob == "$expected_driver_blob" && $path == "$relative" && \
   $(git -C "$checkout" hash-object --no-filters "$driver") == "$expected_driver_blob" && \
   $(git -C "$checkout" rev-parse HEAD) == "$target" && \
   $(git -C "$checkout" rev-parse 'HEAD^') == "$expected_parent" && \
   $(git -C "$checkout" rev-list --parents -n 1 HEAD | wc -w) == 2 && \
   $(git -C "$checkout" rev-parse 'HEAD^{tree}') == "$expected_tree" && \
   -z $(git -C "$checkout" status --porcelain=v1 --untracked-files=all) ]] || \
  fail 'candidate changed after external authentication'
[[ $(git -C "$checkout" rev-parse --verify refs/remotes/origin/main) == "$target" ]] || \
  fail 'supplied merged SHA is not the exact origin/main head'

stage_reviewed_blob() {
  local reviewed_path=$1 expected_mode=$2 descriptor=$3 stage entry mode type blob path extra
  local staged_mode=400
  entry=$(git -C "$checkout" ls-tree "$target" -- "$reviewed_path") || \
    fail "reviewed source cannot be inspected: $reviewed_path"
  read -r mode type blob path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == "$expected_mode" && $type == blob && \
     $blob =~ ^[0-9a-f]{40}$ && $path == "$reviewed_path" ]] || \
    fail "reviewed source mode or blob is invalid: $reviewed_path"
  stage=$(mktemp -d "${TMPDIR:-/tmp}/production-control-bridge-source.XXXXXX") || \
    fail 'reviewed source staging directory could not be created'
  git -C "$checkout" cat-file blob "$target:$reviewed_path" > "$stage/source" || \
    fail "reviewed source could not be staged: $reviewed_path"
  [[ $expected_mode != 100755 ]] || staged_mode=500
  chmod "0$staged_mode" "$stage/source"
  chmod 0500 "$stage"
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    [[ $(stat -c '%U:%G:%a' "$stage") == root:root:500 && \
       $(stat -c '%U:%G:%a' "$stage/source") == "root:root:$staged_mode" ]] || \
      fail "reviewed source staging ownership is invalid: $reviewed_path"
  else
    [[ $(stat -c '%u:%g:%a' "$stage") == "$EUID:$(id -g):500" && \
       $(stat -c '%u:%g:%a' "$stage/source") == "$EUID:$(id -g):$staged_mode" ]] || \
      fail "reviewed test source staging ownership is invalid: $reviewed_path"
  fi
  eval "exec ${descriptor}<\"\$stage/source\"" || \
    fail "reviewed source descriptor could not be opened: $reviewed_path"
  [[ $(git -C "$checkout" hash-object --no-filters "/dev/fd/$descriptor") == "$blob" ]] || \
    fail "reviewed source descriptor differs from its blob: $reviewed_path"
  chmod 0700 "$stage"
  rm -f "$stage/source"
  rmdir "$stage"
}

production_control_bridge_host_paths() {
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    PRODUCTION_CONTROL_BRIDGE_ROOT=${SOCIAL_MONITOR_DEPLOY_ROOT:?test root is required}
    PRODUCTION_CONTROL_BRIDGE_REPO=${SOCIAL_MONITOR_DEPLOY_REPO:?test repo is required}
    PRODUCTION_CONTROL_BRIDGE_CONTROL=${SOCIAL_MONITOR_DEPLOY_CONTROL:?test control root is required}
    PRODUCTION_CONTROL_BRIDGE_STATE=${SOCIAL_MONITOR_DEPLOY_STATE:-$PRODUCTION_CONTROL_BRIDGE_CONTROL/deploy-state}
    PRODUCTION_CONTROL_BRIDGE_STAGING=${SOCIAL_MONITOR_DEPLOY_STAGING:-$PRODUCTION_CONTROL_BRIDGE_ROOT/runtime/deploy-staging}
    PRODUCTION_CONTROL_BRIDGE_RELEASES=${SOCIAL_MONITOR_DEPLOY_RELEASES:-$PRODUCTION_CONTROL_BRIDGE_ROOT/runtime/frontend-releases}
  else
    PRODUCTION_CONTROL_BRIDGE_ROOT=/var/data/social-monitor
    PRODUCTION_CONTROL_BRIDGE_REPO=$PRODUCTION_CONTROL_BRIDGE_ROOT/integration
    PRODUCTION_CONTROL_BRIDGE_CONTROL=$PRODUCTION_CONTROL_BRIDGE_ROOT/control
    PRODUCTION_CONTROL_BRIDGE_STATE=$PRODUCTION_CONTROL_BRIDGE_CONTROL/deploy-state
    PRODUCTION_CONTROL_BRIDGE_STAGING=$PRODUCTION_CONTROL_BRIDGE_ROOT/runtime/deploy-staging
    PRODUCTION_CONTROL_BRIDGE_RELEASES=$PRODUCTION_CONTROL_BRIDGE_ROOT/runtime/frontend-releases
  fi
}

production_control_bridge_validate_host_directory_chains() {
  production_control_bridge_host_paths
  python3 - "$PRODUCTION_CONTROL_BRIDGE_ROOT" "$PRODUCTION_CONTROL_BRIDGE_CONTROL" \
    "$PRODUCTION_CONTROL_BRIDGE_REPO" "$PRODUCTION_CONTROL_BRIDGE_STATE" \
    "$PRODUCTION_CONTROL_BRIDGE_STAGING" "$PRODUCTION_CONTROL_BRIDGE_RELEASES" \
    "${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-0}" <<'PY' || \
    fail 'production bridge host directory chain validation failed'
import os
import stat
import sys

*paths, test_mode = sys.argv[1:]
expected_uid = os.geteuid()

for requested in paths:
    absolute = os.path.abspath(requested)
    if test_mode == "1":
        root = os.path.commonpath([os.path.abspath(path) for path in paths])
        if absolute != root and not absolute.startswith(root + os.sep):
            raise SystemExit(f"test host path escapes root: {requested}")
        components = [root]
        relative = os.path.relpath(absolute, root)
        if relative != ".":
            for component in relative.split(os.sep):
                components.append(os.path.join(components[-1], component))
    else:
        components = [os.sep]
        cursor = os.sep
        for component in absolute.strip(os.sep).split(os.sep):
            cursor = os.path.join(cursor, component)
            components.append(cursor)
    for component in components:
        item = os.lstat(component)
        if (not stat.S_ISDIR(item.st_mode) or stat.S_ISLNK(item.st_mode) or
                item.st_uid != expected_uid or item.st_mode & 0o022):
            raise SystemExit(f"unsafe host directory chain component: {component}")
PY
}

production_control_bridge_source_reviewed() {
  local relative_path=$1 label=$2 descriptor
  case $relative_path in
    ops/deploy/production-host-policy-lib.sh) descriptor=20 ;;
    ops/deploy/social-monitor-production-deploy.sh) descriptor=21 ;;
    ops/deploy/deploy-control-lib.sh) descriptor=22 ;;
    ops/deploy/deploy-control-bridge-lib.sh) descriptor=23 ;;
    ops/deploy/production-control-bridge-preinstall-lib.sh) descriptor=24 ;;
    ops/deploy/postgres-runtime-deploy-lib.sh) descriptor=25 ;;
    ops/deploy/postgres-runtime-weekly-timer-state-lib.sh) descriptor=26 ;;
    ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh) descriptor=27 ;;
    ops/deploy/postgres-runtime-activation-boundary-lib.sh) descriptor=28 ;;
    ops/deploy/backend-runtime-health-lib.sh) descriptor=29 ;;
    ops/deploy/backend-image-rescue-lib.sh) descriptor=30 ;;
    ops/deploy/docker-maintenance-lib.sh) descriptor=31 ;;
    ops/deploy/daily-runner-image-bootstrap-lib.sh) descriptor=32 ;;
    ops/deploy/x-collector-image-deploy-lib.sh) descriptor=33 ;;
    ops/deploy/reader-summary-recovery-maintenance-lib.sh) descriptor=34 ;;
    ops/deploy/reader-summary-publication-deploy-lib.sh) descriptor=38 ;;
    ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh) descriptor=39 ;;
    ops/deploy/reader-summary-publication-prebootstrap-lib.sh) descriptor=40 ;;
    ops/deploy/reader-summary-publication-catalog-query-lib.sh) descriptor=41 ;;
    ops/deploy/reader-summary-original-cutoff-correction-lib.sh) descriptor=42 ;;
    ops/deploy/postgres-backup-deploy-lib.sh) descriptor=43 ;;
    ops/deploy/rabbitmq-quorum-health.sh) descriptor=44 ;;
    ops/deploy/rabbitmq-quorum-recovery.sh) descriptor=45 ;;
    *) fail "unattested production bridge source requested: $relative_path" ;;
  esac
  [[ -r /dev/fd/$descriptor ]] || fail "$label reviewed descriptor is unavailable"
  # shellcheck source=/dev/null
  source "/dev/fd/$descriptor" || fail "$label reviewed descriptor could not be sourced"
}

# Open both locks with O_NOFOLLOW before any candidate library is evaluated.
# The exact reviewed driver is itself re-executed through an already-open blob
# descriptor so this handoff does not reintroduce a worktree race.
if [[ ${PRODUCTION_CONTROL_BRIDGE_LOCK_FDS_READY:-} != 1 ]]; then
  production_control_bridge_validate_host_directory_chains
  stage_reviewed_blob "$relative" 100755 19
  root=$PRODUCTION_CONTROL_BRIDGE_ROOT
  control=$PRODUCTION_CONTROL_BRIDGE_CONTROL
  export PRODUCTION_CONTROL_BRIDGE_DRIVER_PATH=$driver
  export PRODUCTION_CONTROL_BRIDGE_LOCK_FDS_READY=1
  exec python3 - "$root" "$control" "/dev/fd/19" "$@" <<'PY'
import fcntl
import os
import stat
import sys

root, control, driver, *arguments = sys.argv[1:]
expected_uid = os.geteuid()

def fail(message):
    raise SystemExit(f"deploy-error: {message}")

for directory in (root, control):
    try:
        item = os.lstat(directory)
    except OSError as error:
        fail(f"lock parent cannot be inspected: {error}")
    if not stat.S_ISDIR(item.st_mode) or stat.S_ISLNK(item.st_mode):
        fail("lock parent is not an exact directory")
    if item.st_uid != expected_uid or item.st_mode & 0o022:
        fail("lock parent ownership or write mode is invalid")

identities = set()
for descriptor, name in ((9, "production-deploy.lock"), (8, "daily-run.lock")):
    lock_path = os.path.join(control, name)
    try:
        opened = os.open(lock_path, os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC)
    except OSError as error:
        fail(f"lock no-follow open failed for {name}: {error}")
    item = os.fstat(opened)
    named = os.lstat(lock_path)
    if (not stat.S_ISREG(item.st_mode) or stat.S_ISLNK(named.st_mode) or
            (item.st_dev, item.st_ino) != (named.st_dev, named.st_ino) or
            item.st_uid != expected_uid or item.st_mode & 0o022 or
            item.st_nlink != 1 or (item.st_dev, item.st_ino) in identities):
        fail(f"lock descriptor identity is invalid for {name}")
    identities.add((item.st_dev, item.st_ino))
    os.dup2(opened, descriptor, inheritable=True)
    os.close(opened)

os.set_inheritable(19, True)
os.execve(driver, [driver, *arguments], os.environ)
PY
fi

export PRODUCTION_CONTROL_BRIDGE_CHECKOUT=$checkout
export PRODUCTION_CONTROL_BRIDGE_TRUSTED_SOURCE=1
stage_reviewed_blob ops/deploy/production-host-policy-lib.sh 100644 20
stage_reviewed_blob ops/deploy/social-monitor-production-deploy.sh 100644 21
stage_reviewed_blob ops/deploy/deploy-control-lib.sh 100644 22
stage_reviewed_blob ops/deploy/deploy-control-bridge-lib.sh 100644 23
stage_reviewed_blob ops/deploy/production-control-bridge-preinstall-lib.sh 100644 24
stage_reviewed_blob ops/deploy/postgres-runtime-deploy-lib.sh 100644 25
stage_reviewed_blob ops/deploy/postgres-runtime-weekly-timer-state-lib.sh 100644 26
stage_reviewed_blob ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh 100644 27
stage_reviewed_blob ops/deploy/postgres-runtime-activation-boundary-lib.sh 100644 28
stage_reviewed_blob ops/deploy/backend-runtime-health-lib.sh 100644 29
stage_reviewed_blob ops/deploy/backend-image-rescue-lib.sh 100644 30
stage_reviewed_blob ops/deploy/docker-maintenance-lib.sh 100644 31
stage_reviewed_blob ops/deploy/daily-runner-image-bootstrap-lib.sh 100644 32
stage_reviewed_blob ops/deploy/x-collector-image-deploy-lib.sh 100644 33
stage_reviewed_blob ops/deploy/reader-summary-recovery-maintenance-lib.sh 100644 34
stage_reviewed_blob ops/deploy/social-monitor-production-ssh-wrapper.sh 100644 35
stage_reviewed_blob ops/deploy/host/refresh-codex-auth.sh 100644 36
stage_reviewed_blob ops/deploy/production-runtime/x-collector.Dockerfile 100644 37
stage_reviewed_blob ops/deploy/reader-summary-publication-deploy-lib.sh 100644 38
stage_reviewed_blob ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh 100644 39
stage_reviewed_blob ops/deploy/reader-summary-publication-prebootstrap-lib.sh 100644 40
stage_reviewed_blob ops/deploy/reader-summary-publication-catalog-query-lib.sh 100644 41
stage_reviewed_blob ops/deploy/reader-summary-original-cutoff-correction-lib.sh 100644 42
stage_reviewed_blob ops/deploy/postgres-backup-deploy-lib.sh 100644 43
stage_reviewed_blob ops/deploy/rabbitmq-quorum-health.sh 100755 44
stage_reviewed_blob ops/deploy/rabbitmq-quorum-recovery.sh 100755 45

# A deterministic test-only mutation proves that evaluated bytes come from the
# open reviewed descriptors, not from the candidate worktree after attestation.
if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
      -n ${PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE:-} ]]; then
  mutation=$PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE
  case $mutation in
    ops/deploy/production-host-policy-lib.sh|ops/deploy/social-monitor-production-deploy.sh|ops/deploy/deploy-control-lib.sh|ops/deploy/deploy-control-bridge-lib.sh|ops/deploy/production-control-bridge-preinstall-lib.sh|ops/deploy/postgres-runtime-deploy-lib.sh|ops/deploy/postgres-runtime-weekly-timer-state-lib.sh|ops/deploy/postgres-runtime-daily-c1-readiness-lib.sh|ops/deploy/postgres-runtime-activation-boundary-lib.sh|ops/deploy/backend-runtime-health-lib.sh|ops/deploy/backend-image-rescue-lib.sh|ops/deploy/docker-maintenance-lib.sh|ops/deploy/daily-runner-image-bootstrap-lib.sh|ops/deploy/x-collector-image-deploy-lib.sh|ops/deploy/reader-summary-recovery-maintenance-lib.sh|ops/deploy/reader-summary-publication-deploy-lib.sh|ops/deploy/reader-summary-publication-system-dsn-bootstrap-lib.sh|ops/deploy/reader-summary-publication-prebootstrap-lib.sh|ops/deploy/reader-summary-publication-catalog-query-lib.sh|ops/deploy/reader-summary-original-cutoff-correction-lib.sh|ops/deploy/postgres-backup-deploy-lib.sh|ops/deploy/rabbitmq-quorum-health.sh|ops/deploy/rabbitmq-quorum-recovery.sh) ;;
    *) fail 'test mutation path is outside the reviewed source set' ;;
  esac
  printf '\nfail "mutable candidate source was evaluated"\n' >> "$checkout/$mutation"
fi

# shellcheck source=/dev/null
source /dev/fd/20
# shellcheck source=/dev/null
source /dev/fd/21

if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
      -n ${PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE:-} ]]; then
  git -C "$checkout" cat-file blob \
    "$target:$PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE" > \
    "$checkout/$PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE"
fi
if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
      -n ${PRODUCTION_CONTROL_BRIDGE_TEST_HOOK:-} ]]; then
  [[ -f $PRODUCTION_CONTROL_BRIDGE_TEST_HOOK && \
     ! -L $PRODUCTION_CONTROL_BRIDGE_TEST_HOOK ]] || \
    fail 'preinstall test hook is not a regular file'
  # shellcheck source=/dev/null
  source "$PRODUCTION_CONTROL_BRIDGE_TEST_HOOK"
fi
deploy_production_control_bridge_preinstall "$target" "$expected_tree"
unset PRODUCTION_CONTROL_BRIDGE_TRUSTED_SOURCE
exec 20<&- 21<&- 22<&- 23<&- 24<&- 25<&- 26<&- 27<&- 28<&- \
  29<&- 30<&- 31<&- 32<&- 33<&- 34<&- 35<&- 36<&- 37<&- 38<&- \
  39<&- 40<&- 41<&- 42<&- 43<&- 44<&- 45<&-
