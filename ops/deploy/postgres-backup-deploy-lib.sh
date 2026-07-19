#!/usr/bin/env bash

# Sourced only by the authenticated target-publication wrapper after this exact
# target blob passes canonical-path, ownership, mode, type, and digest checks.
# The caller owns deploy/admission locks and supplies ROOT, REPO, STATE,
# COMPOSE, deploy-control digest helpers, and fail().

READER_SUMMARY_PUBLICATION_MIGRATION_ID=20260716170000_reader_summary_fail_closed_publication

# Called through backup_database() after the publication wrapper returns to the
# installed controller.
# shellcheck disable=SC2329
create_pre_migration_database_backup() (
  local sha=$1
  local output partial env_file listing schema_tables migration_state
  local post_dump_schema_tables post_dump_migration_state
  local api_id database_url database_name migration_checksum
  local migration_path=prisma/migrations/$READER_SUMMARY_PUBLICATION_MIGRATION_ID/migration.sql
  local backup_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
  local -a cleanup_paths=()

  [[ $sha =~ ^[0-9a-f]{40}$ ]] || \
    fail 'database backup target SHA is invalid'
  migration_checksum=$(
    deploy_control_git_blob_digest "$sha" "$migration_path"
  ) || fail 'target commit is missing the reviewed publication migration'
  [[ $migration_checksum =~ ^[0-9a-f]{64}$ ]] || \
    fail 'reviewed reader-summary publication migration checksum is unavailable'

  output=$ROOT/backups/pre-autodeploy-${sha:0:12}-$(date -u +%Y%m%dT%H%M%SZ).dump
  partial=$output.partial
  [[ ! -e $output && ! -L $output && ! -e $partial && ! -L $partial ]] || \
    fail 'database backup output already exists'
  cleanup_paths+=("$partial")

  umask 077
  trap 'rm -f -- "${cleanup_paths[@]}"' EXIT
  env_file=$(mktemp "$STATE/database-backup.XXXXXX.env") || \
    fail 'database backup credential file cannot be created'
  cleanup_paths+=("$env_file")
  listing=$(mktemp "$STATE/database-backup.XXXXXX.list") || \
    fail 'database backup listing file cannot be created'
  cleanup_paths+=("$listing")
  schema_tables=$(mktemp "$STATE/database-backup.XXXXXX.tables") || \
    fail 'database backup schema snapshot cannot be created'
  cleanup_paths+=("$schema_tables")
  migration_state=$(mktemp "$STATE/database-backup.XXXXXX.migration-state") || \
    fail 'database backup migration snapshot cannot be created'
  cleanup_paths+=("$migration_state")
  post_dump_schema_tables=$(mktemp \
    "$STATE/database-backup.XXXXXX.post-dump.tables") || \
    fail 'database backup post-dump schema snapshot cannot be created'
  cleanup_paths+=("$post_dump_schema_tables")
  post_dump_migration_state=$(mktemp \
    "$STATE/database-backup.XXXXXX.post-dump.migration-state") || \
    fail 'database backup post-dump migration snapshot cannot be created'
  cleanup_paths+=("$post_dump_migration_state")

  api_id=$("${COMPOSE[@]}" --profile app ps -q api)
  [[ -n $api_id ]] || \
    fail 'production API container is unavailable for database discovery'
  database_url=$(docker inspect "$api_id" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' | \
    awk -F= '$1 == "DATABASE_URL" {sub(/^[^=]*=/, ""); print; exit}')
  [[ -n $database_url ]] || \
    fail 'production API has no effective database URL'

  printf 'DATABASE_URL=%s\n' "$database_url" > "$env_file"

  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  database_name=$(docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$backup_image" \
    sh -lc 'psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "SELECT current_database()"')
  [[ $database_name == social_monitor ]] || \
    fail 'effective production database is not social_monitor'

  capture_pre_migration_schema_tables "$env_file" "$backup_image" \
    > "$schema_tables"
  capture_reader_summary_publication_migration_state \
    "$env_file" "$backup_image" "$migration_checksum" > "$migration_state"
  bash "$REPO/ops/deploy/verify-postgres-backup-coverage.sh" \
    "$schema_tables" "$migration_state"

  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$backup_image" \
    sh -lc 'pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL"' \
    > "$partial"
  [[ -s $partial ]] || fail 'database backup archive is empty'
  docker run --rm \
    -v "$ROOT/backups:/backups:ro" \
    "$backup_image" \
    pg_restore --file=/dev/null --no-owner --no-privileges \
      "/backups/$(basename "$partial")"
  docker run --rm \
    -v "$ROOT/backups:/backups:ro" \
    "$backup_image" \
    pg_restore -l "/backups/$(basename "$partial")" > "$listing"

  capture_pre_migration_schema_tables "$env_file" "$backup_image" \
    > "$post_dump_schema_tables"
  capture_reader_summary_publication_migration_state \
    "$env_file" "$backup_image" "$migration_checksum" \
    > "$post_dump_migration_state"
  bash "$REPO/ops/deploy/verify-postgres-backup-coverage.sh" \
    "$schema_tables" "$migration_state" "$listing" \
    "$post_dump_schema_tables" "$post_dump_migration_state"

  chmod 600 "$partial"
  mv -T -- "$partial" "$output"
  bash "$REPO/ops/deploy/prune-pre-autodeploy-backups.sh" \
    "$ROOT/backups" 10 "$output"
  printf 'database-backup=%s\n' "$output"
)

capture_pre_migration_schema_tables() {
  local env_file=$1
  local backup_image=$2

  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$backup_image" \
    sh -c 'exec psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "$1"' _ \
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
}

capture_reader_summary_publication_migration_state() (
  local env_file=$1
  local backup_image=$2
  local migration_checksum=$3
  local migration_id=$READER_SUMMARY_PUBLICATION_MIGRATION_ID
  local sql
  sql_file=

  # Invoked through the EXIT trap below.
  # shellcheck disable=SC2317
  cleanup_migration_state_sql() {
    if [[ -n $sql_file ]]; then
      rm -f -- "$sql_file"
    fi
  }
  trap cleanup_migration_state_sql EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  umask 077

  # The summary classifies every Prisma lifecycle. The second record is a
  # canonical hex encoding of every target row, including logs and timestamps,
  # so a mutation that remains nominally completed is still detected as a race.
  read -r -d '' sql <<'SQL' || :
WITH target AS MATERIALIZED (
  SELECT
    id,
    checksum,
    finished_at,
    migration_name,
    logs,
    rolled_back_at,
    started_at,
    applied_steps_count
  FROM public."_prisma_migrations"
  WHERE migration_name = :'migration_id'
), summary AS (
  SELECT
    count(*) AS total,
    count(*) FILTER (
      WHERE started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND rolled_back_at IS NULL
        AND applied_steps_count = 1
        AND id <> ''
        AND checksum = :'migration_checksum'
        AND finished_at >= started_at
        AND (logs IS NULL OR btrim(logs) = '')
    ) AS completed,
    count(*) FILTER (
      WHERE finished_at IS NULL
        AND rolled_back_at IS NULL
        AND logs IS NOT NULL
        AND btrim(logs) <> ''
    ) AS failed,
    count(*) FILTER (
      WHERE finished_at IS NULL
        AND rolled_back_at IS NOT NULL
    ) AS rolled_back,
    count(*) FILTER (
      WHERE finished_at IS NULL
        AND rolled_back_at IS NULL
        AND (logs IS NULL OR btrim(logs) = '')
    ) AS in_progress
  FROM target
), classified AS (
  SELECT
    total,
    completed,
    failed,
    rolled_back,
    in_progress,
    total - completed - failed - rolled_back - in_progress AS contradictory
  FROM summary
), exact_state AS (
  SELECT encode(
    convert_to(
      COALESCE(
        jsonb_agg(to_jsonb(target) ORDER BY started_at, id)::text,
        '[]'
      ),
      'UTF8'
    ),
    'hex'
  ) AS exact_hex
  FROM target
)
SELECT concat_ws(
  E'\t',
  'reader-summary-publication-migration-state-v1',
  total,
  completed,
  failed,
  rolled_back,
  in_progress,
  contradictory
)
FROM classified
UNION ALL
SELECT 'exact-hex=' || exact_hex
FROM exact_state;
SQL

  sql_file=$(mktemp "$STATE/database-backup.XXXXXX.migration-state.sql") || \
    fail 'database backup migration query file cannot be created'
  printf '%s\n' "$sql" > "$sql_file" || \
    fail 'database backup migration query file cannot be written'
  chmod 0600 "$sql_file" || \
    fail 'database backup migration query file cannot be secured'
  [[ -f $sql_file && ! -L $sql_file && -s $sql_file ]] || \
    fail 'database backup migration query file is invalid'

  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    -v "$sql_file:/run/social-monitor-db/migration-state.sql:ro" \
    "$backup_image" \
    sh -c 'exec psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -v "migration_id=$1" -v "migration_checksum=$2" --file=/run/social-monitor-db/migration-state.sql' \
      _ "$migration_id" "$migration_checksum"
)
