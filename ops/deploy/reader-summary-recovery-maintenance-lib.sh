#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after project paths, COMPOSE,
# and fail are defined.

verify_daily_runner_maintenance_runtime() {
  local runtime_release backend_release
  runtime_release=$(cat "$POSTGRES_RUNTIME_CURRENT/READY" 2>/dev/null || true)
  backend_release=$(cat "$STATE/backend.sha" 2>/dev/null || true)
  if [[ ! $runtime_release =~ ^[0-9a-f]{40}$ || \
        $runtime_release != "$backend_release" ]]; then
    fail 'daily-runner runtime is not committed by the backend release'
  fi
}

acquire_daily_runner_maintenance_locks() {
  exec 9>"$DAILY_SINGLETON_LOCK"
  flock -n 9 || fail 'reader-summary daily-runner maintenance is already active'
  exec 8>"$POSTGRES_ADMISSION_LOCK"
  flock -w "$DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS" 8 || \
    fail 'timed out waiting for PostgreSQL admission lock'
}

run_reader_summary_daily_runner_maintenance() (
  local maintenance_action=$1
  acquire_daily_runner_maintenance_locks
  verify_daily_runner_maintenance_runtime
  case $maintenance_action in
    reader-summary-recover-missing-days)
      "${COMPOSE[@]}" --profile daily run --rm --no-deps \
        daily-runner sh -lc 'npm run recover:reader-summary-production -- --apply'
      ;;
    reader-summary-weekly-run)
      "${COMPOSE[@]}" --profile daily run --rm --no-deps \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_TENANT_ID=00000000-0000-7000-8000-000000006101 \
        -e READER_SUMMARY_WEEKLY_PRODUCTION_WORKSPACE_ID=00000000-0000-7000-8000-000000006102 \
        -e "READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=$READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR" \
        daily-runner sh -lc \
        'set -eu; npm run run:reader-summary-weekly-production; npm run run:reader-summary-weekly-production -- --replay'
      ;;
    *) fail 'unknown reader-summary daily-runner maintenance action' ;;
  esac
)
