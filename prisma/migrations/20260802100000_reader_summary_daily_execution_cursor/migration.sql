-- @social-monitor-forward-migration
-- Release A: dormant daily cursor authority. No existing runtime is activated here.
-- Lock risk: row locks only at runtime; migration takes ordinary DDL locks.
BEGIN;

CREATE TABLE "reader_summary_daily_execution_cursors" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "next_unresolved_utc_date" DATE NOT NULL,
  "active_requested_utc_date" DATE,
  "lease_owner" TEXT,
  "fencing_token" BIGINT NOT NULL DEFAULT 0,
  "leased_at" TIMESTAMPTZ(6),
  "lease_expires_at" TIMESTAMPTZ(6),
  "absolute_expires_at" TIMESTAMPTZ(6),
  "recovery_required_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reader_summary_daily_execution_cursors_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id"),
  CONSTRAINT "reader_summary_daily_execution_cursors_lease_check" CHECK (
    ("lease_owner" IS NULL AND "active_requested_utc_date" IS NULL
      AND "leased_at" IS NULL AND "lease_expires_at" IS NULL
      AND "absolute_expires_at" IS NULL)
    OR
    (btrim("lease_owner") <> '' AND "active_requested_utc_date" IS NOT NULL
      AND "leased_at" IS NOT NULL AND "lease_expires_at" > "leased_at"
      AND "absolute_expires_at" > "leased_at"
      AND "lease_expires_at" <= "absolute_expires_at")
  )
);

CREATE TABLE "reader_summary_daily_source_authorities" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "requested_utc_date" DATE NOT NULL,
  "ingestion_cutoff" TIMESTAMPTZ(6) NOT NULL,
  "canonical_record" JSONB NOT NULL,
  "canonical_bytes" BYTEA NOT NULL,
  "canonical_sha256" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reader_summary_daily_source_authorities_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id", "requested_utc_date"),
  CONSTRAINT "reader_summary_daily_source_authorities_sha_check"
    CHECK ("canonical_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reader_summary_daily_source_authorities_cutoff_check"
    CHECK ("created_at" = "ingestion_cutoff")
);

CREATE TABLE "reader_summary_daily_model_jobs" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "requested_utc_date" DATE NOT NULL,
  "identity" TEXT NOT NULL,
  "source_authority_sha256" CHAR(64) NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "reasoning_effort" TEXT NOT NULL,
  "runtime_engine" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "reserved_at" TIMESTAMPTZ(6) NOT NULL,
  "running_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "failed_ambiguous_at" TIMESTAMPTZ(6),
  "response_bytes" BYTEA,
  "response_sha256" CHAR(64),
  "attestation" JSONB,
  "attestation_bytes" BYTEA,
  "attestation_sha256" CHAR(64),
  "receipt_bytes" BYTEA,
  "receipt_sha256" CHAR(64),
  CONSTRAINT "reader_summary_daily_model_jobs_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id", "requested_utc_date"),
  CONSTRAINT "reader_summary_daily_model_jobs_identity_key" UNIQUE ("identity"),
  CONSTRAINT "reader_summary_daily_model_jobs_source_fkey" FOREIGN KEY
    ("tenant_id", "workspace_id", "requested_utc_date") REFERENCES
    "reader_summary_daily_source_authorities"
    ("tenant_id", "workspace_id", "requested_utc_date") ON DELETE RESTRICT,
  CONSTRAINT "reader_summary_daily_model_jobs_identity_check" CHECK (
    "provider" = 'codex' AND "model" = 'gpt-5.6-sol'
    AND "reasoning_effort" = 'xhigh'
    AND "runtime_engine" = 'subscription-runtime-cli'
    AND "source_authority_sha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "reader_summary_daily_model_jobs_state_check" CHECK (
    "state" IN ('RESERVED', 'RUNNING', 'COMPLETED', 'FAILED_AMBIGUOUS')
    AND CASE "state"
      WHEN 'RESERVED' THEN "running_at" IS NULL AND "completed_at" IS NULL
        AND "failed_ambiguous_at" IS NULL AND "receipt_bytes" IS NULL
      WHEN 'RUNNING' THEN "running_at" IS NOT NULL AND "completed_at" IS NULL
        AND "failed_ambiguous_at" IS NULL AND "receipt_bytes" IS NULL
      WHEN 'COMPLETED' THEN "running_at" IS NOT NULL AND "completed_at" IS NOT NULL
        AND "failed_ambiguous_at" IS NULL AND "response_bytes" IS NOT NULL
        AND "response_sha256" IS NOT NULL AND "attestation" IS NOT NULL
        AND "attestation_bytes" IS NOT NULL AND "attestation_sha256" IS NOT NULL
        AND "receipt_bytes" IS NOT NULL AND "receipt_sha256" IS NOT NULL
      WHEN 'FAILED_AMBIGUOUS' THEN "running_at" IS NOT NULL
        AND "failed_ambiguous_at" IS NOT NULL AND "completed_at" IS NULL
        AND "receipt_bytes" IS NULL
      ELSE FALSE
    END
  )
);

CREATE FUNCTION "reject_reader_summary_daily_source_authority_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'daily source authority is immutable';
END
$$;

CREATE TRIGGER "reader_summary_daily_source_authority_immutable"
BEFORE UPDATE OR DELETE ON "reader_summary_daily_source_authorities"
FOR EACH ROW EXECUTE FUNCTION
  "reject_reader_summary_daily_source_authority_mutation"();

CREATE FUNCTION "claim_reader_summary_daily_execution"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_worker_id TEXT,
  first_unresolved_utc_date DATE,
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
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cursor "reader_summary_daily_execution_cursors"%ROWTYPE;
  v_job "reader_summary_daily_model_jobs"%ROWTYPE;
  v_source "reader_summary_daily_source_authorities"%ROWTYPE;
  v_eligible DATE := (invoked_at AT TIME ZONE 'UTC')::DATE - 1;
  v_record JSONB;
  v_bytes BYTEA;
  v_identity TEXT;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'daily execution claim requires SERIALIZABLE';
  END IF;
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily execution claim requires the dedicated terminal login';
  END IF;
  IF btrim(target_worker_id) = '' THEN
    RAISE EXCEPTION 'daily execution worker id is required';
  END IF;
  IF invoked_at < transaction_timestamp() - INTERVAL '5 minutes'
     OR invoked_at > transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily execution invocation time is not current';
  END IF;

  INSERT INTO "reader_summary_daily_execution_cursors" (
    "tenant_id", "workspace_id", "next_unresolved_utc_date"
  ) VALUES (target_tenant_id, target_workspace_id, first_unresolved_utc_date)
  ON CONFLICT ON CONSTRAINT "reader_summary_daily_execution_cursors_pkey"
  DO NOTHING;

  SELECT * INTO STRICT v_cursor
  FROM "reader_summary_daily_execution_cursors" cursor_row
  WHERE cursor_row."tenant_id" = target_tenant_id
    AND cursor_row."workspace_id" = target_workspace_id
  FOR UPDATE;

  IF v_cursor."next_unresolved_utc_date" > v_eligible THEN
    RETURN QUERY SELECT 'CAUGHT_UP', target_tenant_id, target_workspace_id,
      NULL::DATE, v_eligible, NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::TEXT,
      NULL::TEXT, NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  IF v_eligible - v_cursor."next_unresolved_utc_date" + 1 > 7 THEN
    UPDATE "reader_summary_daily_execution_cursors" AS cursor_row
    SET "recovery_required_at" = invoked_at, "updated_at" = invoked_at
    WHERE cursor_row."tenant_id" = target_tenant_id
      AND cursor_row."workspace_id" = target_workspace_id;
    RETURN QUERY SELECT 'RECOVERY_REQUIRED', target_tenant_id,
      target_workspace_id, v_cursor."next_unresolved_utc_date", v_eligible,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;

  SELECT * INTO v_job FROM "reader_summary_daily_model_jobs" job
  WHERE job."tenant_id" = target_tenant_id
    AND job."workspace_id" = target_workspace_id
    AND job."requested_utc_date" = v_cursor."next_unresolved_utc_date"
  FOR UPDATE;
  IF FOUND AND v_job."state" = 'RUNNING'
     AND v_cursor."lease_expires_at" <= invoked_at
     AND v_job."receipt_bytes" IS NULL THEN
    UPDATE "reader_summary_daily_model_jobs" AS job_row SET
      "state" = 'FAILED_AMBIGUOUS', "failed_ambiguous_at" = invoked_at
    WHERE job_row."tenant_id" = target_tenant_id
      AND job_row."workspace_id" = target_workspace_id
      AND job_row."requested_utc_date" = v_cursor."next_unresolved_utc_date";
    UPDATE "reader_summary_daily_execution_cursors" AS cursor_row SET
      "active_requested_utc_date" = NULL, "lease_owner" = NULL,
      "leased_at" = NULL, "lease_expires_at" = NULL,
      "absolute_expires_at" = NULL, "updated_at" = invoked_at
    WHERE cursor_row."tenant_id" = target_tenant_id
      AND cursor_row."workspace_id" = target_workspace_id;
    RETURN QUERY SELECT 'FAILED_AMBIGUOUS', target_tenant_id,
      target_workspace_id, v_cursor."next_unresolved_utc_date", v_eligible,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::TEXT, 'FAILED_AMBIGUOUS',
      NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  IF FOUND AND v_job."state" = 'FAILED_AMBIGUOUS' THEN
    RETURN QUERY SELECT 'FAILED_AMBIGUOUS', target_tenant_id,
      target_workspace_id, v_cursor."next_unresolved_utc_date", v_eligible,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::TEXT, 'FAILED_AMBIGUOUS',
      NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  IF v_cursor."lease_expires_at" IS NOT NULL
     AND v_cursor."lease_expires_at" > invoked_at THEN
    RETURN QUERY SELECT 'LEASED', target_tenant_id, target_workspace_id,
      v_cursor."next_unresolved_utc_date", v_eligible, NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::TEXT, COALESCE(v_job."state", 'RESERVED'),
      NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;

  SELECT * INTO v_source FROM "reader_summary_daily_source_authorities" source
  WHERE source."tenant_id" = target_tenant_id
    AND source."workspace_id" = target_workspace_id
    AND source."requested_utc_date" = v_cursor."next_unresolved_utc_date";
  IF NOT FOUND THEN
    SELECT jsonb_build_object(
      'schemaVersion', 1,
      'tenantId', target_tenant_id::TEXT,
      'workspaceId', target_workspace_id::TEXT,
      'requestedUtcDate', to_char(v_cursor."next_unresolved_utc_date", 'YYYY-MM-DD'),
      'ingestionCutoff', to_char(invoked_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'items', COALESCE(jsonb_agg(jsonb_build_object(
        'feedItemId', feed."id"::TEXT,
        'sourceItemId', feed."source_item_id"::TEXT,
        'providerKey', feed."provider_key",
        'canonicalUrl', feed."canonical_url",
        'title', feed."title",
        'bodyPreview', feed."body_preview",
        'authorHandle', feed."author_handle",
        'publishedAt', to_char(feed."published_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'observedAt', to_char(feed."observed_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'contentHash', source_item."content_hash"
      ) ORDER BY feed."provider_key", feed."published_at", feed."id"), '[]'::JSONB)
    ) INTO v_record
    FROM "feed_items" feed
    JOIN "source_items" source_item ON source_item."id" = feed."source_item_id"
    WHERE feed."tenant_id" = target_tenant_id
      AND feed."workspace_id" = target_workspace_id
      AND feed."status" = 'VISIBLE'
      AND feed."published_at" >= v_cursor."next_unresolved_utc_date"::TIMESTAMP AT TIME ZONE 'UTC'
      AND feed."published_at" < (v_cursor."next_unresolved_utc_date" + 1)::TIMESTAMP AT TIME ZONE 'UTC'
      AND feed."observed_at" <= invoked_at
      AND source_item."created_at" <= invoked_at;
    v_bytes := convert_to(v_record::TEXT, 'UTF8');
    INSERT INTO "reader_summary_daily_source_authorities" VALUES (
      target_tenant_id, target_workspace_id, v_cursor."next_unresolved_utc_date",
      invoked_at, v_record, v_bytes, encode(sha256(v_bytes), 'hex'), invoked_at
    );
    SELECT * INTO STRICT v_source
    FROM "reader_summary_daily_source_authorities" source
    WHERE source."tenant_id" = target_tenant_id
      AND source."workspace_id" = target_workspace_id
      AND source."requested_utc_date" = v_cursor."next_unresolved_utc_date";
  END IF;

  v_identity := encode(sha256(convert_to(concat_ws('|',
    'reader-summary-daily:v1', target_tenant_id::TEXT,
    target_workspace_id::TEXT,
    to_char(v_cursor."next_unresolved_utc_date", 'YYYY-MM-DD'),
    btrim(v_source."canonical_sha256"), 'codex', 'gpt-5.6-sol', 'xhigh'
  ), 'UTF8')), 'hex');
  INSERT INTO "reader_summary_daily_model_jobs" (
    "tenant_id", "workspace_id", "requested_utc_date", "identity",
    "source_authority_sha256", "provider", "model", "reasoning_effort",
    "runtime_engine", "state", "reserved_at"
  ) VALUES (target_tenant_id, target_workspace_id,
    v_cursor."next_unresolved_utc_date", v_identity,
    v_source."canonical_sha256", 'codex', 'gpt-5.6-sol', 'xhigh',
    'subscription-runtime-cli', 'RESERVED', invoked_at)
  ON CONFLICT ON CONSTRAINT "reader_summary_daily_model_jobs_pkey" DO NOTHING;
  SELECT * INTO STRICT v_job FROM "reader_summary_daily_model_jobs" job
  WHERE job."tenant_id" = target_tenant_id
    AND job."workspace_id" = target_workspace_id
    AND job."requested_utc_date" = v_cursor."next_unresolved_utc_date"
  FOR UPDATE;
  IF v_job."identity" <> v_identity
     OR btrim(v_job."source_authority_sha256") <> btrim(v_source."canonical_sha256") THEN
    RAISE EXCEPTION 'daily model job identity conflicts with source authority';
  END IF;

  UPDATE "reader_summary_daily_execution_cursors" AS cursor_row SET
    "active_requested_utc_date" = v_cursor."next_unresolved_utc_date",
    "lease_owner" = target_worker_id,
    "fencing_token" = v_cursor."fencing_token" + 1,
    "leased_at" = invoked_at,
    "lease_expires_at" = invoked_at + INTERVAL '20 minutes',
    "absolute_expires_at" = invoked_at + INTERVAL '7 hours',
    "recovery_required_at" = NULL,
    "updated_at" = invoked_at
  WHERE cursor_row."tenant_id" = target_tenant_id
    AND cursor_row."workspace_id" = target_workspace_id
  RETURNING * INTO STRICT v_cursor;
  RETURN QUERY SELECT 'CLAIMED', target_tenant_id, target_workspace_id,
    v_cursor."next_unresolved_utc_date", v_eligible,
    v_source."ingestion_cutoff", v_source."canonical_bytes",
    btrim(v_source."canonical_sha256"), v_job."state", v_cursor."lease_owner",
    v_cursor."fencing_token", v_cursor."leased_at", v_cursor."lease_expires_at",
    v_cursor."absolute_expires_at", v_job."response_bytes", v_job."receipt_bytes";
END
$$;

CREATE FUNCTION "renew_reader_summary_daily_execution_lease"(
  target_tenant_id UUID, target_workspace_id UUID, target_date DATE,
  target_worker_id TEXT, target_fencing_token BIGINT, renewed_at TIMESTAMPTZ
)
RETURNS TABLE (lease_owner TEXT, fencing_token BIGINT, leased_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ, absolute_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_cursor "reader_summary_daily_execution_cursors"%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'daily lease renewal requires SERIALIZABLE';
  END IF;
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily lease renewal requires the dedicated terminal login';
  END IF;
  IF renewed_at < transaction_timestamp() - INTERVAL '5 minutes'
     OR renewed_at > transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily lease renewal time is not current';
  END IF;
  SELECT * INTO STRICT v_cursor FROM "reader_summary_daily_execution_cursors" c
  WHERE c."tenant_id" = target_tenant_id AND c."workspace_id" = target_workspace_id
  FOR UPDATE;
  IF v_cursor."active_requested_utc_date" <> target_date
    OR v_cursor."lease_owner" <> target_worker_id
    OR v_cursor."fencing_token" <> target_fencing_token
    OR renewed_at >= v_cursor."lease_expires_at"
    OR renewed_at >= v_cursor."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily lease renewal is stale or expired';
  END IF;
  UPDATE "reader_summary_daily_execution_cursors" SET
    "lease_expires_at" = LEAST(renewed_at + INTERVAL '20 minutes',
      v_cursor."absolute_expires_at"), "updated_at" = renewed_at
  WHERE "tenant_id" = target_tenant_id AND "workspace_id" = target_workspace_id
  RETURNING * INTO STRICT v_cursor;
  RETURN QUERY SELECT v_cursor."lease_owner", v_cursor."fencing_token",
    v_cursor."leased_at", v_cursor."lease_expires_at", v_cursor."absolute_expires_at";
END
$$;

CREATE FUNCTION "mark_reader_summary_daily_model_job_running"(
  target_tenant_id UUID, target_workspace_id UUID, target_date DATE,
  target_worker_id TEXT, target_fencing_token BIGINT, started_at TIMESTAMPTZ
)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_cursor "reader_summary_daily_execution_cursors"%ROWTYPE;
DECLARE v_state TEXT;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'daily RUNNING transition requires SERIALIZABLE';
  END IF;
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily RUNNING transition requires the dedicated terminal login';
  END IF;
  IF started_at < transaction_timestamp() - INTERVAL '5 minutes'
     OR started_at > transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily RUNNING transition time is not current';
  END IF;
  SELECT * INTO STRICT v_cursor FROM "reader_summary_daily_execution_cursors" c
  WHERE c."tenant_id" = target_tenant_id AND c."workspace_id" = target_workspace_id
  FOR UPDATE;
  IF v_cursor."active_requested_utc_date" <> target_date
    OR v_cursor."lease_owner" <> target_worker_id
    OR v_cursor."fencing_token" <> target_fencing_token
    OR started_at >= v_cursor."lease_expires_at"
    OR started_at >= v_cursor."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily RUNNING transition has a stale fence';
  END IF;
  SELECT "state" INTO STRICT v_state FROM "reader_summary_daily_model_jobs" job
  WHERE job."tenant_id" = target_tenant_id AND job."workspace_id" = target_workspace_id
    AND job."requested_utc_date" = target_date FOR UPDATE;
  IF v_state <> 'RESERVED' THEN
    RAISE EXCEPTION 'daily model job is not RESERVED';
  END IF;
  UPDATE "reader_summary_daily_model_jobs" SET "state" = 'RUNNING',
    "running_at" = started_at
  WHERE "tenant_id" = target_tenant_id AND "workspace_id" = target_workspace_id
    AND "requested_utc_date" = target_date;
  RETURN TRUE;
END
$$;

CREATE FUNCTION "complete_reader_summary_daily_model_job"(
  target_tenant_id UUID, target_workspace_id UUID, target_date DATE,
  target_worker_id TEXT, target_fencing_token BIGINT, finished_at TIMESTAMPTZ,
  exact_response BYTEA, exact_response_sha256 CHAR(64),
  verified_attestation JSONB, exact_attestation_bytes BYTEA,
  exact_attestation_sha256 CHAR(64), exact_receipt_bytes BYTEA,
  exact_receipt_sha256 CHAR(64)
)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_cursor "reader_summary_daily_execution_cursors"%ROWTYPE;
DECLARE v_job "reader_summary_daily_model_jobs"%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'daily COMPLETED transition requires SERIALIZABLE';
  END IF;
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily COMPLETED transition requires the dedicated terminal login';
  END IF;
  IF finished_at < transaction_timestamp() - INTERVAL '5 minutes'
     OR finished_at > transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily COMPLETED transition time is not current';
  END IF;
  SELECT * INTO STRICT v_cursor FROM "reader_summary_daily_execution_cursors" c
  WHERE c."tenant_id" = target_tenant_id AND c."workspace_id" = target_workspace_id
  FOR UPDATE;
  SELECT * INTO STRICT v_job FROM "reader_summary_daily_model_jobs" job
  WHERE job."tenant_id" = target_tenant_id AND job."workspace_id" = target_workspace_id
    AND job."requested_utc_date" = target_date FOR UPDATE;
  IF v_job."state" = 'COMPLETED' THEN
    IF v_job."response_bytes" <> exact_response
      OR v_job."receipt_bytes" <> exact_receipt_bytes THEN
      RAISE EXCEPTION 'daily COMPLETED replay bytes diverged';
    END IF;
    RETURN TRUE;
  END IF;
  IF v_job."state" <> 'RUNNING' OR v_cursor."active_requested_utc_date" <> target_date
    OR v_cursor."lease_owner" <> target_worker_id
    OR v_cursor."fencing_token" <> target_fencing_token
    OR finished_at >= v_cursor."lease_expires_at"
    OR finished_at >= v_cursor."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily COMPLETED transition has a stale fence or state';
  END IF;
  IF btrim(exact_response_sha256) <> encode(sha256(exact_response), 'hex')
    OR btrim(exact_attestation_sha256) <> encode(sha256(exact_attestation_bytes), 'hex')
    OR btrim(exact_receipt_sha256) <> encode(sha256(exact_receipt_bytes), 'hex')
    OR convert_from(exact_attestation_bytes, 'UTF8')::JSONB <> verified_attestation
    OR convert_from(exact_receipt_bytes, 'UTF8')::JSONB->>'modelJobIdentity'
      <> v_job."identity"
    OR convert_from(exact_receipt_bytes, 'UTF8')::JSONB->>'responseSha256'
      <> btrim(exact_response_sha256)
    OR convert_from(exact_receipt_bytes, 'UTF8')::JSONB->>'attestationSha256'
      <> btrim(exact_attestation_sha256)
    OR verified_attestation->>'provider' <> 'codex'
    OR verified_attestation->>'model' <> 'gpt-5.6-sol'
    OR verified_attestation->>'reasoningEffort' <> 'xhigh'
    OR verified_attestation->>'runtimeEngine' <> 'subscription-runtime-cli'
    OR verified_attestation->>'selectedOutputSha256' <> btrim(exact_response_sha256) THEN
    RAISE EXCEPTION 'daily response or verified attestation receipt is invalid';
  END IF;
  UPDATE "reader_summary_daily_model_jobs" SET "state" = 'COMPLETED',
    "completed_at" = finished_at, "response_bytes" = exact_response,
    "response_sha256" = exact_response_sha256, "attestation" = verified_attestation,
    "attestation_bytes" = exact_attestation_bytes,
    "attestation_sha256" = exact_attestation_sha256,
    "receipt_bytes" = exact_receipt_bytes, "receipt_sha256" = exact_receipt_sha256
  WHERE "tenant_id" = target_tenant_id AND "workspace_id" = target_workspace_id
    AND "requested_utc_date" = target_date;
  UPDATE "reader_summary_daily_execution_cursors" SET
    "next_unresolved_utc_date" = target_date + 1,
    "active_requested_utc_date" = NULL, "lease_owner" = NULL,
    "leased_at" = NULL, "lease_expires_at" = NULL,
    "absolute_expires_at" = NULL, "updated_at" = finished_at
  WHERE "tenant_id" = target_tenant_id AND "workspace_id" = target_workspace_id;
  RETURN TRUE;
END
$$;

REVOKE ALL ON TABLE "reader_summary_daily_execution_cursors",
  "reader_summary_daily_source_authorities", "reader_summary_daily_model_jobs"
FROM PUBLIC;
REVOKE ALL ON FUNCTION
  "claim_reader_summary_daily_execution"(UUID, UUID, TEXT, DATE, TIMESTAMPTZ),
  "renew_reader_summary_daily_execution_lease"(UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ),
  "mark_reader_summary_daily_model_job_running"(UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ),
  "complete_reader_summary_daily_model_job"(UUID, UUID, DATE, TEXT, BIGINT,
    TIMESTAMPTZ, BYTEA, CHAR(64), JSONB, BYTEA, CHAR(64), BYTEA, CHAR(64))
FROM PUBLIC;

DO $grant_terminal_if_present$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles
    WHERE rolname = 'social_monitor_reader_summary_daily_terminal') THEN
    GRANT USAGE ON SCHEMA public TO social_monitor_reader_summary_daily_terminal;
    GRANT EXECUTE ON FUNCTION
      "claim_reader_summary_daily_execution"(UUID, UUID, TEXT, DATE, TIMESTAMPTZ),
      "renew_reader_summary_daily_execution_lease"(UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ),
      "mark_reader_summary_daily_model_job_running"(UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ),
      "complete_reader_summary_daily_model_job"(UUID, UUID, DATE, TEXT, BIGINT,
        TIMESTAMPTZ, BYTEA, CHAR(64), JSONB, BYTEA, CHAR(64), BYTEA, CHAR(64))
    TO social_monitor_reader_summary_daily_terminal;
  END IF;
END
$grant_terminal_if_present$;

COMMIT;
