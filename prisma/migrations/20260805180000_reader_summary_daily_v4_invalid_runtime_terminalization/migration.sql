-- @social-monitor-forward-migration
-- A consumed V4 attempt is terminal UNAVAILABLE only when the terminal
-- runtime admits an invalid/non-completed product result under its current
-- fence. No provider payload, prompt, warning, usage, receipt, or publication
-- material is retained by this path.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

-- A negative fence is an irreversible, payload-free UNAVAILABLE marker. The
-- terminal function first verifies the positive live fence, then stores only
-- its negation after clearing the lease. This keeps the Prisma-owned table
-- shape unchanged while rejecting ordinary FAILED_AMBIGUOUS rows.
ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_leases"
  ADD CONSTRAINT "rs_daily_v4_lease_unavailable_terminal_fence_check" CHECK (
    "fencing_token" >= 0 OR (
      "state" = 'FAILED_AMBIGUOUS'
      AND "pre_model_consumed_at" IS NOT NULL
      AND "running_at" IS NOT NULL
      AND "failed_ambiguous_at" IS NOT NULL
      AND "failed_ambiguous_at" >= "running_at"
      AND "lease_owner" IS NULL
      AND "leased_at" IS NULL
      AND "lease_expires_at" IS NULL
      AND "absolute_expires_at" IS NULL
      AND "response_bytes" IS NULL
      AND "response_sha256" IS NULL
      AND "attestation" IS NULL
      AND "attestation_bytes" IS NULL
      AND "attestation_sha256" IS NULL
      AND "receipt_bytes" IS NULL
      AND "receipt_sha256" IS NULL
      AND "completed_at" IS NULL
      AND "reader_summary_job_id" IS NULL
      AND "reader_summary_artifact_id" IS NULL
      AND "publication_id" IS NULL
      AND "publication_report_sha256" IS NULL
      AND "publication_proof_sha256" IS NULL
      AND "weekly_evidence_sha256" IS NULL
      AND "public_evidence_sha256" IS NULL
      AND "public_frontend_sha256" IS NULL
      AND "publication_prepared_at" IS NULL
      AND "finalized_at" IS NULL
    )
  );
ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
  ADD CONSTRAINT "rs_daily_v4_retry_unavailable_terminal_fence_check" CHECK (
    "fencing_token" >= 0 OR (
      "state" = 'FAILED_AMBIGUOUS'
      AND "pre_model_consumed_at" IS NOT NULL
      AND "running_at" IS NOT NULL
      AND "failed_ambiguous_at" IS NOT NULL
      AND "failed_ambiguous_at" >= "running_at"
      AND "lease_owner" IS NULL
      AND "leased_at" IS NULL
      AND "lease_expires_at" IS NULL
      AND "absolute_expires_at" IS NULL
      AND "response_bytes" IS NULL
      AND "response_sha256" IS NULL
      AND "attestation" IS NULL
      AND "attestation_bytes" IS NULL
      AND "attestation_sha256" IS NULL
      AND "receipt_bytes" IS NULL
      AND "receipt_sha256" IS NULL
      AND "completed_at" IS NULL
      AND "reader_summary_job_id" IS NULL
      AND "reader_summary_artifact_id" IS NULL
      AND "publication_id" IS NULL
      AND "publication_report_sha256" IS NULL
      AND "publication_proof_sha256" IS NULL
      AND "weekly_evidence_sha256" IS NULL
      AND "public_evidence_sha256" IS NULL
      AND "public_frontend_sha256" IS NULL
      AND "publication_prepared_at" IS NULL
      AND "finalized_at" IS NULL
    )
  );

CREATE FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_unavailable"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE
) RETURNS TABLE (
  requested_utc_date DATE,
  reason_code TEXT,
  signal_count INTEGER,
  source_authority_sha256 TEXT,
  model_job_identity TEXT,
  attempt_ordinal SMALLINT
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_historical_date CONSTANT DATE := DATE '2026-07-23';
  c_historical_model_job_identity CONSTANT TEXT :=
    '241cc317da26fe2125ccf0590f99cee9d1694c91b4a019b036c9619c61e3672a';
  c_historical_source_authority_sha256 CONSTANT TEXT :=
    '010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb';
  v_attempt SMALLINT;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_signal_count INTEGER;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR target_date NOT IN (
      DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25',
      DATE '2026-07-26', DATE '2026-07-27', DATE '2026-07-28',
      DATE '2026-07-29', DATE '2026-07-30'
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 unavailable read session is invalid';
  END IF;

  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  v_attempt := public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
    c_tenant_id, c_workspace_id, target_date
  );
  IF v_attempt IS NULL THEN
    RAISE EXCEPTION 'daily canonical recovery v4 unavailable work is missing';
  END IF;
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."requested_utc_date" = target_date;
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id
    AND authority."workspace_id" = c_workspace_id
    AND authority."requested_utc_date" = target_date
  FOR KEY SHARE;
  IF v_attempt = 2 THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      c_tenant_id, c_workspace_id, target_date
    );
  END IF;
  IF v_lease."state" <> 'FAILED_AMBIGUOUS' THEN
    RETURN;
  END IF;
  IF pg_catalog.jsonb_typeof(v_authority."source_authority_record"->'items')
      IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 unavailable authority is invalid';
  END IF;
  v_signal_count := pg_catalog.jsonb_array_length(
    v_authority."source_authority_record"->'items'
  );
  IF v_attempt NOT IN (1, 2)
    OR v_lease."fencing_token" = 0
    OR btrim(v_lease."source_authority_sha256") IS DISTINCT FROM
      btrim(v_authority."source_authority_sha256")
    OR (v_attempt = 1 AND btrim(v_lease."model_job_identity") IS DISTINCT FROM
      public."reader_summary_daily_canonical_recovery_v4_model_identity"(
        c_tenant_id, c_workspace_id, target_date,
        btrim(v_authority."source_authority_sha256")
      ))
    OR btrim(v_lease."model_job_identity") !~ '^[0-9a-f]{64}$'
    OR v_lease."pre_model_consumed_at" IS NULL
    OR v_lease."running_at" IS NULL
    OR v_lease."failed_ambiguous_at" IS NULL
    OR v_lease."running_at" < v_lease."pre_model_consumed_at"
    OR v_lease."failed_ambiguous_at" < v_lease."running_at"
    OR (v_attempt = 1 AND v_lease."fencing_token" >= 0)
    OR v_lease."response_bytes" IS NOT NULL
    OR v_lease."response_sha256" IS NOT NULL
    OR v_lease."attestation" IS NOT NULL
    OR v_lease."attestation_bytes" IS NOT NULL
    OR v_lease."attestation_sha256" IS NOT NULL
    OR v_lease."receipt_bytes" IS NOT NULL
    OR v_lease."receipt_sha256" IS NOT NULL
    OR v_lease."completed_at" IS NOT NULL
    OR v_lease."reader_summary_job_id" IS NOT NULL
    OR v_lease."reader_summary_artifact_id" IS NOT NULL
    OR v_lease."publication_id" IS NOT NULL
    OR v_lease."publication_report_sha256" IS NOT NULL
    OR v_lease."publication_proof_sha256" IS NOT NULL
    OR v_lease."weekly_evidence_sha256" IS NOT NULL
    OR v_lease."public_evidence_sha256" IS NOT NULL
    OR v_lease."public_frontend_sha256" IS NOT NULL
    OR v_lease."publication_prepared_at" IS NOT NULL
    OR v_lease."finalized_at" IS NOT NULL
    OR v_lease."lease_owner" IS NOT NULL
    OR v_lease."leased_at" IS NOT NULL
    OR v_lease."lease_expires_at" IS NOT NULL
    OR v_lease."absolute_expires_at" IS NOT NULL
    OR (v_attempt = 2 AND (
      target_date IS DISTINCT FROM c_historical_date
      OR btrim(v_lease."model_job_identity") IS DISTINCT FROM
        c_historical_model_job_identity
      OR btrim(v_lease."source_authority_sha256") IS DISTINCT FROM
        c_historical_source_authority_sha256
      OR v_signal_count <> 342
    )) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 unavailable terminal is invalid';
  END IF;

  RETURN QUERY SELECT target_date,
    'model_result_not_durably_persisted_after_consumed_attempt'::TEXT,
    v_signal_count,
    btrim(v_lease."source_authority_sha256"),
    btrim(v_lease."model_job_identity"),
    v_attempt;
END;
$function$;

CREATE FUNCTION public."reconcile_reader_summary_daily_canonical_recovery_v4_expired_invalid_runtime_result"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_model_job_identity CHAR(64),
  target_source_authority_sha256 CHAR(64)
) RETURNS TABLE (
  requested_utc_date DATE,
  reason_code TEXT,
  signal_count INTEGER,
  source_authority_sha256 TEXT,
  model_job_identity TEXT,
  attempt_ordinal SMALLINT
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_expired_invalid_date CONSTANT DATE := DATE '2026-07-24';
  v_attempt SMALLINT;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_updated INTEGER;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR target_date IS DISTINCT FROM c_expired_invalid_date
    OR btrim(target_model_job_identity) !~ '^[0-9a-f]{64}$'
    OR btrim(target_source_authority_sha256) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 expired runtime reconciliation session is invalid';
  END IF;

  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  v_attempt := public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
    c_tenant_id, c_workspace_id, c_expired_invalid_date
  );
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."requested_utc_date" = c_expired_invalid_date;
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id
    AND authority."workspace_id" = c_workspace_id
    AND authority."requested_utc_date" = c_expired_invalid_date
  FOR KEY SHARE;
  IF v_attempt IS DISTINCT FROM 1
    OR v_lease."state" IS DISTINCT FROM 'FAILED_AMBIGUOUS'
    OR v_lease."fencing_token" = 0
    OR btrim(v_lease."model_job_identity") IS DISTINCT FROM
      btrim(target_model_job_identity)
    OR btrim(v_lease."source_authority_sha256") IS DISTINCT FROM
      btrim(target_source_authority_sha256)
    OR btrim(v_lease."source_authority_sha256") IS DISTINCT FROM
      btrim(v_authority."source_authority_sha256")
    OR btrim(v_lease."model_job_identity") IS DISTINCT FROM
      public."reader_summary_daily_canonical_recovery_v4_model_identity"(
        c_tenant_id, c_workspace_id, c_expired_invalid_date,
        btrim(v_authority."source_authority_sha256")
      ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 expired runtime reconciliation binding is invalid';
  END IF;
  IF v_lease."fencing_token" > 0 THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    SET "fencing_token" = -lease."fencing_token"
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = c_expired_invalid_date
      AND lease."state" = 'FAILED_AMBIGUOUS'
      AND lease."fencing_token" > 0
      AND btrim(lease."model_job_identity") = btrim(target_model_job_identity)
      AND btrim(lease."source_authority_sha256") =
        btrim(target_source_authority_sha256);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'daily canonical recovery v4 expired runtime reconciliation lost its binding';
    END IF;
  END IF;

  RETURN QUERY
  SELECT unavailable.requested_utc_date, unavailable.reason_code,
    unavailable.signal_count, unavailable.source_authority_sha256,
    unavailable.model_job_identity, unavailable.attempt_ordinal
  FROM public."read_reader_summary_daily_canonical_recovery_v4_unavailable"(
    c_tenant_id, c_workspace_id, c_expired_invalid_date
  ) AS unavailable;
END;
$function$;

DO $rewrite_claim_reader_summary_daily_canonical_recovery_v4_unavailable$
DECLARE
  v_definition TEXT;
  v_needle CONSTANT TEXT := $historical_unavailable_claim$
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
      )$historical_unavailable_claim$;
  v_replacement CONSTANT TEXT := $generic_unavailable_claim$
      AND lease."state" <> 'FINALIZED'
      AND NOT (
        lease."state" = 'FAILED_AMBIGUOUS'
        AND (
          (
            lease."requested_utc_date" = DATE '2026-07-23'
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
          )
          OR lease."fencing_token" < 0
        )
      )$generic_unavailable_claim$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.claim_reader_summary_daily_canonical_recovery_v4(uuid,uuid,text,timestamp with time zone)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  IF pg_catalog.length(v_definition) - pg_catalog.length(
    pg_catalog.replace(v_definition, v_needle, '')
  ) <> pg_catalog.length(v_needle)
    OR pg_catalog.strpos(v_definition, v_replacement) <> 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 unavailable claim rewrite target diverged';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_needle, v_replacement);
END;
$rewrite_claim_reader_summary_daily_canonical_recovery_v4_unavailable$;

CREATE FUNCTION public."fail_reader_summary_daily_canonical_recovery_v4_runtime_result"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_model_job_identity CHAR(64),
  target_attempt_ordinal SMALLINT,
  target_worker_id TEXT,
  target_fencing_token BIGINT
) RETURNS TABLE (
  requested_utc_date DATE,
  reason_code TEXT,
  signal_count INTEGER,
  source_authority_sha256 TEXT,
  model_job_identity TEXT,
  attempt_ordinal SMALLINT
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_attempt SMALLINT;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
  v_updated INTEGER;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR target_date NOT IN (
      DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25',
      DATE '2026-07-26', DATE '2026-07-27', DATE '2026-07-28',
      DATE '2026-07-29', DATE '2026-07-30'
    )
    OR btrim(target_model_job_identity) !~ '^[0-9a-f]{64}$'
    OR target_attempt_ordinal NOT IN (1, 2)
    OR btrim(target_worker_id) = ''
    OR target_fencing_token < 1 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 runtime terminal session is invalid';
  END IF;

  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  v_attempt := public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
    c_tenant_id, c_workspace_id, target_date
  );
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."requested_utc_date" = target_date;
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id
    AND authority."workspace_id" = c_workspace_id
    AND authority."requested_utc_date" = target_date
  FOR KEY SHARE;
  IF v_attempt = 2 THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      c_tenant_id, c_workspace_id, target_date
    );
  END IF;
  IF v_attempt IS DISTINCT FROM target_attempt_ordinal
    OR btrim(v_lease."model_job_identity") IS DISTINCT FROM
      btrim(target_model_job_identity)
    OR btrim(v_lease."source_authority_sha256") IS DISTINCT FROM
      btrim(v_authority."source_authority_sha256")
    OR v_lease."state" IS DISTINCT FROM 'RUNNING'
    OR v_lease."pre_model_consumed_at" IS NULL
    OR v_lease."running_at" IS NULL
    OR v_lease."failed_ambiguous_at" IS NOT NULL
    OR v_lease."running_at" < v_lease."pre_model_consumed_at"
    OR v_lease."lease_owner" IS DISTINCT FROM target_worker_id
    OR v_lease."fencing_token" IS DISTINCT FROM target_fencing_token
    OR v_lease."leased_at" IS NULL
    OR v_lease."lease_expires_at" IS NULL
    OR v_lease."absolute_expires_at" IS NULL
    OR v_now < v_lease."leased_at"
    OR v_now >= v_lease."lease_expires_at"
    OR v_now >= v_lease."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily canonical recovery v4 runtime terminal has a stale fence';
  END IF;
  IF v_lease."response_bytes" IS NOT NULL
    OR v_lease."response_sha256" IS NOT NULL
    OR v_lease."attestation" IS NOT NULL
    OR v_lease."attestation_bytes" IS NOT NULL
    OR v_lease."attestation_sha256" IS NOT NULL
    OR v_lease."receipt_bytes" IS NOT NULL
    OR v_lease."receipt_sha256" IS NOT NULL
    OR v_lease."completed_at" IS NOT NULL
    OR v_lease."reader_summary_job_id" IS NOT NULL
    OR v_lease."reader_summary_artifact_id" IS NOT NULL
    OR v_lease."publication_id" IS NOT NULL
    OR v_lease."publication_report_sha256" IS NOT NULL
    OR v_lease."publication_proof_sha256" IS NOT NULL
    OR v_lease."weekly_evidence_sha256" IS NOT NULL
    OR v_lease."public_evidence_sha256" IS NOT NULL
    OR v_lease."public_frontend_sha256" IS NOT NULL
    OR v_lease."publication_prepared_at" IS NOT NULL
    OR v_lease."finalized_at" IS NOT NULL THEN
    RAISE EXCEPTION 'daily canonical recovery v4 runtime terminal state is invalid';
  END IF;

  IF v_attempt = 2 THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    SET "state" = 'FAILED_AMBIGUOUS', "failed_ambiguous_at" = v_now,
      "fencing_token" = -retry."fencing_token",
      "lease_owner" = NULL, "leased_at" = NULL, "lease_expires_at" = NULL,
      "absolute_expires_at" = NULL
    WHERE retry."tenant_id" = c_tenant_id
      AND retry."workspace_id" = c_workspace_id
      AND retry."requested_utc_date" = target_date
      AND retry."attempt_ordinal" = target_attempt_ordinal
      AND btrim(retry."model_job_identity") = btrim(target_model_job_identity)
      AND retry."state" = 'RUNNING'
      AND retry."lease_owner" = target_worker_id
      AND retry."fencing_token" = target_fencing_token;
  ELSE
    UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    SET "state" = 'FAILED_AMBIGUOUS', "failed_ambiguous_at" = v_now,
      "fencing_token" = -lease."fencing_token",
      "lease_owner" = NULL, "leased_at" = NULL, "lease_expires_at" = NULL,
      "absolute_expires_at" = NULL
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = target_date
      AND target_attempt_ordinal = 1
      AND btrim(lease."model_job_identity") = btrim(target_model_job_identity)
      AND lease."state" = 'RUNNING'
      AND lease."lease_owner" = target_worker_id
      AND lease."fencing_token" = target_fencing_token;
  END IF;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 runtime terminal did not retain its fence';
  END IF;

  RETURN QUERY
  SELECT unavailable.requested_utc_date, unavailable.reason_code,
    unavailable.signal_count, unavailable.source_authority_sha256,
    unavailable.model_job_identity, unavailable.attempt_ordinal
  FROM public."read_reader_summary_daily_canonical_recovery_v4_unavailable"(
    c_tenant_id, c_workspace_id, target_date
  ) AS unavailable;
END;
$function$;

CREATE OR REPLACE FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_terminals"(
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
  v_date DATE;
  v_count INTEGER;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
  v_unavailable RECORD;
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
  SELECT count(*)::INTEGER INTO STRICT v_count
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id;
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 terminal read coverage is invalid';
  END IF;

  FOREACH v_date IN ARRAY ARRAY[
    DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25',
    DATE '2026-07-26', DATE '2026-07-27', DATE '2026-07-28',
    DATE '2026-07-29', DATE '2026-07-30'
  ] LOOP
    SELECT * INTO STRICT v_lease
    FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = v_date;
    IF v_lease."state" = 'FINALIZED' THEN
      RETURN QUERY SELECT 'FINALIZED'::TEXT, v_date, NULL::TEXT, NULL::INTEGER,
        btrim(v_lease."source_authority_sha256"),
        btrim(v_lease."model_job_identity"), NULL::SMALLINT,
        v_lease."reader_summary_job_id", v_lease."reader_summary_artifact_id",
        v_lease."publication_id", btrim(v_lease."publication_report_sha256"),
        btrim(v_lease."publication_proof_sha256"),
        btrim(v_lease."weekly_evidence_sha256"),
        btrim(v_lease."public_evidence_sha256"),
        btrim(v_lease."public_frontend_sha256");
    ELSIF v_lease."state" = 'FAILED_AMBIGUOUS' THEN
      SELECT * INTO STRICT v_unavailable
      FROM public."read_reader_summary_daily_canonical_recovery_v4_unavailable"(
        c_tenant_id, c_workspace_id, v_date
      ) AS unavailable;
      RETURN QUERY SELECT 'UNAVAILABLE'::TEXT, v_unavailable.requested_utc_date,
        v_unavailable.reason_code, v_unavailable.signal_count,
        v_unavailable.source_authority_sha256, v_unavailable.model_job_identity,
        v_unavailable.attempt_ordinal, NULL::UUID, NULL::UUID, NULL::UUID,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    ELSE
      RAISE EXCEPTION 'daily canonical recovery v4 terminal read has nonterminal work';
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_unavailable"(
  UUID, UUID, DATE
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_unavailable"(
  UUID, UUID, DATE
) TO "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."reconcile_reader_summary_daily_canonical_recovery_v4_expired_invalid_runtime_result"(
  UUID, UUID, DATE, CHAR(64), CHAR(64)
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."reconcile_reader_summary_daily_canonical_recovery_v4_expired_invalid_runtime_result"(
  UUID, UUID, DATE, CHAR(64), CHAR(64)
) TO "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."fail_reader_summary_daily_canonical_recovery_v4_runtime_result"(
  UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."fail_reader_summary_daily_canonical_recovery_v4_runtime_result"(
  UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT
) TO "social_monitor_reader_summary_daily_terminal";
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
