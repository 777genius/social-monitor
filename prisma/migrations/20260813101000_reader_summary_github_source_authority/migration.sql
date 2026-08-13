-- @social-monitor-forward-migration
-- Verify the current GitHub source snapshot against its terminal scan receipt.
-- The legacy trend-result projection is not part of the active ingestion path.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $rewrite_reader_summary_github_source_authority$
DECLARE
  v_definition TEXT;
  v_original TEXT;
  v_repository_needle CONSTANT TEXT :=
    'source."metadata"->''repository''->>''fullName''
= binding.value->>''repositoryIdentity''';
  v_repository_replacement CONSTANT TEXT :=
    'pg_catalog.lower(source."metadata"->''repository''->>''fullName'')
= pg_catalog.lower(binding.value->>''repositoryIdentity'')';
  v_result_scan_needle CONSTANT TEXT :=
    'LEFT JOIN "github_repository_trend_results" AS result
ON result."source_item_id" = source."id" AND result."tenant_id" = source."tenant_id"
AND result."workspace_id" = source."workspace_id"
AND result."scan_job_id" = (binding.value->>''scanJobId'')::UUID AND result."source_binding_id" =
(binding.value->>''sourceBindingId'')::UUID AND result."repository_full_name" =
binding.value->>''repositoryIdentity'' AND result."repository_url" = binding.value->>''canonicalUrl''
AND result."rank" = (binding.value->>''rank'')::INTEGER
AND to_char(result."checked_at" AT TIME ZONE ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'')
= binding.value->>''checkedAt'' AND to_char(result."observed_at" AT TIME ZONE ''UTC'',
''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'') = binding.value->>''observedAt'' LEFT JOIN "scan_jobs" AS scan
ON scan."id" = result."scan_job_id" AND scan."tenant_id" = result."tenant_id"
AND scan."workspace_id" = result."workspace_id"
AND scan."source_binding_id" = result."source_binding_id" AND scan."status" = ''SUCCEEDED''';
  v_result_scan_replacement CONSTANT TEXT :=
    'LEFT JOIN "scan_jobs" AS scan
ON scan."id" = (binding.value->>''scanJobId'')::UUID
AND scan."id" = (source."metadata"->''trending''->>''scanJobId'')::UUID
AND scan."tenant_id" = source."tenant_id"
AND scan."workspace_id" = source."workspace_id"
AND scan."source_binding_id" = source."source_binding_id"
AND scan."status" = ''SUCCEEDED'' AND scan."completed_at" IS NOT NULL
AND scan."failure_class" IS NULL AND scan."failure_reason" IS NULL
AND jsonb_typeof(scan."execution_metadata") = ''object''
AND scan."execution_metadata"->>''providerKey'' = ''github-trending-page''
AND scan."execution_metadata"->>''status'' = ''succeeded''
AND jsonb_typeof(scan."execution_metadata"->''acceptedItemCount'') = ''number''
AND scan."execution_metadata"->>''acceptedItemCount'' ~ ''^[1-9][0-9]*$''
AND (scan."execution_metadata"->>''acceptedItemCount'')::INTEGER >= 10
AND scan."execution_metadata"->>''targetPublishedWindowStartedAt'' = to_char(
  v_publication."period_started_at" AT TIME ZONE ''UTC'',
  ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"''
)
AND scan."execution_metadata"->>''targetPublishedWindowEndedAt'' = to_char(
  v_publication."period_ended_at" AT TIME ZONE ''UTC'',
  ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"''
)';
  v_missing_needle CONSTANT TEXT :=
    'WHERE source."id" IS NULL OR feed."id" IS NULL OR result."id" IS NULL OR scan."id" IS NULL';
  v_missing_replacement CONSTANT TEXT :=
    'WHERE source."id" IS NULL OR feed."id" IS NULL OR scan."id" IS NULL';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.record_reader_summary_weekly_publication_evidence_base(uuid)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  v_original := v_definition;

  IF pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_repository_needle, '')
    ) <> pg_catalog.length(v_repository_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_result_scan_needle, '')
    ) <> pg_catalog.length(v_result_scan_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_missing_needle, '')
    ) <> pg_catalog.length(v_missing_needle) THEN
    RAISE EXCEPTION 'reader summary GitHub source authority target diverged';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition, v_repository_needle, v_repository_replacement
  );
  v_definition := pg_catalog.replace(
    v_definition, v_result_scan_needle, v_result_scan_replacement
  );
  v_definition := pg_catalog.replace(
    v_definition, v_missing_needle, v_missing_replacement
  );

  IF v_definition = v_original
    OR pg_catalog.strpos(v_definition, v_repository_needle) <> 0
    OR pg_catalog.strpos(v_definition, v_result_scan_needle) <> 0
    OR pg_catalog.strpos(v_definition, v_missing_needle) <> 0
    OR pg_catalog.strpos(v_definition, '"github_repository_trend_results" AS result') <> 0
    OR pg_catalog.strpos(v_definition, 'result."id" IS NULL') <> 0
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_repository_replacement, '')
    ) <> pg_catalog.length(v_repository_replacement)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_result_scan_replacement, '')
    ) <> pg_catalog.length(v_result_scan_replacement) THEN
    RAISE EXCEPTION 'reader summary GitHub source authority rewrite is not exact';
  END IF;

  EXECUTE v_definition;
END;
$rewrite_reader_summary_github_source_authority$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
