#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$SCRIPT_DIR/../.." && pwd)
container="social-monitor-weekly-receipt-pg18-$$-$RANDOM"

cleanup() {
  docker rm -f "$container" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

docker run --detach --rm \
  --name "$container" \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_DB=social_monitor_weekly_receipt_test \
  --publish 127.0.0.1::5432 \
  postgres:18.4-alpine >/dev/null

port=$(docker port "$container" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')
[[ $port =~ ^[0-9]+$ ]]
for _ in $(seq 1 60); do
  if docker exec "$container" pg_isready \
    --username postgres \
    --dbname social_monitor_weekly_receipt_test >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$container" pg_isready \
  --username postgres \
  --dbname social_monitor_weekly_receipt_test >/dev/null

DATABASE_URL="postgresql://postgres@127.0.0.1:$port/social_monitor_weekly_receipt_test" \
  npm --prefix "$REPO" run \
    check:reader-summary-weekly-execution-receipt-postgres18
