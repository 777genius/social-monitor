-- @social-monitor-forward-migration
-- Bound the one-off Jul31-Aug3 maintenance claim inside the same cursor lock
-- that freezes source authority. A stale or post-bound cursor is never claimed.
-- Lock risk: ordinary row lock on one daily cursor at runtime; DDL catalog lock only.
BEGIN;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

CREATE FUNCTION public."claim_reader_summary_daily_execution_bounded_maintenance"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_worker_id TEXT,
  expected_utc_date DATE,
  invoked_at TIMESTAMPTZ
)
RETURNS TABLE (
  outcome TEXT, tenant_id UUID, workspace_id UUID,
  requested_utc_date DATE, eligible_through DATE,
  ingestion_cutoff TIMESTAMPTZ, source_canonical_bytes BYTEA,
  source_canonical_sha256 TEXT, model_job_state TEXT,
  lease_owner TEXT, fencing_token BIGINT, leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ, absolute_expires_at TIMESTAMPTZ,
  response_bytes BYTEA, receipt_bytes BYTEA
)
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_lower_inclusive CONSTANT DATE := DATE '2026-07-31';
  c_upper_inclusive CONSTANT DATE := DATE '2026-08-03';
  v_cursor public."reader_summary_daily_execution_cursors"%ROWTYPE;
  v_job public."reader_summary_daily_model_jobs"%ROWTYPE;
  v_source public."reader_summary_daily_source_authorities"%ROWTYPE;
  v_eligible DATE := c_upper_inclusive;
  v_record JSONB;
  v_bytes BYTEA;
  v_identity TEXT;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR expected_utc_date < c_lower_inclusive
    OR expected_utc_date > c_upper_inclusive
    OR btrim(target_worker_id) = ''
    OR invoked_at < transaction_timestamp() - INTERVAL '5 minutes'
    OR invoked_at > transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'bounded daily maintenance claim session is invalid';
  END IF;

  INSERT INTO public."reader_summary_daily_execution_cursors" (
    "tenant_id", "workspace_id", "next_unresolved_utc_date"
  ) VALUES (c_tenant_id, c_workspace_id, c_lower_inclusive)
  ON CONFLICT ON CONSTRAINT "reader_summary_daily_execution_cursors_pkey"
  DO NOTHING;

  SELECT * INTO STRICT v_cursor
  FROM public."reader_summary_daily_execution_cursors" AS cursor_row
  WHERE cursor_row."tenant_id" = c_tenant_id
    AND cursor_row."workspace_id" = c_workspace_id
  FOR UPDATE;

  IF v_cursor."next_unresolved_utc_date" < c_lower_inclusive THEN
    RAISE EXCEPTION 'bounded daily maintenance cursor is below the lower bound';
  END IF;
  IF v_cursor."next_unresolved_utc_date" > c_upper_inclusive THEN
    RETURN QUERY SELECT 'BOUNDED_CAUGHT_UP', c_tenant_id, c_workspace_id,
      v_cursor."next_unresolved_utc_date", c_upper_inclusive,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  IF v_cursor."next_unresolved_utc_date" IS DISTINCT FROM expected_utc_date THEN
    RETURN QUERY SELECT 'STALE_CURSOR', c_tenant_id, c_workspace_id,
      v_cursor."next_unresolved_utc_date", c_upper_inclusive,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;

  -- This exact-date path deliberately does not call the normal timer claim.
  -- The normal claim's seven-day recovery guard remains intact for timer work;
  -- this explicitly bounded Jul31-Aug3 recovery instead preserves the same
  -- cursor fence, immutable source authority, and model-job identity rules.
  SELECT * INTO v_job
  FROM public."reader_summary_daily_model_jobs" AS job
  WHERE job."tenant_id" = c_tenant_id
    AND job."workspace_id" = c_workspace_id
    AND job."requested_utc_date" = v_cursor."next_unresolved_utc_date"
  FOR UPDATE;
  IF FOUND AND v_job."state" = 'RUNNING'
     AND v_cursor."lease_expires_at" <= invoked_at
     AND v_job."receipt_bytes" IS NULL THEN
    UPDATE public."reader_summary_daily_model_jobs" AS job_row SET
      "state" = 'FAILED_AMBIGUOUS', "failed_ambiguous_at" = invoked_at
    WHERE job_row."tenant_id" = c_tenant_id
      AND job_row."workspace_id" = c_workspace_id
      AND job_row."requested_utc_date" = v_cursor."next_unresolved_utc_date";
    UPDATE public."reader_summary_daily_execution_cursors" AS cursor_row SET
      "active_requested_utc_date" = NULL, "lease_owner" = NULL,
      "leased_at" = NULL, "lease_expires_at" = NULL,
      "absolute_expires_at" = NULL, "updated_at" = invoked_at
    WHERE cursor_row."tenant_id" = c_tenant_id
      AND cursor_row."workspace_id" = c_workspace_id;
    RETURN QUERY SELECT 'FAILED_AMBIGUOUS', c_tenant_id,
      c_workspace_id, v_cursor."next_unresolved_utc_date", v_eligible,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::TEXT, 'FAILED_AMBIGUOUS',
      NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  IF FOUND AND v_job."state" = 'FAILED_AMBIGUOUS' THEN
    RETURN QUERY SELECT 'FAILED_AMBIGUOUS', c_tenant_id,
      c_workspace_id, v_cursor."next_unresolved_utc_date", v_eligible,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::TEXT, 'FAILED_AMBIGUOUS',
      NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  IF v_cursor."lease_expires_at" IS NOT NULL
     AND v_cursor."lease_expires_at" > invoked_at THEN
    RETURN QUERY SELECT 'LEASED', c_tenant_id, c_workspace_id,
      v_cursor."next_unresolved_utc_date", v_eligible, NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::TEXT, COALESCE(v_job."state", 'RESERVED'),
      NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;

  SELECT * INTO v_source
  FROM public."reader_summary_daily_source_authorities" AS source
  WHERE source."tenant_id" = c_tenant_id
    AND source."workspace_id" = c_workspace_id
    AND source."requested_utc_date" = v_cursor."next_unresolved_utc_date";
  IF NOT FOUND THEN
    SELECT pg_catalog.jsonb_build_object(
      'schemaVersion', 1,
      'tenantId', c_tenant_id::TEXT,
      'workspaceId', c_workspace_id::TEXT,
      'requestedUtcDate', pg_catalog.to_char(
        v_cursor."next_unresolved_utc_date", 'YYYY-MM-DD'
      ),
      'ingestionCutoff', pg_catalog.to_char(
        invoked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'items', COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'feedItemId', feed."id"::TEXT,
        'sourceItemId', feed."source_item_id"::TEXT,
        'providerKey', feed."provider_key",
        'canonicalUrl', feed."canonical_url",
        'title', feed."title",
        'bodyPreview', feed."body_preview",
        'authorHandle', feed."author_handle",
        'publishedAt', pg_catalog.to_char(
          feed."published_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'observedAt', pg_catalog.to_char(
          feed."observed_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'contentHash', source_item."content_hash"
      ) ORDER BY feed."provider_key", feed."published_at", feed."id"), '[]'::JSONB)
    ) INTO v_record
    FROM public."feed_items" AS feed
    JOIN public."source_items" AS source_item ON source_item."id" = feed."source_item_id"
    WHERE feed."tenant_id" = c_tenant_id
      AND feed."workspace_id" = c_workspace_id
      AND feed."status" = 'VISIBLE'
      AND feed."published_at" >= v_cursor."next_unresolved_utc_date"::TIMESTAMP AT TIME ZONE 'UTC'
      AND feed."published_at" < (v_cursor."next_unresolved_utc_date" + 1)::TIMESTAMP AT TIME ZONE 'UTC'
      AND feed."observed_at" <= invoked_at
      AND source_item."created_at" <= invoked_at;
    v_bytes := pg_catalog.convert_to(v_record::TEXT, 'UTF8');
    INSERT INTO public."reader_summary_daily_source_authorities" VALUES (
      c_tenant_id, c_workspace_id, v_cursor."next_unresolved_utc_date",
      invoked_at, v_record, v_bytes,
      pg_catalog.encode(pg_catalog.sha256(v_bytes), 'hex'), invoked_at
    );
    SELECT * INTO STRICT v_source
    FROM public."reader_summary_daily_source_authorities" AS source
    WHERE source."tenant_id" = c_tenant_id
      AND source."workspace_id" = c_workspace_id
      AND source."requested_utc_date" = v_cursor."next_unresolved_utc_date";
  END IF;

  v_identity := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.concat_ws('|',
      'reader-summary-daily:v1', c_tenant_id::TEXT,
      c_workspace_id::TEXT,
      pg_catalog.to_char(v_cursor."next_unresolved_utc_date", 'YYYY-MM-DD'),
      pg_catalog.btrim(v_source."canonical_sha256"), 'codex', 'gpt-5.6-sol', 'xhigh'
    ), 'UTF8'
  )), 'hex');
  INSERT INTO public."reader_summary_daily_model_jobs" (
    "tenant_id", "workspace_id", "requested_utc_date", "identity",
    "source_authority_sha256", "provider", "model", "reasoning_effort",
    "runtime_engine", "state", "reserved_at"
  ) VALUES (
    c_tenant_id, c_workspace_id, v_cursor."next_unresolved_utc_date",
    v_identity, v_source."canonical_sha256", 'codex', 'gpt-5.6-sol', 'xhigh',
    'subscription-runtime-cli', 'RESERVED', invoked_at
  ) ON CONFLICT ON CONSTRAINT "reader_summary_daily_model_jobs_pkey" DO NOTHING;
  SELECT * INTO STRICT v_job
  FROM public."reader_summary_daily_model_jobs" AS job
  WHERE job."tenant_id" = c_tenant_id
    AND job."workspace_id" = c_workspace_id
    AND job."requested_utc_date" = v_cursor."next_unresolved_utc_date"
  FOR UPDATE;
  IF v_job."identity" <> v_identity
     OR pg_catalog.btrim(v_job."source_authority_sha256") <>
       pg_catalog.btrim(v_source."canonical_sha256") THEN
    RAISE EXCEPTION 'daily model job identity conflicts with source authority';
  END IF;

  UPDATE public."reader_summary_daily_execution_cursors" AS cursor_row SET
    "active_requested_utc_date" = v_cursor."next_unresolved_utc_date",
    "lease_owner" = target_worker_id,
    "fencing_token" = v_cursor."fencing_token" + 1,
    "leased_at" = invoked_at,
    "lease_expires_at" = invoked_at + INTERVAL '20 minutes',
    "absolute_expires_at" = invoked_at + INTERVAL '7 hours',
    "recovery_required_at" = NULL,
    "updated_at" = invoked_at
  WHERE cursor_row."tenant_id" = c_tenant_id
    AND cursor_row."workspace_id" = c_workspace_id
  RETURNING * INTO STRICT v_cursor;
  RETURN QUERY SELECT 'CLAIMED', c_tenant_id, c_workspace_id,
    v_cursor."next_unresolved_utc_date", v_eligible,
    v_source."ingestion_cutoff", v_source."canonical_bytes",
    pg_catalog.btrim(v_source."canonical_sha256"), v_job."state",
    v_cursor."lease_owner", v_cursor."fencing_token", v_cursor."leased_at",
    v_cursor."lease_expires_at", v_cursor."absolute_expires_at",
    v_job."response_bytes", v_job."receipt_bytes";
END;
$function$;

REVOKE ALL ON FUNCTION public."claim_reader_summary_daily_execution_bounded_maintenance"(
  UUID, UUID, TEXT, DATE, TIMESTAMPTZ
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
GRANT EXECUTE ON FUNCTION public."claim_reader_summary_daily_execution_bounded_maintenance"(
  UUID, UUID, TEXT, DATE, TIMESTAMPTZ
) TO "social_monitor_reader_summary_daily_terminal";

RESET ROLE;
COMMIT;
