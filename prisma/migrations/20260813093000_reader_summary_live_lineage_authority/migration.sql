-- @social-monitor-forward-migration
-- Accept the complete domain lineage object while keeping its database-owned
-- model and prompt bindings authoritative for every publication path.
BEGIN;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $rewrite_reader_summary_live_lineage_authority$
DECLARE
  v_definition TEXT;
  v_needle CONSTANT TEXT :=
    'OR ((v_artifact."quality_signals"->''githubProjectionAudit''->''recoveryV4''->>''recoveryVersion'' IS DISTINCT FROM ''reader_summary.daily_canonical_recovery.v4'' AND v_artifact."artifact_payload"->''lineage'' IS DISTINCT FROM jsonb_build_object(''modelVersion'', v_artifact."model_version", ''promptVersion'', v_artifact."prompt_version")) OR (v_artifact."quality_signals"->''githubProjectionAudit''->''recoveryV4''->>''recoveryVersion'' = ''reader_summary.daily_canonical_recovery.v4'' AND (v_artifact."artifact_payload"->''lineage''->>''modelVersion'' IS DISTINCT FROM v_artifact."model_version" OR v_artifact."artifact_payload"->''lineage''->>''promptVersion'' IS DISTINCT FROM v_artifact."prompt_version")))';
  v_replacement CONSTANT TEXT :=
    'OR ((v_artifact."quality_signals"->''githubProjectionAudit''->''recoveryV4''->>''recoveryVersion'' IS DISTINCT FROM ''reader_summary.daily_canonical_recovery.v4'' AND (
jsonb_typeof(v_artifact."artifact_payload"->''lineage'') IS DISTINCT FROM ''object''
OR public.jsonb_object_length(v_artifact."artifact_payload"->''lineage'') NOT IN (6, 7)
OR NOT (v_artifact."artifact_payload"->''lineage'' ?& ARRAY[''schemaVersion'', ''modelVersion'', ''providerVersion'', ''promptVersion'', ''rulesVersion'', ''evalDatasetVersion''])
OR (v_artifact."artifact_payload"->''lineage'' ? ''rankingPolicyVersion'') IS DISTINCT FROM (public.jsonb_object_length(v_artifact."artifact_payload"->''lineage'') = 7)
OR jsonb_typeof(v_artifact."artifact_payload"->''lineage''->''schemaVersion'') IS DISTINCT FROM ''string''
OR jsonb_typeof(v_artifact."artifact_payload"->''lineage''->''modelVersion'') IS DISTINCT FROM ''string''
OR jsonb_typeof(v_artifact."artifact_payload"->''lineage''->''providerVersion'') IS DISTINCT FROM ''string''
OR jsonb_typeof(v_artifact."artifact_payload"->''lineage''->''promptVersion'') IS DISTINCT FROM ''string''
OR jsonb_typeof(v_artifact."artifact_payload"->''lineage''->''rulesVersion'') IS DISTINCT FROM ''string''
OR jsonb_typeof(v_artifact."artifact_payload"->''lineage''->''evalDatasetVersion'') IS DISTINCT FROM ''string''
OR ((v_artifact."artifact_payload"->''lineage'') ? ''rankingPolicyVersion'' AND jsonb_typeof(v_artifact."artifact_payload"->''lineage''->''rankingPolicyVersion'') IS DISTINCT FROM ''string'')
OR v_artifact."artifact_payload"->''lineage''->>''schemaVersion'' IS DISTINCT FROM ''reader_summary.artifact.v1''
OR v_artifact."artifact_payload"->''lineage''->>''modelVersion'' IS DISTINCT FROM v_artifact."model_version"
OR v_artifact."artifact_payload"->''lineage''->>''promptVersion'' IS DISTINCT FROM v_artifact."prompt_version"
OR btrim(v_artifact."artifact_payload"->''lineage''->>''providerVersion'') = ''''
OR btrim(v_artifact."artifact_payload"->''lineage''->>''rulesVersion'') = ''''
OR btrim(v_artifact."artifact_payload"->''lineage''->>''evalDatasetVersion'') = ''''
OR ((v_artifact."artifact_payload"->''lineage'') ? ''rankingPolicyVersion'' AND btrim(v_artifact."artifact_payload"->''lineage''->>''rankingPolicyVersion'') = '''')
)) OR (v_artifact."quality_signals"->''githubProjectionAudit''->''recoveryV4''->>''recoveryVersion'' = ''reader_summary.daily_canonical_recovery.v4'' AND (v_artifact."artifact_payload"->''lineage''->>''modelVersion'' IS DISTINCT FROM v_artifact."model_version" OR v_artifact."artifact_payload"->''lineage''->>''promptVersion'' IS DISTINCT FROM v_artifact."prompt_version")))';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.publish_reader_summary_pre_evidence(jsonb)'::REGPROCEDURE
  ) INTO STRICT v_definition;

  IF pg_catalog.length(v_definition) - pg_catalog.length(
    pg_catalog.replace(v_definition, v_needle, '')
  ) <> pg_catalog.length(v_needle) THEN
    RAISE EXCEPTION 'reader summary live lineage authority rewrite target diverged';
  END IF;

  EXECUTE pg_catalog.replace(v_definition, v_needle, v_replacement);
END;
$rewrite_reader_summary_live_lineage_authority$;

RESET ROLE;
COMMIT;
