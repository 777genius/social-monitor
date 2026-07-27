#!/usr/bin/env bash

# Sourced only by the authenticated target-publication wrapper after this exact
# target blob passes canonical-path, ownership, mode, type, and digest checks.
# The caller owns deploy/admission locks and supplies ROOT, REPO, STATE,
# COMPOSE, deploy-control digest helpers, and fail().

READER_SUMMARY_PUBLICATION_MIGRATION_ID=20260716170000_reader_summary_fail_closed_publication
POSTGRES_BACKUP_DUMPER_ROLE=social_monitor_backup_dumper
POSTGRES_BACKUP_EMERGENCY_MANAGED_ADMIN_ROLE=doadmin
POSTGRES_BACKUP_DATABASE=social_monitor
POSTGRES_BACKUP_DATABASE_HOST=dbaas-db-8050451-do-user-39622063-0.e.db.ondigitalocean.com
POSTGRES_BACKUP_DATABASE_PORT=25060
POSTGRES_BACKUP_SSLROOTCERT=/run/social-monitor-db/ca-certificate.crt

# Called through backup_database() after the publication wrapper returns to the
# installed controller.
# shellcheck disable=SC2329
create_pre_migration_database_backup() (
  local sha=$1
  local output partial env_file listing schema_tables migration_state
  local post_dump_schema_tables post_dump_migration_state
  local backup_secret database_url database_name migration_checksum
  local backup_capability
  local migration_path=prisma/migrations/$READER_SUMMARY_PUBLICATION_MIGRATION_ID/migration.sql
  local backup_image=postgres@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15
  local -a cleanup_paths=()
  set +x

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

  backup_secret=$ROOT/secrets/db/postgres-backup-admin-url
  declare -F reader_summary_publication_private_file_valid >/dev/null || \
    fail 'database backup private-file validator is unavailable'
  reader_summary_publication_private_file_valid "$backup_secret" '400' || \
    fail 'database backup DSN secret is missing or not root-owned mode 0400'
  validate_postgres_backup_admin_url "$backup_secret" || \
    fail 'database backup DSN secret is not pinned to the approved backup role and production database'
  database_url=$(< "$backup_secret") || \
    fail 'database backup DSN secret cannot be read'

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

  printf 'DATABASE_URL=%s\n' "$database_url" > "$env_file"

  backup_capability=$(
    validate_postgres_backup_dump_capability "$env_file" "$backup_image"
  ) || fail 'database backup DSN role is not dump-capable for FORCE RLS tables'
  printf '%s\n' "$backup_capability"

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

validate_postgres_backup_admin_url() {
  local secret=$1

  python3 - "$secret" \
    "$POSTGRES_BACKUP_DUMPER_ROLE" \
    "$POSTGRES_BACKUP_EMERGENCY_MANAGED_ADMIN_ROLE" \
    "$POSTGRES_BACKUP_DATABASE_HOST" \
    "$POSTGRES_BACKUP_DATABASE_PORT" \
    "$POSTGRES_BACKUP_DATABASE" \
    "$POSTGRES_BACKUP_SSLROOTCERT" <<'PY'
import re
import sys
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlsplit

try:
    raw = Path(sys.argv[1]).read_bytes()
    if raw.endswith(b"\n"):
        raw = raw[:-1]
    value = raw.decode("utf-8", errors="strict")
    if not value or any(ord(character) <= 0x20 for character in value):
        raise ValueError
    if "\\" in value or re.search(r"%(?![0-9A-Fa-f]{2})", value):
        raise ValueError
    if not value.startswith(("postgresql://", "postgres://")):
        raise ValueError

    parsed = urlsplit(value)
    if parsed.fragment or parsed.netloc.count("@") != 1:
        raise ValueError
    backup_role, emergency_role, expected_host, expected_port, expected_database, expected_ca = sys.argv[2:]
    username = unquote(parsed.username or "", errors="strict")
    password = unquote(parsed.password or "", errors="strict")
    database_path = unquote(parsed.path, errors="strict")
    if username not in {backup_role, emergency_role}:
        raise ValueError
    if parsed.password is None or not password:
        raise ValueError
    if parsed.hostname is None or parsed.hostname != expected_host or not parsed.hostname.isascii():
        raise ValueError
    if parsed.port != int(expected_port):
        raise ValueError
    if database_path != f"/{expected_database}":
        raise ValueError
    if any(
        any(ord(character) <= 0x20 for character in field)
        for field in [parsed.hostname, str(parsed.port), expected_database, username, password]
    ):
        raise ValueError
    if not parsed.query or parsed.query.startswith("&") or parsed.query.endswith("&"):
        raise ValueError
    if "&&" in parsed.query:
        raise ValueError

    parameters = parse_qsl(
        parsed.query,
        keep_blank_values=True,
        strict_parsing=True,
        separator="&",
    )
    if len(parameters) != len(dict(parameters)):
        raise ValueError
    parameter_values = dict(parameters)
    if set(parameter_values) != {"connect_timeout", "sslmode", "sslrootcert"}:
        raise ValueError
    timeout = parameter_values["connect_timeout"]
    if not timeout.isdecimal() or not 1 <= int(timeout) <= 15:
        raise ValueError
    if parameter_values["sslmode"] != "verify-full":
        raise ValueError
    if parameter_values["sslrootcert"] != expected_ca:
        raise ValueError
except (OSError, UnicodeError, ValueError):
    raise SystemExit(1)
PY
}

validate_postgres_backup_dump_capability() (
  local env_file=$1
  local backup_image=$2
  local capability_result capability_delimiters
  local database_name current_identity session_identity can_login
  local can_create_role can_create_database can_replicate can_bypass_rls
  local is_superuser uses_tls extra

  # shellcheck disable=SC2016 # Expansion occurs in the child shell.
  capability_result=$(docker run --rm \
    --env-file "$env_file" \
    -v "$ROOT/secrets/db/ca-certificate.crt:/run/social-monitor-db/ca-certificate.crt:ro" \
    "$backup_image" \
    sh -c 'exec psql "$DATABASE_URL" -X -A -t -F "|" -v ON_ERROR_STOP=1 -c "$1"' _ \
    "SELECT current_database(), current_user, session_user,
  backup_role.rolcanlogin, backup_role.rolcreaterole,
  backup_role.rolcreatedb, backup_role.rolreplication,
  backup_role.rolbypassrls, backup_role.rolsuper,
  COALESCE(connection.ssl, false)
FROM pg_catalog.pg_roles AS backup_role
LEFT JOIN pg_catalog.pg_stat_ssl AS connection
  ON connection.pid = pg_catalog.pg_backend_pid()
WHERE backup_role.rolname = current_user;") || return 1
  [[ -n $capability_result && $capability_result != *$'\n'* ]] || return 1
  capability_delimiters=${capability_result//[!|]/}
  ((${#capability_delimiters} == 9)) || return 1

  IFS='|' read -r database_name current_identity session_identity \
    can_login can_create_role can_create_database can_replicate \
    can_bypass_rls is_superuser uses_tls extra <<< "$capability_result"

  [[ -z ${extra:-} && $database_name == "$POSTGRES_BACKUP_DATABASE" ]] || \
    return 1
  [[ $current_identity == "$session_identity" ]] || return 1
  [[ $current_identity == "$POSTGRES_BACKUP_DUMPER_ROLE" || \
     $current_identity == "$POSTGRES_BACKUP_EMERGENCY_MANAGED_ADMIN_ROLE" ]] || \
    return 1
  [[ $can_login == t && $can_create_role == f && \
     $can_create_database == f && $can_replicate == f && \
     $uses_tls == t ]] || return 1
  if [[ $current_identity == "$POSTGRES_BACKUP_DUMPER_ROLE" && \
        $can_bypass_rls == t && $is_superuser == f ]]; then
    printf 'database-backup-role-capability=preferred-bypassrls role=%s\n' \
      "$current_identity"
    return 0
  fi
  if [[ $current_identity == "$POSTGRES_BACKUP_EMERGENCY_MANAGED_ADMIN_ROLE" && \
        $is_superuser == t ]]; then
    printf '%s\n' \
      "database-backup-role-capability=emergency-managed-admin-superuser role=$current_identity"
    return 0
  fi
  return 1
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
    "SELECT c.relname::text
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relpersistence <> 't'
ORDER BY c.relname::text COLLATE \"C\""
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
  # shellcheck disable=SC2329 # invoked indirectly by EXIT trap
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
      WHERE started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at
        AND applied_steps_count = 0
        AND id <> ''
        AND checksum ~ '^[0-9a-f]{64}$'
        AND checksum <> :'migration_checksum'
        AND logs IS NULL
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
