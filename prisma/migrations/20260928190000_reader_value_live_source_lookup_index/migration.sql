-- @social-monitor-forward-migration
-- The reader-value live-scope anti-join must find tombstoned feed rows by
-- tenant, workspace, interest, and source before the worker's 5s timeout.
-- Production already has this verified index. Fresh installations build it
-- under a bounded lock: Prisma sends the whole migration in one transaction,
-- so CREATE INDEX CONCURRENTLY is not permitted in this file.
SET statement_timeout = '30s';
SELECT pg_advisory_lock(hashtextextended(
  'social-monitor:20260928190000_reader_value_live_source_lookup_index', 0
));

SET lock_timeout = '2s';
SET statement_timeout = '60s';

SELECT set_config('role', owner.table_owner, false)
FROM (
  SELECT pg_get_userbyid(relowner) AS table_owner
  FROM pg_class WHERE oid = 'public.feed_items'::regclass
) AS owner
WHERE owner.table_owner = session_user
   OR owner.table_owner = 'social_monitor_public_schema_owner';

-- A failed earlier concurrent build can leave a same-name invalid index.
-- IF NOT EXISTS would silently skip it, so stop for explicit operator repair.
DO $reader_value_index_preflight$
BEGIN
  IF to_regclass('public.reader_value_live_source_lookup_idx') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_index idx
      WHERE idx.indexrelid = to_regclass('public.reader_value_live_source_lookup_idx')
        AND idx.indrelid = 'public.feed_items'::regclass
        AND idx.indisvalid AND idx.indisready
        AND pg_get_indexdef(idx.indexrelid) =
          'CREATE INDEX reader_value_live_source_lookup_idx ON public.feed_items USING btree (tenant_id, workspace_id, interest_id, source_item_id, status)'
    ) THEN
    RAISE EXCEPTION 'reader_value_live_source_lookup_idx is invalid or unexpected; inspect and repair before retry';
  END IF;
END $reader_value_index_preflight$;

CREATE INDEX IF NOT EXISTS "reader_value_live_source_lookup_idx"
ON "feed_items" (
  "tenant_id", "workspace_id", "interest_id", "source_item_id", "status"
);

RESET ROLE;
RESET statement_timeout;
RESET lock_timeout;
SELECT pg_advisory_unlock(hashtextextended(
  'social-monitor:20260928190000_reader_value_live_source_lookup_index', 0
));
