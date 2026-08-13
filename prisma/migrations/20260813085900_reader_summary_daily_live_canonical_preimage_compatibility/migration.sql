-- @social-monitor-forward-migration
-- Normalize the evidence recorder preimage expected by the immutable 090000
-- migration. Deployments that already applied 090000 must remain untouched.
BEGIN;

DO $daily_live_canonical_preimage_compatibility$
DECLARE
  v_artifact_helper REGPROCEDURE := to_regprocedure(
    'public.reader_summary_daily_artifact_canonical_json(jsonb)'
  );
  v_definition TEXT;
  v_original TEXT;
  v_report_helper REGPROCEDURE := to_regprocedure(
    'public.reader_summary_daily_canonical_recovery_v4_report_canonical_json(jsonb)'
  );
  v_report_needle CONSTANT TEXT :=
    '"reader_summary_weekly_canonical_json_unbounded"(v_report)';
  v_report_replacement CONSTANT TEXT :=
    '"reader_summary_weekly_canonical_json"(v_report)';
  v_artifact_needle CONSTANT TEXT :=
    '"reader_summary_weekly_canonical_json_unbounded"(v_artifact."artifact_payload")';
  v_artifact_replacement CONSTANT TEXT :=
    '"reader_summary_weekly_canonical_json"(v_artifact."artifact_payload")';
BEGIN
  -- The report helper was introduced by the recovery-v4 baseline. The artifact
  -- helper is the unambiguous marker that 090000 has already been applied.
  IF v_artifact_helper IS NOT NULL AND v_report_helper IS NOT NULL THEN
    RETURN;
  END IF;
  IF v_report_helper IS NULL OR v_artifact_helper IS NOT NULL THEN
    RAISE EXCEPTION 'daily live canonical helper installation is incomplete';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(
    'public.record_reader_summary_weekly_publication_evidence_base(uuid)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  v_original := v_definition;

  -- Fresh ordered baselines already expose the exact bounded preimage that
  -- 090000 consumes. Only older out-of-order baselines require normalization.
  IF length(v_definition) - length(replace(v_definition, v_report_replacement, ''))
      = length(v_report_replacement)
    AND length(v_definition) - length(replace(v_definition, v_artifact_replacement, ''))
      = length(v_artifact_replacement)
    AND position(v_report_needle IN v_definition) = 0
    AND position(v_artifact_needle IN v_definition) = 0 THEN
    RETURN;
  END IF;
  IF length(v_definition) - length(replace(v_definition, v_report_needle, ''))
      <> length(v_report_needle)
    OR length(v_definition) - length(replace(v_definition, v_artifact_needle, ''))
      <> length(v_artifact_needle)
    OR position(v_report_replacement IN v_definition) <> 0
    OR position(v_artifact_replacement IN v_definition) <> 0 THEN
    RAISE EXCEPTION 'daily live canonical compatibility preimage diverged';
  END IF;

  v_definition := replace(v_definition, v_report_needle, v_report_replacement);
  v_definition := replace(v_definition, v_artifact_needle, v_artifact_replacement);
  IF v_definition = v_original
    OR position(v_report_needle IN v_definition) <> 0
    OR position(v_artifact_needle IN v_definition) <> 0
    OR length(v_definition) - length(replace(v_definition, v_report_replacement, ''))
      <> length(v_report_replacement)
    OR length(v_definition) - length(replace(v_definition, v_artifact_replacement, ''))
      <> length(v_artifact_replacement) THEN
    RAISE EXCEPTION 'daily live canonical compatibility rewrite is not exact';
  END IF;

  EXECUTE 'SET LOCAL ROLE social_monitor_reader_summary_publication_owner';
  EXECUTE v_definition;
  EXECUTE 'RESET ROLE';
END;
$daily_live_canonical_preimage_compatibility$;

COMMIT;
