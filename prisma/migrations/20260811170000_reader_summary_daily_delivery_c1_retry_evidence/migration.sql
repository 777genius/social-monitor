-- @social-monitor-forward-migration
-- C1 needs finalized Jul25--Jul30 retry evidence without granting its runtime
-- direct access to the protected retry table. The definer validates both the
-- exact production login/capability and transaction-local tenant scope.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION public."read_reader_summary_daily_delivery_c1_retry_evidence"(
  target_tenant_id UUID,
  target_workspace_id UUID
) RETURNS TABLE (
  requested_utc_date DATE,
  attempt_ordinal SMALLINT,
  receipt_sha256 TEXT,
  reader_summary_job_id UUID,
  reader_summary_artifact_id UUID,
  publication_id UUID,
  publication_report_sha256 TEXT,
  publication_proof_sha256 TEXT,
  weekly_evidence_sha256 TEXT,
  public_evidence_sha256 TEXT,
  public_frontend_sha256 TEXT
) LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_dates CONSTANT DATE[] := ARRAY[
    DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
    DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
  ];
  v_dates DATE[];
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'on'
    OR session_user <> 'social_monitor_system_app'
    OR NOT pg_has_role(
      session_user, 'social_monitor_tenant_system_runtime', 'MEMBER'
    )
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR current_setting('social_monitor.system_access', TRUE)
      IS DISTINCT FROM 'false'
    OR current_setting('social_monitor.tenant_id', TRUE)
      IS DISTINCT FROM target_tenant_id::TEXT
    OR current_setting('social_monitor.workspace_id', TRUE)
      IS DISTINCT FROM target_workspace_id::TEXT THEN
    RAISE EXCEPTION 'daily delivery C1 retry evidence session is invalid';
  END IF;

  SELECT array_agg(retry."requested_utc_date" ORDER BY retry."requested_utc_date")
  INTO v_dates
  FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
  WHERE retry."tenant_id" = c_tenant_id
    AND retry."workspace_id" = c_workspace_id
    AND retry."requested_utc_date" = ANY(c_dates)
    AND retry."attempt_ordinal" = 2
    AND retry."state" = 'FINALIZED'
    AND retry."receipt_bytes" IS NOT NULL
    AND btrim(retry."receipt_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."receipt_sha256") =
      encode(sha256(retry."receipt_bytes"), 'hex')
    AND retry."reader_summary_job_id" IS NOT NULL
    AND retry."reader_summary_artifact_id" IS NOT NULL
    AND retry."publication_id" IS NOT NULL
    AND btrim(retry."publication_report_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."publication_proof_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."weekly_evidence_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."public_evidence_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."public_frontend_sha256") ~ '^[0-9a-f]{64}$';
  IF v_dates IS DISTINCT FROM c_dates THEN
    RAISE EXCEPTION 'daily delivery C1 retry evidence set is incomplete';
  END IF;

  RETURN QUERY
  SELECT retry."requested_utc_date", retry."attempt_ordinal",
    btrim(retry."receipt_sha256"),
    retry."reader_summary_job_id", retry."reader_summary_artifact_id",
    retry."publication_id", btrim(retry."publication_report_sha256"),
    btrim(retry."publication_proof_sha256"),
    btrim(retry."weekly_evidence_sha256"),
    btrim(retry."public_evidence_sha256"),
    btrim(retry."public_frontend_sha256")
  FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
  WHERE retry."tenant_id" = c_tenant_id
    AND retry."workspace_id" = c_workspace_id
    AND retry."requested_utc_date" = ANY(c_dates)
    AND retry."attempt_ordinal" = 2
    AND retry."state" = 'FINALIZED'
    AND retry."receipt_bytes" IS NOT NULL
    AND btrim(retry."receipt_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."receipt_sha256") =
      encode(sha256(retry."receipt_bytes"), 'hex')
    AND retry."reader_summary_job_id" IS NOT NULL
    AND retry."reader_summary_artifact_id" IS NOT NULL
    AND retry."publication_id" IS NOT NULL
    AND btrim(retry."publication_report_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."publication_proof_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."weekly_evidence_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."public_evidence_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(retry."public_frontend_sha256") ~ '^[0-9a-f]{64}$'
  ORDER BY retry."requested_utc_date";
END;
$function$;

REVOKE ALL ON FUNCTION public."read_reader_summary_daily_delivery_c1_retry_evidence"(
  UUID, UUID
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."read_reader_summary_daily_delivery_c1_retry_evidence"(
  UUID, UUID
) TO "social_monitor_tenant_system_runtime";

CREATE FUNCTION public."assert_reader_summary_daily_delivery_c1_c0_adoption"()
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_dates CONSTANT DATE[] := ARRAY[
    DATE '2026-07-25', DATE '2026-07-26', DATE '2026-07-27',
    DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
  ];
  v_dates DATE[];
BEGIN
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  WITH terminal AS (
    SELECT *
    FROM public."reader_summary_daily_canonical_recovery_v4_terminals_from_projection"(
      c_tenant_id, c_workspace_id
    )
  ), proven AS (
    SELECT terminal.requested_utc_date
    FROM terminal
    JOIN public."reader_summary_publications" AS publication
      ON publication."id" = terminal.publication_id
      AND publication."tenant_id" = c_tenant_id
      AND publication."workspace_id" = c_workspace_id
      AND publication."requested_utc_date" = terminal.requested_utc_date
      AND publication."reader_summary_job_id" = terminal.reader_summary_job_id
      AND publication."reader_summary_artifact_id" = terminal.reader_summary_artifact_id
    JOIN public."reader_summary_publication_slots" AS slot
      ON slot."current_publication_id" = publication."id"
    JOIN public."reader_summary_weekly_publication_evidence" AS evidence
      ON evidence."publication_id" = publication."id"
    JOIN public."reader_summary_jobs" AS job
      ON job."id" = publication."reader_summary_job_id"
    JOIN public."reader_summary_artifacts" AS artifact
      ON artifact."id" = publication."reader_summary_artifact_id"
    LEFT JOIN public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
      ON retry."tenant_id" = c_tenant_id
      AND retry."workspace_id" = c_workspace_id
      AND retry."requested_utc_date" = terminal.requested_utc_date
    WHERE terminal.outcome = 'FINALIZED'
      AND terminal.requested_utc_date = ANY(c_dates)
      AND publication."cadence" = 'daily'
      AND publication."semantic_status" IN ('COMPLETED', 'NO_SIGNAL')
      AND job."status" IN ('COMPLETED', 'NO_SIGNAL')
      AND artifact."status" IN ('COMPLETED', 'NO_SIGNAL')
      AND btrim(publication."report_sha256") = terminal.report_sha256
      AND btrim(publication."proof_sha256") = terminal.proof_sha256
      AND btrim(evidence."canonical_sha256") = terminal.weekly_evidence_sha256
      AND btrim(job."public_evidence_sha256") = terminal.public_evidence_sha256
      AND btrim(job."public_frontend_sha256") = terminal.public_frontend_sha256
      AND (
        retry."attempt_ordinal" = 2 AND retry."state" = 'FINALIZED'
          AND retry."receipt_bytes" IS NOT NULL
          AND btrim(retry."receipt_sha256") ~ '^[0-9a-f]{64}$'
          AND btrim(retry."receipt_sha256") =
            encode(sha256(retry."receipt_bytes"), 'hex')
          AND retry."reader_summary_job_id" = terminal.reader_summary_job_id
          AND retry."reader_summary_artifact_id" = terminal.reader_summary_artifact_id
          AND retry."publication_id" = terminal.publication_id
          AND btrim(retry."publication_report_sha256") = terminal.report_sha256
          AND btrim(retry."publication_proof_sha256") = terminal.proof_sha256
          AND btrim(retry."weekly_evidence_sha256") = terminal.weekly_evidence_sha256
          AND btrim(retry."public_evidence_sha256") = terminal.public_evidence_sha256
          AND btrim(retry."public_frontend_sha256") = terminal.public_frontend_sha256
      )
  )
  SELECT array_agg(proven.requested_utc_date ORDER BY proven.requested_utc_date)
  INTO v_dates FROM proven;
  IF v_dates IS DISTINCT FROM c_dates THEN
    RAISE EXCEPTION 'daily delivery C1 C0 publication set is incomplete';
  END IF;
  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public."assert_reader_summary_daily_delivery_c1_c0_adoption"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."assert_reader_summary_daily_delivery_c1_c0_adoption"()
TO "social_monitor_public_schema_owner";

CREATE FUNCTION public."is_reader_summary_daily_delivery_c1_jul24_adoptable"()
RETURNS BOOLEAN LANGUAGE SQL VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_terminals_from_projection"(
      '00000000-0000-7000-8000-000000000901'::UUID,
      '00000000-0000-7000-8000-000000000902'::UUID
    ) AS terminal
    JOIN public."reader_summary_publications" AS publication
      ON publication."id" = terminal.publication_id
      AND publication."tenant_id" = '00000000-0000-7000-8000-000000000901'::UUID
      AND publication."workspace_id" = '00000000-0000-7000-8000-000000000902'::UUID
      AND publication."requested_utc_date" = terminal.requested_utc_date
      AND publication."reader_summary_job_id" = terminal.reader_summary_job_id
      AND publication."reader_summary_artifact_id" = terminal.reader_summary_artifact_id
    JOIN public."reader_summary_publication_slots" AS slot
      ON slot."current_publication_id" = publication."id"
    JOIN public."reader_summary_weekly_publication_evidence" AS evidence
      ON evidence."publication_id" = publication."id"
    JOIN public."reader_summary_jobs" AS job
      ON job."id" = publication."reader_summary_job_id"
    JOIN public."reader_summary_artifacts" AS artifact
      ON artifact."id" = publication."reader_summary_artifact_id"
    WHERE terminal.requested_utc_date = DATE '2026-07-24'
      AND terminal.outcome = 'FINALIZED'
      AND publication."cadence" = 'daily'
      AND publication."semantic_status" IN ('COMPLETED', 'NO_SIGNAL')
      AND job."status" IN ('COMPLETED', 'NO_SIGNAL')
      AND artifact."status" IN ('COMPLETED', 'NO_SIGNAL')
      AND btrim(publication."report_sha256") = terminal.report_sha256
      AND btrim(publication."proof_sha256") = terminal.proof_sha256
      AND btrim(evidence."canonical_sha256") = terminal.weekly_evidence_sha256
      AND btrim(job."public_evidence_sha256") = terminal.public_evidence_sha256
      AND btrim(job."public_frontend_sha256") = terminal.public_frontend_sha256
  );
$function$;

REVOKE ALL ON FUNCTION public."is_reader_summary_daily_delivery_c1_jul24_adoptable"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."is_reader_summary_daily_delivery_c1_jul24_adoptable"()
TO "social_monitor_public_schema_owner";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

CREATE FUNCTION public."advance_reader_summary_daily_delivery_c1_cursor"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  first_unresolved_utc_date DATE,
  invoked_at TIMESTAMPTZ
) RETURNS TABLE (
  next_unresolved_utc_date DATE,
  eligible_through DATE
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_first_date CONSTANT DATE := DATE '2026-07-23';
  v_cursor public."reader_summary_daily_execution_cursors"%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR first_unresolved_utc_date IS DISTINCT FROM c_first_date
    OR current_setting('social_monitor.daily_delivery_c1_mode', TRUE)
      IS DISTINCT FROM 'exact'
    OR current_setting('social_monitor.system_access', TRUE)
      IS DISTINCT FROM 'false'
    OR current_setting('social_monitor.tenant_id', TRUE)
      IS DISTINCT FROM c_tenant_id::TEXT
    OR current_setting('social_monitor.workspace_id', TRUE)
      IS DISTINCT FROM c_workspace_id::TEXT
    OR invoked_at < transaction_timestamp() - INTERVAL '5 minutes'
    OR invoked_at > transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily delivery C1 cursor session is invalid';
  END IF;
  INSERT INTO public."reader_summary_daily_execution_cursors" (
    "tenant_id", "workspace_id", "next_unresolved_utc_date"
  ) VALUES (c_tenant_id, c_workspace_id, c_first_date)
  ON CONFLICT ON CONSTRAINT "reader_summary_daily_execution_cursors_pkey"
  DO NOTHING;
  SELECT * INTO STRICT v_cursor
  FROM public."reader_summary_daily_execution_cursors" AS cursor_row
  WHERE cursor_row."tenant_id" = c_tenant_id
    AND cursor_row."workspace_id" = c_workspace_id
  FOR UPDATE;
  IF v_cursor."next_unresolved_utc_date" < c_first_date
    OR v_cursor."active_requested_utc_date" IS NOT NULL
    OR v_cursor."lease_owner" IS NOT NULL
    OR v_cursor."leased_at" IS NOT NULL
    OR v_cursor."lease_expires_at" IS NOT NULL
    OR v_cursor."absolute_expires_at" IS NOT NULL THEN
    RAISE EXCEPTION 'daily delivery C1 cursor is outside the adoptable state';
  END IF;
  IF v_cursor."next_unresolved_utc_date" = DATE '2026-07-24'
      AND public."is_reader_summary_daily_delivery_c1_jul24_adoptable"() THEN
    PERFORM public."assert_reader_summary_daily_delivery_c1_c0_adoption"();
    UPDATE public."reader_summary_daily_execution_cursors" AS cursor_row
    SET "next_unresolved_utc_date" = DATE '2026-07-31',
      "recovery_required_at" = NULL, "updated_at" = invoked_at
    WHERE cursor_row."tenant_id" = c_tenant_id
      AND cursor_row."workspace_id" = c_workspace_id
    RETURNING * INTO STRICT v_cursor;
  ELSIF v_cursor."next_unresolved_utc_date" = DATE '2026-07-25' THEN
    PERFORM public."assert_reader_summary_daily_delivery_c1_c0_adoption"();
    UPDATE public."reader_summary_daily_execution_cursors" AS cursor_row
    SET "next_unresolved_utc_date" = DATE '2026-07-31',
      "recovery_required_at" = NULL, "updated_at" = invoked_at
    WHERE cursor_row."tenant_id" = c_tenant_id
      AND cursor_row."workspace_id" = c_workspace_id
    RETURNING * INTO STRICT v_cursor;
  ELSIF v_cursor."next_unresolved_utc_date" BETWEEN DATE '2026-07-26'
      AND DATE '2026-07-30' THEN
    RAISE EXCEPTION 'daily delivery C1 cursor is inside a partial C0 adoption';
  END IF;
  RETURN QUERY SELECT v_cursor."next_unresolved_utc_date",
    (invoked_at AT TIME ZONE 'UTC')::DATE - 1;
END;
$function$;

REVOKE ALL ON FUNCTION public."advance_reader_summary_daily_delivery_c1_cursor"(
  UUID, UUID, DATE, TIMESTAMPTZ
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."advance_reader_summary_daily_delivery_c1_cursor"(
  UUID, UUID, DATE, TIMESTAMPTZ
) TO "social_monitor_reader_summary_daily_terminal";

-- Reuse the reviewed bounded-claim body, narrowing its only permitted dates
-- to Jul23-Jul24 and adding the exact C1 transaction-local admission marker.
DO $clone_c1_legacy_claim$
DECLARE
  v_definition TEXT;
  v_original TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  v_original := v_definition;
  v_definition := replace(v_definition,
    'claim_reader_summary_daily_execution_bounded_maintenance',
    'claim_reader_summary_daily_execution_c1_legacy');
  v_definition := replace(v_definition, 'DATE ''2026-07-31''', 'DATE ''2026-07-23''');
  v_definition := replace(v_definition, 'DATE ''2026-08-03''', 'DATE ''2026-07-24''');
  v_definition := replace(v_definition,
    'OR session_user <> ''social_monitor_reader_summary_daily_terminal''',
    'OR session_user <> ''social_monitor_reader_summary_daily_terminal''
    OR current_setting(''social_monitor.daily_delivery_c1_mode'', TRUE) IS DISTINCT FROM ''exact''
    OR current_setting(''social_monitor.system_access'', TRUE) IS DISTINCT FROM ''false''
    OR current_setting(''social_monitor.tenant_id'', TRUE) IS DISTINCT FROM c_tenant_id::TEXT
    OR current_setting(''social_monitor.workspace_id'', TRUE) IS DISTINCT FROM c_workspace_id::TEXT');
  v_definition := replace(v_definition,
    'bounded daily maintenance claim session is invalid',
    'daily delivery C1 legacy claim session is invalid');
  IF v_definition = v_original
    OR v_definition NOT LIKE '%claim_reader_summary_daily_execution_c1_legacy%'
    OR v_definition NOT LIKE '%2026-07-23%'
    OR v_definition NOT LIKE '%2026-07-24%'
    OR v_definition LIKE '%2026-07-31%'
    OR v_definition LIKE '%2026-08-03%'
    OR v_definition NOT LIKE '%social_monitor.daily_delivery_c1_mode%' THEN
    RAISE EXCEPTION 'daily delivery C1 legacy claim clone is unsafe';
  END IF;
  EXECUTE v_definition;
END
$clone_c1_legacy_claim$;

REVOKE ALL ON FUNCTION public."claim_reader_summary_daily_execution_c1_legacy"(
  UUID, UUID, TEXT, DATE, TIMESTAMPTZ
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
GRANT EXECUTE ON FUNCTION public."claim_reader_summary_daily_execution_c1_legacy"(
  UUID, UUID, TEXT, DATE, TIMESTAMPTZ
) TO "social_monitor_reader_summary_daily_terminal";

REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
