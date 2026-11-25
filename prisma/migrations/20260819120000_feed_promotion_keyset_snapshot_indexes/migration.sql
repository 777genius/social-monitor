-- @social-monitor-forward-migration
-- Online-only migration. PostgreSQL forbids CREATE INDEX CONCURRENTLY inside
-- a transaction block. Prisma's PostgreSQL migration runner executes this file
-- without an implicit transaction because no BEGIN/COMMIT is present.
-- Serialize this non-transactional migration without putting any concurrent
-- index build in a transaction. PostgreSQL releases the session lock if the
-- migration connection disappears. A concurrent deploy fails in finite time.
SET statement_timeout = '30s';
SELECT pg_advisory_lock(hashtextextended(
  'social-monitor:20260819120000_feed_promotion_keyset_snapshot_indexes', 0
));

SET lock_timeout = '2s';
SET statement_timeout = '15min';

-- Fresh Prisma databases leave feed_items owned by the migration login. The
-- ordered production bootstrap instead transfers it to this NOLOGIN owner and
-- grants the migration login SET-only membership. Accept only those two owner
-- states, then assume the actual table owner because ordinary table privileges
-- are insufficient for concurrent index creation.
SELECT set_config(
  'role',
  owner.table_owner,
  false
)
FROM (
  SELECT pg_get_userbyid(relowner) AS table_owner
  FROM pg_class WHERE oid = 'public.feed_items'::regclass
) AS owner
WHERE owner.table_owner = session_user
   OR owner.table_owner = 'social_monitor_public_schema_owner';

-- Promotion snapshots never read hidden rows. Keep status in the partial
-- predicate, not between the scope and timestamp keys, so PostgreSQL can
-- satisfy the descending keyset order directly under RLS.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "feed_items_workspace_published_keyset_idx"
ON "feed_items" (
  "tenant_id", "workspace_id", "published_at" DESC, "id" DESC
)
WHERE "status" = 'VISIBLE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "feed_items_interest_published_keyset_idx"
ON "feed_items" (
  "tenant_id", "workspace_id", "interest_id",
  "published_at" DESC, "id" DESC
)
WHERE "status" = 'VISIBLE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "feed_items_workspace_observed_keyset_idx"
ON "feed_items" (
  "tenant_id", "workspace_id", "observed_at" DESC, "id" DESC
)
WHERE "status" = 'VISIBLE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "feed_items_interest_observed_keyset_idx"
ON "feed_items" (
  "tenant_id", "workspace_id", "interest_id",
  "observed_at" DESC, "id" DESC
)
WHERE "status" = 'VISIBLE';

RESET ROLE;
RESET statement_timeout;
RESET lock_timeout;
SELECT pg_advisory_unlock(hashtextextended(
  'social-monitor:20260819120000_feed_promotion_keyset_snapshot_indexes', 0
));
