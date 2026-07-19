#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENTRYPOINT=$SCRIPT_DIR/social-monitor-production-deploy.sh
BACKUP_LIBRARY=$SCRIPT_DIR/postgres-backup-deploy-lib.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-deploy-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

REPO=$FIXTURE/repo
ORIGIN=$FIXTURE/origin.git
ROOT=$FIXTURE/root
CONTROL=$ROOT/control
STATE=$CONTROL/deploy-state
STAGING=$ROOT/runtime/deploy-staging

git init --bare -q "$ORIGIN"
git init -q -b main "$REPO"
git -C "$REPO" config user.name 'Deploy Contract Test'
git -C "$REPO" config user.email deploy-contract@example.invalid
git -C "$REPO" remote add origin "$ORIGIN"
install -d "$REPO/apps/frontend" "$REPO/apps/api-gateway" \
  "$REPO/apps/x-collector" "$REPO/ops/deploy" "$REPO/ops/recovery" \
  "$REPO/prisma/migrations/20260716170000_reader_summary_fail_closed_publication" \
  "$STATE" "$STAGING"
cp "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/deploy-control-lib.sh" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh" \
  "$SCRIPT_DIR/reader-summary-publication-pre-migration.sql" \
  "$SCRIPT_DIR/reader-summary-publication-post-migration.sql" \
  "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/verify-postgres-backup-coverage.sh" \
  "$SCRIPT_DIR/prune-pre-autodeploy-backups.sh" \
  "$BACKUP_LIBRARY" \
  "$REPO/ops/deploy/"
cp "$ENTRYPOINT" "$REPO/ops/deploy/"
cp "$SCRIPT_DIR/../../prisma/migrations/20260716170000_reader_summary_fail_closed_publication/migration.sql" \
  "$REPO/prisma/migrations/20260716170000_reader_summary_fail_closed_publication/"
cp "$SCRIPT_DIR/verify-postgres-runtime-topology.py" "$REPO/ops/deploy/"
cp -R "$SCRIPT_DIR/production-runtime" "$REPO/ops/deploy/"
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

grep -F "if printf '%s\\n' \"\${persistent[@]}\" | grep -qx api && ! refresh_frontend_api_proxy; then" \
  "$ENTRYPOINT" >/dev/null
grep -F "if [[ \$api_rolled_back == true ]]; then" "$ENTRYPOINT" >/dev/null
grep -F 'refresh_frontend_api_proxy || return 1' \
  "$ENTRYPOINT" >/dev/null
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
BACKUP_SCHEMA=$FIXTURE/backup-schema.txt
BACKUP_LISTING=$FIXTURE/backup-listing.txt
BACKUP_MIGRATION_STATE=$FIXTURE/backup-migration-state.txt
BACKUP_DOCKER_LOG=$FIXTURE/backup-docker.log
install -d "$ROOT/backups" "$ROOT/secrets/db"
printf '%s\n' fixture-ca > "$ROOT/secrets/db/ca-certificate.crt"
cat > "$BACKUP_SCHEMA" <<'TEXT'
_prisma_migrations
tenants
workspaces
source_items
feed_items
reader_summary_artifacts
outbox_events
inbox_records
idempotency_keys
TEXT
cat > "$BACKUP_LISTING" <<'TEXT'
1; 0 1 TABLE DATA public _prisma_migrations owner
2; 0 2 TABLE DATA public tenants owner
3; 0 3 TABLE DATA public workspaces owner
4; 0 4 TABLE DATA public source_items owner
5; 0 5 TABLE DATA public feed_items owner
6; 0 6 TABLE DATA public reader_summary_artifacts owner
7; 0 7 TABLE DATA public outbox_events owner
8; 0 8 TABLE DATA public inbox_records owner
9; 0 9 TABLE DATA public idempotency_keys owner
TEXT
printf 'reader-summary-publication-migration-state-v1\t0\t0\t0\t0\t0\t0\nexact-hex=5b5d\n' \
  > "$BACKUP_MIGRATION_STATE"

run_backup_fixture() {
  local dump_mode=$1
  local backup_timestamp=$2
  # Fixture values expand only inside this isolated child shell.
  # shellcheck disable=SC2016
  BACKUP_DUMP_MODE=$dump_mode BACKUP_SHA=$BASE_SHA \
  BACKUP_TIMESTAMP=$backup_timestamp BACKUP_SCHEMA=$BACKUP_SCHEMA \
  BACKUP_LISTING=$BACKUP_LISTING BACKUP_DOCKER_LOG=$BACKUP_DOCKER_LOG \
  BACKUP_MIGRATION_STATE=$BACKUP_MIGRATION_STATE \
  SOCIAL_MONITOR_DEPLOY_TEST_MODE=1 \
  SOCIAL_MONITOR_DEPLOY_ROOT="$ROOT" \
  SOCIAL_MONITOR_DEPLOY_REPO="$REPO" \
  SOCIAL_MONITOR_DEPLOY_CONTROL="$CONTROL" \
  SOCIAL_MONITOR_DEPLOY_STATE="$STATE" \
  SOCIAL_MONITOR_DEPLOY_STAGING="$STAGING" \
  ENTRYPOINT=$ENTRYPOINT bash -c '
    source "$ENTRYPOINT"
    helper_path=$SOCIAL_MONITOR_DEPLOY_REPO/ops/deploy/postgres-backup-deploy-lib.sh
    stat() {
      local last_argument=${!#}
      if [[ $1 == -c && $2 == "%u %a" && \
            $last_argument == "$helper_path" ]]; then
        printf "0 %s\n" "$(command stat -c "%a" "$last_argument")"
      else
        command stat "$@"
      fi
    }
    sha=$BACKUP_SHA
    source "$SOCIAL_MONITOR_DEPLOY_REPO/ops/deploy/reader-summary-publication-deploy-lib.sh"
    declare -F create_pre_migration_database_backup >/dev/null
    declare -f backup_database | \
      grep -F "create_pre_migration_database_backup \"\$@\"" >/dev/null
    COMPOSE=(fake_compose)
    fake_compose() {
      [[ $* == "--profile app ps -q api" ]] || return 90
      printf "%s\n" fixture-api
    }
    date() {
      [[ $* == "-u +%Y%m%dT%H%M%SZ" ]] || return 91
      printf "%s\n" "$BACKUP_TIMESTAMP"
    }
    docker() {
      printf "%s\n" "$*" >> "$BACKUP_DOCKER_LOG"
      if [[ $1 == inspect ]]; then
        printf "%s\n" \
          "DATABASE_URL=postgresql://fixture@db.invalid/social_monitor"
      elif [[ $* == *"SELECT current_database()"* ]]; then
        if [[ $BACKUP_DUMP_MODE == wrong-database ]]; then
          printf "%s\n" postgres
        else
          printf "%s\n" social_monitor
        fi
      elif [[ $* == *"information_schema.tables"* ]]; then
        command cat "$BACKUP_SCHEMA"
      elif [[ $* == *"reader-summary-publication-migration-state-v1"* ]]; then
        command cat "$BACKUP_MIGRATION_STATE"
      elif [[ $* == *"pg_dump --format=custom"* ]]; then
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

: > "$BACKUP_DOCKER_LOG"
valid_backup_output=$(run_backup_fixture valid 20260719T120000Z)
BACKUP_PREFIX=${BASE_SHA:0:12}
VALID_BACKUP=$ROOT/backups/pre-autodeploy-${BACKUP_PREFIX}-20260719T120000Z.dump
[[ -s $VALID_BACKUP ]]
[[ $(stat -c '%a' "$VALID_BACKUP") == 600 ]]
grep -F "database-backup=$VALID_BACKUP" <<< "$valid_backup_output" >/dev/null
grep -F 'pg_restore --file=/dev/null --no-owner --no-privileges' \
  "$BACKUP_DOCKER_LOG" >/dev/null
grep -F '20260716170000_reader_summary_fail_closed_publication' \
  "$BACKUP_DOCKER_LOG" >/dev/null
grep -F "checksum = :'migration_checksum'" "$BACKUP_DOCKER_LOG" >/dev/null
mapfile -t migration_snapshot_lines < <(
  grep -nF 'reader-summary-publication-migration-state-v1' \
    "$BACKUP_DOCKER_LOG" | cut -d: -f1
)
((${#migration_snapshot_lines[@]} == 2))
dump_capture_line=$(grep -nF 'pg_dump --format=custom' \
  "$BACKUP_DOCKER_LOG" | cut -d: -f1)
((migration_snapshot_lines[0] < dump_capture_line && \
  dump_capture_line < migration_snapshot_lines[1]))

assert_backup_failure_clean() {
  local mode=$1 timestamp=$2
  local expected=$ROOT/backups/pre-autodeploy-${BACKUP_PREFIX}-${timestamp}.dump
  local status
  set +e
  run_backup_fixture "$mode" "$timestamp" >/dev/null 2>&1
  status=$?
  set -e
  ((status != 0))
  [[ ! -e $expected && ! -L $expected ]]
  [[ ! -e $expected.partial && ! -L $expected.partial ]]
  if compgen -G "$STATE/database-backup.*" >/dev/null; then
    echo "$mode retained a temporary or credential-bearing backup file" >&2
    exit 1
  fi
}

assert_backup_failure_clean corrupt 20260719T120001Z
assert_backup_failure_clean empty 20260719T120002Z
assert_backup_failure_clean dump-failure 20260719T120003Z
assert_backup_failure_clean wrong-database 20260719T120004Z
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

grep -F 'deploy_release_runtime_transaction "$sha" "$backend" "$runtime_control"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" >/dev/null
grep -F 'activate_postgres_runtime_control "$sha" "$compatible_backend_sha"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'snapshot_postgres_runtime_control "$sha"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'restore_postgres_runtime_control "$runtime_control_backup"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'rollback_backend_images "$previous_images"' \
  "$ENTRYPOINT" >/dev/null
grep -F 'verify_live_postgres_admission "$postgres_env"' "$ENTRYPOINT" >/dev/null
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
grep -F 'trap cleanup_pgpass EXIT' \
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
grep -F 'install -m 0644 "$source/social-monitor-prod.service"' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'install -m 0644 "$source/social-monitor-daily.service"' \
  "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'DropInPaths' "$SCRIPT_DIR/postgres-runtime-deploy-lib.sh" >/dev/null
grep -F 'postgres-runtime-current/compose.postgres-runtime.yml' \
  "$SCRIPT_DIR/production-runtime/daily-run.sh" >/dev/null
if find "$SCRIPT_DIR/production-runtime" -name '*.timer' -print -quit | grep -q .; then
  echo 'PostgreSQL runtime release unexpectedly owns a timer' >&2
  exit 1
fi
grep -F 'dailyTimerOwner' \
  "$SCRIPT_DIR/postgres-pool-release-contract.json" >/dev/null
grep -F 'runtime_release != "$backend_release"' \
  "$SCRIPT_DIR/production-runtime/daily-run.sh" >/dev/null
grep -F 'daily-run-singleton.lock' \
  "$SCRIPT_DIR/production-runtime/daily-run.sh" >/dev/null
grep -F 'flock -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8' \
  "$SCRIPT_DIR/production-runtime/daily-run.sh" >/dev/null
grep -Fx 'TimeoutStartSec=23400' \
  "$SCRIPT_DIR/production-runtime/social-monitor-daily.service" >/dev/null
grep -Fx 'Restart=no' \
  "$SCRIPT_DIR/production-runtime/social-monitor-daily.service" >/dev/null
deploy_library_source_line=$(grep -nF 'source "$REPO/ops/deploy/deploy-control-lib.sh"' \
  "$ENTRYPOINT" | cut -d: -f1)
bridge_initialization_line=$(grep -nF 'initialize_deploy_control_bridge' \
  "$ENTRYPOINT" | tail -1 | cut -d: -f1)
((deploy_library_source_line < bridge_initialization_line))
grep -F 'advance_integration "$sha"' \
  "$SCRIPT_DIR/deploy-control-lib.sh" >/dev/null

# A bridge-current entrypoint classifies a later daily asset-only release as
# control-only runtime activation and uses the already-sourced bridge library.
BRIDGE_SHA=$CONTROL_TARGET_SHA
for component in frontend backend control; do
  printf '%s\n' "$BRIDGE_SHA" > "$STATE/$component.sha"
done
printf '# final daily runtime asset\n' >> \
  "$REPO/ops/deploy/production-runtime/daily-run.sh"
git -C "$REPO" add ops/deploy/production-runtime/daily-run.sh
git -C "$REPO" commit -qm 'test: final daily runtime asset'
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

# The next target is intentionally invalid: it combines another daily runtime
# asset with a controller-library change. The bridge-current process must fail
# before any runtime-control snapshot or activation.
printf '# incompatible controller mutation\n' >> \
  "$REPO/ops/deploy/deploy-control-lib.sh"
printf '# incompatible daily mutation\n' >> \
  "$REPO/ops/deploy/production-runtime/daily-run.sh"
git -C "$REPO" add ops/deploy/deploy-control-lib.sh \
  ops/deploy/production-runtime/daily-run.sh
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
bash "$SCRIPT_DIR/postgres-runtime-deploy-lib.test.sh"
bash "$SCRIPT_DIR/verify-postgres-runtime-topology.test.sh"
bash "$SCRIPT_DIR/reader-summary-publication-migrator-validation.test.sh"
bash "$SCRIPT_DIR/refresh-codex-auth.test.sh"
bash "$SCRIPT_DIR/prune-pre-autodeploy-backups.test.sh"
bash "$SCRIPT_DIR/verify-postgres-backup-coverage.test.sh"
