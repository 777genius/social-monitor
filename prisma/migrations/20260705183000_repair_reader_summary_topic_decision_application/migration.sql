-- @social-monitor-repair-migration
-- Repair databases that already created topic recommendation decisions before
-- the application payload column was added.

ALTER TABLE "reader_summary_topic_recommendation_decisions"
  ADD COLUMN IF NOT EXISTS "application" JSONB;
