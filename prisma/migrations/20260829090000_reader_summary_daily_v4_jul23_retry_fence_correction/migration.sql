-- @social-monitor-forward-migration
-- Normalize the one legacy Jul23 ambiguity retry that was terminalized before
-- failed runtime attempts began retaining a negative fencing token.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $correct_reader_summary_daily_v4_jul23_retry_fence$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_target_date CONSTANT DATE := DATE '2026-07-23';
  c_model_job_identity CONSTANT TEXT :=
    '241cc317da26fe2125ccf0590f99cee9d1694c91b4a019b036c9619c61e3672a';
  c_source_authority_sha256 CONSTANT TEXT :=
    '010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb';
  v_lease public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_retry public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"%ROWTYPE;
  v_scope_count INTEGER;
  v_terminal_count INTEGER;
  v_updated INTEGER;
BEGIN
  SELECT * INTO v_retry
  FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
  WHERE retry."tenant_id" = c_tenant_id
    AND retry."workspace_id" = c_workspace_id
    AND retry."requested_utc_date" = c_target_date
  FOR UPDATE;

  -- Fresh databases have no production recovery row. A successfully finalized
  -- retry also needs no historical terminal correction.
  IF NOT FOUND OR v_retry."state" = 'FINALIZED' THEN
    RETURN;
  END IF;

  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."requested_utc_date" = c_target_date
  FOR KEY SHARE;

  IF v_lease."state" IS DISTINCT FROM 'FAILED_AMBIGUOUS'
    OR v_lease."fencing_token" IS DISTINCT FROM 1
    OR btrim(v_retry."supersedes_model_job_identity") IS DISTINCT FROM
      btrim(v_lease."model_job_identity")
    OR v_retry."superseded_pre_model_consumed_at" IS DISTINCT FROM
      v_lease."pre_model_consumed_at"
    OR v_retry."superseded_running_at" IS DISTINCT FROM v_lease."running_at"
    OR v_retry."superseded_failed_ambiguous_at" IS DISTINCT FROM
      v_lease."failed_ambiguous_at"
    OR v_retry."attempt_ordinal" IS DISTINCT FROM 2
    OR v_retry."state" IS DISTINCT FROM 'FAILED_AMBIGUOUS'
    OR v_retry."fencing_token" NOT IN (-1, 1)
    OR btrim(v_retry."model_job_identity") IS DISTINCT FROM c_model_job_identity
    OR btrim(v_retry."source_authority_sha256") IS DISTINCT FROM
      c_source_authority_sha256
    OR v_retry."authorization_reason" IS DISTINCT FROM
      'user_authorized_single_retry_after_failed_ambiguous'
    OR v_retry."authorized_by" IS DISTINCT FROM
      'social_monitor_reader_summary_daily_terminal'
    OR v_retry."invalid_category" IS NOT NULL
    OR v_retry."terminal_set_sha256" IS NOT NULL
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
    OR v_retry."absolute_expires_at" IS NOT NULL THEN
    RAISE EXCEPTION 'daily canonical recovery v4 Jul23 retry fence preimage diverged';
  END IF;

  IF v_retry."fencing_token" = 1 THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    SET "fencing_token" = -retry."fencing_token"
    WHERE retry."tenant_id" = c_tenant_id
      AND retry."workspace_id" = c_workspace_id
      AND retry."requested_utc_date" = c_target_date
      AND retry."attempt_ordinal" = 2
      AND retry."state" = 'FAILED_AMBIGUOUS'
      AND retry."fencing_token" = 1
      AND btrim(retry."model_job_identity") = c_model_job_identity
      AND btrim(retry."source_authority_sha256") = c_source_authority_sha256
      AND retry."authorization_reason" =
        'user_authorized_single_retry_after_failed_ambiguous'
      AND retry."invalid_category" IS NULL
      AND retry."terminal_set_sha256" IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'daily canonical recovery v4 Jul23 retry fence update lost its binding';
    END IF;
  END IF;

  IF (
    SELECT retry."fencing_token"
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = c_tenant_id
      AND retry."workspace_id" = c_workspace_id
      AND retry."requested_utc_date" = c_target_date
  ) IS DISTINCT FROM -1 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 Jul23 retry fence readback diverged';
  END IF;

  SELECT count(*) INTO v_scope_count
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id;
  IF v_scope_count = 8 THEN
    SELECT count(*) INTO v_terminal_count
    FROM public."reader_summary_daily_canonical_recovery_v4_terminals_from_projection"(
      c_tenant_id, c_workspace_id
    );
    IF v_terminal_count <> 8 THEN
      RAISE EXCEPTION 'daily canonical recovery v4 Jul23 correction did not close projection';
    END IF;
  END IF;
END
$correct_reader_summary_daily_v4_jul23_retry_fence$;

RESET ROLE;
COMMIT;
