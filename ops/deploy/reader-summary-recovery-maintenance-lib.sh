#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after project paths, COMPOSE,
# and fail are defined. The installed V4A4 entrypoint invokes this function
# with its original one-argument ABI; the SSH wrapper maps the confirmed V4
# request onto the existing bounded recovery intent.

verify_daily_runner_maintenance_runtime() {
  local runtime_release backend_release integration_release
  runtime_release=$(cat "$POSTGRES_RUNTIME_CURRENT/READY" 2>/dev/null || true)
  backend_release=$(cat "$STATE/backend.sha" 2>/dev/null || true)
  integration_release=$(git -C "$REPO" rev-parse --verify 'HEAD^{commit}' 2>/dev/null || true)
  if [[ ! $runtime_release =~ ^[0-9a-f]{40}$ || \
        $runtime_release != "$backend_release" || \
        $runtime_release != "$integration_release" ]]; then
    fail 'daily-runner runtime is not committed by the current backend integration release'
  fi
}

daily_runner_maintenance_now_seconds() {
  printf '%s\n' "$SECONDS"
}

acquire_daily_runner_maintenance_locks() {
  local deadline_seconds=7500
  local started_at elapsed_seconds remaining_seconds
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
        ${DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS:-} =~ ^[1-9][0-9]*$ ]]; then
    deadline_seconds=$DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS
  fi
  started_at=$(daily_runner_maintenance_now_seconds)
  exec 9>"$DAILY_SINGLETON_LOCK"
  flock -w "$deadline_seconds" 9 || \
    fail 'timed out waiting for reader-summary daily-runner singleton lock'
  elapsed_seconds=$(( $(daily_runner_maintenance_now_seconds) - started_at ))
  remaining_seconds=$(( deadline_seconds - elapsed_seconds ))
  (( remaining_seconds > 0 )) || \
    fail 'timed out waiting for PostgreSQL admission lock'
  exec 8>"$POSTGRES_ADMISSION_LOCK"
  flock -w "$remaining_seconds" 8 || \
    fail 'timed out waiting for PostgreSQL admission lock'
}

run_reader_summary_daily_runner_maintenance() (
  local maintenance_action=$1
  [[ $# == 1 ]] || fail 'reader-summary daily-runner maintenance accepts exactly one action'
  acquire_daily_runner_maintenance_locks
  verify_daily_runner_maintenance_runtime
  case $maintenance_action in
    reader-summary-recover-missing-days)
      "${COMPOSE[@]}" --profile daily run --rm --no-deps \
        daily-runner sh -lc \
        'set -eu; npm run prepare:reader-summary-production-recovery-gap-authority; npm run run:reader-summary-daily-canonical-recovery'
      ;;
    reader-summary-weekly-run)
      "${COMPOSE[@]}" --profile daily run --rm --no-deps \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID=00000000-0000-7000-8000-000000000901 \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID=00000000-0000-7000-8000-000000000902 \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_FIRST_WEEK_START=2026-07-20 \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_CATCH_UP_LIMIT=4 \
        -e "READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=$READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR" \
        daily-runner sh -lc \
        'set -eu; npm run run:reader-summary-weekly-production'
      ;;
    *) fail 'unknown reader-summary daily-runner maintenance action' ;;
  esac
)
