#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin

SSH_HOST=${SOCIAL_MONITOR_MIRROR_SSH_HOST:-codex-workers-eu-01}
REMOTE_CONTAINER=${SOCIAL_MONITOR_MIRROR_REMOTE_CONTAINER:-social-monitor-prod-postgres-1}
LOCAL_CONTAINER=${SOCIAL_MONITOR_MIRROR_LOCAL_CONTAINER:-social-monitor-local-postgres-1}
SOURCE_DATABASE=${SOCIAL_MONITOR_MIRROR_SOURCE_DATABASE:-social_monitor}
LOCAL_USER=${SOCIAL_MONITOR_MIRROR_LOCAL_USER:-social_monitor}
MIRROR_DATABASE=${SOCIAL_MONITOR_MIRROR_DATABASE:-social_monitor_host_mirror}
NEXT_DATABASE=${MIRROR_DATABASE}_next
PREVIOUS_DATABASE=${MIRROR_DATABASE}_previous
LOCK_DIR=${TMPDIR:-/tmp}/social-monitor-host-db-mirror.lock
DUMP_FILE=$(mktemp "${TMPDIR:-/tmp}/social-monitor-host-db.XXXXXX.dump")

cleanup() {
  rm -f "$DUMP_FILE"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT

validate_name() {
  [[ $1 =~ ^[a-zA-Z0-9_-]+$ ]] || {
    echo "invalid runtime name" >&2
    exit 64
  }
}

validate_database_name() {
  [[ $1 =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || {
    echo "invalid database name" >&2
    exit 64
  }
}

validate_name "$SSH_HOST"
validate_name "$REMOTE_CONTAINER"
validate_name "$LOCAL_CONTAINER"
validate_database_name "$SOURCE_DATABASE"
validate_database_name "$LOCAL_USER"
validate_database_name "$MIRROR_DATABASE"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "mirror sync already running"
  exit 0
fi

docker inspect "$LOCAL_CONTAINER" >/dev/null
[[ $(docker inspect -f '{{.State.Running}}' "$LOCAL_CONTAINER") == true ]]

ssh -o BatchMode=yes "$SSH_HOST" \
  "docker exec $REMOTE_CONTAINER pg_dump -U social_monitor_prod -d $SOURCE_DATABASE -Fc" \
  > "$DUMP_FILE"

[[ $(wc -c < "$DUMP_FILE") -gt 1024 ]]

psql_local() {
  docker exec "$LOCAL_CONTAINER" psql \
    -v ON_ERROR_STOP=1 -U "$LOCAL_USER" -d postgres -Atc "$1"
}

psql_local "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$NEXT_DATABASE' AND pid <> pg_backend_pid();" >/dev/null
psql_local "DROP DATABASE IF EXISTS $NEXT_DATABASE;" >/dev/null
psql_local "CREATE DATABASE $NEXT_DATABASE OWNER $LOCAL_USER;" >/dev/null

docker exec -i "$LOCAL_CONTAINER" pg_restore \
  -U "$LOCAL_USER" -d "$NEXT_DATABASE" \
  --no-owner --no-privileges --exit-on-error < "$DUMP_FILE"

migration_count=$(docker exec "$LOCAL_CONTAINER" psql \
  -U "$LOCAL_USER" -d "$NEXT_DATABASE" -Atc \
  'SELECT count(*) FROM _prisma_migrations;')
feed_count=$(docker exec "$LOCAL_CONTAINER" psql \
  -U "$LOCAL_USER" -d "$NEXT_DATABASE" -Atc \
  'SELECT count(*) FROM feed_items;')
summary_count=$(docker exec "$LOCAL_CONTAINER" psql \
  -U "$LOCAL_USER" -d "$NEXT_DATABASE" -Atc \
  'SELECT count(*) FROM reader_summary_artifacts;')

[[ $migration_count -gt 0 && $feed_count -gt 0 && $summary_count -gt 0 ]]

psql_local "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$MIRROR_DATABASE','$PREVIOUS_DATABASE') AND pid <> pg_backend_pid();" >/dev/null
psql_local "DROP DATABASE IF EXISTS $PREVIOUS_DATABASE;" >/dev/null

current_exists=$(psql_local "SELECT count(*) FROM pg_database WHERE datname = '$MIRROR_DATABASE';")
if [[ $current_exists -eq 1 ]]; then
  psql_local "ALTER DATABASE $MIRROR_DATABASE RENAME TO $PREVIOUS_DATABASE;" >/dev/null
fi

if ! psql_local "ALTER DATABASE $NEXT_DATABASE RENAME TO $MIRROR_DATABASE;" >/dev/null; then
  if [[ $current_exists -eq 1 ]]; then
    psql_local "ALTER DATABASE $PREVIOUS_DATABASE RENAME TO $MIRROR_DATABASE;" >/dev/null
  fi
  exit 1
fi

echo "mirror updated: migrations=$migration_count feed_items=$feed_count reader_summaries=$summary_count"
