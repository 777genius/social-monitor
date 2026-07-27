#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after project paths, COMPOSE,
# and fail are defined.

READER_SUMMARY_RECOVERY_SOURCE_ENV_NAME=READER_SUMMARY_PRODUCTION_RECOVERY_SOURCE_DATABASE_URL
READER_SUMMARY_RECOVERY_SNAPSHOT_IMAGE=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
READER_SUMMARY_RECOVERY_VERIFIED_DUMP=/var/data/social-monitor/backups/pre-autodeploy-7da1005a6d7e-20260727T051450Z.dump

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
      run_reader_summary_recovery_with_snapshot_source
      ;;
    reader-summary-weekly-run)
      "${COMPOSE[@]}" --profile daily run --rm --no-deps \
        -e "READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR=$READER_SUMMARY_WEEKLY_PRODUCTION_ARTIFACT_DIR" \
        daily-runner sh -lc 'npm run run:reader-summary-weekly-production'
      ;;
    *) fail 'unknown reader-summary daily-runner maintenance action' ;;
  esac
)

run_reader_summary_recovery_with_snapshot_source() (
  set -euo pipefail
  local dump env_file password container database user source_url
  dump=$(reader_summary_recovery_snapshot_dump_path)
  user=social_monitor_recovery_source
  database=social_monitor_recovery_source
  container=social-monitor-reader-summary-recovery-source-$$
  env_file=$STATE/reader-summary-recovery-source.$$.env
  password=$(reader_summary_recovery_random_hex)

  cleanup_reader_summary_recovery_snapshot() {
    docker rm -f "$container" >/dev/null 2>&1 || true
    rm -f "$env_file"
  }
  trap cleanup_reader_summary_recovery_snapshot EXIT

  reader_summary_recovery_validate_snapshot_dump "$dump"
  umask 077
  {
    printf 'POSTGRES_USER=%s\n' "$user"
    printf 'POSTGRES_DB=%s\n' "$database"
    printf 'POSTGRES_PASSWORD=%s\n' "$password"
  } > "$env_file"
  reader_summary_recovery_start_snapshot_container "$container" "$dump" "$env_file"
  reader_summary_recovery_wait_for_snapshot_database "$container" "$user" "$database"
  reader_summary_recovery_restore_snapshot_dump \
    "$container" "$user" "$database" "$dump"
  reader_summary_recovery_validate_restored_snapshot "$container" "$user" "$database"
  source_url='postgresql:'
  source_url+="//$user"
  source_url+=":$password"
  source_url+="@$container:5432/$database"
  export "$READER_SUMMARY_RECOVERY_SOURCE_ENV_NAME=$source_url"
  "${COMPOSE[@]}" --profile daily run --rm --no-deps \
    -e "$READER_SUMMARY_RECOVERY_SOURCE_ENV_NAME" \
    daily-runner sh -lc 'npm run recover:reader-summary-production -- --apply'
)

reader_summary_recovery_snapshot_dump_path() {
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 && \
        -n ${READER_SUMMARY_RECOVERY_TEST_DUMP:-} ]]; then
    printf '%s\n' "$READER_SUMMARY_RECOVERY_TEST_DUMP"
    return
  fi
  printf '%s\n' "$READER_SUMMARY_RECOVERY_VERIFIED_DUMP"
}

reader_summary_recovery_random_hex() {
  local password
  password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
  [[ $password =~ ^[0-9a-f]{48}$ ]] || \
    fail 'reader summary recovery source password generation failed'
  printf '%s\n' "$password"
}

reader_summary_recovery_validate_snapshot_dump() (
  set -euo pipefail
  local dump=$1
  local listing=$STATE/reader-summary-recovery-source.$$.list
  trap 'rm -f "$listing"' EXIT
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 || \
        -z ${READER_SUMMARY_RECOVERY_TEST_DUMP:-} ]]; then
    [[ $dump == "$READER_SUMMARY_RECOVERY_VERIFIED_DUMP" ]] || \
      fail 'reader summary recovery source dump path is not the verified snapshot'
  fi
  [[ -f $dump && ! -L $dump ]] || \
    fail 'reader summary recovery source dump is not a regular file'
  docker run --rm \
    -v "$(dirname "$dump"):/recovery-backups:ro" \
    "$READER_SUMMARY_RECOVERY_SNAPSHOT_IMAGE" \
    pg_restore -l "/recovery-backups/$(basename "$dump")" > "$listing"
  for required_table in \
    feed_items \
    source_items \
    github_repository_trend_results \
    scan_jobs \
    scan_attempts \
    tenants \
    workspaces; do
    grep -Eq "(TABLE|TABLE DATA) public ${required_table}" "$listing" || \
      fail "reader summary recovery source dump omits $required_table"
  done
)

reader_summary_recovery_start_snapshot_container() {
  local container=$1 dump=$2 env_file=$3 network
  network=${PROJECT}_default
  docker network inspect "$network" >/dev/null || \
    fail 'reader summary recovery compose network is unavailable'
  docker run -d --rm \
    --name "$container" \
    --network "$network" \
    --env-file "$env_file" \
    -v "$(dirname "$dump"):/recovery-backups:ro" \
    "$READER_SUMMARY_RECOVERY_SNAPSHOT_IMAGE" >/dev/null
}

reader_summary_recovery_wait_for_snapshot_database() {
  local container=$1 user=$2 database=$3 attempt
  for attempt in $(seq 1 60); do
    if docker exec "$container" pg_isready -U "$user" -d "$database" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  fail 'reader summary recovery source database did not become ready'
}

reader_summary_recovery_restore_snapshot_dump() {
  local container=$1 user=$2 database=$3 dump=$4
  docker exec "$container" pg_restore \
    -U "$user" \
    --single-transaction \
    --no-owner \
    --no-privileges \
    --dbname "$database" \
    "/recovery-backups/$(basename "$dump")" >/dev/null
}

reader_summary_recovery_validate_restored_snapshot() {
  local container=$1 user=$2 database=$3
  docker exec "$container" psql -U "$user" -d "$database" \
    -X -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DO $reader_summary_recovery_snapshot_validation$
DECLARE
  v_duplicate_count INTEGER;
  v_github_verified_count INTEGER;
  v_mismatch_count INTEGER;
  v_scope_count INTEGER;
BEGIN
  SELECT count(*)
    INTO v_scope_count
    FROM (
      SELECT DISTINCT feed."tenant_id", feed."workspace_id"
        FROM "feed_items" AS feed
        JOIN "source_items" AS source
          ON source."id" = feed."source_item_id"
         AND source."tenant_id" = feed."tenant_id"
         AND source."workspace_id" = feed."workspace_id"
         AND source."source_binding_id" = feed."source_binding_id"
         AND source."provider_key" = feed."provider_key"
         AND source."canonical_url" = feed."canonical_url"
        JOIN "tenants" AS tenant
          ON tenant."id" = feed."tenant_id"
         AND tenant."deleted_at" IS NULL
        JOIN "workspaces" AS workspace
          ON workspace."id" = feed."workspace_id"
         AND workspace."tenant_id" = feed."tenant_id"
         AND workspace."deleted_at" IS NULL
       WHERE feed."status" = 'VISIBLE'
         AND feed."provider_key" = ANY(ARRAY[
           'github-trending-page',
           'hacker-news',
           'reddit',
           'rss',
           'x-twitter'
         ])
         AND feed."observed_at" >=
           (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
         AND feed."observed_at" <
           (DATE '2026-07-26'::TIMESTAMP AT TIME ZONE 'UTC')
    ) AS scope;
  IF v_scope_count <> 1 THEN
    RAISE EXCEPTION
      'reader summary recovery snapshot scope is absent or ambiguous';
  END IF;

  WITH expected(requested_utc_date, provider_key, expected_count) AS (
    VALUES
      (DATE '2026-07-23', 'github-trending-page', 0),
      (DATE '2026-07-23', 'hacker-news', 100),
      (DATE '2026-07-23', 'reddit', 100),
      (DATE '2026-07-23', 'rss', 75),
      (DATE '2026-07-23', 'x-twitter', 67),
      (DATE '2026-07-24', 'github-trending-page', 10),
      (DATE '2026-07-24', 'hacker-news', 100),
      (DATE '2026-07-24', 'reddit', 100),
      (DATE '2026-07-24', 'rss', 67),
      (DATE '2026-07-24', 'x-twitter', 73)
  ),
  actual AS (
    SELECT
      CASE
        WHEN feed."observed_at" <
          (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
        THEN DATE '2026-07-23'
        ELSE DATE '2026-07-24'
      END AS requested_utc_date,
      feed."provider_key",
      count(*)::INTEGER AS actual_count
    FROM "feed_items" AS feed
    JOIN "source_items" AS source
      ON source."id" = feed."source_item_id"
     AND source."tenant_id" = feed."tenant_id"
     AND source."workspace_id" = feed."workspace_id"
     AND source."source_binding_id" = feed."source_binding_id"
     AND source."provider_key" = feed."provider_key"
     AND source."canonical_url" = feed."canonical_url"
    WHERE feed."status" = 'VISIBLE'
      AND feed."provider_key" = ANY(ARRAY[
        'github-trending-page',
        'hacker-news',
        'reddit',
        'rss',
        'x-twitter'
      ])
      AND feed."observed_at" >=
        (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
      AND feed."observed_at" <
        (DATE '2026-07-26'::TIMESTAMP AT TIME ZONE 'UTC')
    GROUP BY requested_utc_date, feed."provider_key"
  )
  SELECT count(*)
    INTO v_mismatch_count
    FROM expected
    LEFT JOIN actual
      ON actual.requested_utc_date = expected.requested_utc_date
     AND actual.provider_key = expected.provider_key
   WHERE COALESCE(actual.actual_count, 0) <> expected.expected_count;
  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION
      'reader summary recovery snapshot provider counts diverged';
  END IF;

  SELECT count(*) - count(DISTINCT feed."id")
    INTO v_duplicate_count
    FROM "feed_items" AS feed
   WHERE feed."status" = 'VISIBLE'
     AND feed."observed_at" >=
       (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
     AND feed."observed_at" <
       (DATE '2026-07-26'::TIMESTAMP AT TIME ZONE 'UTC');
  IF v_duplicate_count <> 0 THEN
    RAISE EXCEPTION
      'reader summary recovery snapshot feed rows are duplicated';
  END IF;

  SELECT count(*)::INTEGER
    INTO v_github_verified_count
    FROM "feed_items" AS feed
    JOIN "source_items" AS source
      ON source."id" = feed."source_item_id"
     AND source."tenant_id" = feed."tenant_id"
     AND source."workspace_id" = feed."workspace_id"
     AND source."source_binding_id" = feed."source_binding_id"
     AND source."provider_key" = feed."provider_key"
     AND source."canonical_url" = feed."canonical_url"
    JOIN "github_repository_trend_results" AS result
      ON result."source_item_id" = source."id"
     AND result."tenant_id" = source."tenant_id"
     AND result."workspace_id" = source."workspace_id"
     AND result."source_binding_id" = source."source_binding_id"
     AND result."repository_url" = source."canonical_url"
     AND result."primary_window" IN ('daily', 'today')
    JOIN "scan_jobs" AS scan
      ON scan."id" = result."scan_job_id"
     AND scan."tenant_id" = result."tenant_id"
     AND scan."workspace_id" = result."workspace_id"
     AND scan."source_binding_id" = result."source_binding_id"
     AND scan."status" = 'SUCCEEDED'
    JOIN "scan_attempts" AS attempt
      ON attempt."scan_job_id" = scan."id"
     AND attempt."tenant_id" = scan."tenant_id"
     AND attempt."workspace_id" = scan."workspace_id"
     AND attempt."source_binding_id" = scan."source_binding_id"
     AND attempt."status" = 'SUCCEEDED'
     AND attempt."finished_at" IS NOT NULL
   WHERE feed."status" = 'VISIBLE'
     AND feed."provider_key" = 'github-trending-page'
     AND feed."observed_at" >=
       (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
     AND feed."observed_at" <
       (DATE '2026-07-26'::TIMESTAMP AT TIME ZONE 'UTC');
  IF v_github_verified_count <> 10 THEN
    RAISE EXCEPTION
      'reader summary recovery snapshot Jul24 verified GitHub evidence diverged';
  END IF;
END;
$reader_summary_recovery_snapshot_validation$;
SQL
}
