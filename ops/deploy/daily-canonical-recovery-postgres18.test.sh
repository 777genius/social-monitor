#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
container="social-monitor-daily-recovery-v4-pg18-$$-$RANDOM"

cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM

docker image inspect postgres:18.4-alpine >/dev/null
docker run --detach --rm --name "$container" \
  --env POSTGRES_PASSWORD=daily_recovery_local_test_password \
  --env POSTGRES_DB=postgres \
  --publish 127.0.0.1::5432 postgres:18.4-alpine >/dev/null
port=$(docker port "$container" 5432/tcp | /usr/bin/sed -E 's/.*:([0-9]+)$/\1/')
[[ $port =~ ^[0-9]+$ ]]
for _ in $(seq 1 60); do
  docker exec "$container" pg_isready --host 127.0.0.1 --username postgres --dbname postgres \
    >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$container" pg_isready --host 127.0.0.1 --username postgres --dbname postgres >/dev/null

READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL="postgresql://postgres:daily_recovery_local_test_password@127.0.0.1:$port/postgres" \
  npm --prefix "$REPO" run check:reader-summary-production-recovery-postgres
