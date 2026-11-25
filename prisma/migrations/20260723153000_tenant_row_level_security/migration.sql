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
  FOREACH table_name IN ARRAY ARRAY[
    'tenants'
  ] LOOP
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
  FOREACH table_name IN ARRAY ARRAY[
    'users',
    'workspaces'
  ] LOOP
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
  FOREACH table_name IN ARRAY ARRAY[
    'api_keys',
    'conversation_signal_baseline_samples',
    'conversation_units',
    'reader_summary_jobs',
    'reader_summary_policies',
    'reader_summary_topic_recommendation_decisions',
    'cursor_checkpoints',
    'delivery_attempts',
    'digest_schedules',
    'digests',
    'feed_items',
    'feed_signal_baseline_samples',
    'github_repository_trend_candidates',
    'github_repository_trend_results',
    'github_repository_trend_snapshots',
    'interests',
    'memberships',
    'notification_preferences',
    'public_api_audit_events',
    'realtime_events',
    'relevance_feedback_signals',
    'relevance_memory_projections',
    'scan_attempts',
    'scan_failure_queue_entries',
    'scan_jobs',
    'scan_leases',
    'scan_policies',
    'scan_scheduler_decisions',
    'social_research_result_cache_entries',
    'source_candidate_memory',
    'source_bindings',
    'source_credentials',
    'source_item_engagement_daily_rollups',
    'source_item_engagement_observations',
    'source_item_engagement_snapshots',
    'source_items',
    'summary_artifacts',
    'summary_feedback',
    'summary_jobs',
    'summary_policies',
    'source_targets',
    'usage_quota_buckets',
    'usage_records',
    'user_relevance_profiles',
    'user_subscriptions',
    'user_subscription_schedules',
    'user_summary_preferences',
    'webhook_endpoints'
  ] LOOP
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

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "outbox_events"
  USING (
    public.social_monitor_rls_system_access()
    OR (
      "tenant_id" IS NOT NULL
      AND "workspace_id" IS NOT NULL
      AND public.social_monitor_rls_workspace_match(
        "tenant_id",
        "workspace_id"
      )
    )
  )
  WITH CHECK (
    public.social_monitor_rls_system_access()
    OR (
      "tenant_id" IS NOT NULL
      AND "workspace_id" IS NOT NULL
      AND public.social_monitor_rls_workspace_match(
        "tenant_id",
        "workspace_id"
      )
    )
  );

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "idempotency_keys"
  USING (
    public.social_monitor_rls_system_access()
    OR (
      "tenant_id" IS NOT NULL
      AND "workspace_id" IS NOT NULL
      AND public.social_monitor_rls_workspace_match(
        "tenant_id",
        "workspace_id"
      )
    )
  )
  WITH CHECK (
    public.social_monitor_rls_system_access()
    OR (
      "tenant_id" IS NOT NULL
      AND "workspace_id" IS NOT NULL
      AND public.social_monitor_rls_workspace_match(
        "tenant_id",
        "workspace_id"
      )
    )
  );

ALTER TABLE "inbox_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_records" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "inbox_records"
  USING (
    public.social_monitor_rls_system_access()
    OR (
      "tenant_id" IS NOT NULL
      AND public.social_monitor_rls_tenant_match("tenant_id")
    )
  )
  WITH CHECK (
    public.social_monitor_rls_system_access()
    OR (
      "tenant_id" IS NOT NULL
      AND public.social_monitor_rls_tenant_match("tenant_id")
    )
  );

ALTER TABLE "source_credential_secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "source_credential_secrets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "source_credential_secrets"
  USING (
    public.social_monitor_rls_system_access()
    OR EXISTS (
      SELECT 1
      FROM "source_credentials"
      WHERE "source_credentials"."secret_key_id" =
        "source_credential_secrets"."id"
        AND public.social_monitor_rls_workspace_match(
          "source_credentials"."tenant_id",
          "source_credentials"."workspace_id"
        )
    )
  )
  WITH CHECK (
    public.social_monitor_rls_system_access()
    OR public.social_monitor_rls_tenant_context_present()
  );

ALTER TABLE "webhook_secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_secrets" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "webhook_secrets"
  USING (
    public.social_monitor_rls_system_access()
    OR EXISTS (
      SELECT 1
      FROM "webhook_endpoints"
      WHERE "webhook_endpoints"."secret_key_id" = "webhook_secrets"."id"
        AND public.social_monitor_rls_workspace_match(
          "webhook_endpoints"."tenant_id",
          "webhook_endpoints"."workspace_id"
        )
    )
  )
  WITH CHECK (
    public.social_monitor_rls_system_access()
    OR public.social_monitor_rls_tenant_context_present()
  );

ALTER TABLE "webhook_replay_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_replay_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "webhook_replay_deliveries"
  USING (
    public.social_monitor_rls_system_access()
    OR EXISTS (
      SELECT 1
      FROM "webhook_endpoints"
      WHERE "webhook_endpoints"."id" =
        "webhook_replay_deliveries"."webhook_endpoint_id"
        AND public.social_monitor_rls_workspace_match(
          "webhook_endpoints"."tenant_id",
          "webhook_endpoints"."workspace_id"
        )
    )
  )
  WITH CHECK (
    public.social_monitor_rls_system_access()
    OR EXISTS (
      SELECT 1
      FROM "webhook_endpoints"
      WHERE "webhook_endpoints"."id" =
        "webhook_replay_deliveries"."webhook_endpoint_id"
        AND public.social_monitor_rls_workspace_match(
          "webhook_endpoints"."tenant_id",
          "webhook_endpoints"."workspace_id"
        )
    )
  );

RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $protected_reader_summary_rls$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reader_summary_artifacts',
    'reader_summary_publications',
    'reader_summary_publication_slots',
    'reader_summary_recovery_receipts'
  ] LOOP
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
$protected_reader_summary_rls$;

RESET ROLE;

COMMIT;
