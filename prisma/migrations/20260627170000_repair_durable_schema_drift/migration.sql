-- @social-monitor-repair-migration
-- Repair databases that already applied an older version of the baseline migration.
-- The current baseline contains these objects, so this migration must be idempotent
-- for fresh databases while bringing existing local/beta databases up to schema.

ALTER TABLE "feed_items" ADD COLUMN IF NOT EXISTS "provider_metadata" JSONB;
ALTER TABLE "scan_jobs" ADD COLUMN IF NOT EXISTS "failure_metadata" JSONB;

CREATE TABLE IF NOT EXISTS "scan_scheduler_decisions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "decision_key" TEXT NOT NULL,
    "scan_policy_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "provider_key" TEXT,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "scan_job_id" UUID,
    "policy_due_at" TIMESTAMPTZ(6) NOT NULL,
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL,
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "configured_interval_seconds" INTEGER NOT NULL,
    "effective_interval_seconds" INTEGER,
    "freshness_seconds" INTEGER,
    "provider_minimum_interval_enforced" BOOLEAN,
    "backoff_until" TIMESTAMPTZ(6),
    "correlation_id" TEXT,
    "causation_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "scan_scheduler_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "feed_signal_baseline_samples" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "feed_item_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "feed_signal_baseline_samples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reader_summary_artifacts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "topic_id" UUID,
    "cadence" TEXT NOT NULL,
    "period_started_at" TIMESTAMPTZ(6) NOT NULL,
    "period_ended_at" TIMESTAMPTZ(6) NOT NULL,
    "period_timezone" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "user_id" TEXT,
    "subscription_id" UUID,
    "status" "SummaryStatus" NOT NULL DEFAULT 'COMPLETED',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "model_version" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary_text" TEXT,
    "artifact_payload" JSONB NOT NULL,
    "citations" JSONB NOT NULL,
    "quality_signals" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "reader_summary_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reader_summary_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "topic_id" UUID,
    "cadence" TEXT NOT NULL,
    "period_started_at" TIMESTAMPTZ(6) NOT NULL,
    "period_ended_at" TIMESTAMPTZ(6) NOT NULL,
    "period_timezone" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "user_id" TEXT,
    "subscription_id" UUID,
    "status" "SummaryStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotency_key" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "reader_summary_artifact_id" UUID,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "reader_summary_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "reader_summary_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "topic_id" UUID,
    "language" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "max_stories" INTEGER NOT NULL,
    "include_risks" BOOLEAN NOT NULL,
    "include_topic_highlights" BOOLEAN NOT NULL,
    "include_repeated_signals" BOOLEAN NOT NULL,
    "dedupe_strategy" TEXT NOT NULL,
    "custom_instructions" TEXT,
    "rules_version" TEXT NOT NULL,
    "schedule_enabled" BOOLEAN NOT NULL DEFAULT true,
    "schedule_timezone" TEXT NOT NULL DEFAULT 'UTC',
    "schedule_cadences" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "reader_summary_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "relevance_memory_projections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "feedback_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "rating" INTEGER,
    "target" JSONB NOT NULL,
    "learning_direction" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL,
    "projected_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "relevance_memory_projections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "scan_scheduler_decisions_tenant_id_workspace_id_source_bind_idx" ON "scan_scheduler_decisions"("tenant_id", "workspace_id", "source_binding_id", "evaluated_at");
CREATE INDEX IF NOT EXISTS "scan_scheduler_decisions_tenant_id_workspace_id_provider_ke_idx" ON "scan_scheduler_decisions"("tenant_id", "workspace_id", "provider_key", "evaluated_at");
CREATE INDEX IF NOT EXISTS "scan_scheduler_decisions_tenant_id_workspace_id_decision_re_idx" ON "scan_scheduler_decisions"("tenant_id", "workspace_id", "decision", "reason", "evaluated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "scan_scheduler_decisions_tenant_id_workspace_id_decision_ke_key" ON "scan_scheduler_decisions"("tenant_id", "workspace_id", "decision_key");

CREATE INDEX IF NOT EXISTS "feed_signal_baseline_samples_tenant_id_workspace_id_topic_i_idx" ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "topic_id", "observed_at");
CREATE INDEX IF NOT EXISTS "feed_signal_baseline_samples_tenant_id_workspace_id_provide_idx" ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "provider_key", "content_type", "observed_at");
CREATE UNIQUE INDEX IF NOT EXISTS "feed_signal_baseline_samples_tenant_id_workspace_id_feed_it_key" ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "feed_item_id");

CREATE INDEX IF NOT EXISTS "reader_summary_artifacts_period_lookup_idx" ON "reader_summary_artifacts"("tenant_id", "workspace_id", "scope_key", "cadence", "period_started_at");
CREATE INDEX IF NOT EXISTS "reader_summary_artifacts_tenant_id_workspace_id_scope_key_s_idx" ON "reader_summary_artifacts"("tenant_id", "workspace_id", "scope_key", "status", "created_at");
CREATE INDEX IF NOT EXISTS "reader_summary_artifacts_tenant_id_workspace_id_user_id_sco_idx" ON "reader_summary_artifacts"("tenant_id", "workspace_id", "user_id", "scope_key", "created_at");

CREATE INDEX IF NOT EXISTS "reader_summary_jobs_period_lookup_idx" ON "reader_summary_jobs"("tenant_id", "workspace_id", "scope_key", "cadence", "period_started_at");
CREATE INDEX IF NOT EXISTS "reader_summary_jobs_tenant_id_workspace_id_scope_key_status_idx" ON "reader_summary_jobs"("tenant_id", "workspace_id", "scope_key", "status", "created_at");
CREATE INDEX IF NOT EXISTS "reader_summary_jobs_tenant_id_workspace_id_user_id_scope_ke_idx" ON "reader_summary_jobs"("tenant_id", "workspace_id", "user_id", "scope_key", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "reader_summary_jobs_tenant_id_idempotency_key_key" ON "reader_summary_jobs"("tenant_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "reader_summary_policies_schedule_lookup_idx" ON "reader_summary_policies"("tenant_id", "workspace_id", "schedule_enabled", "updated_at");
CREATE INDEX IF NOT EXISTS "reader_summary_policies_tenant_id_workspace_id_updated_at_idx" ON "reader_summary_policies"("tenant_id", "workspace_id", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "reader_summary_policies_tenant_id_workspace_id_scope_key_key" ON "reader_summary_policies"("tenant_id", "workspace_id", "scope_key");

CREATE INDEX IF NOT EXISTS "relevance_memory_projections_status_next_attempt_at_created_idx" ON "relevance_memory_projections"("status", "next_attempt_at", "created_at");
CREATE INDEX IF NOT EXISTS "relevance_memory_projections_tenant_id_workspace_id_user_id_idx" ON "relevance_memory_projections"("tenant_id", "workspace_id", "user_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "relevance_memory_projections_tenant_id_workspace_id_feedbac_key" ON "relevance_memory_projections"("tenant_id", "workspace_id", "feedback_id");
