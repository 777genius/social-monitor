-- @social-monitor-repair-migration
-- Repair databases that already applied an older baseline without reader
-- summary topic recommendation decision storage.

CREATE TABLE IF NOT EXISTS "reader_summary_topic_recommendation_decisions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recommendation_id" TEXT NOT NULL,
    "topic_label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decided_by" TEXT NOT NULL,
    "note" TEXT,
    "application" JSONB,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reader_summary_topic_recommendation_decisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "reader_summary_topic_recommendation_decisions"
  ADD COLUMN IF NOT EXISTS "application" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "reader_summary_topic_recommendation_decisions_scope_key"
    ON "reader_summary_topic_recommendation_decisions"("tenant_id", "workspace_id", "recommendation_id");

CREATE INDEX IF NOT EXISTS "reader_summary_topic_recommendation_decisions_scope_time_idx"
    ON "reader_summary_topic_recommendation_decisions"("tenant_id", "workspace_id", "decided_at");
