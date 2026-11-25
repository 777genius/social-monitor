-- @social-monitor-forward-migration
-- Owned canonical historical-unavailable continuation migration.
-- Jul23's consumed second attempt has no durable model bytes. It is a terminal
-- unavailable outcome, never a third model attempt, NO_SIGNAL result, or publication.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $rewrite_claim_reader_summary_daily_canonical_recovery_v4_terminal_failed$
DECLARE
  v_definition TEXT;
  v_needle CONSTANT TEXT := '      AND lease."state" <> ''FINALIZED''';
  v_replacement CONSTANT TEXT := $exact_historical_unavailable_claim$
      AND lease."state" <> 'FINALIZED'
      AND NOT (
        lease."state" = 'FAILED_AMBIGUOUS'
        AND lease."requested_utc_date" = DATE '2026-07-23'
        AND btrim(lease."source_authority_sha256") =
          '010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb'
        AND EXISTS (
          SELECT 1
          FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
          WHERE retry."tenant_id" = lease."tenant_id"
            AND retry."workspace_id" = lease."workspace_id"
            AND retry."requested_utc_date" = lease."requested_utc_date"
            AND retry."state" = 'FAILED_AMBIGUOUS'
            AND btrim(retry."model_job_identity") =
              '241cc317da26fe2125ccf0590f99cee9d1694c91b4a019b036c9619c61e3672a'
            AND btrim(retry."source_authority_sha256") =
              '010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb'
        )
      )$exact_historical_unavailable_claim$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.claim_reader_summary_daily_canonical_recovery_v4(uuid,uuid,text,timestamp with time zone)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  IF pg_catalog.length(v_definition) - pg_catalog.length(
    pg_catalog.replace(v_definition, v_needle, '')
  ) <> pg_catalog.length(v_needle)
    OR pg_catalog.strpos(v_definition, v_replacement) <> 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 terminal failed claim rewrite target diverged';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_needle, v_replacement);
END;
$rewrite_claim_reader_summary_daily_canonical_recovery_v4_terminal_failed$;

CREATE FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_terminals"(
  target_tenant_id UUID,
  target_workspace_id UUID
) RETURNS TABLE (
  outcome TEXT,
  requested_utc_date DATE,
  reason_code TEXT,
  signal_count INTEGER,
  source_authority_sha256 TEXT,
  model_job_identity TEXT,
  attempt_ordinal SMALLINT,
  reader_summary_job_id UUID,
  reader_summary_artifact_id UUID,
  publication_id UUID,
  report_sha256 TEXT,
  proof_sha256 TEXT,
  weekly_evidence_sha256 TEXT,
  public_evidence_sha256 TEXT,
  public_frontend_sha256 TEXT
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_unavailable_date CONSTANT DATE := DATE '2026-07-23';
  c_unavailable_model_job_identity CONSTANT TEXT :=
    '241cc317da26fe2125ccf0590f99cee9d1694c91b4a019b036c9619c61e3672a';
  c_unavailable_source_authority_sha256 CONSTANT TEXT :=
    '010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb';
  v_failed_count INTEGER;
  v_signal_count INTEGER;
  v_original public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_retry public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id THEN
    RAISE EXCEPTION 'daily canonical recovery v4 terminal read session is invalid';
  END IF;

  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  PERFORM lease."requested_utc_date"
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
  ORDER BY lease."requested_utc_date"
  FOR KEY SHARE;
  PERFORM retry."requested_utc_date"
  FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
  WHERE retry."tenant_id" = c_tenant_id
    AND retry."workspace_id" = c_workspace_id
  ORDER BY retry."requested_utc_date"
  FOR KEY SHARE;

  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = c_tenant_id
      AND retry."workspace_id" = c_workspace_id
  ) THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      c_tenant_id, c_workspace_id, c_unavailable_date
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND (
        lease."state" <> 'FINALIZED'
        AND NOT (
          lease."state" = 'FAILED_AMBIGUOUS'
          AND lease."requested_utc_date" = c_unavailable_date
          AND btrim(lease."model_job_identity") =
            c_unavailable_model_job_identity
          AND btrim(lease."source_authority_sha256") =
            c_unavailable_source_authority_sha256
        )
      )
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 terminal read has nonterminal work';
  END IF;

  SELECT count(*)::INTEGER INTO STRICT v_failed_count
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."state" = 'FAILED_AMBIGUOUS'
    AND lease."requested_utc_date" = c_unavailable_date
    AND btrim(lease."model_job_identity") = c_unavailable_model_job_identity
    AND btrim(lease."source_authority_sha256") =
      c_unavailable_source_authority_sha256;

  IF v_failed_count > 0 THEN
    IF v_failed_count <> 1 THEN
      RAISE EXCEPTION 'daily canonical recovery v4 terminal unavailable count is invalid';
    END IF;
    SELECT * INTO STRICT v_original
    FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = c_unavailable_date
    FOR KEY SHARE;
    SELECT * INTO STRICT v_retry
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = c_tenant_id
      AND retry."workspace_id" = c_workspace_id
      AND retry."requested_utc_date" = c_unavailable_date
    FOR KEY SHARE;
    SELECT * INTO STRICT v_authority
    FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
    WHERE authority."tenant_id" = c_tenant_id
      AND authority."workspace_id" = c_workspace_id
      AND authority."requested_utc_date" = c_unavailable_date
    FOR KEY SHARE;
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      c_tenant_id, c_workspace_id, c_unavailable_date
    );
    IF pg_catalog.jsonb_typeof(v_authority."source_authority_record"->'items')
      IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'daily canonical recovery v4 unavailable source authority is invalid';
    END IF;
    v_signal_count := pg_catalog.jsonb_array_length(
      v_authority."source_authority_record"->'items'
    );
    IF v_original."state" IS DISTINCT FROM 'FAILED_AMBIGUOUS'
      OR v_retry."state" IS DISTINCT FROM 'FAILED_AMBIGUOUS'
      OR v_retry."attempt_ordinal" <> 2
      OR btrim(v_retry."model_job_identity") IS DISTINCT FROM
        c_unavailable_model_job_identity
      OR btrim(v_retry."source_authority_sha256") IS DISTINCT FROM
        c_unavailable_source_authority_sha256
      OR btrim(v_authority."source_authority_sha256") IS DISTINCT FROM
        c_unavailable_source_authority_sha256
      OR v_retry."pre_model_consumed_at" IS NULL
      OR v_retry."running_at" IS NULL
      OR v_retry."failed_ambiguous_at" IS NULL
      OR v_retry."running_at" < v_retry."pre_model_consumed_at"
      OR v_retry."failed_ambiguous_at" < v_retry."running_at"
      OR v_retry."response_bytes" IS NOT NULL
      OR v_retry."response_sha256" IS NOT NULL
      OR v_retry."attestation" IS NOT NULL
      OR v_retry."attestation_bytes" IS NOT NULL
      OR v_retry."attestation_sha256" IS NOT NULL
      OR v_retry."receipt_bytes" IS NOT NULL
      OR v_retry."receipt_sha256" IS NOT NULL
      OR v_retry."completed_at" IS NOT NULL
      OR v_retry."reader_summary_job_id" IS NOT NULL
      OR v_retry."reader_summary_artifact_id" IS NOT NULL
      OR v_retry."publication_id" IS NOT NULL
      OR v_retry."publication_report_sha256" IS NOT NULL
      OR v_retry."publication_proof_sha256" IS NOT NULL
      OR v_retry."weekly_evidence_sha256" IS NOT NULL
      OR v_retry."public_evidence_sha256" IS NOT NULL
      OR v_retry."public_frontend_sha256" IS NOT NULL
      OR v_retry."publication_prepared_at" IS NOT NULL
      OR v_retry."finalized_at" IS NOT NULL
      OR v_retry."lease_owner" IS NOT NULL
      OR v_retry."leased_at" IS NOT NULL
      OR v_retry."lease_expires_at" IS NOT NULL
      OR v_retry."absolute_expires_at" IS NOT NULL
      OR v_signal_count <> 342 THEN
      RAISE EXCEPTION 'daily canonical recovery v4 unavailable binding is invalid';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public."reader_summary_artifacts" AS artifact
      WHERE artifact."tenant_id" = c_tenant_id
        AND artifact."workspace_id" = c_workspace_id
        AND artifact."scope_type" = 'workspace'
        AND artifact."scope_key" = 'workspace'
        AND artifact."interest_id" IS NULL
        AND artifact."cadence" = 'daily'
        AND artifact."period_timezone" = 'UTC'
        AND artifact."period_started_at" =
          (c_unavailable_date::TIMESTAMP AT TIME ZONE 'UTC')
        AND artifact."period_ended_at" =
          ((c_unavailable_date + 1)::TIMESTAMP AT TIME ZONE 'UTC')
    ) OR EXISTS (
      SELECT 1
      FROM public."reader_summary_jobs" AS job
      WHERE job."tenant_id" = c_tenant_id
        AND job."workspace_id" = c_workspace_id
        AND job."scope_type" = 'workspace'
        AND job."scope_key" = 'workspace'
        AND job."interest_id" IS NULL
        AND job."cadence" = 'daily'
        AND job."period_timezone" = 'UTC'
        AND job."period_started_at" =
          (c_unavailable_date::TIMESTAMP AT TIME ZONE 'UTC')
        AND job."period_ended_at" =
          ((c_unavailable_date + 1)::TIMESTAMP AT TIME ZONE 'UTC')
    ) OR EXISTS (
      SELECT 1
      FROM public."reader_summary_publications" AS publication
      WHERE publication."tenant_id" = c_tenant_id
        AND publication."workspace_id" = c_workspace_id
        AND publication."scope_type" = 'workspace'
        AND publication."scope_key" = 'workspace'
        AND publication."cadence" = 'daily'
        AND publication."period_timezone" = 'UTC'
        AND publication."period_started_at" =
          (c_unavailable_date::TIMESTAMP AT TIME ZONE 'UTC')
        AND publication."period_ended_at" =
          ((c_unavailable_date + 1)::TIMESTAMP AT TIME ZONE 'UTC')
    ) THEN
      RAISE EXCEPTION 'daily canonical recovery v4 unavailable cannot have a summary or publication';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    CASE WHEN lease."state" = 'FINALIZED' THEN 'FINALIZED' ELSE 'UNAVAILABLE' END,
    lease."requested_utc_date",
    CASE WHEN lease."state" = 'FAILED_AMBIGUOUS'
      THEN 'model_result_not_durably_persisted_after_consumed_attempt'
      ELSE NULL::TEXT END,
    CASE WHEN lease."state" = 'FAILED_AMBIGUOUS'
      THEN v_signal_count ELSE NULL::INTEGER END,
    btrim(lease."source_authority_sha256"),
    btrim(lease."model_job_identity"),
    CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' THEN 2::SMALLINT
      ELSE NULL::SMALLINT END,
    CASE WHEN lease."state" = 'FINALIZED' THEN lease."reader_summary_job_id"
      ELSE NULL::UUID END,
    CASE WHEN lease."state" = 'FINALIZED' THEN lease."reader_summary_artifact_id"
      ELSE NULL::UUID END,
    CASE WHEN lease."state" = 'FINALIZED' THEN lease."publication_id"
      ELSE NULL::UUID END,
    CASE WHEN lease."state" = 'FINALIZED' THEN btrim(lease."publication_report_sha256")
      ELSE NULL::TEXT END,
    CASE WHEN lease."state" = 'FINALIZED' THEN btrim(lease."publication_proof_sha256")
      ELSE NULL::TEXT END,
    CASE WHEN lease."state" = 'FINALIZED' THEN btrim(lease."weekly_evidence_sha256")
      ELSE NULL::TEXT END,
    CASE WHEN lease."state" = 'FINALIZED' THEN btrim(lease."public_evidence_sha256")
      ELSE NULL::TEXT END,
    CASE WHEN lease."state" = 'FINALIZED' THEN btrim(lease."public_frontend_sha256")
      ELSE NULL::TEXT END
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND (
      lease."state" = 'FINALIZED'
      OR (
        lease."state" = 'FAILED_AMBIGUOUS'
        AND lease."requested_utc_date" = c_unavailable_date
        AND btrim(lease."model_job_identity") =
          c_unavailable_model_job_identity
        AND btrim(lease."source_authority_sha256") =
          c_unavailable_source_authority_sha256
      )
    )
  ORDER BY lease."requested_utc_date";
END;
$function$;

REVOKE ALL ON FUNCTION public."claim_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."claim_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, TEXT, TIMESTAMPTZ
) TO "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_terminals"(
  UUID, UUID
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_terminals"(
  UUID, UUID
) TO "social_monitor_reader_summary_daily_terminal";

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
