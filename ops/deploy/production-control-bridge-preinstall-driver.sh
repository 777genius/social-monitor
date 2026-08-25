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
   ( ${BASH_SOURCE[0]} == "$driver" || \
     ( ${PRODUCTION_CONTROL_BRIDGE_LOCK_FDS_READY:-} == 1 && \
       ${BASH_SOURCE[0]} == /dev/fd/19 ) ) && \
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
  rm -f "$stage/source"
  rmdir "$stage"
}

# Open both locks with O_NOFOLLOW before any candidate library is evaluated.
# The exact reviewed driver is itself re-executed through an already-open blob
# descriptor so this handoff does not reintroduce a worktree race.
if [[ ${PRODUCTION_CONTROL_BRIDGE_LOCK_FDS_READY:-} != 1 ]]; then
  stage_reviewed_blob "$relative" 100755 19
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    control=${SOCIAL_MONITOR_DEPLOY_CONTROL:?test control root is required}
    root=${SOCIAL_MONITOR_DEPLOY_ROOT:?test root is required}
  else
    root=/var/data/social-monitor
    control=$root/control
  fi
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
            item.st_uid != expected_uid or item.st_mode & 0o022):
        fail(f"lock descriptor identity is invalid for {name}")
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
stage_reviewed_blob ops/deploy/deploy-control-bridge-lib.sh 100644 22
stage_reviewed_blob ops/deploy/production-control-bridge-preinstall-lib.sh 100644 23

# A deterministic test-only mutation proves that evaluated bytes come from the
# open reviewed descriptors, not from the candidate worktree after attestation.
if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
      -n ${PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE:-} ]]; then
  mutation=$PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE
  case $mutation in
    ops/deploy/production-host-policy-lib.sh|ops/deploy/social-monitor-production-deploy.sh|ops/deploy/deploy-control-bridge-lib.sh|ops/deploy/production-control-bridge-preinstall-lib.sh) ;;
    *) fail 'test mutation path is outside the reviewed source set' ;;
  esac
  printf '\nfail "mutable candidate source was evaluated"\n' >> "$checkout/$mutation"
fi

# shellcheck source=/dev/null
source /dev/fd/20
# shellcheck source=/dev/null
source /dev/fd/21
# shellcheck source=/dev/null
source /dev/fd/22
# shellcheck source=/dev/null
source /dev/fd/23
exec 20<&- 21<&- 22<&- 23<&-

if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
      -n ${PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE:-} ]]; then
  git -C "$checkout" cat-file blob \
    "$target:$PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE" > \
    "$checkout/$PRODUCTION_CONTROL_BRIDGE_TEST_MUTATE_AFTER_STAGE"
fi
unset PRODUCTION_CONTROL_BRIDGE_TRUSTED_SOURCE

if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
      -n ${PRODUCTION_CONTROL_BRIDGE_TEST_HOOK:-} ]]; then
  [[ -f $PRODUCTION_CONTROL_BRIDGE_TEST_HOOK && \
     ! -L $PRODUCTION_CONTROL_BRIDGE_TEST_HOOK ]] || \
    fail 'preinstall test hook is not a regular file'
  # shellcheck source=/dev/null
  source "$PRODUCTION_CONTROL_BRIDGE_TEST_HOOK"
fi
deploy_production_control_bridge_preinstall "$target" "$expected_tree"
