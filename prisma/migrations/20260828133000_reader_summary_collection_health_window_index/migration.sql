-- @social-monitor-forward-migration
-- Online-only migration. PostgreSQL forbids CREATE INDEX CONCURRENTLY inside
-- a transaction block, so this file intentionally has no BEGIN/COMMIT.
SET statement_timeout = '30s';
SELECT pg_advisory_lock(hashtextextended(
  'social-monitor:20260828133000_reader_summary_collection_health_window_index',
  0
));

SET lock_timeout = '2s';
SET statement_timeout = '15min';

SELECT set_config('role', owner.table_owner, false)
FROM (
  SELECT pg_get_userbyid(relowner) AS table_owner
  FROM pg_class WHERE oid = 'public.scan_jobs'::regclass
) AS owner
WHERE owner.table_owner = session_user
   OR owner.table_owner = 'social_monitor_public_schema_owner';

-- A cancelled concurrent build can leave a same-name invalid catalog entry.
-- Rebuild this new performance index on retry instead of accepting that entry.
-- Both statements remain transaction-free as required by PostgreSQL.
DROP INDEX CONCURRENTLY IF EXISTS
  "scan_jobs_reader_summary_window_latest_idx";

CREATE INDEX CONCURRENTLY
  "scan_jobs_reader_summary_window_latest_idx"
ON "scan_jobs" (
  "tenant_id",
  "workspace_id",
  ("execution_metadata"->>'targetPublishedWindowStartedAt'),
  ("execution_metadata"->>'targetPublishedWindowEndedAt'),
  "source_binding_id",
  "completed_at" DESC NULLS LAST,
  "requested_at" DESC,
  "id" DESC
)
WHERE "execution_metadata" IS NOT NULL
  AND "status" IN ('SUCCEEDED', 'FAILED');

RESET ROLE;
RESET statement_timeout;
RESET lock_timeout;
SELECT pg_advisory_unlock(hashtextextended(
  'social-monitor:20260828133000_reader_summary_collection_health_window_index',
  0
));
