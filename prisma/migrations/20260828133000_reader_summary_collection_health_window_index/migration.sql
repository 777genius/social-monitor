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

-- A cancelled concurrent build can leave a same-name catalog entry that
-- IF NOT EXISTS would otherwise accept as usable. Fail closed so the operator
-- can drop that invalid index concurrently before retrying this migration.
DO $$
BEGIN
  IF to_regclass('public.scan_jobs_reader_summary_window_latest_idx') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index
       WHERE indexrelid =
         to_regclass('public.scan_jobs_reader_summary_window_latest_idx')
         AND indrelid = 'public.scan_jobs'::regclass
         AND indisvalid AND indisready AND indislive
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'scan_jobs reader-summary index is invalid; drop it concurrently before retry';
  END IF;
END
$$;

CREATE INDEX CONCURRENTLY IF NOT EXISTS
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
