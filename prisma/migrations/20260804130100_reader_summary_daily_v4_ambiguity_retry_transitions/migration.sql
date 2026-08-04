-- @social-monitor-forward-migration
-- Route only the explicitly authorized Jul23 second attempt through the V4
-- terminal state machine. Every transition locks original history first.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

-- The original date/worker/fence-only callbacks can target attempt 2 when
-- attempt 1 and 2 share a worker and fencing token. Remove those overloads
-- before installing the identity-and-ordinal fenced transition surface.
DROP FUNCTION IF EXISTS public."renew_reader_summary_daily_canonical_recovery_v4_lease"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS public."mark_reader_summary_daily_canonical_recovery_v4_running"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS public."complete_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR(64), JSONB,
  BYTEA, CHAR(64), BYTEA, CHAR(64)
);

CREATE FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_date CONSTANT DATE := DATE '2026-07-23';
  v_original public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_retry public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
BEGIN
  IF target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR target_date IS DISTINCT FROM c_date THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry is outside its authorized scope';
  END IF;
  SELECT * INTO STRICT v_original
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."requested_utc_date" = c_date
  FOR KEY SHARE;
  SELECT * INTO STRICT v_retry
  FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
  WHERE retry."tenant_id" = c_tenant_id
    AND retry."workspace_id" = c_workspace_id
    AND retry."requested_utc_date" = c_date
  FOR KEY SHARE;
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id
    AND authority."workspace_id" = c_workspace_id
    AND authority."requested_utc_date" = c_date
  FOR KEY SHARE;
  IF v_original."state" IS DISTINCT FROM 'FAILED_AMBIGUOUS'
    OR v_original."pre_model_consumed_at" IS DISTINCT FROM
      v_retry."superseded_pre_model_consumed_at"
    OR v_original."running_at" IS DISTINCT FROM v_retry."superseded_running_at"
    OR v_original."failed_ambiguous_at" IS DISTINCT FROM
      v_retry."superseded_failed_ambiguous_at"
    OR v_original."fencing_token" <= 0
    OR v_original."running_at" < v_original."pre_model_consumed_at"
    OR v_original."failed_ambiguous_at" < v_original."running_at"
    OR v_original."response_bytes" IS NOT NULL
    OR v_original."response_sha256" IS NOT NULL
    OR v_original."attestation" IS NOT NULL
    OR v_original."attestation_bytes" IS NOT NULL
    OR v_original."attestation_sha256" IS NOT NULL
    OR v_original."receipt_bytes" IS NOT NULL
    OR v_original."receipt_sha256" IS NOT NULL
    OR v_original."completed_at" IS NOT NULL
    OR v_original."reader_summary_job_id" IS NOT NULL
    OR v_original."reader_summary_artifact_id" IS NOT NULL
    OR v_original."publication_id" IS NOT NULL
    OR v_original."publication_report_sha256" IS NOT NULL
    OR v_original."publication_proof_sha256" IS NOT NULL
    OR v_original."weekly_evidence_sha256" IS NOT NULL
    OR v_original."public_evidence_sha256" IS NOT NULL
    OR v_original."public_frontend_sha256" IS NOT NULL
    OR v_original."publication_prepared_at" IS NOT NULL
    OR v_original."finalized_at" IS NOT NULL
    OR v_original."lease_owner" IS NOT NULL
    OR v_original."leased_at" IS NOT NULL
    OR v_original."lease_expires_at" IS NOT NULL
    OR v_original."absolute_expires_at" IS NOT NULL
    OR btrim(v_original."model_job_identity") IS DISTINCT FROM
      btrim(v_retry."supersedes_model_job_identity")
    OR btrim(v_original."source_authority_sha256") IS DISTINCT FROM
      btrim(v_retry."source_authority_sha256")
    OR btrim(v_authority."source_authority_sha256") IS DISTINCT FROM
      btrim(v_retry."source_authority_sha256")
    OR btrim(v_authority."source_authority_sha256") IS DISTINCT FROM encode(
      sha256(v_authority."source_authority_bytes"), 'hex'
    )
    OR btrim(v_original."model_job_identity") IS DISTINCT FROM btrim(
      public."reader_summary_daily_canonical_recovery_v4_model_identity"(
        c_tenant_id, c_workspace_id, c_date,
        v_authority."source_authority_sha256"
      )
    )
    OR v_retry."attempt_ordinal" <> 2
    OR v_retry."authorization_reason" IS DISTINCT FROM
      'user_authorized_single_retry_after_failed_ambiguous'
    OR v_retry."authorized_by" IS DISTINCT FROM
      'social_monitor_reader_summary_daily_terminal'
    OR btrim(v_retry."authorization_sha256") IS DISTINCT FROM btrim(
      public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_authorization_sha256"(
        c_tenant_id, c_workspace_id, c_date, v_original."model_job_identity",
        v_authority."source_authority_sha256"
      )
    )
    OR btrim(v_retry."model_job_identity") IS DISTINCT FROM btrim(
      public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_model_identity"(
        c_tenant_id, c_workspace_id, c_date, v_authority."source_authority_sha256",
        v_original."model_job_identity", v_retry."authorization_sha256"
      )
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry binding is invalid';
  END IF;
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public."claim_reader_summary_daily_canonical_recovery_v4"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_worker_id TEXT,
  invoked_at TIMESTAMPTZ
) RETURNS TABLE (
  outcome TEXT,
  tenant_id UUID,
  workspace_id UUID,
  requested_utc_date DATE,
  eligible_through DATE,
  ingestion_cutoff TIMESTAMPTZ,
  source_canonical_bytes BYTEA,
  source_canonical_sha256 TEXT,
  model_job_identity TEXT,
  attempt_ordinal SMALLINT,
  model_job_state TEXT,
  lease_owner TEXT,
  fencing_token BIGINT,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  absolute_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  response_bytes BYTEA,
  receipt_bytes BYTEA
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_original public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_retry public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_has_retry BOOLEAN := FALSE;
  v_selected BOOLEAN := FALSE;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR btrim(target_worker_id) = ''
    OR invoked_at < v_now - INTERVAL '5 minutes'
    OR invoked_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 claim session is invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_plans" AS plan
    WHERE plan."tenant_id" = c_tenant_id
      AND plan."workspace_id" = c_workspace_id
  ) THEN
    PERFORM public."bootstrap_reader_summary_daily_canonical_recovery_v4"();
  END IF;
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();

  FOR v_original IN
    SELECT lease.*
    FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."state" <> 'FINALIZED'
    ORDER BY lease."requested_utc_date"
    FOR UPDATE
  LOOP
    v_has_retry := FALSE;
    IF v_original."state" = 'FAILED_AMBIGUOUS' THEN
      SELECT * INTO v_retry
      FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
      WHERE retry."tenant_id" = c_tenant_id
        AND retry."workspace_id" = c_workspace_id
        AND retry."requested_utc_date" = v_original."requested_utc_date"
      FOR UPDATE;
      v_has_retry := FOUND;
      IF v_has_retry THEN
        PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
          c_tenant_id, c_workspace_id, v_original."requested_utc_date"
        );
        IF v_retry."state" = 'FINALIZED' THEN
          CONTINUE;
        END IF;
      END IF;
    ELSIF EXISTS (
      SELECT 1
      FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
      WHERE retry."tenant_id" = c_tenant_id
        AND retry."workspace_id" = c_workspace_id
        AND retry."requested_utc_date" = v_original."requested_utc_date"
    ) THEN
      RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry lost its FAILED_AMBIGUOUS original binding';
    END IF;
    v_selected := TRUE;
    EXIT;
  END LOOP;
  IF NOT v_selected THEN
    RETURN QUERY SELECT 'CAUGHT_UP', c_tenant_id, c_workspace_id,
      NULL::DATE, DATE '2026-07-30', NULL::TIMESTAMPTZ, NULL::BYTEA,
      NULL::TEXT, NULL::TEXT, NULL::SMALLINT, NULL::TEXT, NULL::TEXT,
      NULL::BIGINT,
      NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id
    AND authority."workspace_id" = c_workspace_id
    AND authority."requested_utc_date" = v_original."requested_utc_date"
  FOR KEY SHARE;

  IF v_original."state" = 'FAILED_AMBIGUOUS' THEN
    IF NOT v_has_retry THEN
      RETURN QUERY SELECT 'FAILED_AMBIGUOUS', c_tenant_id, c_workspace_id,
        v_original."requested_utc_date", DATE '2026-07-30', NULL::TIMESTAMPTZ,
        NULL::BYTEA, btrim(v_authority."source_authority_sha256"), btrim(v_original."model_job_identity"),
        1::SMALLINT, 'FAILED_AMBIGUOUS', NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ,
        NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
        NULL::BYTEA, NULL::BYTEA;
      RETURN;
    END IF;
    IF v_retry."lease_expires_at" IS NOT NULL
      AND v_retry."lease_expires_at" > v_now THEN
      RETURN QUERY SELECT 'LEASED', c_tenant_id, c_workspace_id,
        v_retry."requested_utc_date", DATE '2026-07-30', NULL::TIMESTAMPTZ,
        NULL::BYTEA, NULL::TEXT, NULL::TEXT, NULL::SMALLINT, NULL::TEXT,
        NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
        NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
      RETURN;
    END IF;
    IF v_retry."state" IN ('CONSUMED', 'RUNNING')
      AND v_retry."response_bytes" IS NULL THEN
      UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
      SET "state" = 'FAILED_AMBIGUOUS', "failed_ambiguous_at" = v_now,
        "lease_owner" = NULL, "leased_at" = NULL, "lease_expires_at" = NULL,
        "absolute_expires_at" = NULL
      WHERE retry."tenant_id" = c_tenant_id
        AND retry."workspace_id" = c_workspace_id
        AND retry."requested_utc_date" = v_retry."requested_utc_date";
      RETURN QUERY SELECT 'FAILED_AMBIGUOUS', c_tenant_id, c_workspace_id,
        v_retry."requested_utc_date", DATE '2026-07-30', NULL::TIMESTAMPTZ,
        NULL::BYTEA, btrim(v_authority."source_authority_sha256"), btrim(v_retry."model_job_identity"),
        2::SMALLINT, 'FAILED_AMBIGUOUS', NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ,
        NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
        NULL::BYTEA, NULL::BYTEA;
      RETURN;
    END IF;
    IF v_retry."state" = 'FAILED_AMBIGUOUS' THEN
      RETURN QUERY SELECT 'FAILED_AMBIGUOUS', c_tenant_id, c_workspace_id,
        v_retry."requested_utc_date", DATE '2026-07-30', NULL::TIMESTAMPTZ,
        NULL::BYTEA, btrim(v_authority."source_authority_sha256"), btrim(v_retry."model_job_identity"),
        2::SMALLINT, 'FAILED_AMBIGUOUS', NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ,
        NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
        NULL::BYTEA, NULL::BYTEA;
      RETURN;
    END IF;
    UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    SET "state" = CASE WHEN retry."state" = 'AUTHORIZED' THEN 'CONSUMED'
      ELSE retry."state" END,
      "pre_model_consumed_at" = COALESCE(retry."pre_model_consumed_at", v_now),
      "lease_owner" = target_worker_id,
      "fencing_token" = retry."fencing_token" + 1,
      "leased_at" = v_now,
      "lease_expires_at" = v_now + INTERVAL '20 minutes',
      "absolute_expires_at" = v_now + INTERVAL '7 hours'
    WHERE retry."tenant_id" = c_tenant_id
      AND retry."workspace_id" = c_workspace_id
      AND retry."requested_utc_date" = v_retry."requested_utc_date"
    RETURNING * INTO STRICT v_retry;
    RETURN QUERY SELECT 'CLAIMED', c_tenant_id, c_workspace_id,
      v_retry."requested_utc_date", DATE '2026-07-30',
      (v_authority."source_authority_record"->>'ingestionCutoff')::TIMESTAMPTZ,
      v_authority."source_authority_bytes", btrim(v_authority."source_authority_sha256"),
      btrim(v_retry."model_job_identity"),
      v_retry."attempt_ordinal",
      CASE v_retry."state"
        WHEN 'COMPLETED' THEN 'COMPLETED'
        WHEN 'PUBLICATION_PENDING' THEN 'PUBLICATION_PENDING'
        ELSE 'RESERVED'
      END,
      v_retry."lease_owner", v_retry."fencing_token", v_retry."leased_at",
      v_retry."lease_expires_at", v_retry."absolute_expires_at",
      v_retry."completed_at", v_retry."response_bytes", v_retry."receipt_bytes";
    RETURN;
  END IF;

  IF v_original."lease_expires_at" IS NOT NULL
    AND v_original."lease_expires_at" > v_now THEN
    RETURN QUERY SELECT 'LEASED', c_tenant_id, c_workspace_id,
      v_original."requested_utc_date", DATE '2026-07-30', NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::TEXT, NULL::TEXT, NULL::SMALLINT, NULL::TEXT,
      NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  IF v_original."state" IN ('CONSUMED', 'RUNNING')
    AND v_original."response_bytes" IS NULL THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    SET "state" = 'FAILED_AMBIGUOUS', "failed_ambiguous_at" = v_now,
      "lease_owner" = NULL, "leased_at" = NULL, "lease_expires_at" = NULL,
      "absolute_expires_at" = NULL
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = v_original."requested_utc_date";
    RETURN QUERY SELECT 'FAILED_AMBIGUOUS', c_tenant_id, c_workspace_id,
      v_original."requested_utc_date", DATE '2026-07-30', NULL::TIMESTAMPTZ,
      NULL::BYTEA, btrim(v_authority."source_authority_sha256"), btrim(v_original."model_job_identity"),
      1::SMALLINT, 'FAILED_AMBIGUOUS', NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  SET "state" = CASE WHEN lease."state" = 'READY' THEN 'CONSUMED' ELSE lease."state" END,
    "pre_model_consumed_at" = COALESCE(lease."pre_model_consumed_at", v_now),
    "lease_owner" = target_worker_id,
    "fencing_token" = lease."fencing_token" + 1,
    "leased_at" = v_now,
    "lease_expires_at" = v_now + INTERVAL '20 minutes',
    "absolute_expires_at" = v_now + INTERVAL '7 hours'
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."requested_utc_date" = v_original."requested_utc_date"
  RETURNING * INTO STRICT v_original;
  RETURN QUERY SELECT 'CLAIMED', c_tenant_id, c_workspace_id,
    v_original."requested_utc_date", DATE '2026-07-30',
    (v_authority."source_authority_record"->>'ingestionCutoff')::TIMESTAMPTZ,
    v_authority."source_authority_bytes", btrim(v_authority."source_authority_sha256"),
    btrim(v_original."model_job_identity"),
    1::SMALLINT,
    CASE v_original."state"
      WHEN 'COMPLETED' THEN 'COMPLETED'
      WHEN 'PUBLICATION_PENDING' THEN 'PUBLICATION_PENDING'
      ELSE 'RESERVED'
    END,
    v_original."lease_owner", v_original."fencing_token", v_original."leased_at",
    v_original."lease_expires_at", v_original."absolute_expires_at",
    v_original."completed_at", v_original."response_bytes", v_original."receipt_bytes";
END;
$function$;

CREATE OR REPLACE FUNCTION public."renew_reader_summary_daily_canonical_recovery_v4_lease"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_model_job_identity CHAR(64),
  target_attempt_ordinal SMALLINT,
  target_worker_id TEXT,
  target_fencing_token BIGINT,
  renewed_at TIMESTAMPTZ
) RETURNS TABLE (
  lease_owner TEXT,
  fencing_token BIGINT,
  leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  absolute_expires_at TIMESTAMPTZ
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_attempt SMALLINT;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR btrim(target_model_job_identity) !~ '^[0-9a-f]{64}$'
    OR target_attempt_ordinal NOT IN (1, 2)
    OR renewed_at < v_now - INTERVAL '5 minutes'
    OR renewed_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 renewal session is invalid';
  END IF;
  v_attempt := public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
    target_tenant_id, target_workspace_id, target_date
  );
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date;
  IF v_attempt = 2 THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      target_tenant_id, target_workspace_id, target_date
    );
  END IF;
  IF v_attempt IS DISTINCT FROM target_attempt_ordinal
    OR btrim(v_lease."model_job_identity") IS DISTINCT FROM
      btrim(target_model_job_identity) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 renewal has a stale attempt identity';
  END IF;
  IF v_lease."state" NOT IN ('CONSUMED', 'RUNNING', 'COMPLETED', 'PUBLICATION_PENDING')
    OR v_lease."lease_owner" IS DISTINCT FROM target_worker_id
    OR v_lease."fencing_token" IS DISTINCT FROM target_fencing_token
    OR v_now < v_lease."leased_at"
    OR v_now >= v_lease."lease_expires_at"
    OR v_now >= v_lease."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily canonical recovery v4 renewal has a stale fence';
  END IF;
  IF v_attempt = 2 THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    SET "lease_expires_at" = LEAST(
      v_now + INTERVAL '20 minutes', v_lease."absolute_expires_at"
    )
    WHERE retry."tenant_id" = target_tenant_id
      AND retry."workspace_id" = target_workspace_id
      AND retry."requested_utc_date" = target_date
      AND retry."attempt_ordinal" = target_attempt_ordinal
      AND btrim(retry."model_job_identity") = btrim(target_model_job_identity);
  ELSE
    UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    SET "lease_expires_at" = LEAST(
      v_now + INTERVAL '20 minutes', v_lease."absolute_expires_at"
    )
    WHERE lease."tenant_id" = target_tenant_id
      AND lease."workspace_id" = target_workspace_id
      AND lease."requested_utc_date" = target_date
      AND target_attempt_ordinal = 1
      AND btrim(lease."model_job_identity") = btrim(target_model_job_identity);
  END IF;
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date;
  RETURN QUERY SELECT v_lease."lease_owner", v_lease."fencing_token",
    v_lease."leased_at", v_lease."lease_expires_at", v_lease."absolute_expires_at";
END;
$function$;

CREATE OR REPLACE FUNCTION public."mark_reader_summary_daily_canonical_recovery_v4_running"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_model_job_identity CHAR(64),
  target_attempt_ordinal SMALLINT,
  target_worker_id TEXT,
  target_fencing_token BIGINT,
  started_at TIMESTAMPTZ
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_attempt SMALLINT;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR btrim(target_model_job_identity) !~ '^[0-9a-f]{64}$'
    OR target_attempt_ordinal NOT IN (1, 2)
    OR started_at < v_now - INTERVAL '5 minutes'
    OR started_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 running session is invalid';
  END IF;
  v_attempt := public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
    target_tenant_id, target_workspace_id, target_date
  );
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date;
  IF v_attempt = 2 THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      target_tenant_id, target_workspace_id, target_date
    );
  END IF;
  IF v_attempt IS DISTINCT FROM target_attempt_ordinal
    OR btrim(v_lease."model_job_identity") IS DISTINCT FROM
      btrim(target_model_job_identity) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 running transition has a stale attempt identity';
  END IF;
  IF v_lease."state" <> 'CONSUMED'
    OR v_lease."pre_model_consumed_at" IS NULL
    OR v_lease."lease_owner" IS DISTINCT FROM target_worker_id
    OR v_lease."fencing_token" IS DISTINCT FROM target_fencing_token
    OR v_now < v_lease."pre_model_consumed_at"
    OR v_now >= v_lease."lease_expires_at"
    OR v_now >= v_lease."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily canonical recovery v4 running transition has a stale fence';
  END IF;
  IF v_attempt = 2 THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    SET "state" = 'RUNNING', "running_at" = v_now
    WHERE retry."tenant_id" = target_tenant_id
      AND retry."workspace_id" = target_workspace_id
      AND retry."requested_utc_date" = target_date
      AND retry."attempt_ordinal" = target_attempt_ordinal
      AND btrim(retry."model_job_identity") = btrim(target_model_job_identity);
  ELSE
    UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    SET "state" = 'RUNNING', "running_at" = v_now
    WHERE lease."tenant_id" = target_tenant_id
      AND lease."workspace_id" = target_workspace_id
      AND lease."requested_utc_date" = target_date
      AND target_attempt_ordinal = 1
      AND btrim(lease."model_job_identity") = btrim(target_model_job_identity);
  END IF;
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public."complete_reader_summary_daily_canonical_recovery_v4"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_model_job_identity CHAR(64),
  target_attempt_ordinal SMALLINT,
  target_worker_id TEXT,
  target_fencing_token BIGINT,
  completed_at TIMESTAMPTZ,
  exact_response BYTEA,
  exact_response_sha256 CHAR(64),
  verified_attestation JSONB,
  exact_attestation_bytes BYTEA,
  exact_attestation_sha256 CHAR(64),
  exact_receipt_bytes BYTEA,
  exact_receipt_sha256 CHAR(64)
) RETURNS TABLE (db_completed_at TIMESTAMPTZ)
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_attempt SMALLINT;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
  v_response JSONB;
  v_attestation JSONB;
  v_receipt JSONB;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR btrim(target_model_job_identity) !~ '^[0-9a-f]{64}$'
    OR target_attempt_ordinal NOT IN (1, 2)
    OR completed_at < v_now - INTERVAL '5 minutes'
    OR completed_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 completion session is invalid';
  END IF;
  v_attempt := public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
    target_tenant_id, target_workspace_id, target_date
  );
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date;
  IF v_attempt = 2 THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      target_tenant_id, target_workspace_id, target_date
    );
  END IF;
  IF v_attempt IS DISTINCT FROM target_attempt_ordinal
    OR btrim(v_lease."model_job_identity") IS DISTINCT FROM
      btrim(target_model_job_identity) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 completion has a stale attempt identity';
  END IF;
  IF v_lease."state" = 'COMPLETED' THEN
    IF v_lease."response_bytes" IS DISTINCT FROM exact_response
      OR v_lease."receipt_bytes" IS DISTINCT FROM exact_receipt_bytes THEN
      RAISE EXCEPTION 'daily canonical recovery v4 completed replay bytes diverged';
    END IF;
    RETURN QUERY SELECT v_lease."completed_at";
    RETURN;
  END IF;
  IF v_lease."state" <> 'RUNNING'
    OR v_lease."pre_model_consumed_at" IS NULL
    OR v_lease."lease_owner" IS DISTINCT FROM target_worker_id
    OR v_lease."fencing_token" IS DISTINCT FROM target_fencing_token
    OR v_now < v_lease."running_at"
    OR v_now >= v_lease."lease_expires_at"
    OR v_now >= v_lease."absolute_expires_at"
    OR btrim(exact_response_sha256) IS DISTINCT FROM encode(sha256(exact_response), 'hex')
    OR btrim(exact_attestation_sha256) IS DISTINCT FROM
      encode(sha256(exact_attestation_bytes), 'hex')
    OR btrim(exact_receipt_sha256) IS DISTINCT FROM encode(sha256(exact_receipt_bytes), 'hex') THEN
    RAISE EXCEPTION 'daily canonical recovery v4 completion has a stale fence or digest';
  END IF;
  BEGIN
    v_response := convert_from(exact_response, 'UTF8')::JSONB;
    v_attestation := convert_from(exact_attestation_bytes, 'UTF8')::JSONB;
    v_receipt := convert_from(exact_receipt_bytes, 'UTF8')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'daily canonical recovery v4 output text or receipt is not JSON';
  END;
  IF jsonb_typeof(v_response) <> 'object'
    OR exact_response IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_response), 'UTF8'
    )
    OR (SELECT count(*) FROM jsonb_object_keys(v_response)) <> 12
    OR NOT (v_response ?& ARRAY[
      'headline', 'executiveSummary', 'narrativeSections', 'content', 'topStories',
      'interestHighlights', 'repeatedSignals', 'risksAndUnknowns', 'citationMap',
      'qualityFlags', 'confidence', 'noSignalReason'
    ]) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 output text is not strict canonical JSON';
  END IF;
  IF jsonb_typeof(v_attestation) <> 'object'
    OR v_attestation IS DISTINCT FROM verified_attestation
    OR exact_attestation_bytes IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_attestation), 'UTF8'
    )
    OR (SELECT count(*) FROM jsonb_object_keys(v_attestation)) <> 12
    OR NOT (v_attestation ?& ARRAY[
      'schemaVersion', 'requestId', 'purpose', 'canonicalRequestSha256', 'provider',
      'model', 'reasoningEffort', 'runtimeEngine', 'runtimePackageVersion',
      'launcherSha256', 'selectedOutputKind', 'selectedOutputSha256'
    ])
    OR v_attestation->>'purpose' IS DISTINCT FROM
      'social_monitor.reader_summary.weekly.generate'
    OR v_attestation->>'schemaVersion' IS DISTINCT FROM '1'
    OR COALESCE(v_attestation->>'requestId', '') = ''
    OR COALESCE(v_attestation->>'canonicalRequestSha256', '') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_attestation->>'launcherSha256', '') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_attestation->>'runtimePackageVersion', '') !~
      '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'
    OR v_attestation->>'provider' IS DISTINCT FROM 'codex'
    OR v_attestation->>'model' IS DISTINCT FROM 'gpt-5.6-sol'
    OR v_attestation->>'reasoningEffort' IS DISTINCT FROM 'xhigh'
    OR v_attestation->>'runtimeEngine' IS DISTINCT FROM 'subscription-runtime-cli'
    OR v_attestation->>'selectedOutputKind' IS DISTINCT FROM 'output_text'
    OR v_attestation->>'selectedOutputSha256' IS DISTINCT FROM btrim(exact_response_sha256)
  THEN
    RAISE EXCEPTION 'daily canonical recovery v4 output text attestation is invalid';
  END IF;
  IF jsonb_typeof(v_receipt) <> 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(v_receipt)) <> 8
    OR NOT (v_receipt ?& ARRAY[
      'schemaVersion', 'modelJobIdentity', 'requestedUtcDate', 'sourceAuthoritySha256',
      'responseSha256', 'responseByteLength', 'attestationSha256', 'attestation'
    ])
    OR v_receipt->>'schemaVersion' IS DISTINCT FROM '1'
    OR v_receipt->>'modelJobIdentity' IS DISTINCT FROM btrim(v_lease."model_job_identity")
    OR v_receipt->>'requestedUtcDate' IS DISTINCT FROM to_char(target_date, 'YYYY-MM-DD')
    OR v_receipt->>'sourceAuthoritySha256' IS DISTINCT FROM btrim(v_lease."source_authority_sha256")
    OR v_receipt->>'responseSha256' IS DISTINCT FROM btrim(exact_response_sha256)
    OR (v_receipt->>'responseByteLength')::INTEGER IS DISTINCT FROM
      octet_length(exact_response)
    OR v_receipt->>'attestationSha256' IS DISTINCT FROM btrim(exact_attestation_sha256)
    OR v_receipt->'attestation' IS DISTINCT FROM v_attestation
    OR exact_receipt_bytes IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_receipt), 'UTF8'
    )
  THEN
    RAISE EXCEPTION 'daily canonical recovery v4 receipt is invalid';
  END IF;
  IF v_attempt = 2 THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    SET "state" = 'COMPLETED', "completed_at" = v_now,
      "response_bytes" = exact_response, "response_sha256" = exact_response_sha256,
      "attestation" = verified_attestation, "attestation_bytes" = exact_attestation_bytes,
      "attestation_sha256" = exact_attestation_sha256,
      "receipt_bytes" = exact_receipt_bytes, "receipt_sha256" = exact_receipt_sha256
    WHERE retry."tenant_id" = target_tenant_id
      AND retry."workspace_id" = target_workspace_id
      AND retry."requested_utc_date" = target_date
      AND retry."attempt_ordinal" = target_attempt_ordinal
      AND btrim(retry."model_job_identity") = btrim(target_model_job_identity);
  ELSE
    UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    SET "state" = 'COMPLETED', "completed_at" = v_now,
      "response_bytes" = exact_response, "response_sha256" = exact_response_sha256,
      "attestation" = verified_attestation, "attestation_bytes" = exact_attestation_bytes,
      "attestation_sha256" = exact_attestation_sha256,
      "receipt_bytes" = exact_receipt_bytes, "receipt_sha256" = exact_receipt_sha256
    WHERE lease."tenant_id" = target_tenant_id
      AND lease."workspace_id" = target_workspace_id
      AND lease."requested_utc_date" = target_date
      AND target_attempt_ordinal = 1
      AND btrim(lease."model_job_identity") = btrim(target_model_job_identity);
  END IF;
  RETURN QUERY SELECT v_now;
END;
$function$;

REVOKE ALL ON FUNCTION
  public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
    UUID, UUID, DATE
  )
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
REVOKE ALL ON FUNCTION
  public."claim_reader_summary_daily_canonical_recovery_v4"(
    UUID, UUID, TEXT, TIMESTAMPTZ
  ),
  public."renew_reader_summary_daily_canonical_recovery_v4_lease"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, TIMESTAMPTZ
  ),
  public."mark_reader_summary_daily_canonical_recovery_v4_running"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, TIMESTAMPTZ
  ),
  public."complete_reader_summary_daily_canonical_recovery_v4"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, TIMESTAMPTZ,
    BYTEA, CHAR(64), JSONB, BYTEA, CHAR(64), BYTEA, CHAR(64)
  )
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION
  public."claim_reader_summary_daily_canonical_recovery_v4"(
    UUID, UUID, TEXT, TIMESTAMPTZ
  ),
  public."renew_reader_summary_daily_canonical_recovery_v4_lease"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, TIMESTAMPTZ
  ),
  public."mark_reader_summary_daily_canonical_recovery_v4_running"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, TIMESTAMPTZ
  ),
  public."complete_reader_summary_daily_canonical_recovery_v4"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, TIMESTAMPTZ,
    BYTEA, CHAR(64), JSONB, BYTEA, CHAR(64), BYTEA, CHAR(64)
  ) TO "social_monitor_reader_summary_daily_terminal";

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
