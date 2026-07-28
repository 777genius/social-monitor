#!/usr/bin/env bash
# shellcheck disable=SC2317
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
FIXTURE=$(mktemp -d "/tmp/social-monitor-recovery-maintenance-test.XXXXXX")
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
SHA=0123456789abcdef0123456789abcdef01234567

install -d "$REPO/ops/deploy" "$STATE" "$POSTGRES_RUNTIME_CURRENT"
cp "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" "$REPO/ops/deploy/"
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
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run

grep -Fx -- '--profile daily run --rm --no-deps daily-runner sh -lc npm run recover:reader-summary-production -- --apply' \
  "$COMPOSE_LOG" >/dev/null
[[ $(grep -Fc 'source-env=unset' "$COMPOSE_LOG") == 2 ]]
! grep -F 'source-env=set' "$COMPOSE_LOG" >/dev/null
! grep -F 'READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL' \
  "$COMPOSE_LOG" >/dev/null
grep -Fx -- '--profile daily run --rm --no-deps -e READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID=00000000-0000-7000-8000-000000006101 -e READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID=00000000-0000-7000-8000-000000006102 -e READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=/var/lib/social-monitor/artifacts/reader-summary-weekly-production daily-runner sh -lc set -eu; npm run run:reader-summary-weekly-production; npm run run:reader-summary-weekly-production -- --replay' \
  "$COMPOSE_LOG" >/dev/null
! grep -F 'postgresql://' "$COMPOSE_LOG" >/dev/null
! grep -F 'pg_restore' "$DOCKER_LOG" "$COMPOSE_LOG" >/dev/null
! grep -F 'social-monitor-reader-summary-recovery-source-' \
  "$DOCKER_LOG" "$COMPOSE_LOG" >/dev/null
! compgen -G "$STATE/reader-summary-recovery-source.*.env" >/dev/null

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

grep -F 'reader-summary-recover-missing-days|reader-summary-weekly-run' \
  "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" >/dev/null
grep -F 'reader-summary-recover-missing-days|reader-summary-weekly-run' \
  "$SCRIPT_DIR/github-production-deploy-client.sh" >/dev/null

echo 'Reader summary recovery maintenance tests passed'
