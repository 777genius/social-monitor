-- @social-monitor-forward-migration
-- The Jul25--Jul30 V4 failures are a closed, all-or-nothing remediation set.
-- It never rewrites the consumed attempt-1 history and it carries no provider
-- payload: only the fixed invalid-product category and set digest are durable.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
  ADD COLUMN "invalid_category" TEXT,
  ADD COLUMN "terminal_set_sha256" CHAR(64);

ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
  DROP CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_scope_check",
  ADD CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_scope_check" CHECK (
    "tenant_id" = UUID '00000000-0000-7000-8000-000000000901'
    AND "workspace_id" = UUID '00000000-0000-7000-8000-000000000902'
    AND "attempt_ordinal" = 2
    AND "authorized_by" = 'social_monitor_reader_summary_daily_terminal'
    AND (
      (
        "requested_utc_date" = DATE '2026-07-23'
        AND "authorization_reason" =
          'user_authorized_single_retry_after_failed_ambiguous'
        AND "invalid_category" IS NULL
        AND "terminal_set_sha256" IS NULL
      )
      OR (
        "requested_utc_date" IN (
          DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
          DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
        )
        AND "authorization_reason" = 'invalid_product_retry_set_v1'
        AND "invalid_category" = 'invalid_product'
        AND "terminal_set_sha256" ~ '^[0-9a-f]{64}$'
      )
    )
  ),
  ADD CONSTRAINT "rs_daily_v4_retry_invalid_category_check" CHECK (
    ("invalid_category" IS NULL AND "terminal_set_sha256" IS NULL)
    OR (
      "invalid_category" = 'invalid_product'
      AND "terminal_set_sha256" ~ '^[0-9a-f]{64}$'
    )
  );

CREATE OR REPLACE FUNCTION public."reject_rs_daily_recovery_v4_ambiguity_retry_identity_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry identity is immutable';
  END IF;
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
    OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
    OR NEW."requested_utc_date" IS DISTINCT FROM OLD."requested_utc_date"
    OR NEW."attempt_ordinal" IS DISTINCT FROM OLD."attempt_ordinal"
    OR NEW."supersedes_model_job_identity" IS DISTINCT FROM
      OLD."supersedes_model_job_identity"
    OR NEW."superseded_pre_model_consumed_at" IS DISTINCT FROM
      OLD."superseded_pre_model_consumed_at"
    OR NEW."superseded_running_at" IS DISTINCT FROM OLD."superseded_running_at"
    OR NEW."superseded_failed_ambiguous_at" IS DISTINCT FROM
      OLD."superseded_failed_ambiguous_at"
    OR NEW."source_authority_sha256" IS DISTINCT FROM
      OLD."source_authority_sha256"
    OR NEW."authorization_sha256" IS DISTINCT FROM OLD."authorization_sha256"
    OR NEW."authorization_reason" IS DISTINCT FROM OLD."authorization_reason"
    OR NEW."invalid_category" IS DISTINCT FROM OLD."invalid_category"
    OR NEW."terminal_set_sha256" IS DISTINCT FROM OLD."terminal_set_sha256"
    OR NEW."authorized_by" IS DISTINCT FROM OLD."authorized_by"
    OR NEW."authorized_at" IS DISTINCT FROM OLD."authorized_at"
    OR NEW."model_job_identity" IS DISTINCT FROM OLD."model_job_identity" THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry identity is immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set_sha256"()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_dates CONSTANT DATE[] := ARRAY[
    DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
    DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
  ];
  v_date DATE;
  v_original public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_lines TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH v_date IN ARRAY c_dates LOOP
    SELECT * INTO STRICT v_original
    FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = v_date
    FOR KEY SHARE;
    SELECT * INTO STRICT v_authority
    FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
    WHERE authority."tenant_id" = c_tenant_id
      AND authority."workspace_id" = c_workspace_id
      AND authority."requested_utc_date" = v_date
    FOR KEY SHARE;
    IF v_original."state" IS DISTINCT FROM 'FAILED_AMBIGUOUS'
      OR v_original."fencing_token" >= 0
      OR v_original."pre_model_consumed_at" IS NULL
      OR v_original."running_at" IS NULL
      OR v_original."failed_ambiguous_at" IS NULL
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
      OR btrim(v_original."source_authority_sha256") IS DISTINCT FROM
        btrim(v_authority."source_authority_sha256")
      OR btrim(v_authority."source_authority_sha256") IS DISTINCT FROM
        encode(sha256(v_authority."source_authority_bytes"), 'hex')
      OR btrim(v_original."model_job_identity") IS DISTINCT FROM btrim(
        public."reader_summary_daily_canonical_recovery_v4_model_identity"(
          c_tenant_id, c_workspace_id, v_date,
          v_authority."source_authority_sha256"
        )
      ) THEN
      RAISE EXCEPTION 'daily canonical recovery v4 invalid-product terminal set is invalid';
    END IF;
    v_lines := array_append(v_lines, concat_ws('|',
      to_char(v_date, 'YYYY-MM-DD'), btrim(v_original."model_job_identity"),
      btrim(v_authority."source_authority_sha256"), 'FAILED_AMBIGUOUS',
      'negative_fence', 'invalid_product'
    ));
  END LOOP;
  RETURN encode(sha256(convert_to(concat_ws(E'\n',
    'invalid-product-retry-set-v1', array_to_string(v_lines, E'\n')
  ), 'UTF8')), 'hex');
END;
$function$;

CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_invalid_product_retry_authorization_sha256"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  terminal_set_sha256 TEXT,
  original_model_job_identity TEXT,
  source_authority_sha256 TEXT
) RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog AS $function$
  SELECT encode(sha256(convert_to(concat_ws('|',
    'reader-summary-daily:v4:invalid-product-retry-set-v1',
    target_tenant_id::TEXT, target_workspace_id::TEXT,
    to_char(target_date, 'YYYY-MM-DD'), btrim(terminal_set_sha256),
    btrim(original_model_job_identity), btrim(source_authority_sha256),
    'attempt=2', 'invalid_product',
    'social_monitor_reader_summary_daily_terminal'
  ), 'UTF8')), 'hex')
$function$;

CREATE OR REPLACE FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_legacy_date CONSTANT DATE := DATE '2026-07-23';
  c_legacy_reason CONSTANT TEXT :=
    'user_authorized_single_retry_after_failed_ambiguous';
  c_invalid_reason CONSTANT TEXT := 'invalid_product_retry_set_v1';
  v_original public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_retry public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_terminal_set_sha256 TEXT;
BEGIN
  IF target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR target_date NOT IN (
      c_legacy_date, DATE '2026-07-25', DATE '2026-07-26',
      DATE '2026-07-27', DATE '2026-07-28', DATE '2026-07-29',
      DATE '2026-07-30'
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry is outside its authorized scope';
  END IF;
  SELECT * INTO STRICT v_original
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."requested_utc_date" = target_date
  FOR KEY SHARE;
  SELECT * INTO STRICT v_retry
  FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
  WHERE retry."tenant_id" = c_tenant_id
    AND retry."workspace_id" = c_workspace_id
    AND retry."requested_utc_date" = target_date
  FOR KEY SHARE;
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id
    AND authority."workspace_id" = c_workspace_id
    AND authority."requested_utc_date" = target_date
  FOR KEY SHARE;
  IF v_original."state" IS DISTINCT FROM 'FAILED_AMBIGUOUS'
    OR v_original."pre_model_consumed_at" IS DISTINCT FROM
      v_retry."superseded_pre_model_consumed_at"
    OR v_original."running_at" IS DISTINCT FROM v_retry."superseded_running_at"
    OR v_original."failed_ambiguous_at" IS DISTINCT FROM
      v_retry."superseded_failed_ambiguous_at"
    OR v_original."pre_model_consumed_at" IS NULL
    OR v_original."running_at" IS NULL
    OR v_original."failed_ambiguous_at" IS NULL
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
        c_tenant_id, c_workspace_id, target_date,
        v_authority."source_authority_sha256"
      )
    )
    OR v_retry."attempt_ordinal" <> 2
    OR v_retry."authorized_by" IS DISTINCT FROM
      'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry binding is invalid';
  END IF;

  IF target_date = c_legacy_date THEN
    IF v_original."fencing_token" <= 0
      OR v_retry."authorization_reason" IS DISTINCT FROM c_legacy_reason
      OR v_retry."invalid_category" IS NOT NULL
      OR v_retry."terminal_set_sha256" IS NOT NULL
      OR btrim(v_retry."authorization_sha256") IS DISTINCT FROM btrim(
        public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_authorization_sha256"(
          c_tenant_id, c_workspace_id, target_date, v_original."model_job_identity",
          v_authority."source_authority_sha256"
        )
      )
      OR btrim(v_retry."model_job_identity") IS DISTINCT FROM btrim(
        public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_model_identity"(
          c_tenant_id, c_workspace_id, target_date, v_authority."source_authority_sha256",
          v_original."model_job_identity", v_retry."authorization_sha256"
        )
      ) THEN
      RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry binding is invalid';
    END IF;
    RETURN TRUE;
  END IF;

  v_terminal_set_sha256 :=
    public."reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set_sha256"();
  IF v_original."fencing_token" >= 0
    OR v_retry."authorization_reason" IS DISTINCT FROM c_invalid_reason
    OR v_retry."invalid_category" IS DISTINCT FROM 'invalid_product'
    OR btrim(v_retry."terminal_set_sha256") IS DISTINCT FROM v_terminal_set_sha256
    OR btrim(v_retry."authorization_sha256") IS DISTINCT FROM btrim(
      public."reader_summary_daily_canonical_recovery_v4_invalid_product_retry_authorization_sha256"(
        c_tenant_id, c_workspace_id, target_date, v_terminal_set_sha256,
        v_original."model_job_identity", v_authority."source_authority_sha256"
      )
    )
    OR btrim(v_retry."model_job_identity") IS DISTINCT FROM btrim(
      public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_model_identity"(
        c_tenant_id, c_workspace_id, target_date, v_authority."source_authority_sha256",
        v_original."model_job_identity", v_retry."authorization_sha256"
      )
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 invalid-product retry binding is invalid';
  END IF;
  RETURN TRUE;
END;
$function$;

CREATE FUNCTION public."authorize_reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  expected_terminal_set_sha256 CHAR(64)
) RETURNS TABLE (
  requested_utc_date DATE,
  model_job_identity TEXT,
  authorization_sha256 TEXT
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_dates CONSTANT DATE[] := ARRAY[
    DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
    DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
  ];
  v_date DATE;
  v_original public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_retry public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"%ROWTYPE;
  v_retry_count INTEGER;
  v_terminal_set_sha256 TEXT;
  v_authorization_sha256 TEXT;
  v_model_job_identity TEXT;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR btrim(expected_terminal_set_sha256) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 invalid-product authorization session is invalid';
  END IF;
  -- The set hash is meaningful only for the immutable eight-day V4 plan.
  -- Check that root binding before locking its six terminal rows.
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();

  -- Lock original history, then its authority, then any superseding attempt in
  -- one date order. No partial set can race into a committed authorization.
  FOREACH v_date IN ARRAY c_dates LOOP
    SELECT * INTO STRICT v_original
    FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = v_date
    FOR UPDATE;
    SELECT * INTO STRICT v_authority
    FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
    WHERE authority."tenant_id" = c_tenant_id
      AND authority."workspace_id" = c_workspace_id
      AND authority."requested_utc_date" = v_date
    FOR KEY SHARE;
    SELECT * INTO v_retry
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = c_tenant_id
      AND retry."workspace_id" = c_workspace_id
      AND retry."requested_utc_date" = v_date
    FOR UPDATE;
  END LOOP;
  SELECT count(*)::INTEGER INTO STRICT v_retry_count
  FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
  WHERE retry."tenant_id" = c_tenant_id
    AND retry."workspace_id" = c_workspace_id
    AND retry."requested_utc_date" = ANY(c_dates);
  IF v_retry_count NOT IN (0, 6) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 invalid-product retry set is partial';
  END IF;

  v_terminal_set_sha256 :=
    public."reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set_sha256"();
  IF btrim(expected_terminal_set_sha256) IS DISTINCT FROM v_terminal_set_sha256 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 invalid-product terminal-set digest is invalid';
  END IF;

  IF v_retry_count = 6 THEN
    FOREACH v_date IN ARRAY c_dates LOOP
      PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
        c_tenant_id, c_workspace_id, v_date
      );
    END LOOP;
    RETURN QUERY
    SELECT retry."requested_utc_date", btrim(retry."model_job_identity"),
      btrim(retry."authorization_sha256")
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = c_tenant_id
      AND retry."workspace_id" = c_workspace_id
      AND retry."requested_utc_date" = ANY(c_dates)
    ORDER BY retry."requested_utc_date";
    RETURN;
  END IF;

  FOREACH v_date IN ARRAY c_dates LOOP
    SELECT * INTO STRICT v_original
    FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = v_date;
    SELECT * INTO STRICT v_authority
    FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
    WHERE authority."tenant_id" = c_tenant_id
      AND authority."workspace_id" = c_workspace_id
      AND authority."requested_utc_date" = v_date;
    PERFORM publication."id"
    FROM public."reader_summary_publications" AS publication
    WHERE publication."tenant_id" = c_tenant_id
      AND publication."workspace_id" = c_workspace_id
      AND (
        publication."requested_utc_date" = v_date
        OR (publication."period_started_at" AT TIME ZONE 'UTC')::DATE = v_date
      )
    FOR KEY SHARE;
    IF FOUND THEN
      RAISE EXCEPTION 'daily canonical recovery v4 invalid-product retry cannot supersede published history';
    END IF;
    PERFORM evidence."publication_id"
    FROM public."reader_summary_weekly_publication_evidence" AS evidence
    WHERE evidence."tenant_id" = c_tenant_id
      AND evidence."workspace_id" = c_workspace_id
      AND evidence."requested_utc_date" = v_date
    FOR KEY SHARE;
    IF FOUND THEN
      RAISE EXCEPTION 'daily canonical recovery v4 invalid-product retry cannot supersede recorded evidence';
    END IF;
    v_authorization_sha256 :=
      public."reader_summary_daily_canonical_recovery_v4_invalid_product_retry_authorization_sha256"(
        c_tenant_id, c_workspace_id, v_date, v_terminal_set_sha256,
        v_original."model_job_identity", v_authority."source_authority_sha256"
      );
    v_model_job_identity :=
      public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_model_identity"(
        c_tenant_id, c_workspace_id, v_date, v_authority."source_authority_sha256",
        v_original."model_job_identity", v_authorization_sha256
      );
    INSERT INTO public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" (
      "tenant_id", "workspace_id", "requested_utc_date", "attempt_ordinal",
      "supersedes_model_job_identity", "superseded_pre_model_consumed_at",
      "superseded_running_at", "superseded_failed_ambiguous_at",
      "source_authority_sha256", "authorization_sha256", "authorization_reason",
      "invalid_category", "terminal_set_sha256", "authorized_by", "authorized_at",
      "model_job_identity", "state"
    ) VALUES (
      c_tenant_id, c_workspace_id, v_date, 2,
      v_original."model_job_identity", v_original."pre_model_consumed_at",
      v_original."running_at", v_original."failed_ambiguous_at",
      v_authority."source_authority_sha256", v_authorization_sha256,
      'invalid_product_retry_set_v1', 'invalid_product', v_terminal_set_sha256,
      session_user, v_now, v_model_job_identity, 'AUTHORIZED'
    );
  END LOOP;
  RETURN QUERY
  SELECT retry."requested_utc_date", btrim(retry."model_job_identity"),
    btrim(retry."authorization_sha256")
  FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
  WHERE retry."tenant_id" = c_tenant_id
    AND retry."workspace_id" = c_workspace_id
    AND retry."requested_utc_date" = ANY(c_dates)
  ORDER BY retry."requested_utc_date";
END;
$function$;

-- A negative-fenced original is invisible unless its exact second attempt is
-- still executable. A finalized or negative-fenced terminal retry cannot loop.
DO $replace_reader_summary_daily_canonical_recovery_v4_negative_claim$
DECLARE
  v_definition TEXT;
  v_needle CONSTANT TEXT := $old$
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
      )$old$;
  v_replacement CONSTANT TEXT := $new$
      AND lease."state" <> 'FINALIZED'
      AND NOT (
        lease."state" = 'FAILED_AMBIGUOUS'
        AND (
          (
            lease."fencing_token" < 0
            AND (
              NOT EXISTS (
                SELECT 1
                FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
                WHERE retry."tenant_id" = lease."tenant_id"
                  AND retry."workspace_id" = lease."workspace_id"
                  AND retry."requested_utc_date" = lease."requested_utc_date"
              )
              OR EXISTS (
                SELECT 1
                FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
                WHERE retry."tenant_id" = lease."tenant_id"
                  AND retry."workspace_id" = lease."workspace_id"
                  AND retry."requested_utc_date" = lease."requested_utc_date"
                  AND (
                    retry."state" = 'FINALIZED'
                    OR (retry."state" = 'FAILED_AMBIGUOUS' AND retry."fencing_token" < 0)
                  )
              )
            )
          )
          OR (
            lease."requested_utc_date" = DATE '2026-07-23'
            AND lease."fencing_token" > 0
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
        )
      )$new$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.claim_reader_summary_daily_canonical_recovery_v4(uuid,uuid,text,timestamp with time zone)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  IF pg_catalog.length(v_definition) - pg_catalog.length(
    pg_catalog.replace(v_definition, v_needle, '')
  ) <> pg_catalog.length(v_needle)
    OR pg_catalog.strpos(v_definition, v_replacement) <> 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 negative claim rewrite target diverged';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_needle, v_replacement);
END;
$replace_reader_summary_daily_canonical_recovery_v4_negative_claim$;

CREATE OR REPLACE FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_unavailable"(
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
  c_legacy_date CONSTANT DATE := DATE '2026-07-23';
  c_legacy_model_job_identity CONSTANT TEXT :=
    '241cc317da26fe2125ccf0590f99cee9d1694c91b4a019b036c9619c61e3672a';
  c_legacy_source_authority_sha256 CONSTANT TEXT :=
    '010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb';
  v_attempt SMALLINT;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_signal_count INTEGER;
  v_invalid_product BOOLEAN;
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
  v_signal_count := pg_catalog.jsonb_array_length(v_authority."source_authority_record"->'items');
  v_invalid_product := target_date IN (
    DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
    DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
  );
  IF v_lease."fencing_token" >= 0
    OR btrim(v_lease."source_authority_sha256") IS DISTINCT FROM
      btrim(v_authority."source_authority_sha256")
    OR btrim(v_lease."model_job_identity") !~ '^[0-9a-f]{64}$'
    OR v_lease."pre_model_consumed_at" IS NULL
    OR v_lease."running_at" IS NULL
    OR v_lease."failed_ambiguous_at" IS NULL
    OR v_lease."running_at" < v_lease."pre_model_consumed_at"
    OR v_lease."failed_ambiguous_at" < v_lease."running_at"
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
    OR (NOT v_invalid_product AND v_attempt = 2 AND (
      target_date IS DISTINCT FROM c_legacy_date
      OR btrim(v_lease."model_job_identity") IS DISTINCT FROM c_legacy_model_job_identity
      OR btrim(v_lease."source_authority_sha256") IS DISTINCT FROM
        c_legacy_source_authority_sha256
      OR v_signal_count <> 342
    ))
    OR (NOT v_invalid_product AND v_attempt = 1 AND target_date NOT IN (
      c_legacy_date, DATE '2026-07-24'
    )) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 unavailable terminal is invalid';
  END IF;
  RETURN QUERY SELECT target_date,
    CASE WHEN v_invalid_product AND v_attempt = 2 THEN 'invalid_product'
      ELSE 'model_result_not_durably_persisted_after_consumed_attempt' END,
    v_signal_count, btrim(v_lease."source_authority_sha256"),
    btrim(v_lease."model_job_identity"), v_attempt;
END;
$function$;

-- The public reader performs only the terminal-role self-binding. The private
-- helper consumes one owner-only projection and never rebinds each date.
CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_terminals_from_projection"(
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
  v_count INTEGER;
BEGIN
  IF target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id THEN
    RAISE EXCEPTION 'daily canonical recovery v4 terminal projection scope is invalid';
  END IF;
  RETURN QUERY
  WITH projection AS (
    SELECT lease."requested_utc_date", lease."state" AS original_state,
      lease."fencing_token" AS original_fencing_token,
      lease."model_job_identity" AS original_model_job_identity,
      retry."attempt_ordinal" AS retry_attempt_ordinal,
      retry."state" AS retry_state,
      retry."fencing_token" AS retry_fencing_token,
      retry."authorization_reason", retry."invalid_category",
      retry."terminal_set_sha256",
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."state" ELSE lease."state" END AS effective_state,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."source_authority_sha256" ELSE lease."source_authority_sha256" END AS source_authority_sha256,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."model_job_identity" ELSE lease."model_job_identity" END AS model_job_identity,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."pre_model_consumed_at" ELSE lease."pre_model_consumed_at" END AS pre_model_consumed_at,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."running_at" ELSE lease."running_at" END AS running_at,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."failed_ambiguous_at" ELSE lease."failed_ambiguous_at" END AS failed_ambiguous_at,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."response_bytes" ELSE lease."response_bytes" END AS response_bytes,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."receipt_bytes" ELSE lease."receipt_bytes" END AS receipt_bytes,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."reader_summary_job_id" ELSE lease."reader_summary_job_id" END AS reader_summary_job_id,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."reader_summary_artifact_id" ELSE lease."reader_summary_artifact_id" END AS reader_summary_artifact_id,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."publication_id" ELSE lease."publication_id" END AS publication_id,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."publication_report_sha256" ELSE lease."publication_report_sha256" END AS report_sha256,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."publication_proof_sha256" ELSE lease."publication_proof_sha256" END AS proof_sha256,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."weekly_evidence_sha256" ELSE lease."weekly_evidence_sha256" END AS weekly_evidence_sha256,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."public_evidence_sha256" ELSE lease."public_evidence_sha256" END AS public_evidence_sha256,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL
        THEN retry."public_frontend_sha256" ELSE lease."public_frontend_sha256" END AS public_frontend_sha256,
      CASE WHEN lease."state" = 'FAILED_AMBIGUOUS' AND retry."requested_utc_date" IS NOT NULL THEN (
        retry."response_bytes" IS NULL AND retry."response_sha256" IS NULL
        AND retry."attestation" IS NULL AND retry."attestation_bytes" IS NULL
        AND retry."attestation_sha256" IS NULL AND retry."receipt_bytes" IS NULL
        AND retry."receipt_sha256" IS NULL AND retry."completed_at" IS NULL
        AND retry."reader_summary_job_id" IS NULL AND retry."reader_summary_artifact_id" IS NULL
        AND retry."publication_id" IS NULL AND retry."publication_report_sha256" IS NULL
        AND retry."publication_proof_sha256" IS NULL AND retry."weekly_evidence_sha256" IS NULL
        AND retry."public_evidence_sha256" IS NULL AND retry."public_frontend_sha256" IS NULL
        AND retry."publication_prepared_at" IS NULL AND retry."finalized_at" IS NULL
        AND retry."lease_owner" IS NULL AND retry."leased_at" IS NULL
        AND retry."lease_expires_at" IS NULL AND retry."absolute_expires_at" IS NULL
      ) ELSE (
        lease."response_bytes" IS NULL AND lease."response_sha256" IS NULL
        AND lease."attestation" IS NULL AND lease."attestation_bytes" IS NULL
        AND lease."attestation_sha256" IS NULL AND lease."receipt_bytes" IS NULL
        AND lease."receipt_sha256" IS NULL AND lease."completed_at" IS NULL
        AND lease."reader_summary_job_id" IS NULL AND lease."reader_summary_artifact_id" IS NULL
        AND lease."publication_id" IS NULL AND lease."publication_report_sha256" IS NULL
        AND lease."publication_proof_sha256" IS NULL AND lease."weekly_evidence_sha256" IS NULL
        AND lease."public_evidence_sha256" IS NULL AND lease."public_frontend_sha256" IS NULL
        AND lease."publication_prepared_at" IS NULL AND lease."finalized_at" IS NULL
        AND lease."lease_owner" IS NULL AND lease."leased_at" IS NULL
        AND lease."lease_expires_at" IS NULL AND lease."absolute_expires_at" IS NULL
      ) END AS unavailable_payload_free,
      authority."source_authority_record"
    FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    JOIN public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
      ON authority."tenant_id" = lease."tenant_id"
      AND authority."workspace_id" = lease."workspace_id"
      AND authority."requested_utc_date" = lease."requested_utc_date"
    LEFT JOIN public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
      ON retry."tenant_id" = lease."tenant_id"
      AND retry."workspace_id" = lease."workspace_id"
      AND retry."requested_utc_date" = lease."requested_utc_date"
    WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id
  )
  SELECT CASE WHEN terminal.effective_state = 'FINALIZED' THEN 'FINALIZED' ELSE 'UNAVAILABLE' END,
    terminal.requested_utc_date,
    CASE WHEN terminal.effective_state = 'FAILED_AMBIGUOUS' THEN
      CASE WHEN terminal.retry_attempt_ordinal = 2 AND terminal.requested_utc_date IN (
        DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
        DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
      ) THEN 'invalid_product'
      ELSE 'model_result_not_durably_persisted_after_consumed_attempt' END
    ELSE NULL END,
    CASE WHEN terminal.effective_state = 'FAILED_AMBIGUOUS' THEN
      pg_catalog.jsonb_array_length(terminal.source_authority_record->'items') ELSE NULL END,
    btrim(terminal.source_authority_sha256), btrim(terminal.model_job_identity),
    CASE WHEN terminal.effective_state = 'FAILED_AMBIGUOUS' THEN COALESCE(terminal.retry_attempt_ordinal, 1)::SMALLINT
      ELSE NULL END,
    CASE WHEN terminal.effective_state = 'FINALIZED' THEN terminal.reader_summary_job_id ELSE NULL END,
    CASE WHEN terminal.effective_state = 'FINALIZED' THEN terminal.reader_summary_artifact_id ELSE NULL END,
    CASE WHEN terminal.effective_state = 'FINALIZED' THEN terminal.publication_id ELSE NULL END,
    CASE WHEN terminal.effective_state = 'FINALIZED' THEN btrim(terminal.report_sha256) ELSE NULL END,
    CASE WHEN terminal.effective_state = 'FINALIZED' THEN btrim(terminal.proof_sha256) ELSE NULL END,
    CASE WHEN terminal.effective_state = 'FINALIZED' THEN btrim(terminal.weekly_evidence_sha256) ELSE NULL END,
    CASE WHEN terminal.effective_state = 'FINALIZED' THEN btrim(terminal.public_evidence_sha256) ELSE NULL END,
    CASE WHEN terminal.effective_state = 'FINALIZED' THEN btrim(terminal.public_frontend_sha256) ELSE NULL END
  FROM projection AS terminal
  WHERE (
    terminal.effective_state = 'FINALIZED'
    AND terminal.reader_summary_job_id IS NOT NULL AND terminal.reader_summary_artifact_id IS NOT NULL
    AND terminal.publication_id IS NOT NULL AND terminal.report_sha256 IS NOT NULL AND terminal.proof_sha256 IS NOT NULL
    AND terminal.weekly_evidence_sha256 IS NOT NULL AND terminal.public_evidence_sha256 IS NOT NULL
    AND terminal.public_frontend_sha256 IS NOT NULL
  ) OR (
    terminal.effective_state = 'FAILED_AMBIGUOUS'
    AND terminal.unavailable_payload_free
    AND terminal.pre_model_consumed_at IS NOT NULL AND terminal.running_at IS NOT NULL
    AND terminal.failed_ambiguous_at IS NOT NULL AND terminal.failed_ambiguous_at >= terminal.running_at
    AND pg_catalog.jsonb_typeof(terminal.source_authority_record->'items') = 'array'
    AND (
      (terminal.retry_attempt_ordinal IS NULL AND terminal.original_fencing_token < 0)
      OR (
        terminal.requested_utc_date IN (
          DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
          DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
        )
        AND terminal.retry_attempt_ordinal = 2 AND terminal.original_fencing_token < 0
        AND terminal.retry_fencing_token < 0 AND terminal.authorization_reason = 'invalid_product_retry_set_v1'
        AND terminal.invalid_category = 'invalid_product' AND terminal.terminal_set_sha256 ~ '^[0-9a-f]{64}$'
      ) OR (
        terminal.requested_utc_date = DATE '2026-07-23' AND terminal.retry_attempt_ordinal = 2
        AND terminal.retry_fencing_token < 0
        AND terminal.authorization_reason = 'user_authorized_single_retry_after_failed_ambiguous'
        AND terminal.invalid_category IS NULL AND terminal.terminal_set_sha256 IS NULL
        AND btrim(terminal.model_job_identity) =
          '241cc317da26fe2125ccf0590f99cee9d1694c91b4a019b036c9619c61e3672a'
        AND btrim(terminal.source_authority_sha256) =
          '010fd4f8da8aa2e4b332601e145e49549ff41c34b7ea498024b7449f9c827bbb'
      )
    )
  )
  ORDER BY terminal.requested_utc_date;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 8 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 terminal projection has nonterminal or invalid work';
  END IF;
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
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id THEN
    RAISE EXCEPTION 'daily canonical recovery v4 terminal read session is invalid';
  END IF;
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  RETURN QUERY
  SELECT * FROM public."reader_summary_daily_canonical_recovery_v4_terminals_from_projection"(
    c_tenant_id, c_workspace_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public."reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set_sha256"(),
  public."reader_summary_daily_canonical_recovery_v4_invalid_product_retry_authorization_sha256"(
    UUID, UUID, DATE, TEXT, TEXT, TEXT
  ),
  public."reader_summary_daily_canonical_recovery_v4_terminals_from_projection"(UUID, UUID)
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
REVOKE ALL ON FUNCTION public."authorize_reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set"(
  UUID, UUID, CHAR(64)
) FROM PUBLIC, "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."authorize_reader_summary_daily_canonical_recovery_v4_invalid_product_retry_set"(
  UUID, UUID, CHAR(64)
) TO "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_unavailable"(
  UUID, UUID, DATE
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_unavailable"(
  UUID, UUID, DATE
) TO "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_terminals"(
  UUID, UUID
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_terminals"(
  UUID, UUID
) TO "social_monitor_reader_summary_daily_terminal";

-- Preserve the Jul23 fence and extend it only to the authorized Jul25--Jul30
-- invalid-product retries. This remains row-local: ordinary V4 work is not
-- blocked merely because it shares the publisher.
DO $rewrite_publish_reader_summary_pre_evidence_invalid_product_retry_set_guard$
DECLARE
  v_definition TEXT;
  v_needle CONSTANT TEXT :=
    'AND v_job."period_started_at" = (DATE ''2026-07-23''::TIMESTAMP AT TIME ZONE ''UTC'') AND v_job."period_ended_at" = ((DATE ''2026-07-23'' + 1)::TIMESTAMP AT TIME ZONE ''UTC'') THEN';
  v_replacement CONSTANT TEXT := $guard$
AND (
  (v_job."period_started_at" = (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
    AND v_job."period_ended_at" = ((DATE '2026-07-23' + 1)::TIMESTAMP AT TIME ZONE 'UTC'))
  OR (
    v_job."period_started_at" IN (
      (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC'),
      (DATE '2026-07-26'::TIMESTAMP AT TIME ZONE 'UTC'),
      (DATE '2026-07-27'::TIMESTAMP AT TIME ZONE 'UTC'),
      (DATE '2026-07-28'::TIMESTAMP AT TIME ZONE 'UTC'),
      (DATE '2026-07-29'::TIMESTAMP AT TIME ZONE 'UTC'),
      (DATE '2026-07-30'::TIMESTAMP AT TIME ZONE 'UTC')
    )
    AND v_job."period_ended_at" = v_job."period_started_at" + INTERVAL '1 day'
    AND EXISTS (
      SELECT 1
      FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
      WHERE retry."tenant_id" = v_job."tenant_id"
        AND retry."workspace_id" = v_job."workspace_id"
        AND retry."requested_utc_date" =
          (v_job."period_started_at" AT TIME ZONE 'UTC')::DATE
        AND retry."requested_utc_date" IN (
          DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
          DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
        )
        AND retry."attempt_ordinal" = 2
        AND retry."authorization_reason" = 'invalid_product_retry_set_v1'
        AND retry."invalid_category" = 'invalid_product'
        AND btrim(retry."terminal_set_sha256") IS NOT NULL
        AND CASE
          WHEN v_artifact."quality_signals"->'githubProjectionAudit'->'recoveryV4'->>'tenantId'
                 IS NOT DISTINCT FROM retry."tenant_id"::TEXT
            AND v_artifact."quality_signals"->'githubProjectionAudit'->'recoveryV4'->>'workspaceId'
                 IS NOT DISTINCT FROM retry."workspace_id"::TEXT
            AND v_artifact."quality_signals"->'githubProjectionAudit'->'recoveryV4'->>'requestedUtcDate'
                 IS NOT DISTINCT FROM to_char(retry."requested_utc_date", 'YYYY-MM-DD')
            AND btrim(v_artifact."quality_signals"->'githubProjectionAudit'->'recoveryV4'->>'sourceAuthoritySha256')
                 IS NOT DISTINCT FROM btrim(retry."source_authority_sha256")
            AND btrim(v_artifact."quality_signals"->'githubProjectionAudit'->'recoveryV4'->>'modelJobIdentity')
                 IS NOT DISTINCT FROM btrim(retry."model_job_identity")
          THEN public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
            retry."tenant_id", retry."workspace_id", retry."requested_utc_date"
          )
          ELSE FALSE
        END
    )
  )
) THEN
$guard$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.publish_reader_summary_pre_evidence(jsonb)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  IF pg_catalog.length(v_definition) - pg_catalog.length(
    pg_catalog.replace(v_definition, v_needle, '')
  ) <> pg_catalog.length(v_needle)
    OR pg_catalog.strpos(v_definition, v_replacement) <> 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 invalid-product publisher rewrite target diverged';
  END IF;
  EXECUTE pg_catalog.replace(v_definition, v_needle, v_replacement);
END;
$rewrite_publish_reader_summary_pre_evidence_invalid_product_retry_set_guard$;

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
