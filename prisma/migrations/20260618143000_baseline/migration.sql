-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "InterestStatus" AS ENUM ('ENABLED', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceBindingStatus" AS ENUM ('DRAFT', 'ENABLED', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceCredentialKind" AS ENUM ('OAUTH2', 'API_TOKEN', 'BEARER_TOKEN', 'APP_OAUTH');

-- CreateEnum
CREATE TYPE "SourceCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ScanJobStatus" AS ENUM ('REQUESTED', 'ENQUEUED', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FeedItemStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'TOMBSTONED');

-- CreateEnum
CREATE TYPE "SummaryStatus" AS ENUM ('REQUESTED', 'RUNNING', 'COMPLETED', 'NO_SIGNAL', 'FAILED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'ASSEMBLING', 'SUPPRESSED', 'SENDING', 'DELIVERED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'DEAD_LETTERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryDigestStatus" AS ENUM ('ASSEMBLED', 'EMPTY');

-- CreateEnum
CREATE TYPE "DigestScheduleStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "UserSubscriptionStatus" AS ENUM ('ENABLED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UserSubscriptionScheduleStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WebhookEndpointStatus" AS ENUM ('ENABLED', 'DISABLED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('SCAN', 'AI_SUMMARY', 'DELIVERY');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScanFailureQueueStatus" AS ENUM ('RETRY_ENQUEUED', 'DEAD_LETTERED');

-- CreateEnum
CREATE TYPE "ScanAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApiKeyCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "secret_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "ApiKeyCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "status" "InterestStatus" NOT NULL DEFAULT 'ENABLED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "interests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_catalog_entries" (
    "id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "acquisition_mode" TEXT NOT NULL,
    "readiness" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "source_catalog_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_profiles" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_bindings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "source_catalog_entry_id" UUID NOT NULL,
    "capability_profile_version" INTEGER NOT NULL,
    "status" "SourceBindingStatus" NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "cursor_reset_requested_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "source_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_credentials" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "kind" "SourceCredentialKind" NOT NULL,
    "status" "SourceCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "secret_key_id" TEXT NOT NULL,
    "secret_preview" TEXT NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMPTZ(6),
    "rotated_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "source_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_credential_secrets" (
    "id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "source_credential_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "interval_seconds" INTEGER NOT NULL,
    "freshness_seconds" INTEGER NOT NULL,
    "retry_budget" INTEGER NOT NULL,
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scan_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "scan_policy_id" UUID NOT NULL,
    "status" "ScanJobStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotency_key" TEXT NOT NULL,
    "leased_until" TIMESTAMPTZ(6),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "failure_class" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "enqueued_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "failure_metadata" JSONB,
    "correlation_id" TEXT,
    "causation_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scan_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_scheduler_decisions" (
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

-- CreateTable
CREATE TABLE "cursor_checkpoints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "cursor_payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cursor_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "provider_item_id" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_handle" TEXT,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "content_hash" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "raw_pointer" TEXT,
    "metadata" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_failure_queue_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scan_job_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "scan_policy_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "source_query" JSONB NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "causation_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "retry_budget" INTEGER NOT NULL,
    "next_attempt_number" INTEGER,
    "failure_reason" TEXT NOT NULL,
    "status" "ScanFailureQueueStatus" NOT NULL DEFAULT 'RETRY_ENQUEUED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_failure_queue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_attempts" (
    "scan_job_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "status" "ScanAttemptStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "skipped_duplicates" INTEGER NOT NULL DEFAULT 0,
    "projected" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scan_attempts_pkey" PRIMARY KEY ("scan_job_id")
);

-- CreateTable
CREATE TABLE "scan_leases" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scan_job_id" UUID NOT NULL,
    "worker_id" TEXT NOT NULL,
    "fencing_token" TEXT NOT NULL,
    "leased_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "scan_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "source_item_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body_preview" TEXT NOT NULL,
    "author_handle" TEXT,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "provider_metadata" JSONB,
    "status" "FeedItemStatus" NOT NULL DEFAULT 'VISIBLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feed_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_signal_baseline_samples" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
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

-- CreateTable
CREATE TABLE "conversation_units" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "root_feed_item_id" UUID NOT NULL,
    "root_provider_item_id" TEXT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "provider_unit_id" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "author_handle" TEXT,
    "body" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "thread_external_id" TEXT NOT NULL,
    "parent_provider_unit_id" TEXT,
    "depth" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "provider_metadata" JSONB,
    "content_hash" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_signal_baseline_samples" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "conversation_unit_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_signal_baseline_samples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_repository_trend_candidates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "scan_job_id" UUID NOT NULL,
    "repository_full_name" TEXT NOT NULL,
    "primary_window" TEXT NOT NULL,
    "stars_24h" INTEGER NOT NULL,
    "stars_48h" INTEGER NOT NULL DEFAULT 0,
    "stars_7d" INTEGER NOT NULL,
    "stars_30d" INTEGER NOT NULL,
    "stars_90d" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_repository_trend_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_repository_trend_snapshots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "repository_full_name" TEXT NOT NULL,
    "repository_url" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,
    "topics" JSONB NOT NULL,
    "license" TEXT,
    "total_stars" INTEGER NOT NULL,
    "stars_24h" INTEGER NOT NULL,
    "stars_48h" INTEGER NOT NULL DEFAULT 0,
    "stars_7d" INTEGER NOT NULL,
    "stars_30d" INTEGER NOT NULL,
    "stars_90d" INTEGER NOT NULL,
    "checked_at" TIMESTAMPTZ(6) NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_repository_trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "github_repository_trend_results" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "scan_job_id" UUID NOT NULL,
    "source_item_id" UUID NOT NULL,
    "repository_full_name" TEXT NOT NULL,
    "repository_url" TEXT NOT NULL,
    "primary_window" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "checked_at" TIMESTAMPTZ(6) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "source" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "github_repository_trend_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_artifacts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
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

    CONSTRAINT "summary_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "user_id" TEXT,
    "subscription_id" UUID,
    "status" "SummaryStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotency_key" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "summary_artifact_id" UUID,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "summary_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "max_key_points" INTEGER NOT NULL,
    "include_risks" BOOLEAN NOT NULL,
    "include_source_highlights" BOOLEAN NOT NULL,
    "custom_instructions" TEXT,
    "rules_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "summary_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "summary_feedback" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "summary_artifact_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "triage_owner" TEXT NOT NULL,
    "eligible_for_eval_fixture" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "evidence" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "summary_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reader_summary_artifacts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "interest_id" UUID,
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

-- CreateTable
CREATE TABLE "reader_summary_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "interest_id" UUID,
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

-- CreateTable
CREATE TABLE "reader_summary_policies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "interest_id" UUID,
    "language" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "max_stories" INTEGER NOT NULL,
    "include_risks" BOOLEAN NOT NULL,
    "include_interest_highlights" BOOLEAN NOT NULL,
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

-- CreateTable
CREATE TABLE "reader_summary_topic_recommendation_decisions" (
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

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "state" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "queued_at" TIMESTAMPTZ(6) NOT NULL,
    "assembling_at" TIMESTAMPTZ(6),
    "suppressed_at" TIMESTAMPTZ(6),
    "sending_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "dead_lettered_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "failure_reason" TEXT,
    "suppression_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "window_id" TEXT NOT NULL,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL,
    "window_ended_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "DeliveryDigestStatus" NOT NULL DEFAULT 'ASSEMBLED',
    "summary_ids" TEXT[],
    "feed_item_ids" TEXT[],
    "provenance" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "assembled_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_schedules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "interest_ids" TEXT[],
    "interval_seconds" INTEGER NOT NULL,
    "include_no_signal" BOOLEAN NOT NULL,
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "DigestScheduleStatus" NOT NULL DEFAULT 'ENABLED',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "digest_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_targets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "target_kind" TEXT NOT NULL,
    "target_value" TEXT NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "source_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_target_id" UUID NOT NULL,
    "status" "UserSubscriptionStatus" NOT NULL DEFAULT 'ENABLED',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscription_schedules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "interval_seconds" INTEGER NOT NULL,
    "include_no_signal" BOOLEAN NOT NULL,
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "UserSubscriptionScheduleStatus" NOT NULL DEFAULT 'ENABLED',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_subscription_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_summary_preferences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" UUID,
    "interest_id" UUID,
    "language" TEXT,
    "format" TEXT,
    "tone" TEXT,
    "max_key_points" INTEGER,
    "include_risks" BOOLEAN,
    "include_source_highlights" BOOLEAN,
    "custom_instructions" TEXT,
    "rules_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_summary_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_relevance_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "interest_weights" JSONB NOT NULL,
    "source_weights" JSONB NOT NULL,
    "keyword_weights" JSONB NOT NULL,
    "muted_keywords" TEXT[],
    "blocked_provider_keys" TEXT[],
    "rules_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_relevance_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relevance_feedback_signals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "rating" INTEGER,
    "target" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relevance_feedback_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relevance_memory_projections" (
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

-- CreateTable
CREATE TABLE "realtime_events" (
    "id" UUID NOT NULL,
    "protocol_version" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "replay_cursor" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "event_types" TEXT[],
    "status" "WebhookEndpointStatus" NOT NULL DEFAULT 'ENABLED',
    "secret_key_id" TEXT NOT NULL,
    "secret_preview" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "disabled_at" TIMESTAMPTZ(6),
    "quarantined_at" TIMESTAMPTZ(6),
    "quarantine_reason" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_secrets" (
    "id" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_replay_deliveries" (
    "webhook_endpoint_id" UUID NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "remembered_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "webhook_replay_deliveries_pkey" PRIMARY KEY ("webhook_endpoint_id","delivery_id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "recipient_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("tenant_id","workspace_id","recipient_key","channel")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "units" INTEGER NOT NULL,
    "cost_micros" BIGINT NOT NULL,
    "source_ref" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_api_audit_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "reason_code" TEXT,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "public_api_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "bucket_key" TEXT NOT NULL,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL,
    "window_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "count" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("bucket_key")
);

-- CreateTable
CREATE TABLE "usage_quota_buckets" (
    "bucket_key" TEXT NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "subject_key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL,
    "window_ends_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed" INTEGER NOT NULL,
    "limit" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "usage_quota_buckets_pkey" PRIMARY KEY ("bucket_key")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "workspace_id" UUID,
    "event_type" TEXT NOT NULL,
    "schema_version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "correlation_id" TEXT NOT NULL,
    "causation_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_records" (
    "id" UUID NOT NULL,
    "consumer_name" TEXT NOT NULL,
    "event_id" UUID NOT NULL,
    "tenant_id" UUID,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schema_version" INTEGER NOT NULL,

    CONSTRAINT "inbox_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "workspace_id" UUID,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT,
    "response_status" INTEGER,
    "response_payload" JSONB,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_research_result_cache_entries" (
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_research_result_cache_entries_pkey" PRIMARY KEY ("tenant_id","workspace_id","kind","cache_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "workspaces_tenant_id_created_at_idx" ON "workspaces"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_tenant_id_slug_key" ON "workspaces"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "users_tenant_id_created_at_idx" ON "users"("tenant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_user_id_idx" ON "memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_workspace_id_user_id_key" ON "memberships"("tenant_id", "workspace_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_prefix_key" ON "api_keys"("key_prefix");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_workspace_id_created_at_idx" ON "api_keys"("tenant_id", "workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_workspace_id_status_idx" ON "api_keys"("tenant_id", "workspace_id", "status");

-- CreateIndex
CREATE INDEX "interests_tenant_id_workspace_id_status_created_at_idx" ON "interests"("tenant_id", "workspace_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "interests_tenant_id_workspace_id_name_key" ON "interests"("tenant_id", "workspace_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "source_catalog_entries_provider_key_key" ON "source_catalog_entries"("provider_key");

-- CreateIndex
CREATE UNIQUE INDEX "capability_profiles_source_id_version_key" ON "capability_profiles"("source_id", "version");

-- CreateIndex
CREATE INDEX "source_bindings_tenant_workspace_interest_status_idx" ON "source_bindings"("tenant_id", "workspace_id", "interest_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "source_credentials_secret_key_id_key" ON "source_credentials"("secret_key_id");

-- CreateIndex
CREATE INDEX "source_credentials_tenant_id_workspace_id_provider_key_stat_idx" ON "source_credentials"("tenant_id", "workspace_id", "provider_key", "status");

-- CreateIndex
CREATE INDEX "source_credentials_tenant_id_workspace_id_updated_at_idx" ON "source_credentials"("tenant_id", "workspace_id", "updated_at");

-- CreateIndex
CREATE INDEX "scan_policies_tenant_id_workspace_id_idx" ON "scan_policies"("tenant_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "scan_policies_tenant_id_source_binding_id_key" ON "scan_policies"("tenant_id", "source_binding_id");

-- CreateIndex
CREATE INDEX "scan_jobs_tenant_id_workspace_id_status_created_at_idx" ON "scan_jobs"("tenant_id", "workspace_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scan_jobs_tenant_id_idempotency_key_key" ON "scan_jobs"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "scan_scheduler_decisions_tenant_id_workspace_id_source_bind_idx" ON "scan_scheduler_decisions"("tenant_id", "workspace_id", "source_binding_id", "evaluated_at");

-- CreateIndex
CREATE INDEX "scan_scheduler_decisions_tenant_id_workspace_id_provider_ke_idx" ON "scan_scheduler_decisions"("tenant_id", "workspace_id", "provider_key", "evaluated_at");

-- CreateIndex
CREATE INDEX "scan_scheduler_decisions_tenant_id_workspace_id_decision_re_idx" ON "scan_scheduler_decisions"("tenant_id", "workspace_id", "decision", "reason", "evaluated_at");

-- CreateIndex
CREATE UNIQUE INDEX "scan_scheduler_decisions_tenant_id_workspace_id_decision_ke_key" ON "scan_scheduler_decisions"("tenant_id", "workspace_id", "decision_key");

-- CreateIndex
CREATE INDEX "cursor_checkpoints_tenant_id_workspace_id_idx" ON "cursor_checkpoints"("tenant_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "cursor_checkpoints_tenant_id_source_binding_id_key" ON "cursor_checkpoints"("tenant_id", "source_binding_id");

-- CreateIndex
CREATE INDEX "source_items_tenant_id_workspace_id_source_binding_id_obser_idx" ON "source_items"("tenant_id", "workspace_id", "source_binding_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "source_items_tenant_workspace_provider_item_key" ON "source_items"("tenant_id", "workspace_id", "provider_key", "provider_item_id");

-- CreateIndex
CREATE INDEX "scan_failure_queue_entries_tenant_id_workspace_id_status_cr_idx" ON "scan_failure_queue_entries"("tenant_id", "workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "scan_failure_queue_entries_tenant_id_scan_job_id_idx" ON "scan_failure_queue_entries"("tenant_id", "scan_job_id");

-- CreateIndex
CREATE INDEX "scan_attempts_tenant_id_workspace_id_status_started_at_idx" ON "scan_attempts"("tenant_id", "workspace_id", "status", "started_at");

-- CreateIndex
CREATE INDEX "scan_leases_expires_at_idx" ON "scan_leases"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "scan_leases_tenant_id_workspace_id_scan_job_id_key" ON "scan_leases"("tenant_id", "workspace_id", "scan_job_id");

-- CreateIndex
CREATE INDEX "feed_items_tenant_id_workspace_id_status_created_at_idx" ON "feed_items"("tenant_id", "workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "feed_items_tenant_id_workspace_id_provider_key_observed_at_idx" ON "feed_items"("tenant_id", "workspace_id", "provider_key", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "feed_items_tenant_interest_dedupe_key_key" ON "feed_items"("tenant_id", "interest_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "feed_signal_baseline_samples_interest_observed_idx" ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "interest_id", "observed_at");

-- CreateIndex
CREATE INDEX "feed_signal_baseline_samples_tenant_id_workspace_id_provide_idx" ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "provider_key", "content_type", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "feed_signal_baseline_samples_tenant_id_workspace_id_feed_it_key" ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "feed_item_id");

-- CreateIndex
CREATE INDEX "conversation_units_tenant_id_workspace_id_root_feed_item_id_idx" ON "conversation_units"("tenant_id", "workspace_id", "root_feed_item_id", "observed_at");

-- CreateIndex
CREATE INDEX "conversation_units_tenant_id_workspace_id_thread_external_i_idx" ON "conversation_units"("tenant_id", "workspace_id", "thread_external_id", "depth");

-- CreateIndex
CREATE INDEX "conversation_units_tenant_id_workspace_id_provider_key_obse_idx" ON "conversation_units"("tenant_id", "workspace_id", "provider_key", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_units_tenant_id_provider_key_provider_unit_id_key" ON "conversation_units"("tenant_id", "provider_key", "provider_unit_id");

-- CreateIndex
CREATE INDEX "conversation_signal_samples_interest_observed_idx" ON "conversation_signal_baseline_samples"("tenant_id", "workspace_id", "interest_id", "observed_at");

-- CreateIndex
CREATE INDEX "conversation_signal_baseline_samples_tenant_id_workspace_id_idx" ON "conversation_signal_baseline_samples"("tenant_id", "workspace_id", "provider_key", "content_type", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_signal_baseline_samples_tenant_id_workspace_id_key" ON "conversation_signal_baseline_samples"("tenant_id", "workspace_id", "conversation_unit_id");

-- CreateIndex
CREATE INDEX "github_repository_trend_candidates_tenant_id_workspace_id_s_idx" ON "github_repository_trend_candidates"("tenant_id", "workspace_id", "source_binding_id", "observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "github_repository_trend_candidates_tenant_id_workspace_id_s_key" ON "github_repository_trend_candidates"("tenant_id", "workspace_id", "scan_job_id", "repository_full_name", "primary_window");

-- CreateIndex
CREATE INDEX "github_repository_trend_snapshots_tenant_id_workspace_id_ch_idx" ON "github_repository_trend_snapshots"("tenant_id", "workspace_id", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "github_repository_trend_snapshots_tenant_id_workspace_id_re_key" ON "github_repository_trend_snapshots"("tenant_id", "workspace_id", "repository_full_name", "checked_at");

-- CreateIndex
CREATE INDEX "github_repository_trend_results_interest_checked_idx" ON "github_repository_trend_results"("tenant_id", "workspace_id", "interest_id", "checked_at");

-- CreateIndex
CREATE UNIQUE INDEX "github_repository_trend_results_tenant_id_workspace_id_scan_key" ON "github_repository_trend_results"("tenant_id", "workspace_id", "scan_job_id", "repository_full_name", "primary_window");

-- CreateIndex
CREATE INDEX "summary_artifacts_interest_status_created_idx" ON "summary_artifacts"("tenant_id", "workspace_id", "interest_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "summary_artifacts_user_interest_created_idx" ON "summary_artifacts"("tenant_id", "workspace_id", "user_id", "interest_id", "created_at");

-- CreateIndex
CREATE INDEX "summary_jobs_interest_status_created_idx" ON "summary_jobs"("tenant_id", "workspace_id", "interest_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "summary_jobs_user_interest_created_idx" ON "summary_jobs"("tenant_id", "workspace_id", "user_id", "interest_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "summary_jobs_tenant_id_idempotency_key_key" ON "summary_jobs"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "summary_policies_tenant_id_workspace_id_updated_at_idx" ON "summary_policies"("tenant_id", "workspace_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "summary_policies_tenant_workspace_interest_key" ON "summary_policies"("tenant_id", "workspace_id", "interest_id");

-- CreateIndex
CREATE INDEX "summary_feedback_tenant_id_workspace_id_summary_artifact_id_idx" ON "summary_feedback"("tenant_id", "workspace_id", "summary_artifact_id");

-- CreateIndex
CREATE UNIQUE INDEX "summary_feedback_tenant_id_idempotency_key_key" ON "summary_feedback"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "reader_summary_artifacts_period_lookup_idx" ON "reader_summary_artifacts"("tenant_id", "workspace_id", "scope_key", "cadence", "period_started_at");

-- CreateIndex
CREATE INDEX "reader_summary_artifacts_tenant_id_workspace_id_scope_key_s_idx" ON "reader_summary_artifacts"("tenant_id", "workspace_id", "scope_key", "status", "created_at");

-- CreateIndex
CREATE INDEX "reader_summary_artifacts_tenant_id_workspace_id_user_id_sco_idx" ON "reader_summary_artifacts"("tenant_id", "workspace_id", "user_id", "scope_key", "created_at");

-- CreateIndex
CREATE INDEX "reader_summary_jobs_period_lookup_idx" ON "reader_summary_jobs"("tenant_id", "workspace_id", "scope_key", "cadence", "period_started_at");

-- CreateIndex
CREATE INDEX "reader_summary_jobs_tenant_id_workspace_id_scope_key_status_idx" ON "reader_summary_jobs"("tenant_id", "workspace_id", "scope_key", "status", "created_at");

-- CreateIndex
CREATE INDEX "reader_summary_jobs_tenant_id_workspace_id_user_id_scope_ke_idx" ON "reader_summary_jobs"("tenant_id", "workspace_id", "user_id", "scope_key", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reader_summary_jobs_tenant_id_idempotency_key_key" ON "reader_summary_jobs"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "reader_summary_policies_schedule_lookup_idx" ON "reader_summary_policies"("tenant_id", "workspace_id", "schedule_enabled", "updated_at");

-- CreateIndex
CREATE INDEX "reader_summary_policies_tenant_id_workspace_id_updated_at_idx" ON "reader_summary_policies"("tenant_id", "workspace_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "reader_summary_policies_tenant_id_workspace_id_scope_key_key" ON "reader_summary_policies"("tenant_id", "workspace_id", "scope_key");

-- CreateIndex
CREATE INDEX "reader_summary_topic_recommendation_decisions_scope_time_idx" ON "reader_summary_topic_recommendation_decisions"("tenant_id", "workspace_id", "decided_at");

-- CreateIndex
CREATE UNIQUE INDEX "reader_summary_topic_recommendation_decisions_scope_key" ON "reader_summary_topic_recommendation_decisions"("tenant_id", "workspace_id", "recommendation_id");

-- CreateIndex
CREATE INDEX "delivery_attempts_tenant_id_workspace_id_state_queued_at_idx" ON "delivery_attempts"("tenant_id", "workspace_id", "state", "queued_at");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_attempts_tenant_id_workspace_id_idempotency_key_key" ON "delivery_attempts"("tenant_id", "workspace_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "digests_tenant_id_workspace_id_status_assembled_at_idx" ON "digests"("tenant_id", "workspace_id", "status", "assembled_at");

-- CreateIndex
CREATE UNIQUE INDEX "digests_tenant_id_workspace_id_recipient_key_channel_window_key" ON "digests"("tenant_id", "workspace_id", "recipient_key", "channel", "window_id");

-- CreateIndex
CREATE INDEX "digest_schedules_tenant_id_workspace_id_status_next_run_at_idx" ON "digest_schedules"("tenant_id", "workspace_id", "status", "next_run_at");

-- CreateIndex
CREATE INDEX "source_targets_tenant_id_workspace_id_provider_key_idx" ON "source_targets"("tenant_id", "workspace_id", "provider_key");

-- CreateIndex
CREATE UNIQUE INDEX "source_targets_tenant_id_workspace_id_provider_key_normaliz_key" ON "source_targets"("tenant_id", "workspace_id", "provider_key", "normalized_key");

-- CreateIndex
CREATE INDEX "user_subscriptions_tenant_id_workspace_id_user_id_created_a_idx" ON "user_subscriptions"("tenant_id", "workspace_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "user_subscriptions_tenant_id_workspace_id_source_target_id_idx" ON "user_subscriptions"("tenant_id", "workspace_id", "source_target_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_tenant_id_workspace_id_user_id_source_ta_key" ON "user_subscriptions"("tenant_id", "workspace_id", "user_id", "source_target_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscription_schedules_subscription_id_key" ON "user_subscription_schedules"("subscription_id");

-- CreateIndex
CREATE INDEX "user_subscription_schedules_tenant_id_workspace_id_status_n_idx" ON "user_subscription_schedules"("tenant_id", "workspace_id", "status", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_summary_preferences_tenant_id_workspace_id_user_id_sub_key" ON "user_summary_preferences"("tenant_id", "workspace_id", "user_id", "subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_summary_preferences_user_interest_key" ON "user_summary_preferences"("tenant_id", "workspace_id", "user_id", "interest_id");

-- CreateIndex
CREATE INDEX "user_relevance_profiles_tenant_id_workspace_id_updated_at_idx" ON "user_relevance_profiles"("tenant_id", "workspace_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_relevance_profiles_tenant_id_workspace_id_user_id_key" ON "user_relevance_profiles"("tenant_id", "workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "relevance_feedback_signals_tenant_id_workspace_id_user_id_c_idx" ON "relevance_feedback_signals"("tenant_id", "workspace_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "relevance_feedback_signals_tenant_id_workspace_id_idempoten_key" ON "relevance_feedback_signals"("tenant_id", "workspace_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "relevance_memory_projections_status_next_attempt_at_created_idx" ON "relevance_memory_projections"("status", "next_attempt_at", "created_at");

-- CreateIndex
CREATE INDEX "relevance_memory_projections_tenant_id_workspace_id_user_id_idx" ON "relevance_memory_projections"("tenant_id", "workspace_id", "user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "relevance_memory_projections_tenant_id_workspace_id_feedbac_key" ON "relevance_memory_projections"("tenant_id", "workspace_id", "feedback_id");

-- CreateIndex
CREATE INDEX "realtime_events_tenant_id_workspace_id_channel_sequence_idx" ON "realtime_events"("tenant_id", "workspace_id", "channel", "sequence");

-- CreateIndex
CREATE INDEX "realtime_events_tenant_id_workspace_id_occurred_at_idx" ON "realtime_events"("tenant_id", "workspace_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "realtime_events_tenant_id_workspace_id_channel_sequence_key" ON "realtime_events"("tenant_id", "workspace_id", "channel", "sequence");

-- CreateIndex
CREATE INDEX "webhook_endpoints_tenant_id_workspace_id_status_created_at_idx" ON "webhook_endpoints"("tenant_id", "workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "webhook_replay_deliveries_expires_at_idx" ON "webhook_replay_deliveries"("expires_at");

-- CreateIndex
CREATE INDEX "notification_preferences_tenant_id_workspace_id_channel_all_idx" ON "notification_preferences"("tenant_id", "workspace_id", "channel", "allowed");

-- CreateIndex
CREATE INDEX "usage_records_tenant_id_workspace_id_kind_created_at_idx" ON "usage_records"("tenant_id", "workspace_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "public_api_audit_events_tenant_id_workspace_id_occurred_at_idx" ON "public_api_audit_events"("tenant_id", "workspace_id", "occurred_at");

-- CreateIndex
CREATE INDEX "public_api_audit_events_tenant_id_workspace_id_actor_type_a_idx" ON "public_api_audit_events"("tenant_id", "workspace_id", "actor_type", "actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "rate_limit_buckets_window_ends_at_idx" ON "rate_limit_buckets"("window_ends_at");

-- CreateIndex
CREATE INDEX "usage_quota_buckets_tenant_id_workspace_id_subject_key_oper_idx" ON "usage_quota_buckets"("tenant_id", "workspace_id", "subject_key", "operation", "window_started_at");

-- CreateIndex
CREATE INDEX "usage_quota_buckets_window_ends_at_idx" ON "usage_quota_buckets"("window_ends_at");

-- CreateIndex
CREATE INDEX "outbox_events_tenant_id_workspace_id_status_created_at_idx" ON "outbox_events"("tenant_id", "workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "inbox_records_tenant_id_processed_at_idx" ON "inbox_records"("tenant_id", "processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "inbox_records_consumer_name_event_id_key" ON "inbox_records"("consumer_name", "event_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_tenant_id_workspace_id_scope_key_key" ON "idempotency_keys"("tenant_id", "workspace_id", "scope", "key");

-- CreateIndex
CREATE INDEX "social_research_result_cache_entries_tenant_id_workspace_id_idx" ON "social_research_result_cache_entries"("tenant_id", "workspace_id", "kind", "updated_at");

-- CreateIndex
CREATE INDEX "social_research_result_cache_entries_expires_at_idx" ON "social_research_result_cache_entries"("expires_at");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interests" ADD CONSTRAINT "interests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_profiles" ADD CONSTRAINT "capability_profiles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source_catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_source_item_id_fkey" FOREIGN KEY ("source_item_id") REFERENCES "source_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_source_target_id_fkey" FOREIGN KEY ("source_target_id") REFERENCES "source_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_schedules" ADD CONSTRAINT "user_subscription_schedules_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "user_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_summary_preferences" ADD CONSTRAINT "user_summary_preferences_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "user_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
