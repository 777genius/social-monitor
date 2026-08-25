#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/bin:/usr/bin:/bin

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
PACKAGE=$PROJECT_ROOT/package.json
HELPER=$PROJECT_ROOT/scripts/check-feed-promotion-index-recovery.ts
PUBLICATION=$SCRIPT_DIR/reader-summary-publication-deploy-lib.sh
POSTGRES_IMAGE=${PRODUCTION_CONTROL_BRIDGE_POSTGRES_IMAGE:-postgres:18.4-alpine}
CONTAINER=sm-feed-recovery-$RANDOM-$$
POSTGRES_FIXTURE=
POSTGRES_DATA=

as_disposable_postgres_user() {
  unshare --user --map-users=1:0:1 --map-groups=1:0:1 "$@"
}

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  if [[ -n $POSTGRES_DATA ]]; then
    as_disposable_postgres_user /usr/lib/postgresql/16/bin/pg_ctl \
      -D "$POSTGRES_DATA" -m immediate stop >/dev/null 2>&1 || true
  fi
  [[ -z $POSTGRES_FIXTURE ]] || rm -rf "$POSTGRES_FIXTURE"
}
trap cleanup EXIT

node - "$PACKAGE" <<'NODE'
const manifest = require(process.argv[2]);
const expected = "ts-node -r tsconfig-paths/register scripts/check-feed-promotion-index-recovery.ts";
if (manifest.scripts?.["check:feed-promotion-index-recovery"] !== expected) {
  process.exit(1);
}
NODE
[[ -f $HELPER && ! -L $HELPER ]]
grep -Fx 'import { Pool, type PoolClient } from "pg";' "$HELPER" >/dev/null
for mode in recover verify inspect; do
  [[ $(grep -Fxc "      npm run check:feed-promotion-index-recovery -- $mode" \
    "$PUBLICATION") == 1 ]]
done

[[ -x $PROJECT_ROOT/node_modules/.bin/ts-node ]] || {
  printf 'feed recovery behavioral E2E requires installed Node dependencies\n' >&2
  exit 1
}
if docker info >/dev/null 2>&1; then
  docker image inspect "$POSTGRES_IMAGE" >/dev/null 2>&1 || \
    docker pull "$POSTGRES_IMAGE" >/dev/null
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_PASSWORD=bridge_recovery_test \
    -e POSTGRES_DB=bridge_recovery_test \
    -p 127.0.0.1::5432 "$POSTGRES_IMAGE" >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$CONTAINER" pg_isready -U postgres \
      -d bridge_recovery_test >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$CONTAINER" pg_isready -U postgres \
    -d bridge_recovery_test >/dev/null
  PORT=$(docker port "$CONTAINER" 5432/tcp | awk -F: 'NR == 1 { print $NF }')
  DATABASE_URL="postgresql://postgres:bridge_recovery_test@127.0.0.1:$PORT/bridge_recovery_test"
else
  [[ -x /usr/lib/postgresql/16/bin/initdb && \
     -x /usr/lib/postgresql/16/bin/pg_ctl ]] || {
    printf 'feed recovery behavioral E2E requires disposable PostgreSQL\n' >&2
    exit 1
  }
  POSTGRES_FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/feed-recovery-pg.XXXXXX")
  POSTGRES_DATA=$POSTGRES_FIXTURE/data
  install -d "$POSTGRES_DATA"
  as_disposable_postgres_user /usr/lib/postgresql/16/bin/initdb \
    -D "$POSTGRES_DATA" --username=postgres --auth=trust --no-locale >/dev/null
  PORT=$((20000 + RANDOM))
  as_disposable_postgres_user /usr/lib/postgresql/16/bin/pg_ctl \
    -D "$POSTGRES_DATA" \
    -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories=''" \
    -w start >/dev/null
  DATABASE_URL="postgresql://postgres@127.0.0.1:$PORT/postgres"
fi
[[ $PORT =~ ^[0-9]+$ ]]
export DATABASE_URL

psql -X "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE TYPE "FeedItemStatus" AS ENUM ('VISIBLE', 'HIDDEN');
CREATE TABLE public.feed_items (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  interest_id uuid NOT NULL,
  published_at timestamptz NOT NULL,
  observed_at timestamptz NOT NULL,
  status "FeedItemStatus" NOT NULL
);
SQL

run_recovery() {
  "$PROJECT_ROOT/node_modules/.bin/ts-node" \
    -r tsconfig-paths/register "$HELPER" "$1"
}

# Exercise the exact bridge helper against a real disposable catalog: initial
# build, all-valid verification, wrong-definition repair, and idempotent retry.
run_recovery recover | grep -F 'feed_promotion_index_recovery=ok rebuilt=4' >/dev/null
run_recovery verify | grep -F 'feed_promotion_indexes=verified count=4' >/dev/null
psql -X "$DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
DROP INDEX CONCURRENTLY public."feed_items_interest_observed_keyset_idx";
CREATE INDEX CONCURRENTLY "feed_items_interest_observed_keyset_idx"
  ON public.feed_items (id);
SQL
run_recovery inspect | grep -F 'feed_promotion_indexes=pending count=1' >/dev/null
run_recovery recover | grep -F 'feed_promotion_index_recovery=ok rebuilt=1' >/dev/null
run_recovery verify | grep -F 'feed_promotion_indexes=verified count=4' >/dev/null
run_recovery recover | grep -F \
  'feed_promotion_index_recovery=skipped reason=all_valid' >/dev/null

printf 'production control bridge feed recovery contract test passed\n'
