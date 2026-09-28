-- @social-monitor-forward-migration
-- The reader-value live-scope anti-join must find tombstoned feed rows by
-- tenant, workspace, interest, and source before the worker's 5s timeout.
-- Keep the build online for the production feed_items table.
SET statement_timeout = '30s';
SELECT pg_advisory_lock(hashtextextended(
  'social-monitor:20260928190000_reader_value_live_source_lookup_index', 0
));

SET lock_timeout = '2s';
SET statement_timeout = '15min';

SELECT set_config('role', owner.table_owner, false)
FROM (
  SELECT pg_get_userbyid(relowner) AS table_owner
  FROM pg_class WHERE oid = 'public.feed_items'::regclass
) AS owner
WHERE owner.table_owner = session_user
   OR owner.table_owner = 'social_monitor_public_schema_owner';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "reader_value_live_source_lookup_idx"
ON "feed_items" (
  "tenant_id", "workspace_id", "interest_id", "source_item_id", "status"
);

RESET ROLE;
RESET statement_timeout;
RESET lock_timeout;
SELECT pg_advisory_unlock(hashtextextended(
  'social-monitor:20260928190000_reader_value_live_source_lookup_index', 0
));
