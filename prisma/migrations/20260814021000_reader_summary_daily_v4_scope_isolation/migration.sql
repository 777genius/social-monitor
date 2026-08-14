-- @social-monitor-forward-migration
-- Keep the one-off Daily V4 recovery gate isolated to the reviewed recovery
-- scope. Later production workspaces may recover the same calendar dates
-- through the ordinary immutable historical-regeneration path.
BEGIN;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

CREATE OR REPLACE FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  supplied_audit JSONB,
  target_artifact_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_tenant_id UUID;
  v_workspace_id UUID;
  v_date DATE;
  v_recovery JSONB;
BEGIN
  IF target_artifact_id IS NULL THEN
    IF target_tenant_id IS DISTINCT FROM c_tenant_id
      OR target_workspace_id IS DISTINCT FROM c_workspace_id
      OR target_date NOT BETWEEN DATE '2026-07-23' AND DATE '2026-07-30' THEN
      RETURN NULL;
    END IF;
    v_recovery := supplied_audit->'recoveryV4';
  ELSE
    SELECT artifact."tenant_id", artifact."workspace_id",
      artifact."period_started_at"::DATE,
      artifact."quality_signals"->'githubProjectionAudit'->'recoveryV4'
    INTO STRICT v_tenant_id, v_workspace_id, v_date, v_recovery
    FROM public."reader_summary_artifacts" AS artifact
    WHERE artifact."id" = target_artifact_id
    FOR KEY SHARE;
    IF v_tenant_id IS DISTINCT FROM c_tenant_id
      OR v_workspace_id IS DISTINCT FROM c_workspace_id
      OR v_date NOT BETWEEN DATE '2026-07-23' AND DATE '2026-07-30' THEN
      RETURN NULL;
    END IF;
  END IF;
  IF jsonb_typeof(v_recovery) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 provenance schema is invalid';
  END IF;
  IF v_recovery->>'schemaVersion' =
    'reader_summary.daily_canonical_recovery_provenance.v2' THEN
    RETURN public."verify_reader_summary_daily_canonical_recovery_v4_provenance_v2"(
      target_tenant_id, target_workspace_id, target_date,
      supplied_audit, target_artifact_id
    );
  END IF;
  IF v_recovery->>'schemaVersion' =
    'reader_summary.daily_canonical_recovery_provenance.v3' THEN
    RETURN public."verify_reader_summary_daily_canonical_recovery_v4_provenance_v3"(
      target_tenant_id, target_workspace_id, target_date,
      supplied_audit, target_artifact_id
    );
  END IF;
  RAISE EXCEPTION 'daily canonical recovery v4 provenance schema is invalid';
END;
$function$;

DO $validate_daily_v4_scope_isolation$
BEGIN
  IF public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
    '00000000-0000-7000-8000-000000006101'::UUID,
    '00000000-0000-7000-8000-000000006102'::UUID,
    DATE '2026-07-23', '{}'::JSONB, NULL::UUID
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'daily canonical recovery v4 leaked into the current production scope';
  END IF;
END;
$validate_daily_v4_scope_isolation$;

RESET ROLE;
COMMIT;
