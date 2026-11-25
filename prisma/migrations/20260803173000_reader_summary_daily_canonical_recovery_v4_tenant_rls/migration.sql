-- @social-monitor-forward-migration
-- The V4 recovery tables are tenant-scoped authority state. Preserve their
-- owner-only policy while also applying the repository-wide tenant RLS guard.
-- Lock risk: metadata-only ACCESS EXCLUSIVE locks on three empty bounded
-- recovery tables; no heap rewrite or data scan.
BEGIN;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

ALTER TABLE "reader_summary_daily_canonical_recovery_v4_plans"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_canonical_recovery_v4_plans"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_canonical_recovery_v4_authorities"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_canonical_recovery_v4_authorities"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_canonical_recovery_v4_leases"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_canonical_recovery_v4_leases"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON "reader_summary_daily_canonical_recovery_v4_plans"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );

CREATE POLICY "tenant_isolation"
  ON "reader_summary_daily_canonical_recovery_v4_authorities"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );

CREATE POLICY "tenant_isolation"
  ON "reader_summary_daily_canonical_recovery_v4_leases"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );

RESET ROLE;

COMMIT;
