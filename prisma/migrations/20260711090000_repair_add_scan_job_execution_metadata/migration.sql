-- @social-monitor-repair-migration
ALTER TABLE "scan_jobs"
ADD COLUMN IF NOT EXISTS "execution_metadata" JSONB;
