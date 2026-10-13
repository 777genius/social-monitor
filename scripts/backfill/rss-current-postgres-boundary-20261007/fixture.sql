CREATE TYPE "InterestStatus" AS ENUM ('ENABLED', 'DISABLED', 'ARCHIVED');

CREATE TYPE "SourceBindingStatus" AS ENUM ('DRAFT', 'ENABLED', 'PAUSED', 'FAILED');

CREATE TYPE "FeedItemStatus" AS ENUM ('VISIBLE', 'HIDDEN', 'TOMBSTONED');

CREATE TYPE "ScanAttemptStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "capability_profiles" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_profiles_pkey" PRIMARY KEY ("id")
);

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
    "provider_content_hash" TEXT,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "last_observed_at" TIMESTAMPTZ(6),
    "content_updated_at" TIMESTAMPTZ(6),
    "raw_pointer" TEXT,
    "metadata" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "source_item_engagement_snapshots" (
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_item_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "score" BIGINT,
    "comments" BIGINT,
    "likes" BIGINT,
    "reposts" BIGINT,
    "replies" BIGINT,
    "quotes" BIGINT,
    "bookmarks" BIGINT,
    "impressions" BIGINT,
    "views" BIGINT,
    "points" BIGINT,
    "stars" BIGINT,
    "forks" BIGINT,
    "stars_gained" BIGINT,
    "provider_rank" INTEGER,
    "upvote_ratio_bps" INTEGER,
    "metrics_hash" TEXT NOT NULL,
    "first_observed_at" TIMESTAMPTZ(6) NOT NULL,
    "last_observed_at" TIMESTAMPTZ(6) NOT NULL,
    "last_changed_at" TIMESTAMPTZ(6) NOT NULL,
    "last_observation_at" TIMESTAMPTZ(6) NOT NULL,
    "next_observation_due_at" TIMESTAMPTZ(6) NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "source_item_engagement_snapshots_pkey" PRIMARY KEY ("tenant_id","workspace_id","source_item_id")
);

CREATE TABLE "scan_attempts" (
    "scan_job_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
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

CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

CREATE INDEX "workspaces_tenant_id_created_at_idx" ON "workspaces"("tenant_id", "created_at");

CREATE UNIQUE INDEX "workspaces_tenant_id_slug_key" ON "workspaces"("tenant_id", "slug");

CREATE INDEX "interests_tenant_id_workspace_id_status_created_at_idx" ON "interests"("tenant_id", "workspace_id", "status", "created_at");

CREATE UNIQUE INDEX "interests_tenant_workspace_id_key" ON "interests"("tenant_id", "workspace_id", "id");

CREATE UNIQUE INDEX "interests_tenant_id_workspace_id_name_key" ON "interests"("tenant_id", "workspace_id", "name");

CREATE UNIQUE INDEX "source_catalog_entries_provider_key_key" ON "source_catalog_entries"("provider_key");

CREATE UNIQUE INDEX "capability_profiles_source_id_version_key" ON "capability_profiles"("source_id", "version");

CREATE INDEX "source_bindings_tenant_workspace_interest_status_idx" ON "source_bindings"("tenant_id", "workspace_id", "interest_id", "status");

CREATE INDEX "scan_policies_tenant_id_workspace_id_idx" ON "scan_policies"("tenant_id", "workspace_id");

CREATE UNIQUE INDEX "scan_policies_tenant_id_source_binding_id_key" ON "scan_policies"("tenant_id", "source_binding_id");

CREATE INDEX "source_items_tenant_id_workspace_id_source_binding_id_obser_idx" ON "source_items"("tenant_id", "workspace_id", "source_binding_id", "observed_at");

CREATE UNIQUE INDEX "source_items_tenant_workspace_provider_item_key" ON "source_items"("tenant_id", "workspace_id", "provider_key", "provider_item_id");

CREATE UNIQUE INDEX "source_items_tenant_workspace_id_key" ON "source_items"("tenant_id", "workspace_id", "id");

CREATE UNIQUE INDEX "source_items_scope_id_provider_key" ON "source_items"("tenant_id", "workspace_id", "id", "provider_key");

CREATE INDEX "source_item_engagement_snapshots_provider_observed_idx" ON "source_item_engagement_snapshots"("tenant_id", "workspace_id", "provider_key", "last_observed_at" DESC);

CREATE INDEX "source_item_engagement_snapshots_due_idx" ON "source_item_engagement_snapshots"("tenant_id", "workspace_id", "next_observation_due_at");

CREATE UNIQUE INDEX "source_item_engagement_snapshots_scope_provider_key" ON "source_item_engagement_snapshots"("tenant_id", "workspace_id", "source_item_id", "provider_key");

CREATE INDEX "scan_attempts_tenant_id_workspace_id_status_started_at_idx" ON "scan_attempts"("tenant_id", "workspace_id", "status", "started_at");

CREATE INDEX "scan_leases_expires_at_idx" ON "scan_leases"("expires_at");

CREATE UNIQUE INDEX "scan_leases_tenant_id_workspace_id_scan_job_id_key" ON "scan_leases"("tenant_id", "workspace_id", "scan_job_id");

CREATE INDEX "feed_items_tenant_id_workspace_id_status_created_at_idx" ON "feed_items"("tenant_id", "workspace_id", "status", "created_at");

CREATE INDEX "feed_items_tenant_id_workspace_id_provider_key_observed_at_idx" ON "feed_items"("tenant_id", "workspace_id", "provider_key", "observed_at");

CREATE INDEX "feed_items_workspace_published_keyset_idx" ON "feed_items"("tenant_id", "workspace_id", "published_at" DESC, "id" DESC);

CREATE INDEX "feed_items_interest_published_keyset_idx" ON "feed_items"("tenant_id", "workspace_id", "interest_id", "published_at" DESC, "id" DESC);

CREATE INDEX "feed_items_workspace_observed_keyset_idx" ON "feed_items"("tenant_id", "workspace_id", "observed_at" DESC, "id" DESC);

CREATE INDEX "feed_items_interest_observed_keyset_idx" ON "feed_items"("tenant_id", "workspace_id", "interest_id", "observed_at" DESC, "id" DESC);

CREATE INDEX "reader_value_live_source_lookup_idx" ON "feed_items"("tenant_id", "workspace_id", "interest_id", "source_item_id", "status");

CREATE UNIQUE INDEX "feed_items_tenant_interest_dedupe_key_key" ON "feed_items"("tenant_id", "interest_id", "dedupe_key");

CREATE INDEX "feed_signal_baseline_samples_interest_observed_idx" ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "interest_id", "observed_at");

CREATE INDEX "feed_signal_baseline_samples_tenant_id_workspace_id_provide_idx" ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "provider_key", "content_type", "observed_at");

CREATE UNIQUE INDEX "feed_signal_baseline_samples_tenant_id_workspace_id_feed_it_key" ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "feed_item_id");

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "interests" ADD CONSTRAINT "interests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "capability_profiles" ADD CONSTRAINT "capability_profiles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "source_catalog_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "source_item_engagement_snapshots" ADD CONSTRAINT "source_item_engagement_snapshots_source_item_scope_fkey" FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id", "provider_key") REFERENCES "source_items"("tenant_id", "workspace_id", "id", "provider_key") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_source_item_id_fkey" FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id", "provider_key") REFERENCES "source_items"("tenant_id", "workspace_id", "id", "provider_key") ON DELETE RESTRICT ON UPDATE CASCADE;
-- @social-monitor-forward-migration
-- Database-enforced tenant isolation. Context is transaction-local and the
-- worker-only system path additionally requires a dedicated NOLOGIN
-- capability that is absent from the API database login.

BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";

CREATE OR REPLACE FUNCTION public.social_monitor_rls_system_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT
    current_user = 'social_monitor_reader_summary_publication_owner'
    OR (
      current_setting('social_monitor.system_access', TRUE) = 'true'
      AND pg_has_role(
        current_user,
        'social_monitor_tenant_system_runtime',
        'USAGE'
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.social_monitor_rls_tenant_context_present()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT
    NULLIF(current_setting('social_monitor.tenant_id', TRUE), '') IS NOT NULL
    AND NULLIF(current_setting('social_monitor.workspace_id', TRUE), '') IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.social_monitor_rls_tenant_match(
  row_tenant_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT
    public.social_monitor_rls_system_access()
    OR row_tenant_id =
      NULLIF(current_setting('social_monitor.tenant_id', TRUE), '')::UUID
$$;

CREATE OR REPLACE FUNCTION public.social_monitor_rls_workspace_match(
  row_tenant_id UUID,
  row_workspace_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT
    public.social_monitor_rls_system_access()
    OR (
      row_tenant_id =
        NULLIF(current_setting('social_monitor.tenant_id', TRUE), '')::UUID
      AND row_workspace_id =
        NULLIF(current_setting('social_monitor.workspace_id', TRUE), '')::UUID
    )
$$;

DO $tenant_root_rls$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['tenants'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (public.social_monitor_rls_tenant_match(id)) '
      'WITH CHECK (public.social_monitor_rls_tenant_match(id))',
      table_name
    );
  END LOOP;
END
$tenant_root_rls$;

DO $tenant_only_rls$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['workspaces'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (public.social_monitor_rls_tenant_match(tenant_id)) '
      'WITH CHECK (public.social_monitor_rls_tenant_match(tenant_id))',
      table_name
    );
  END LOOP;
END
$tenant_only_rls$;

DO $tenant_workspace_rls$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['feed_items', 'feed_signal_baseline_samples', 'interests', 'scan_attempts', 'scan_leases', 'scan_policies', 'source_bindings', 'source_item_engagement_snapshots', 'source_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING (public.social_monitor_rls_workspace_match(tenant_id, workspace_id)) '
      'WITH CHECK (public.social_monitor_rls_workspace_match(tenant_id, workspace_id))',
      table_name
    );
  END LOOP;
END
$tenant_workspace_rls$;
COMMIT;
