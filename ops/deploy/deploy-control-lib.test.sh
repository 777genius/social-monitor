#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/deploy-control-lib-test.XXXXXX")
trap 'touch "$FIXTURE/release"; rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
CONTROL=$FIXTURE/control
STATE=$CONTROL/deploy-state
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
# The sourced deploy-control library consumes this fixture-scoped path.
# shellcheck disable=SC2034
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
install -d "$REPO/ops/deploy" "$CONTROL" "$STATE"
cp "$SCRIPT_DIR/social-monitor-production-deploy.sh" \
  "$SCRIPT_DIR/deploy-control-lib.sh" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$REPO/ops/deploy/"

fail() {
  printf 'test deploy failure: %s\n' "$*" >&2
  exit 1
}

# shellcheck source=ops/deploy/deploy-control-lib.sh
source "$SCRIPT_DIR/deploy-control-lib.sh"
initialize_deploy_control_bridge

# Successful acquisition retains only PostgreSQL admission. A separate process
# can still acquire the singleton while this shell owns admission.
exec 8>"$POSTGRES_ADMISSION_LOCK"
POSTGRES_ADMISSION_MAX_ATTEMPTS=2
POSTGRES_ADMISSION_RETRY_SLICE_SECONDS=0.01
acquire_postgres_admission_with_daily_priority 8
flock -n "$DAILY_SINGLETON_LOCK" true
flock -u 8

# The bounded nonblocking loop times out without calling a blocking long-wait
# flock operation.
(
  exec 7>"$POSTGRES_ADMISSION_LOCK"
  flock 7
  : > "$FIXTURE/admission-held"
  while [[ ! -e $FIXTURE/release ]]; do sleep 0.01; done
) &
holder_pid=$!
while [[ ! -e $FIXTURE/admission-held ]]; do sleep 0.01; done
set +e
timeout_error=$(
  (
    exec 8>"$POSTGRES_ADMISSION_LOCK"
    acquire_postgres_admission_with_daily_priority 8
  ) 2>&1
)
timeout_status=$?
set -e
((timeout_status != 0))
grep -F 'timed out waiting for PostgreSQL admission lock' \
  <<< "$timeout_error" >/dev/null
: > "$FIXTURE/release"
wait "$holder_pid"
rm -f "$FIXTURE/release" "$FIXTURE/admission-held"

# Deterministically place a daily singleton holder after the clear probe but
# before admission acquisition. The post-acquire probe must release admission
# and fail.
postgres_admission_after_singleton_probe() {
  [[ ! -e $FIXTURE/gap-started ]] || return 0
  : > "$FIXTURE/gap-started"
  (
    exec 7>"$DAILY_SINGLETON_LOCK"
    flock 7
    : > "$FIXTURE/singleton-held"
    while [[ ! -e $FIXTURE/release ]]; do sleep 0.01; done
  ) </dev/null >/dev/null 2>&1 &
  while [[ ! -e $FIXTURE/singleton-held ]]; do sleep 0.01; done
}

set +e
gap_error=$(
  (
    exec 8>"$POSTGRES_ADMISSION_LOCK"
    acquire_postgres_admission_with_daily_priority 8
  ) 2>&1
)
gap_status=$?
set -e
((gap_status != 0))
grep -F 'daily run claimed priority while deploy acquired PostgreSQL admission' \
  <<< "$gap_error" >/dev/null
flock -n "$POSTGRES_ADMISSION_LOCK" true
: > "$FIXTURE/release"
until flock -n "$DAILY_SINGLETON_LOCK" true; do sleep 0.01; done
rm -f "$FIXTURE/release"

# Runtime assets cannot advance in the same release as the already-sourced
# bridge controller or PostgreSQL activation library.
printf '# target mutation\n' >> \
  "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
set +e
bridge_error=$(verify_deploy_control_bridge_compatibility 2>&1)
bridge_status=$?
set -e
((bridge_status != 0))
grep -F 'deploy the bridge release first' <<< "$bridge_error" >/dev/null
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" \
  "$REPO/ops/deploy/postgres-runtime-deploy-lib.sh"
verify_deploy_control_bridge_compatibility

echo 'Deploy control library tests passed'
