#!/usr/bin/env bash
# shellcheck disable=SC2317
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-recovery-maintenance-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

ROOT=$FIXTURE/root
REPO=$FIXTURE/repo
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS=1
READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=/var/lib/social-monitor/artifacts/reader-summary-weekly-production
DOCKER_LOG=$FIXTURE/docker.log
COMPOSE_LOG=$FIXTURE/compose.log
SHA=''

install -d "$REPO/ops/deploy" "$STATE" "$POSTGRES_RUNTIME_CURRENT"
cp "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" "$REPO/ops/deploy/"
git -C "$REPO" init -q
git -C "$REPO" config user.name 'Reader summary maintenance fixture'
git -C "$REPO" config user.email reader-summary-maintenance@example.invalid
git -C "$REPO" add ops/deploy/reader-summary-recovery-maintenance-lib.sh
git -C "$REPO" commit -qm 'test: maintenance runtime identity'
SHA=$(git -C "$REPO" rev-parse HEAD)
printf '%s\n' "$SHA" > "$POSTGRES_RUNTIME_CURRENT/READY"
printf '%s\n' "$SHA" > "$STATE/backend.sha"
: > "$DOCKER_LOG"
: > "$COMPOSE_LOG"

fail() {
  printf 'test failure: %s\n' "$*" >&2
  exit 1
}

docker() {
  printf '%s\n' "$*" >> "$DOCKER_LOG"
  return 0
}

fake_compose() {
  local source_env_status=unset
  [[ -z ${READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL:-} ]] || \
    source_env_status=set
  if [[ ${ASSERT_WEEKLY_LOCKS_HELD:-0} == 1 ]]; then
    exec 6>"$DAILY_SINGLETON_LOCK"
    if flock -n 6; then
      return 91
    fi
    exec 6>&-
    exec 5>"$POSTGRES_ADMISSION_LOCK"
    if flock -n 5; then
      return 92
    fi
    exec 5>&-
  fi
  printf '%s\n' "$*" >> "$COMPOSE_LOG"
  printf 'source-env=%s\n' "$source_env_status" >> "$COMPOSE_LOG"
  [[ ${FAKE_COMPOSE_FAIL:-0} == 1 ]] && return 44
  return 0
}

export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export DOCKER_LOG COMPOSE_LOG
COMPOSE=(fake_compose)

# shellcheck source=ops/deploy/reader-summary-recovery-maintenance-lib.sh
source "$REPO/ops/deploy/reader-summary-recovery-maintenance-lib.sh"

unset READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days
ASSERT_WEEKLY_LOCKS_HELD=1
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run
unset ASSERT_WEEKLY_LOCKS_HELD

recovery_command='--profile daily run --rm --no-deps daily-runner sh -lc set -eu; npm run prepare:reader-summary-production-recovery-gap-authority; npm run run:reader-summary-daily-canonical-recovery'
grep -Fx -- "$recovery_command" \
  "$COMPOSE_LOG" >/dev/null
[[ $(grep -Fc 'source-env=unset' "$COMPOSE_LOG") == 2 ]]
! grep -F 'source-env=set' "$COMPOSE_LOG" >/dev/null
! grep -F 'READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL' \
  "$COMPOSE_LOG" >/dev/null
grep -Fx -- '--profile daily run --rm --no-deps -e READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID=00000000-0000-7000-8000-000000000901 -e READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 -e READER_SUMMARY_WEEKLY_PRODUCTION_FIRST_WEEK_START=2026-07-20 -e READER_SUMMARY_WEEKLY_PRODUCTION_CATCH_UP_LIMIT=4 -e READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=/var/lib/social-monitor/artifacts/reader-summary-weekly-production daily-runner sh -lc set -eu; npm run run:reader-summary-weekly-production' \
  "$COMPOSE_LOG" >/dev/null
! grep -F 'backfill:reader-summary-weekly-daily-certifications' "$COMPOSE_LOG" >/dev/null
! grep -F 'run:reader-summary-weekly-production -- --replay' "$COMPOSE_LOG" >/dev/null
! grep -F 'postgresql://' "$COMPOSE_LOG" >/dev/null
! grep -F 'pg_restore' "$DOCKER_LOG" "$COMPOSE_LOG" >/dev/null
! grep -F 'social-monitor-reader-summary-recovery-source-' \
  "$DOCKER_LOG" "$COMPOSE_LOG" >/dev/null
! compgen -G "$STATE/reader-summary-recovery-source.*.env" >/dev/null

for action in reader-summary-daily-canonical-recovery-v4 reader-summary-recover-missing-days; do
  : > "$COMPOSE_LOG"
  set +e
  run_reader_summary_daily_runner_maintenance "$action" unexpected >/dev/null 2>&1
  status=$?
  set -e
  [[ $status == 1 ]]
  [[ ! -s $COMPOSE_LOG ]]
done

: > "$COMPOSE_LOG"
set +e
run_reader_summary_daily_runner_maintenance reader-summary-daily-canonical-recovery-v4 >/dev/null 2>&1
status=$?
set -e
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]

: > "$COMPOSE_LOG"
printf '%s\n' 89abcdef0123456789abcdef0123456789abcdef > "$POSTGRES_RUNTIME_CURRENT/READY"
set +e
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days >/dev/null 2>&1
status=$?
set -e
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]
printf '%s\n' "$SHA" > "$POSTGRES_RUNTIME_CURRENT/READY"

: > "$COMPOSE_LOG"
printf '%s\n' 89abcdef0123456789abcdef0123456789abcdef > "$STATE/backend.sha"
set +e
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days >/dev/null 2>&1
status=$?
set -e
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]
printf '%s\n' "$SHA" > "$STATE/backend.sha"

: > "$COMPOSE_LOG"
exec 7>"$DAILY_SINGLETON_LOCK"
flock -n 7
set +e
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run \
  >/dev/null 2>&1
status=$?
set -e
flock -u 7
exec 7>&-
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]

(
  DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS=7500
  LOCK_CLOCK_SECONDS=0
  LOCK_WAIT_SECONDS=()
  daily_runner_maintenance_now_seconds() {
    printf '%s\n' "$LOCK_CLOCK_SECONDS"
  }
  flock() {
    [[ $1 == '-w' ]] || return 97
    LOCK_WAIT_SECONDS+=("$2")
    if [[ ${#LOCK_WAIT_SECONDS[@]} == 1 ]]; then
      LOCK_CLOCK_SECONDS=7499
    fi
    return 0
  }
  acquire_daily_runner_maintenance_locks
  [[ ${LOCK_WAIT_SECONDS[*]} == '7500 1' ]]
)

: > "$COMPOSE_LOG"
exec 7>"$POSTGRES_ADMISSION_LOCK"
flock -n 7
set +e
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run \
  >/dev/null 2>&1
status=$?
set -e
flock -u 7
exec 7>&-
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]

: > "$DOCKER_LOG"
: > "$COMPOSE_LOG"
FAKE_COMPOSE_FAIL=1
set +e
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days
status=$?
set -e
[[ $status == 44 ]]
[[ ! -s $DOCKER_LOG ]]
grep -Fx 'source-env=unset' "$COMPOSE_LOG" >/dev/null
! grep -F 'READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL' \
  "$COMPOSE_LOG" >/dev/null

printf 'integration moved after backend release\n' > "$REPO/integration-drift"
git -C "$REPO" add integration-drift
git -C "$REPO" commit -qm 'test: integration drift'
: > "$COMPOSE_LOG"
set +e
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days >/dev/null 2>&1
status=$?
set -e
[[ $status == 1 ]]
[[ ! -s $COMPOSE_LOG ]]

grep -F 'reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-daily-canonical-recovery-v4' \
  "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" >/dev/null
grep -F 'reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-daily-canonical-recovery-v4' \
  "$SCRIPT_DIR/github-production-deploy-client.sh" >/dev/null

echo 'Reader summary recovery maintenance tests passed'
