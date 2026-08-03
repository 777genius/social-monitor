-- @social-monitor-forward-migration
-- Daily cursor, source authority and model receipt state are tenant-scoped.
-- Keep direct tenant access scope-filtered while the reviewed schema owner and
-- daily publication definer retain the authority required by fenced functions.
-- Lock risk: metadata-only ACCESS EXCLUSIVE locks on three bounded daily state
-- tables; no heap rewrite or data scan.
BEGIN;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

DO $transfer_daily_execution_relation_ownership$
DECLARE
  v_owner NAME;
  v_owner_count INTEGER;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(min(relation.relowner)),
    count(DISTINCT relation.relowner)
  INTO STRICT v_owner, v_owner_count
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = ANY (ARRAY[
    'public.reader_summary_daily_execution_cursors'::REGCLASS,
    'public.reader_summary_daily_source_authorities'::REGCLASS,
    'public.reader_summary_daily_model_jobs'::REGCLASS
  ]::OID[]);
  IF v_owner_count <> 1 THEN
    RAISE EXCEPTION 'daily execution relations do not have one owner';
  END IF;
  IF v_owner = session_user THEN
    ALTER TABLE "reader_summary_daily_execution_cursors"
      OWNER TO "social_monitor_public_schema_owner";
    ALTER TABLE "reader_summary_daily_source_authorities"
      OWNER TO "social_monitor_public_schema_owner";
    ALTER TABLE "reader_summary_daily_model_jobs"
      OWNER TO "social_monitor_public_schema_owner";
  ELSIF v_owner <> 'social_monitor_public_schema_owner' THEN
    RAISE EXCEPTION 'daily execution relation owner is not reviewed: %',
      v_owner;
  END IF;
END
$transfer_daily_execution_relation_ownership$;

SET LOCAL ROLE "social_monitor_public_schema_owner";

ALTER TABLE "reader_summary_daily_execution_cursors"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_execution_cursors"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_source_authorities"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_source_authorities"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_model_jobs"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_model_jobs"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON "reader_summary_daily_execution_cursors"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );
CREATE POLICY "daily_execution_authority"
  ON "reader_summary_daily_execution_cursors"
  FOR ALL TO "social_monitor_public_schema_owner",
    "social_monitor_reader_summary_daily_publication_definer"
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "tenant_isolation"
  ON "reader_summary_daily_source_authorities"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );
CREATE POLICY "daily_execution_authority"
  ON "reader_summary_daily_source_authorities"
  FOR ALL TO "social_monitor_public_schema_owner",
    "social_monitor_reader_summary_daily_publication_definer"
  USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "tenant_isolation"
  ON "reader_summary_daily_model_jobs"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );
CREATE POLICY "daily_execution_authority"
  ON "reader_summary_daily_model_jobs"
  FOR ALL TO "social_monitor_public_schema_owner",
    "social_monitor_reader_summary_daily_publication_definer"
  USING (TRUE) WITH CHECK (TRUE);

RESET ROLE;

COMMIT;
