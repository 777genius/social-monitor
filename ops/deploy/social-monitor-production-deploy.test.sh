#!/usr/bin/env bash
# shellcheck disable=SC2016
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
BACKUP_LIBRARY=$SCRIPT_DIR/postgres-backup-deploy-lib.sh
FIXTURE=$(mktemp -d "/tmp/social-monitor-deploy-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT
REPO=$(readlink -f -- "$FIXTURE")/repo
ORIGIN=$FIXTURE/origin.git
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
STAGING=${SOCIAL_MONITOR_DEPLOY_TEST_STAGING:-$ROOT/runtime/deploy-staging}
git init --bare -q "$ORIGIN"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Deploy Contract Test'
git -C "$REPO" config user.email deploy-contract@example.invalid
git -C "$REPO" remote add origin "$ORIGIN"
install -d "$REPO/apps/frontend" "$REPO/apps/api-gateway" \
  "$REPO/apps/x-collector" "$REPO/ops/deploy" "$REPO/ops/recovery" \
  "$REPO/prisma/migrations"/{20260716170000_reader_summary_fail_closed_publication,20260731153000_reader_summary_production_recovery_original_cutoff_authority} \
  "$STATE" "$STAGING"
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR"/postgres-runtime-{weekly-timer-state,daily-c1-readiness,activation-boundary}-lib.sh \
  "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/deploy-control-lib.sh" "$SCRIPT_DIR/deploy-control-bridge-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/backend-runtime-health-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/backend-image-rescue-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/docker-maintenance-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/daily-runner-image-bootstrap-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/x-collector-image-deploy-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/reader-summary-recovery-maintenance-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR"/{reader-summary-publication-deploy-lib.sh,reader-summary-publication-system-dsn-bootstrap-lib.sh,reader-summary-publication-prebootstrap-lib.sh,reader-summary-publication-pre-migration.sql,reader-summary-publication-post-migration.sql,reader-summary-original-cutoff-failed-migration-preflight.sql} \
  "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/verify-postgres-backup-coverage.sh" \
  "$SCRIPT_DIR/prune-pre-autodeploy-backups.sh" \
  "$BACKUP_LIBRARY" \
  "$REPO/ops/deploy/"
cp "$ENTRYPOINT" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" "$REPO/ops/deploy/"
for migration in 20260716170000_reader_summary_fail_closed_publication 20260731153000_reader_summary_production_recovery_original_cutoff_authority; do
  cp "$SCRIPT_DIR/../../prisma/migrations/$migration/migration.sql" "$REPO/prisma/migrations/$migration/"
done
cp "$SCRIPT_DIR/verify-postgres-runtime-topology.py" "$REPO/ops/deploy/"
cp -R "$SCRIPT_DIR/production-runtime" "$REPO/ops/deploy/"
rm -f \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
printf 'base\n' > "$REPO/README.md"
git -C "$REPO" add README.md ops/deploy prisma/migrations
git -C "$REPO" commit -qm 'test: base'
git -C "$REPO" push -q -u origin main
BASE_SHA=$(git -C "$REPO" rev-parse HEAD)
printf 'frontend\n' > "$REPO/apps/frontend/change.txt"
git -C "$REPO" add apps/frontend/change.txt
git -C "$REPO" commit -qm 'test: frontend change'
git -C "$REPO" push -q origin main
TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
for component in frontend backend control; do
  printf '%s\n' "$BASE_SHA" > "$STATE/$component.sha"
done
cp "$ENTRYPOINT" "$CONTROL/github-production-deploy.sh"
cp "$SCRIPT_DIR/social-monitor-production-ssh-wrapper.sh" \
  "$CONTROL/github-production-deploy-wrapper.sh"
printf '%s\n' "$BASE_SHA" > "$STATE/postgres-pool-bootstrap.sha"
run_entrypoint() {
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    bash "$ENTRYPOINT" "$@"
}
plan=$(run_entrypoint plan "$TARGET_SHA")
grep -Fx 'frontend=true' <<< "$plan" >/dev/null
grep -Fx 'backend=false' <<< "$plan" >/dev/null
grep -Fx "backend_base=$BASE_SHA" <<< "$plan" >/dev/null
grep -Fx 'control=false' <<< "$plan" >/dev/null
grep -Fx 'x_collector=false' <<< "$plan" >/dev/null
grep -Fx 'postgres_pool_bootstrap=postgres-pool-v1' <<< "$plan" >/dev/null
grep -Fx "postgres_pool_bootstrap_sha=$BASE_SHA" <<< "$plan" >/dev/null
printf '%s\n' "$TARGET_SHA" > "$STATE/frontend.sha"
plan=$(run_entrypoint plan "$TARGET_SHA")
grep -Fx 'frontend=false' <<< "$plan" >/dev/null
if run_entrypoint plan invalid-sha >/dev/null 2>&1; then
  echo 'invalid SHA was accepted' >&2
  exit 1
fi
if SSH_ORIGINAL_COMMAND=$'plan '"$TARGET_SHA"$'\ndeploy '"$TARGET_SHA" \
  run_entrypoint >/dev/null 2>&1; then
  echo 'multiline command was accepted' >&2
  exit 1
fi
disk_report=$(run_entrypoint disk-report "$TARGET_SHA")
grep -Fx 'docker-disk-report-begin' <<< "$disk_report" >/dev/null
grep -Fx 'docker-disk-report-end' <<< "$disk_report" >/dev/null
printf '{"schemaVersion":1}\n' > "$REPO/ops/recovery/backup-restore-contract.json"
git -C "$REPO" add ops/recovery/backup-restore-contract.json
git -C "$REPO" commit -qm 'test: backup contract control change'
git -C "$REPO" push -q origin main
CONTROL_TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
plan=$(run_entrypoint plan "$CONTROL_TARGET_SHA")
grep -Fx 'frontend=false' <<< "$plan" >/dev/null
grep -Fx 'backend=false' <<< "$plan" >/dev/null
grep -Fx 'control=true' <<< "$plan" >/dev/null
# Publication privilege contract changes must always select the standalone
# migrator, even when no application source changed.
git -C "$REPO" checkout -qb publication-mapping-test
printf '\n-- publication mapping contract\n' >> \
  "$REPO/ops/deploy/reader-summary-publication-pre-migration.sql"
git -C "$REPO" add ops/deploy/reader-summary-publication-pre-migration.sql
git -C "$REPO" commit -qm 'test: publication migration contract change'
PUBLICATION_TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
publication_services=$(
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
  CONTROL_TARGET_SHA="$CONTROL_TARGET_SHA" \
  PUBLICATION_TARGET_SHA="$PUBLICATION_TARGET_SHA" \
    bash -c '
      source "$1"
      backend_services "$CONTROL_TARGET_SHA" "$PUBLICATION_TARGET_SHA"
    ' _ "$ENTRYPOINT"
)
[[ $publication_services == migrate ]]
git -C "$REPO" checkout -q main
# Observability-only changes must explicitly recreate the collector because the
# production Compose activation uses up --no-deps.
git -C "$REPO" checkout -qb otel-mapping-test
install -d "$REPO/ops/observability"
printf 'service: {pipelines: {metrics: {}}}\n' > \
  "$REPO/ops/observability/otel-collector.yml"
git -C "$REPO" add ops/observability/otel-collector.yml
git -C "$REPO" commit -qm 'test: collector config change'
OTEL_TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
otel_services=$(
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
  CONTROL_TARGET_SHA="$CONTROL_TARGET_SHA" OTEL_TARGET_SHA="$OTEL_TARGET_SHA" \
    bash -c '
      source "$1"
      backend_services "$CONTROL_TARGET_SHA" "$OTEL_TARGET_SHA"
    ' _ "$ENTRYPOINT"
)
[[ $otel_services == otel-collector ]]
git -C "$REPO" checkout -q main
grep -F "if printf '%s\\n' \"\${persistent[@]}\" | grep -qx api && ! refresh_frontend_api_proxy; then" \
  "$ENTRYPOINT" >/dev/null
grep -F "if [[ \$api_rolled_back == true ]]; then" \
  "$SCRIPT_DIR/backend-image-rescue-lib.sh" >/dev/null
grep -F 'refresh_frontend_api_proxy || return 1' \
  "$SCRIPT_DIR/backend-image-rescue-lib.sh" >/dev/null
grep -F 'http://127.0.0.1:13080/auth/session' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
# shellcheck disable=SC2016
grep -F '[[ ! -e $output && ! -L $output && ! -e $partial && ! -L $partial ]]' \
  "$BACKUP_LIBRARY" >/dev/null
# shellcheck disable=SC2016
grep -F '"$ROOT/backups" 10 "$output"' \
  "$BACKUP_LIBRARY" >/dev/null
grep -F 'verify-postgres-backup-coverage.sh' "$BACKUP_LIBRARY" >/dev/null
# shellcheck disable=SC2016
backup_move_line=$(grep -nF 'mv -T -- "$partial" "$output"' \
  "$BACKUP_LIBRARY" | cut -d: -f1)
# shellcheck disable=SC2016
backup_prune_line=$(grep -nF 'prune-pre-autodeploy-backups.sh' \
  "$BACKUP_LIBRARY" | cut -d: -f1)
((backup_move_line < backup_prune_line))
backup_integrity_line=$(grep -nF \
  'pg_restore --file=/dev/null --no-owner --no-privileges' \
  "$BACKUP_LIBRARY" | cut -d: -f1)
backup_listing_line=$(grep -nF 'pg_restore -l ' \
  "$BACKUP_LIBRARY" | cut -d: -f1)
post_dump_snapshot_line=$(grep -nF \
  '"$post_dump_migration_state"' "$BACKUP_LIBRARY" | tail -1 | cut -d: -f1)
((backup_integrity_line < backup_listing_line))
((backup_listing_line < post_dump_snapshot_line))
((post_dump_snapshot_line < backup_move_line))
# Exercise the real target wrapper and backup transaction with a fake
# PostgreSQL client container. Empty, corrupt, failed, wrong-database, and
# raced archives never escape their partial name or retain credential files.
BACKUP_SCHEMA=$FIXTURE/backup-schema.txt BACKUP_LISTING=$FIXTURE/backup-listing.txt
BACKUP_MIGRATION_STATE=$FIXTURE/backup-migration-state.txt BACKUP_DOCKER_LOG=$FIXTURE/backup-docker.log
install -d "$ROOT/backups" "$ROOT/secrets/db"
printf '%s\n' fixture-ca > "$ROOT/secrets/db/ca-certificate.crt"
BACKUP_DSN_PATH=$ROOT/secrets/db/postgres-backup-admin-url BACKUP_PUBLICATION_ADMIN_DSN_FILE=$ROOT/secrets/db/reader-summary-publication-admin-url
BACKUP_DATABASE_HOST=dbaas-db-8050451-do-user-39622063-0.e.db.ondigitalocean.com
BACKUP_DSN_QUERY='connect_timeout=10&sslmode=verify-full&sslrootcert=%2Frun%2Fsocial-monitor-db%2Fca-certificate.crt'
BACKUP_DATABASE_URL="postgresql://social_monitor_backup_dumper:password@$BACKUP_DATABASE_HOST:25060/social_monitor?$BACKUP_DSN_QUERY"
BACKUP_MANAGED_ADMIN_DATABASE_URL="postgresql://doadmin:password@$BACKUP_DATABASE_HOST:25060/social_monitor?$BACKUP_DSN_QUERY"
BACKUP_PUBLICATION_ADMIN_DATABASE_URL="postgresql://social_monitor_publication_migrator:password@$BACKUP_DATABASE_HOST:25060/social_monitor?$BACKUP_DSN_QUERY"
BACKUP_API_DATABASE_URL="postgresql://social_monitor_app:password@$BACKUP_DATABASE_HOST:25060/social_monitor?$BACKUP_DSN_QUERY"
BACKUP_SYSTEM_DATABASE_URL="postgresql://social_monitor_system_app:password@$BACKUP_DATABASE_HOST:25060/social_monitor?$BACKUP_DSN_QUERY"
for rejected_url in "$BACKUP_PUBLICATION_ADMIN_DATABASE_URL" "$BACKUP_API_DATABASE_URL" "$BACKUP_SYSTEM_DATABASE_URL"; do [[ $BACKUP_DATABASE_URL != "$rejected_url" ]]; done
printf '%s\n' _prisma_migrations tenants workspaces source_items feed_items reader_summary_artifacts outbox_events inbox_records idempotency_keys > "$BACKUP_SCHEMA"
printf '%s\n' '1; 0 1 TABLE DATA public _prisma_migrations owner' '2; 0 2 TABLE DATA public tenants owner' '3; 0 3 TABLE DATA public workspaces owner' '4; 0 4 TABLE DATA public source_items owner' '5; 0 5 TABLE DATA public feed_items owner' '6; 0 6 TABLE DATA public reader_summary_artifacts owner' '7; 0 7 TABLE DATA public outbox_events owner' '8; 0 8 TABLE DATA public inbox_records owner' '9; 0 9 TABLE DATA public idempotency_keys owner' > "$BACKUP_LISTING"
printf 'reader-summary-publication-migration-state-v1\t0\t0\t0\t0\t0\t0\nexact-hex=5b5d\n' > "$BACKUP_MIGRATION_STATE"
run_backup_fixture() {
  local dump_mode=$1 backup_timestamp=$2 backup_url=$BACKUP_DATABASE_URL
  case $dump_mode in managed-admin) backup_url=$BACKUP_MANAGED_ADMIN_DATABASE_URL;; publication-dsn) backup_url=$BACKUP_PUBLICATION_ADMIN_DATABASE_URL;; app-dsn|managed-db-app-dsn) backup_url=$BACKUP_API_DATABASE_URL;; system-dsn) backup_url=$BACKUP_SYSTEM_DATABASE_URL;; invalid-secret) backup_url=not-a-postgres-url;; esac
  rm -f -- "$BACKUP_DSN_PATH" "$BACKUP_PUBLICATION_ADMIN_DSN_FILE"
  if [[ $dump_mode != missing-backup-secret ]]; then
    printf '%s\n' "$backup_url" > "$BACKUP_DSN_PATH"; chmod 0400 "$BACKUP_DSN_PATH"
  fi
  printf '%s\n' "$BACKUP_PUBLICATION_ADMIN_DATABASE_URL" > "$BACKUP_PUBLICATION_ADMIN_DSN_FILE"; chmod 0400 "$BACKUP_PUBLICATION_ADMIN_DSN_FILE"
  printf '%s\n' "$BACKUP_API_DATABASE_URL" > "$ROOT/secrets/db/managed-db-app.url"; printf '%s\n' "$BACKUP_SYSTEM_DATABASE_URL" > "$ROOT/secrets/db/system-database-url"
  # Fixture values expand only inside this isolated child shell.
  # shellcheck disable=SC2016
  BACKUP_DUMP_MODE=$dump_mode BACKUP_SHA=$BASE_SHA BACKUP_TIMESTAMP=$backup_timestamp BACKUP_SCHEMA=$BACKUP_SCHEMA \
  BACKUP_LISTING=$BACKUP_LISTING BACKUP_DOCKER_LOG=$BACKUP_DOCKER_LOG BACKUP_MIGRATION_STATE=$BACKUP_MIGRATION_STATE \
  BACKUP_DATABASE_URL="$backup_url" BACKUP_API_DATABASE_URL="$BACKUP_API_DATABASE_URL" SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" SOCIAL_MONITOR_DEPLOY_REPO="$REPO" SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
  ENTRYPOINT=$ENTRYPOINT bash -c '
    source "$ENTRYPOINT"
    helper_path=$SOCIAL_MONITOR_DEPLOY_REPO/ops/deploy/postgres-backup-deploy-lib.sh backup_secret=$SOCIAL_MONITOR_DEPLOY_ROOT/secrets/db/postgres-backup-admin-url
    stat() {
      local last_argument=${!#}
      if [[ $1 == -c && $2 == "%U|%a" && $last_argument == "$backup_secret" ]]; then
        [[ $BACKUP_DUMP_MODE != unsafe-backup-secret ]] || { printf "root|644\n"; return; }
        printf "root|400\n"
      elif [[ $1 == -c && $2 == "%u %a" ]]; then
        [[ $(readlink -f -- "$last_argument") == $(readlink -f -- "$helper_path") ]]
        local mode
        if ! mode=$(command stat -f "%Lp" "$last_argument" 2>/dev/null); then
          mode=$(command stat -c "%a" "$last_argument")
        fi
        printf "0 %s\n" "$mode"
      else
        command stat "$@"
      fi
    }
    sha=$BACKUP_SHA
    source "$SOCIAL_MONITOR_DEPLOY_REPO/ops/deploy/reader-summary-publication-deploy-lib.sh"
    declare -F create_pre_migration_database_backup >/dev/null; declare -f backup_database | grep -F "create_pre_migration_database_backup \"\$@\"" >/dev/null
    COMPOSE=(fake_compose)
    fake_compose() { [[ $* == "--profile app ps -q api" ]] && printf "%s\n" fixture-api; }
    date() { [[ $* == "-u +%Y%m%dT%H%M%SZ" ]] || return 91; printf "%s\n" "$BACKUP_TIMESTAMP"; }
    assert_backup_env() {
      [[ -n $1 && -f $1 && ! -L $1 && $(< "$1") == "DATABASE_URL=$BACKUP_DATABASE_URL" ]]
      printf "backup-env:%s\n" "$2" >> "$BACKUP_DOCKER_LOG"
    }
    docker() {
      local argument previous= env_file= migration_sql_file=
      printf "%s\n" "$*" >> "$BACKUP_DOCKER_LOG"
      for argument in "$@"; do
        [[ $previous != --env-file ]] || env_file=$argument
        [[ $argument != *:/run/social-monitor-db/migration-state.sql:ro ]] || migration_sql_file=${argument%:/run/social-monitor-db/migration-state.sql:ro}
        previous=$argument
      done
      if [[ $1 == inspect ]]; then
        printf "DATABASE_URL=%s\n" "$BACKUP_API_DATABASE_URL"
      elif [[ $* == *"pg_catalog.pg_roles AS backup_role"* ]]; then
        assert_backup_env "$env_file" capability
        case $BACKUP_DUMP_MODE in
          managed-admin) printf "social_monitor|doadmin|doadmin|t|f|f|f|f|t|t\n";;
          no-bypassrls) printf "social_monitor|social_monitor_backup_dumper|social_monitor_backup_dumper|t|f|f|f|f|f|t\n";;
          no-tls) printf "social_monitor|social_monitor_backup_dumper|social_monitor_backup_dumper|t|f|f|f|t|f|f\n";;
          *) printf "social_monitor|social_monitor_backup_dumper|social_monitor_backup_dumper|t|f|f|f|t|f|t\n";;
        esac
      elif [[ $* == *"SELECT current_database()"* ]]; then
        assert_backup_env "$env_file" database-name
        [[ $BACKUP_DUMP_MODE != wrong-database ]] || { printf "%s\n" postgres; return; }
        printf "%s\n" social_monitor
      elif [[ $* == *"information_schema.tables"* ]]; then
        return 94
      elif [[ $* == *"pg_catalog.pg_class"* ]]; then
        assert_backup_env "$env_file" schema
        quote=$(printf "\\047")
        for schema_query_fragment in "pg_catalog.pg_namespace" "c.relkind IN (${quote}r${quote}, ${quote}p${quote})" "c.relpersistence <> ${quote}t${quote}" "n.nspname = ${quote}public${quote}" "COLLATE \"C\""; do
          [[ $* == *"$schema_query_fragment"* ]]
        done
        command cat "$BACKUP_SCHEMA"
      elif [[ -n $migration_sql_file ]]; then
        assert_backup_env "$env_file" migration
        [[ -f $migration_sql_file && ! -L $migration_sql_file && -s $migration_sql_file ]]
        [[ $(command stat -c "%a" "$migration_sql_file") == 600 ]]
        grep -F "WHERE migration_name = :" "$migration_sql_file" >/dev/null
        grep -F "checksum = :" "$migration_sql_file" >/dev/null
        [[ $* == *"--file=/run/social-monitor-db/migration-state.sql"* ]]
        [[ $* == *"-v \"migration_id=\$1\""* ]]
        [[ $* == *"-v \"migration_checksum=\$2\""* ]]
        [[ $* != *"-c \"\$3\""* && $* != *"--command"* ]]
        [[ ${*: -2:1} == 20260716170000_reader_summary_fail_closed_publication ]]
        [[ ${*: -1} =~ ^[0-9a-f]{64}$ ]]
        printf "migration-state-sql-file:mode=600:variables-via-file\n" >> "$BACKUP_DOCKER_LOG"
        [[ $BACKUP_DUMP_MODE != signal-* ]] || { kill -s "${BACKUP_DUMP_MODE#signal-}" "$BASHPID"; return 93; }
        command cat "$BACKUP_MIGRATION_STATE"
      elif [[ $* == *"pg_dump --format=custom"* ]]; then
        assert_backup_env "$env_file" pg_dump
        [[ $BACKUP_DUMP_MODE != dump-failure ]] || return 72
        [[ $BACKUP_DUMP_MODE != empty ]] && printf "%s\n" fixture-archive
      elif [[ $* == *"pg_restore --file=/dev/null"* ]]; then
        [[ $BACKUP_DUMP_MODE != corrupt ]] || return 73
      elif [[ $* == *"pg_restore -l"* ]]; then
        command cat "$BACKUP_LISTING"
      else
        return 92
      fi
    }
    backup_database "$BACKUP_SHA"
  '
}

assert_backup_output() {
  local output=$1 expected_capability=$2 expected_backup=$3
  (($(wc -l <<< "$output") == 5))
  [[ $(grep -Fxc "$expected_capability" <<< "$output") == 1 ]]
  [[ $(grep -c '^database-backup-role-capability=' <<< "$output") == 1 ]]
  [[ $(grep -Fxc 'database-backup-schema-verified=9 publication-schema=absent publication-migration=not-applied' <<< "$output") == 1 ]]
  [[ $(grep -Fxc 'database-backup-relations-verified=9 publication-schema=absent publication-migration=not-applied' <<< "$output") == 1 ]]
  [[ $(grep -Ec '^database-backups-pruned=[0-9]+ retained=[0-9]+$' <<< "$output") == 1 ]]
  [[ $(grep -Fxc "database-backup=$expected_backup" <<< "$output") == 1 ]]
  [[ $(grep -c '^database-backup=' <<< "$output") == 1 ]]
}
: > "$BACKUP_DOCKER_LOG"
valid_backup_output=$(run_backup_fixture valid 20260719T120000Z)
BACKUP_PREFIX=${BASE_SHA:0:12}
VALID_BACKUP=$ROOT/backups/pre-autodeploy-${BACKUP_PREFIX}-20260719T120000Z.dump
[[ -s $VALID_BACKUP ]]
[[ $(stat -c '%a' "$VALID_BACKUP") == 600 ]]
assert_backup_output "$valid_backup_output" 'database-backup-role-capability=preferred-bypassrls role=social_monitor_backup_dumper' "$VALID_BACKUP"
for backup_log_snippet in 'pg_restore --file=/dev/null --no-owner --no-privileges' '20260716170000_reader_summary_fail_closed_publication'; do grep -F "$backup_log_snippet" "$BACKUP_DOCKER_LOG" >/dev/null; done
for backup_env_use in capability database-name pg_dump; do grep -Fx "backup-env:$backup_env_use" "$BACKUP_DOCKER_LOG" >/dev/null; done
for backup_env_marker in 'backup-env:schema' 'backup-env:migration' 'migration-state-sql-file:mode=600:variables-via-file'; do [[ $(grep -cFx "$backup_env_marker" "$BACKUP_DOCKER_LOG") == 2 ]]; done
for forbidden_backup_log in '-c "$3"' '--command'; do
  if grep -F -- "$forbidden_backup_log" "$BACKUP_DOCKER_LOG" >/dev/null; then exit 1; fi
done
mapfile -t migration_snapshot_lines < <(grep -nF 'migration-state-sql-file:mode=600:variables-via-file' "$BACKUP_DOCKER_LOG" | cut -d: -f1)
((${#migration_snapshot_lines[@]} == 2))
dump_capture_line=$(grep -nF 'pg_dump --format=custom' "$BACKUP_DOCKER_LOG" | cut -d: -f1)
((migration_snapshot_lines[0] < dump_capture_line && dump_capture_line < migration_snapshot_lines[1]))
grep -F 'postgres-backup-admin-url' "$BACKUP_LIBRARY" >/dev/null
for forbidden_backup_snippet in 'reader-summary-publication-admin-url' 'managed-db-app.url' 'SYSTEM_DATABASE_URL'; do
  if grep -F "$forbidden_backup_snippet" "$BACKUP_LIBRARY" >/dev/null; then exit 1; fi
done
if grep -E -- '--enable-row-security|--exclude-(table|schema)|--schema-only|--data-only' "$BACKUP_LIBRARY" >/dev/null; then exit 1; fi
: > "$BACKUP_DOCKER_LOG"; managed_admin_output=$(run_backup_fixture managed-admin 20260719T120010Z)
MANAGED_ADMIN_BACKUP=$ROOT/backups/pre-autodeploy-${BACKUP_PREFIX}-20260719T120010Z.dump
[[ -s $MANAGED_ADMIN_BACKUP ]]
assert_backup_output "$managed_admin_output" 'database-backup-role-capability=emergency-managed-admin-superuser role=doadmin' "$MANAGED_ADMIN_BACKUP"
: > "$BACKUP_DOCKER_LOG"; missing_backup_output=$(run_backup_fixture missing-backup-secret 20260719T120008Z)
MISSING_BACKUP=$ROOT/backups/pre-autodeploy-${BACKUP_PREFIX}-20260719T120008Z.dump
[[ $missing_backup_output == "database-backup=skipped-user-authorized-missing-secret-20260727 sha=$BASE_SHA" ]]
[[ ! -e $BACKUP_DSN_PATH && ! -L $BACKUP_DSN_PATH ]]
[[ ! -e $MISSING_BACKUP && ! -L $MISSING_BACKUP && ! -e $MISSING_BACKUP.partial && ! -L $MISSING_BACKUP.partial ]]
[[ ! -s $BACKUP_DOCKER_LOG ]]
if compgen -G "$STATE/database-backup.*" >/dev/null; then echo 'missing backup secret retained a temporary or credential-bearing backup file' >&2; exit 1; fi
assert_backup_failure_clean() {
  local mode=$1 timestamp=$2
  local expected=$ROOT/backups/pre-autodeploy-${BACKUP_PREFIX}-${timestamp}.dump
  local status
  : > "$BACKUP_DOCKER_LOG"
  set +e; run_backup_fixture "$mode" "$timestamp" >/dev/null 2>&1; status=$?; set -e
  ((status != 0))
  if [[ $mode == invalid-secret ]]; then
    [[ -f $BACKUP_DSN_PATH && $(< "$BACKUP_DSN_PATH") == not-a-postgres-url ]]
  fi
  [[ ! -e $expected && ! -L $expected ]]
  [[ ! -e $expected.partial && ! -L $expected.partial ]]
  if compgen -G "$STATE/database-backup.*" >/dev/null; then echo "$mode retained a temporary or credential-bearing backup file" >&2; exit 1; fi
  case $mode in invalid-secret|unsafe-backup-secret|app-dsn|managed-db-app-dsn|system-dsn|publication-dsn|no-bypassrls|no-tls) ! grep -F 'pg_dump --format=custom' "$BACKUP_DOCKER_LOG" >/dev/null;; esac
}

for failure_case in corrupt:20260719T120001Z empty:20260719T120002Z dump-failure:20260719T120003Z wrong-database:20260719T120004Z signal-HUP:20260719T120005Z signal-INT:20260719T120006Z signal-TERM:20260719T120007Z invalid-secret:20260719T120008Z unsafe-backup-secret:20260719T120009Z app-dsn:20260719T120011Z managed-db-app-dsn:20260719T120012Z system-dsn:20260719T120013Z publication-dsn:20260719T120014Z no-bypassrls:20260719T120015Z no-tls:20260719T120016Z; do
  assert_backup_failure_clean "${failure_case%:*}" "${failure_case#*:}"
done
grep -F 'ops/deploy/host/refresh-codex-auth.sh' "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
grep -F 'install -m 0700 -o root -g root "$auth_refresh_source" "$auth_refresh_destination.next"' \
  "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
grep -F 'mv -f "$auth_refresh_destination.next" "$auth_refresh_destination"' \
  "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
grep -F 'install -m 0755 -o root -g root "$source" "$destination.next"' \
  "$ENTRYPOINT" >/dev/null
# shellcheck disable=SC2016
auth_sync_line=$(grep -nF 'install -m 0700 -o root -g root "$auth_refresh_source"' \
  "$ENTRYPOINT" | cut -d: -f1)
# shellcheck disable=SC2016
entrypoint_sync_line=$(grep -nF 'install -m 0755 -o root -g root "$source"' \
  "$ENTRYPOINT" | tail -1 | cut -d: -f1)
((auth_sync_line < entrypoint_sync_line))
# shellcheck disable=SC2016
control_library=$SCRIPT_DIR/deploy-control-lib.sh
control_sync_line=$(grep -nF 'sync_control_script "$sha"' \
  "$control_library" | tail -1 | cut -d: -f1)
bootstrap_commit_line=$(grep -nF 'commit_postgres_pool_bootstrap "$sha"' \
  "$control_library" | tail -1 | cut -d: -f1)
# shellcheck disable=SC2016
control_marker_line=$(grep -nF 'printf '\''%s\n'\'' "$sha" > "$STATE/control.sha.next"' \
  "$control_library" | cut -d: -f1)
((control_sync_line < bootstrap_commit_line))
((bootstrap_commit_line < control_marker_line))
target_reconcile_line=$(grep -nF '"$current" "$POSTGRES_POOL_ATOMIC_REPAIR_BACKEND_SHA"' "$control_library" | cut -d: -f1)
rescue_reconcile_line=$(grep -nF 'reconcile_completed_backend_image_rescues ||' "$control_library" | cut -d: -f1)
runtime_transaction_line=$(grep -nF 'deploy_release_runtime_transaction "$sha" "$backend" "$runtime_control"' "$control_library" | tail -1 | cut -d: -f1)
((target_reconcile_line < rescue_reconcile_line && rescue_reconcile_line < runtime_transaction_line))
grep -F 'deploy_release_runtime_transaction "$sha" "$backend" "$runtime_control"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" >/dev/null
# A normal replay still enters Compose validation; only the workflow run whose
# client durably verified a repair may omit the ordinary deploy invocation.
ORDINARY_RENDER_LOG=$FIXTURE/ordinary-render.log
ENTRYPOINT=$ENTRYPOINT ORDINARY_RENDER_LOG=$ORDINARY_RENDER_LOG \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 SOCIAL_MONITOR_DEPLOY_ROOT=$ROOT \
  SOCIAL_MONITOR_DEPLOY_REPO=$REPO SOCIAL_MONITOR_DEPLOY_CONTROL=$CONTROL \
  SOCIAL_MONITOR_DEPLOY_STATE=$STATE SOCIAL_MONITOR_DEPLOY_STAGING=$STAGING \
  bash -c 'source "$ENTRYPOINT"; verify_compose_scope() {
    printf "compose-rendered\n" > "$ORDINARY_RENDER_LOG";
  }; deploy_release_runtime_transaction "$1" false false' _ "$TARGET_SHA"
grep -Fx 'compose-rendered' "$ORDINARY_RENDER_LOG" >/dev/null
grep -F 'activate_postgres_runtime_control "$sha" "$compatible_backend_sha"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'snapshot_postgres_runtime_control "$sha"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'restore_postgres_runtime_control "$runtime_control_backup"' \
  "$SCRIPT_DIR/backend-image-rescue-lib.sh" >/dev/null
grep -F 'rollback_backend_and_runtime_control_forward_only_safe' "$ENTRYPOINT" >/dev/null
grep -F 'rollback_backend_images "$state_file" || backend_status=$?' \
  "$SCRIPT_DIR/backend-image-rescue-lib.sh" >/dev/null
grep -F 'restore_postgres_runtime_control "$runtime_control_backup" || runtime_status=$?' \
  "$SCRIPT_DIR/backend-image-rescue-lib.sh" >/dev/null
grep -F 'backend_image_rescue_prepare "$sha" "$previous"' \
  "$ENTRYPOINT" >/dev/null
rescue_prepare_line=$(grep -nF \
  'backend_image_rescue_prepare "$sha" "$previous"' "$ENTRYPOINT" | cut -d: -f1)
backend_build_line=$(grep -nF \
  '"${COMPOSE[@]}" --profile app --profile daily build' \
  "$ENTRYPOINT" | cut -d: -f1)
((rescue_prepare_line < backend_build_line))

# A rescue-pin failure exits deploy_backend before preflight, backup, or build.
BUILD_GUARD_LOG=$FIXTURE/backend-build-guard.log
set +e
build_guard_error=$(
  ENTRYPOINT="$ENTRYPOINT" BUILD_GUARD_LOG="$BUILD_GUARD_LOG" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    bash -c '
      source "$ENTRYPOINT"
      backend_services() { printf "%s\n" api; }
      marker_value() { printf "%s\n" 0123456789abcdef0123456789abcdef01234567; }
      backend_image_rescue_prepare() { return 77; }
      reader_summary_publication_migrator_preflight() {
        printf "preflight\n" >> "$BUILD_GUARD_LOG"
      }
      backup_database() { printf "backup\n" >> "$BUILD_GUARD_LOG"; }
      fake_compose() { printf "compose:%s\n" "$*" >> "$BUILD_GUARD_LOG"; }
      COMPOSE=(fake_compose)
      deploy_backend fedcba9876543210fedcba9876543210fedcba98
    ' 2>&1
)
build_guard_status=$?
set -e
((build_guard_status != 0))
grep -F 'required rollback images could not be pinned before build' \
  <<< "$build_guard_error" >/dev/null
[[ ! -s $BUILD_GUARD_LOG ]]

# The replacement phase is a durable inner/outer transaction seam. Failures in
# preflight, backup, build, and migration all reach outer rollback as prepared;
# no healthy service is stopped or recreated in any of those paths.
# Scrambled candidates prove canonical one-service Compose build order. The
# build failure proves later candidates are not attempted.
assert_pre_replacement_failure() {
  local stage=$1
  local expected=$2
  local log=$FIXTURE/pre-replacement-$stage.log
  local output status actual
  : > "$log"
  set +e
  output=$(
    ENTRYPOINT="$ENTRYPOINT" FAILURE_STAGE="$stage" FAILURE_LOG="$log" \
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
    SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
    SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
    SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
    SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
    SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
      bash -c '
        set -euo pipefail
        source "$ENTRYPOINT"
        backend_services() {
          printf "%s\n" event-relay api daily-runner migrate delivery-service \
            intelligence-worker agent-runtime ingestion-worker
        }
        marker_value() {
          printf "%s\n" 0123456789abcdef0123456789abcdef01234567
        }
        daily_runner_image_bootstrap_before_rescue() { :; }
        backend_image_rescue_prepare() {
          printf "prepared\n" > "$(backend_image_rescue_phase_file "$2")"
          printf "prepare\n" >> "$FAILURE_LOG"
        }
        backend_image_rescue_mark_replacement_started() {
          printf "replacement-started\n" > \
            "$(backend_image_rescue_phase_file "$1")"
          printf "mark-replacement\n" >> "$FAILURE_LOG"
        }
        reader_summary_publication_migrator_preflight() {
          printf "preflight\n" >> "$FAILURE_LOG"
          [[ $FAILURE_STAGE != preflight ]]
        }
        verify_migration_compatibility() {
          printf "compatibility\n" >> "$FAILURE_LOG"
        }
        backup_database() {
          printf "backup\n" >> "$FAILURE_LOG"
          [[ $FAILURE_STAGE != backup ]]
        }
        deploy_reader_summary_publication_migrations() {
          printf "migration\n" >> "$FAILURE_LOG"
          [[ $FAILURE_STAGE != migration ]]
        }
        fake_compose() {
          if [[ " $* " == *" build "* ]]; then
            local built_service=${!#}
            if [[ $built_service == daily-runner ]]; then
              [[ $# == 4 && $* == "--profile daily build daily-runner" ]]
            else
              [[ $# == 6 ]]
              [[ $* == \
                "--profile app --profile daily build $built_service" ]]
            fi
            printf "build:%s\n" "$built_service" >> "$FAILURE_LOG"
            if [[ $FAILURE_STAGE == build && \
                  $built_service == agent-runtime ]]; then
              return 79
            fi
          else
            printf "compose-up\n" >> "$FAILURE_LOG"
            return 90
          fi
        }
        COMPOSE=(fake_compose)
        stop_and_remove_database_services() {
          printf "stop\n" >> "$FAILURE_LOG"
          return 91
        }
        snapshot_postgres_runtime_control() {
          printf "%s/runtime-backup\n" "$STATE"
        }
        activate_postgres_runtime_control() { :; }
        verify_compose_scope() { :; }
        rollback_backend_and_runtime_control() {
          local phase_file
          phase_file=$(backend_image_rescue_phase_file "$2")
          printf "rollback:%s\n" "$(< "$phase_file")" >> "$FAILURE_LOG"
        }
        deploy_release_runtime_transaction \
          fedcba9876543210fedcba9876543210fedcba98 true false
      ' 2>&1
  )
  status=$?
  set -e
  ((status != 0))
  actual=$(< "$log")
  if [[ $actual != "$expected" ]]; then
    printf 'pre-replacement-failure-mismatch:%s:actual=%q:output=%q\n' \
      "$stage" "$actual" "$output" >&2
    return 1
  fi
}

assert_pre_replacement_failure preflight \
  $'prepare\npreflight\nrollback:prepared'
assert_pre_replacement_failure backup \
  $'prepare\npreflight\ncompatibility\nbackup\nrollback:prepared'
assert_pre_replacement_failure build \
  $'prepare\npreflight\ncompatibility\nbackup\nbuild:migrate\nbuild:api\nbuild:agent-runtime\nrollback:prepared'
assert_pre_replacement_failure migration \
  $'prepare\npreflight\ncompatibility\nbackup\nbuild:migrate\nbuild:api\nbuild:agent-runtime\nbuild:ingestion-worker\nbuild:intelligence-worker\nbuild:delivery-service\nbuild:event-relay\nbuild:daily-runner\nmigration\nrollback:prepared'

# Every failure after the durable replacement transition is aggregated by the
# outer transaction. Legacy inner rollback calls would add `inner-rollback`
# here and cause a second backend rollback from the outer transaction.
assert_post_replacement_failure() {
  local stage=$1
  local log=$FIXTURE/post-replacement-$stage.log
  local output status
  : > "$log"
  set +e
  output=$(
    ENTRYPOINT="$ENTRYPOINT" FAILURE_STAGE="$stage" FAILURE_LOG="$log" \
    SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
    SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
    SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
    SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
    SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
    SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
      bash -c '
        set -euo pipefail
        source "$ENTRYPOINT"
        backend_services() { printf "%s\n" api; }
        marker_value() {
          printf "%s\n" 0123456789abcdef0123456789abcdef01234567
        }
        backend_image_rescue_prepare() {
          printf "prepared\n" > "$(backend_image_rescue_phase_file "$2")"
        }
        backend_image_rescue_mark_replacement_started() {
          printf "replacement-started\n" > \
            "$(backend_image_rescue_phase_file "$1")"
          printf "mark-replacement\n" >> "$FAILURE_LOG"
        }
        reader_summary_publication_migrator_preflight() { :; }
        verify_migration_compatibility() { :; }
        backup_database() { :; }
        deploy_reader_summary_publication_migrations() { :; }
        capture_effective_postgres_environment() { : > "$1"; }
        verify_live_postgres_admission() { :; }
        probe_postgres_maximum_envelope() { :; }
        fake_compose() {
          if [[ " $* " == *" build "* ]]; then
            return 0
          fi
          printf "recreate\n" >> "$FAILURE_LOG"
          [[ $FAILURE_STAGE != recreate ]] || {
            printf "fail-stage:recreate\n" >> "$FAILURE_LOG"
            return 72
          }
        }
        COMPOSE=(fake_compose)
        stop_and_remove_database_services() {
          printf "stop\n" >> "$FAILURE_LOG"
          [[ $FAILURE_STAGE != stop ]] || {
            printf "fail-stage:stop\n" >> "$FAILURE_LOG"
            return 71
          }
        }
        verify_backend_with_retry() {
          printf "verify\n" >> "$FAILURE_LOG"
          [[ $FAILURE_STAGE != health ]] || {
            printf "fail-stage:health\n" >> "$FAILURE_LOG"
            return 73
          }
        }
        refresh_frontend_api_proxy() {
          printf "proxy\n" >> "$FAILURE_LOG"
          [[ $FAILURE_STAGE != proxy ]] || {
            printf "fail-stage:proxy\n" >> "$FAILURE_LOG"
            return 74
          }
        }
        soak_backend_release() {
          printf "soak\n" >> "$FAILURE_LOG"
          [[ $FAILURE_STAGE != soak ]] || {
            printf "fail-stage:soak\n" >> "$FAILURE_LOG"
            return 75
          }
        }
        snapshot_postgres_runtime_control() {
          printf "%s/runtime-backup\n" "$STATE"
        }
        activate_postgres_runtime_control() { :; }
        verify_compose_scope() { :; }
        rollback_backend_images() {
          printf "inner-rollback\n" >> "$FAILURE_LOG"
        }
        rollback_backend_and_runtime_control() {
          local phase_file
          phase_file=$(backend_image_rescue_phase_file "$2")
          printf "outer-rollback:%s\n" "$(< "$phase_file")" \
            >> "$FAILURE_LOG"
        }
        deploy_release_runtime_transaction \
          fedcba9876543210fedcba9876543210fedcba98 true false
      ' 2>&1
  )
  status=$?
  set -e
  ((status != 0))
  grep -Fx "fail-stage:$stage" "$log" >/dev/null
  [[ $(grep -c '^mark-replacement$' "$log") == 1 ]]
  [[ $(grep -c '^outer-rollback:replacement-started$' "$log") == 1 ]]
  if grep -F 'inner-rollback' "$log" >/dev/null; then
    printf 'post-replacement failure ran inner and outer rollback: %s: %q\n' \
      "$stage" "$output" >&2
    return 1
  fi
}

assert_post_replacement_failure stop
assert_post_replacement_failure recreate
assert_post_replacement_failure health
assert_post_replacement_failure proxy
assert_post_replacement_failure soak

# A process retry cannot snapshot over the runtime-control evidence associated
# with an interrupted replacement. It fails closed before activation or a new
# rollback transaction begins.
INTERRUPTED_RETRY_LOG=$FIXTURE/interrupted-retry.log
: > "$INTERRUPTED_RETRY_LOG"
set +e
interrupted_retry_output=$(
  ENTRYPOINT="$ENTRYPOINT" FAILURE_LOG="$INTERRUPTED_RETRY_LOG" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    bash -c '
      set -euo pipefail
      source "$ENTRYPOINT"
      target=fedcba9876543210fedcba9876543210fedcba98
      : > "$(backend_image_rescue_state_file "$target")"
      backend_image_rescue_read_phase() { printf "replacement-started\n"; }
      snapshot_postgres_runtime_control() {
        printf "snapshot\n" >> "$FAILURE_LOG"
      }
      activate_postgres_runtime_control() {
        printf "activate\n" >> "$FAILURE_LOG"
      }
      rollback_backend_and_runtime_control() {
        printf "rollback\n" >> "$FAILURE_LOG"
      }
      deploy_release_runtime_transaction "$target" true false
    ' 2>&1
)
interrupted_retry_status=$?
set -e
((interrupted_retry_status != 0))
grep -F 'unfinished backend rollback requires operator recovery before retry' \
  <<< "$interrupted_retry_output" >/dev/null
[[ ! -s $INTERRUPTED_RETRY_LOG ]]
rm -f "$STATE/backend-image-rescue-fedcba9876543210fedcba9876543210fedcba98.tsv"
grep -F 'verify_live_postgres_admission "$postgres_env"' "$ENTRYPOINT" >/dev/null; grep -F 'reader-summary-weekly-run|reader-summary-daily-terminal-set-receipt-v1|' "$ENTRYPOINT" >/dev/null
grep -F 'probe_postgres_maximum_envelope "$postgres_env"' "$ENTRYPOINT" >/dev/null
grep -F 'deploy_reader_summary_publication_migrations' "$ENTRYPOINT" >/dev/null
grep -F 'reader_summary_publication_migrator_preflight' "$ENTRYPOINT" >/dev/null
grep -F 'reader-summary-publication-admin-url' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
# The admin URL must never be a Docker argument or the production runtime
# environment. psql receives only an escaped pgpass record over Docker stdin.
if grep -E -- '--(env|set)[ =]DATABASE_URL' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null; then
  echo 'publication admin URL is exposed through a container argument' >&2
  exit 1
fi
if grep -F 'PGDATABASE=' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null; then
  echo 'publication admin URL is exposed through PGDATABASE' >&2
  exit 1
fi
grep -F 'reader_summary_publication_admin_pgpass "$secret" |' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F 'PGPASSFILE=$pgpass_file' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F 'chmod 0600 "$pgpass_file"' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F 'cleanup_postgres_client_files() {' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F 'trap cleanup_postgres_client_files EXIT' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F 'rm -f -- "$pgpass_file"' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F 'chmod 0600 "$query_file"' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F 'rm -f -- "$query_file"' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F 'social_monitor_app' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F 'social_monitor_publication_migrator' \
  "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" >/dev/null
grep -F "'externalConnectionOccupancy'" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F "'stoppedRuntimeConnectionOccupancy'" \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'capture_backend_soak_baseline' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'verify_backend_soak_logs' "$ENTRYPOINT" >/dev/null
grep -F 'verify_ingestion_queue_recovery' "$ENTRYPOINT" >/dev/null
SOAK_TIME_STATE=$FIXTURE/soak-time
printf '0\n' > "$SOAK_TIME_STATE"
heartbeat_output=$(
  ENTRYPOINT="$ENTRYPOINT" \
  SOAK_TIME_STATE="$SOAK_TIME_STATE" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
    bash -c '
      source "$ENTRYPOINT"
      ((POSTGRES_ROLLOUT_SOAK_SECONDS == 300))
      ((POSTGRES_ROLLOUT_SOAK_HEARTBEAT_SECONDS == 30))
      POSTGRES_ROLLOUT_SOAK_SECONDS=65
      POSTGRES_ROLLOUT_SOAK_HEARTBEAT_SECONDS=30
      capture_backend_soak_baseline() { : > "$1"; }
      verify_backend() { return 0; }
      verify_backend_proxy_readiness() { return 0; }
      verify_concurrent_backend_readiness() { return 0; }
      verify_backend_soak_state() { return 0; }
      verify_backend_soak_logs() { return 0; }
      verify_ingestion_queue_recovery() { return 0; }
      sleep() { :; }
      date() {
        local now
        read -r now < "$SOAK_TIME_STATE"
        printf "%s\n" "$((now + 5))" > "$SOAK_TIME_STATE"
        printf "%s\n" "$now"
      }
      soak_backend_release api
    '
)
grep -Fx 'backend-soak-heartbeat elapsed_seconds=0 target_seconds=65' \
  <<< "$heartbeat_output" >/dev/null
grep -Fx 'backend-soak-heartbeat elapsed_seconds=30 remaining_seconds=35' \
  <<< "$heartbeat_output" >/dev/null
grep -Fx 'backend-soak-heartbeat elapsed_seconds=60 remaining_seconds=5' \
  <<< "$heartbeat_output" >/dev/null
[[ $(grep -c '^backend-soak-heartbeat ' <<< "$heartbeat_output") == 3 ]]
grep -F 'verify-postgres-runtime-topology.py' "$ENTRYPOINT" >/dev/null
grep -F 'install -m 0644 "$source/$unit" "$staged_release/$unit"' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'social-monitor-prod.service' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'social-monitor-daily.service' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'social-monitor-github-premidnight-capture-v1.service' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'social-monitor-github-premidnight-capture-v1.timer' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'DropInPaths' "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'social-monitor-github-premidnight-capture-v1.timer' \
  "$ENTRYPOINT" >/dev/null
grep -F 'dailyTimerOwner' \
  "$SCRIPT_DIR/postgres-pool-release-contract.json" >/dev/null
bash "$SCRIPT_DIR/production-runtime/daily-runtime-contract.test.sh"
deploy_library_source_line=$(grep -nF 'source "$REPO/ops/deploy/deploy-control-lib.sh"' \
  "$ENTRYPOINT" | cut -d: -f1)
publication_library_source_line=$(grep -nF 'source_deploy_library reader-summary-publication-deploy-lib.sh' "$ENTRYPOINT" | cut -d: -f1)
publication_loader_call_line=$(grep -nF '    load_reader_summary_publication_deploy_library' "$ENTRYPOINT" | cut -d: -f1)
bridge_initialization_line=$(grep -nF 'initialize_deploy_control_bridge' \
  "$ENTRYPOINT" | tail -1 | cut -d: -f1)
first_contract_call_line=$(grep -nF '  ensure_system_database_url_deploy_contract' "$ENTRYPOINT" | head -1 | cut -d: -f1)
((deploy_library_source_line < bridge_initialization_line && publication_library_source_line < bridge_initialization_line))
((publication_loader_call_line < first_contract_call_line))
grep -F 'advance_integration "$sha"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" >/dev/null

# A bridge-current entrypoint classifies a later pre-midnight asset-only release
# as control-only runtime activation and uses the already-sourced bridge library.
BRIDGE_SHA=$CONTROL_TARGET_SHA
for component in frontend backend control; do
  printf '%s\n' "$BRIDGE_SHA" > "$STATE/$component.sha"
done
printf 'install-disabled-v1\n' > \
  "$REPO/ops/deploy/production-runtime/github-premidnight-capture-v1.activation"
git -C "$REPO" add \
  ops/deploy/production-runtime/github-premidnight-capture-v1.activation
git -C "$REPO" commit -qm 'test: final pre-midnight runtime asset'
git -C "$REPO" push -q origin HEAD:main
RUNTIME_CONTROL_TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" checkout -q "$BRIDGE_SHA"

ACTIVATION_LOG=$FIXTURE/runtime-control-activation.log
activation_output=$(
  ENTRYPOINT="$ENTRYPOINT" ACTIVATION_LOG="$ACTIVATION_LOG" \
  RUNTIME_CONTROL_TARGET_SHA="$RUNTIME_CONTROL_TARGET_SHA" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    bash -c '
      source "$ENTRYPOINT"
      sync_control_script() { :; }
      commit_postgres_pool_bootstrap() { :; }
      deploy_release_runtime_transaction() {
        verify_deploy_control_bridge_compatibility
        printf "%s %s %s\n" "$1" "$2" "$3" > "$ACTIVATION_LOG"
      }
      deploy_release "$RUNTIME_CONTROL_TARGET_SHA"
    '
)
grep -F "deployed=$RUNTIME_CONTROL_TARGET_SHA" <<< "$activation_output" >/dev/null
[[ $(cat "$ACTIVATION_LOG") == \
   "$RUNTIME_CONTROL_TARGET_SHA false true" ]]
[[ $(cat "$STATE/control.sha") == "$RUNTIME_CONTROL_TARGET_SHA" ]]

# The next target is intentionally invalid: it combines another pre-midnight
# runtime asset with a controller-library change. The bridge-current process
# must fail before any runtime-control snapshot or activation.
printf '# incompatible controller mutation\n' >> \
  "$REPO/ops/deploy/deploy-control-lib.sh"
printf '# incompatible pre-midnight mutation\n' >> \
  "$REPO/ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.service"
git -C "$REPO" add ops/deploy/deploy-control-lib.sh \
  ops/deploy/production-runtime/social-monitor-github-premidnight-capture-v1.service
git -C "$REPO" commit -qm 'test: reject combined control activation'
git -C "$REPO" push -q origin HEAD:main
INCOMPATIBLE_TARGET_SHA=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" checkout -q "$RUNTIME_CONTROL_TARGET_SHA"
for component in frontend backend control; do
  printf '%s\n' "$RUNTIME_CONTROL_TARGET_SHA" > "$STATE/$component.sha"
done
rm -f "$ACTIVATION_LOG"
set +e
incompatible_error=$(
  ENTRYPOINT="$ENTRYPOINT" ACTIVATION_LOG="$ACTIVATION_LOG" \
  INCOMPATIBLE_TARGET_SHA="$INCOMPATIBLE_TARGET_SHA" \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
    bash -c '
      source "$ENTRYPOINT"
      sync_control_script() { :; }
      commit_postgres_pool_bootstrap() { :; }
      snapshot_postgres_runtime_control() {
        : > "$ACTIVATION_LOG"
        return 99
      }
      deploy_release "$INCOMPATIBLE_TARGET_SHA"
    ' 2>&1
)
incompatible_status=$?
set -e
((incompatible_status != 0))
grep -F 'deploy the bridge release first' <<< "$incompatible_error" >/dev/null
[[ ! -e $ACTIVATION_LOG ]]
[[ $(git -C "$REPO" rev-parse HEAD) == "$RUNTIME_CONTROL_TARGET_SHA" ]]

RELEASE_FIXTURE=$FIXTURE/frontend-release
install -d "$RELEASE_FIXTURE/public" "$RELEASE_FIXTURE/admin"
printf '<html>public</html>\n' > "$RELEASE_FIXTURE/public/index.html"
printf '<html>admin</html>\n' > "$RELEASE_FIXTURE/admin/index.html"
printf 'https://social-monitor.app\n' > "$RELEASE_FIXTURE/public/main.dart.js"
printf 'https://admin.social-monitor.app\n' > "$RELEASE_FIXTURE/admin/main.dart.js"
printf 'self.registration.unregister()\n' > "$RELEASE_FIXTURE/public/flutter_service_worker.js"
printf 'self.registration.unregister()\n' > "$RELEASE_FIXTURE/admin/flutter_service_worker.js"
printf '%s\n' "$TARGET_SHA" > "$RELEASE_FIXTURE/public/release-sha.txt"
printf '%s\n' "$TARGET_SHA" > "$RELEASE_FIXTURE/admin/release-sha.txt"
COPYFILE_DISABLE=1 tar -C "$RELEASE_FIXTURE" -czf "$FIXTURE/frontend.tgz" public admin
run_entrypoint upload "$TARGET_SHA" < "$FIXTURE/frontend.tgz" >/dev/null
[[ $(cat "$STAGING/$TARGET_SHA/frontend/READY") == "$TARGET_SHA" ]]

BAD_FIXTURE=$FIXTURE/bad-release
install -d "$BAD_FIXTURE/public" "$BAD_FIXTURE/admin"
ln -s /etc/passwd "$BAD_FIXTURE/public/escape"
COPYFILE_DISABLE=1 tar -C "$BAD_FIXTURE" -czf "$FIXTURE/bad-frontend.tgz" public admin
rm -rf "$STAGING/$TARGET_SHA/frontend"
if run_entrypoint upload "$TARGET_SHA" < "$FIXTURE/bad-frontend.tgz" >/dev/null 2>&1; then
  echo 'unsafe frontend archive was accepted' >&2
  exit 1
fi

echo 'Production deploy contract tests passed'
if command -v shellcheck >/dev/null; then
  shellcheck -x "$SCRIPT_DIR"/daily-runner-image-bootstrap-*.sh
fi
bash "$SCRIPT_DIR/daily-runner-image-bootstrap-deploy.test.sh"
bash "$SCRIPT_DIR/daily-runner-image-bootstrap-lib.test.sh"
bash "$SCRIPT_DIR/backend-runtime-health-lib.test.sh"
bash "$SCRIPT_DIR/otel-collector-deploy-lifecycle.test.sh"
for test_file in backend-image-rescue-lib.test.sh backend-image-rescue-migrate-fallback.test.sh; do bash "$SCRIPT_DIR/$test_file"; done
bash "$SCRIPT_DIR/postgres-runtime-deploy-lib.test.sh"
TMPDIR=/tmp bash "$SCRIPT_DIR/github-premidnight-capture-runtime.test.sh"
bash "$SCRIPT_DIR/verify-postgres-runtime-topology.test.sh"
bash "$SCRIPT_DIR/reader-summary-publication-migrator-validation.test.sh"
bash "$SCRIPT_DIR/rabbitmq-quorum-deploy-bridge-transition.test.sh"
bash "$SCRIPT_DIR/daily-canonical-recovery-production.test.sh"
uid_fixture_status=0
if ((EUID == 0)); then
  uid_fixture_probe=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-uidmap.XXXXXX")
  chown 65534:65534 "$uid_fixture_probe" 2>/dev/null || uid_fixture_status=$?
  rm -rf "$uid_fixture_probe"
fi
if ((uid_fixture_status == 0)); then
  bash "$SCRIPT_DIR/refresh-codex-auth.test.sh"
  bash "$SCRIPT_DIR/prune-pre-autodeploy-backups.test.sh"
else
  printf 'Skipping UID-mapped deploy fixtures: chown 65534 unsupported\n'
fi
bash "$SCRIPT_DIR/verify-postgres-backup-coverage.test.sh"
