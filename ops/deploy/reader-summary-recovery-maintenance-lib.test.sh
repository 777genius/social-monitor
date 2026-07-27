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
PROJECT=social-monitor-prod
POSTGRES_RUNTIME_CURRENT=$CONTROL/postgres-runtime-current
DAILY_SINGLETON_LOCK=$CONTROL/daily-run-singleton.lock
POSTGRES_ADMISSION_LOCK=$CONTROL/daily-run.lock
DAILY_RUNNER_MAINTENANCE_ADMISSION_WAIT_SECONDS=1
READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=/var/lib/social-monitor/artifacts/reader-summary-weekly-production
READER_SUMMARY_RECOVERY_TEST_DUMP=$ROOT/backups/pre-autodeploy-7da1005a6d7e-20260727T051450Z.dump
DOCKER_LOG=$FIXTURE/docker.log
COMPOSE_LOG=$FIXTURE/compose.log
SQL_LOG=$FIXTURE/snapshot-validation.sql
SHA=0123456789abcdef0123456789abcdef01234567

install -d "$REPO/ops/deploy" "$STATE" "$POSTGRES_RUNTIME_CURRENT" "$ROOT/backups"
cp "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" "$REPO/ops/deploy/"
printf '%s\n' "$SHA" > "$POSTGRES_RUNTIME_CURRENT/READY"
printf '%s\n' "$SHA" > "$STATE/backend.sha"
printf 'fixture dump\n' > "$READER_SUMMARY_RECOVERY_TEST_DUMP"
: > "$DOCKER_LOG"
: > "$COMPOSE_LOG"
: > "$SQL_LOG"

fail() {
  printf 'test failure: %s\n' "$*" >&2
  exit 1
}

docker() {
  printf '%s\n' "$*" >> "$DOCKER_LOG"
  if [[ $1 == run && $* == *"pg_restore -l"* ]]; then
    for table in \
      feed_items \
      source_items \
      github_repository_trend_results \
      scan_jobs \
      scan_attempts \
      tenants \
      workspaces; do
      printf '1; 0 0 TABLE public %s postgres\n' "$table"
    done
  elif [[ $1 == exec && $* == *" psql "* ]]; then
    cat > "$SQL_LOG"
  fi
  return 0
}

fake_compose() {
  printf '%s\n' "$*" >> "$COMPOSE_LOG"
  printf 'source-env=%s\n' \
    "${READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL:+set}" \
    >> "$COMPOSE_LOG"
  [[ ${FAKE_COMPOSE_FAIL:-0} == 1 ]] && return 44
  return 0
}

export SOCIAL_MONITOR_DEPLOY_TEST_MODE=1
export READER_SUMMARY_RECOVERY_TEST_DUMP
export DOCKER_LOG COMPOSE_LOG SQL_LOG
COMPOSE=(fake_compose)

# shellcheck source=ops/deploy/reader-summary-recovery-maintenance-lib.sh
source "$REPO/ops/deploy/reader-summary-recovery-maintenance-lib.sh"

unset READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days
run_reader_summary_daily_runner_maintenance reader-summary-weekly-run

grep -Fx -- '--profile daily run --rm --no-deps -e READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL daily-runner sh -lc npm run recover:reader-summary-production -- --apply' \
  "$COMPOSE_LOG" >/dev/null
grep -Fx 'source-env=set' "$COMPOSE_LOG" >/dev/null
grep -Fx -- '--profile daily run --rm --no-deps -e READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=/var/lib/social-monitor/artifacts/reader-summary-weekly-production daily-runner sh -lc npm run run:reader-summary-weekly-production' \
  "$COMPOSE_LOG" >/dev/null
! grep -F 'postgresql://' "$COMPOSE_LOG" >/dev/null

grep -F 'network inspect social-monitor-prod_default' "$DOCKER_LOG" >/dev/null
grep -F -- '--env-file' "$DOCKER_LOG" >/dev/null
grep -F -- "$ROOT/backups:/recovery-backups:ro" "$DOCKER_LOG" >/dev/null
grep -F 'pg_restore -l /recovery-backups/pre-autodeploy-7da1005a6d7e-20260727T051450Z.dump' \
  "$DOCKER_LOG" >/dev/null
grep -F 'pg_restore -U social_monitor_recovery_source --single-transaction --no-owner --no-privileges --dbname social_monitor_recovery_source /recovery-backups/pre-autodeploy-7da1005a6d7e-20260727T051450Z.dump' \
  "$DOCKER_LOG" >/dev/null
grep -F 'rm -f social-monitor-reader-summary-recovery-source-' "$DOCKER_LOG" >/dev/null
[[ ! -e $STATE/reader-summary-recovery-source.$$.env ]]

grep -F "(DATE '2026-07-23', 'github-trending-page', 0)" "$SQL_LOG" >/dev/null
grep -F "(DATE '2026-07-23', 'hacker-news', 100)" "$SQL_LOG" >/dev/null
grep -F "(DATE '2026-07-23', 'reddit', 100)" "$SQL_LOG" >/dev/null
grep -F "(DATE '2026-07-23', 'rss', 75)" "$SQL_LOG" >/dev/null
grep -F "(DATE '2026-07-23', 'x-twitter', 67)" "$SQL_LOG" >/dev/null
grep -F "(DATE '2026-07-24', 'github-trending-page', 10)" "$SQL_LOG" >/dev/null
grep -F "(DATE '2026-07-24', 'rss', 67)" "$SQL_LOG" >/dev/null
grep -F "(DATE '2026-07-24', 'x-twitter', 73)" "$SQL_LOG" >/dev/null
grep -F 'JOIN "tenants" AS tenant' "$SQL_LOG" >/dev/null
grep -F 'tenant."deleted_at" IS NULL' "$SQL_LOG" >/dev/null
grep -F 'JOIN "workspaces" AS workspace' "$SQL_LOG" >/dev/null
grep -F 'workspace."deleted_at" IS NULL' "$SQL_LOG" >/dev/null
grep -F "v_github_verified_count <> 10" "$SQL_LOG" >/dev/null
grep -F "snapshot Jul24 verified GitHub evidence diverged" "$SQL_LOG" >/dev/null
grep -F "snapshot feed rows are duplicated" "$SQL_LOG" >/dev/null

: > "$DOCKER_LOG"
: > "$COMPOSE_LOG"
FAKE_COMPOSE_FAIL=1
set +e
run_reader_summary_daily_runner_maintenance reader-summary-recover-missing-days
status=$?
set -e
[[ $status == 44 ]]
grep -F 'rm -f social-monitor-reader-summary-recovery-source-' "$DOCKER_LOG" >/dev/null

grep -F 'reader-summary-recover-missing-days|reader-summary-weekly-run' \
  "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" >/dev/null
grep -F 'reader-summary-recover-missing-days|reader-summary-weekly-run' \
  "$SCRIPT_DIR/github-production-deploy-client.sh" >/dev/null

echo 'Reader summary recovery maintenance tests passed'
