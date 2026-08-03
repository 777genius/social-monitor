-- @social-monitor-forward-migration
-- V4 runtime state transitions. All state changes are serializable, row-fenced,
-- SECURITY DEFINER procedures; the terminal gets no direct table privileges.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION public."claim_reader_summary_daily_canonical_recovery_v4"(
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
  v_lease public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
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
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  SELECT lease.* INTO v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."state" <> 'FINALIZED'
  ORDER BY lease."requested_utc_date"
  LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'CAUGHT_UP', c_tenant_id, c_workspace_id,
      NULL::DATE, DATE '2026-07-30', NULL::TIMESTAMPTZ, NULL::BYTEA,
      NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::BIGINT,
      NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id
    AND authority."workspace_id" = c_workspace_id
    AND authority."requested_utc_date" = v_lease."requested_utc_date"
  FOR KEY SHARE;
  IF v_lease."lease_expires_at" IS NOT NULL
    AND v_lease."lease_expires_at" > v_now THEN
    RETURN QUERY SELECT 'LEASED', c_tenant_id, c_workspace_id,
      v_lease."requested_utc_date", DATE '2026-07-30', NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
      NULL::BIGINT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  -- A consumed/running call whose exact response never reached the DB is
  -- intentionally ambiguous. It is terminal instead of retrying a subscription.
  IF v_lease."state" IN ('CONSUMED', 'RUNNING')
    AND v_lease."response_bytes" IS NULL THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    SET "state" = 'FAILED_AMBIGUOUS', "failed_ambiguous_at" = v_now,
      "lease_owner" = NULL, "leased_at" = NULL, "lease_expires_at" = NULL,
      "absolute_expires_at" = NULL
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND lease."requested_utc_date" = v_lease."requested_utc_date";
    RETURN QUERY SELECT 'FAILED_AMBIGUOUS', c_tenant_id, c_workspace_id,
      v_lease."requested_utc_date", DATE '2026-07-30', NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::TEXT, btrim(v_lease."model_job_identity"),
      'FAILED_AMBIGUOUS', NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ,
      NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::BYTEA;
    RETURN;
  END IF;
  IF v_lease."state" = 'FAILED_AMBIGUOUS' THEN
    RETURN QUERY SELECT 'FAILED_AMBIGUOUS', c_tenant_id, c_workspace_id,
      v_lease."requested_utc_date", DATE '2026-07-30', NULL::TIMESTAMPTZ,
      NULL::BYTEA, NULL::TEXT, btrim(v_lease."model_job_identity"),
      'FAILED_AMBIGUOUS', NULL::TEXT, NULL::BIGINT, NULL::TIMESTAMPTZ,
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
    AND lease."requested_utc_date" = v_lease."requested_utc_date"
  RETURNING * INTO STRICT v_lease;
  RETURN QUERY SELECT 'CLAIMED', c_tenant_id, c_workspace_id,
    v_lease."requested_utc_date", DATE '2026-07-30',
    (v_authority."source_authority_record"->>'ingestionCutoff')::TIMESTAMPTZ,
    v_authority."source_authority_bytes", btrim(v_authority."source_authority_sha256"),
    btrim(v_lease."model_job_identity"),
    CASE v_lease."state"
      WHEN 'COMPLETED' THEN 'COMPLETED'
      WHEN 'PUBLICATION_PENDING' THEN 'PUBLICATION_PENDING'
      ELSE 'RESERVED'
    END,
    v_lease."lease_owner", v_lease."fencing_token", v_lease."leased_at",
    v_lease."lease_expires_at", v_lease."absolute_expires_at",
    v_lease."completed_at", v_lease."response_bytes", v_lease."receipt_bytes";
END;
$function$;

CREATE FUNCTION public."complete_reader_summary_daily_canonical_recovery_v4"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
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
  v_lease public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_response JSONB;
  v_attestation JSONB;
  v_receipt JSONB;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR completed_at < v_now - INTERVAL '5 minutes'
    OR completed_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 completion session is invalid';
  END IF;
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date
  FOR UPDATE;
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
  UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  SET "state" = 'COMPLETED', "completed_at" = v_now,
    "response_bytes" = exact_response, "response_sha256" = exact_response_sha256,
    "attestation" = verified_attestation, "attestation_bytes" = exact_attestation_bytes,
    "attestation_sha256" = exact_attestation_sha256,
    "receipt_bytes" = exact_receipt_bytes, "receipt_sha256" = exact_receipt_sha256
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date;
  RETURN QUERY SELECT v_now;
END;
$function$;

CREATE FUNCTION public."renew_reader_summary_daily_canonical_recovery_v4_lease"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
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
  v_lease public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR renewed_at < v_now - INTERVAL '5 minutes'
    OR renewed_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 renewal session is invalid';
  END IF;
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date FOR UPDATE;
  IF v_lease."state" NOT IN ('CONSUMED', 'RUNNING', 'COMPLETED', 'PUBLICATION_PENDING')
    OR v_lease."lease_owner" IS DISTINCT FROM target_worker_id
    OR v_lease."fencing_token" IS DISTINCT FROM target_fencing_token
    OR v_now < v_lease."leased_at"
    OR v_now >= v_lease."lease_expires_at"
    OR v_now >= v_lease."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily canonical recovery v4 renewal has a stale fence';
  END IF;
  UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  SET "lease_expires_at" = LEAST(
    v_now + INTERVAL '20 minutes', v_lease."absolute_expires_at"
  )
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date
  RETURNING * INTO STRICT v_lease;
  RETURN QUERY SELECT v_lease."lease_owner", v_lease."fencing_token",
    v_lease."leased_at", v_lease."lease_expires_at", v_lease."absolute_expires_at";
END;
$function$;

CREATE FUNCTION public."mark_reader_summary_daily_canonical_recovery_v4_running"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_worker_id TEXT,
  target_fencing_token BIGINT,
  started_at TIMESTAMPTZ
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_lease public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR started_at < v_now - INTERVAL '5 minutes'
    OR started_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 running session is invalid';
  END IF;
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date FOR UPDATE;
  IF v_lease."state" <> 'CONSUMED'
    OR v_lease."pre_model_consumed_at" IS NULL
    OR v_lease."lease_owner" IS DISTINCT FROM target_worker_id
    OR v_lease."fencing_token" IS DISTINCT FROM target_fencing_token
    OR v_now < v_lease."pre_model_consumed_at"
    OR v_now >= v_lease."lease_expires_at"
    OR v_now >= v_lease."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily canonical recovery v4 running transition has a stale fence';
  END IF;
  UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  SET "state" = 'RUNNING', "running_at" = v_now
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date;
  RETURN TRUE;
END;
$function$;

-- One role-gated predicate validates the closed V2 provenance record. The
-- artifact repository calls it before RUNNING; prepare/final publication calls
-- the same predicate again after loading the persisted audit.
CREATE FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  supplied_audit JSONB,
  target_artifact_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_artifact public."reader_summary_artifacts"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_lease public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_audit JSONB;
  v_recovery JSONB;
  v_projection JSONB;
  v_response JSONB;
  v_receipt JSONB;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS capability ON capability.oid = membership.roleid
      JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
      WHERE capability.rolname = 'social_monitor_tenant_system_runtime'
        AND member.rolname = session_user
        AND NOT membership.admin_option
        AND membership.inherit_option
        AND NOT membership.set_option
    )
    OR (target_artifact_id IS NOT NULL AND supplied_audit IS NOT NULL) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 provenance session is invalid';
  END IF;

  IF target_artifact_id IS NOT NULL THEN
    SELECT * INTO STRICT v_artifact
    FROM public."reader_summary_artifacts"
    WHERE "id" = target_artifact_id
    FOR KEY SHARE;
    target_tenant_id := v_artifact."tenant_id";
    target_workspace_id := v_artifact."workspace_id";
    target_date := (v_artifact."period_started_at" AT TIME ZONE 'UTC')::DATE;
    v_audit := v_artifact."quality_signals"->'githubProjectionAudit';
    IF v_artifact."scope_type" IS DISTINCT FROM 'workspace'
      OR v_artifact."scope_key" IS DISTINCT FROM 'workspace'
      OR v_artifact."interest_id" IS NOT NULL
      OR v_artifact."cadence" IS DISTINCT FROM 'daily'
      OR v_artifact."period_timezone" IS DISTINCT FROM 'UTC'
      OR v_artifact."period_started_at" IS DISTINCT FROM
        (target_date::TIMESTAMP AT TIME ZONE 'UTC')
      OR v_artifact."period_ended_at" IS DISTINCT FROM
        ((target_date + 1)::TIMESTAMP AT TIME ZONE 'UTC')
      OR v_artifact."period_key" IS DISTINCT FROM format(
        'daily:%sT00:00:00.000Z:%sT00:00:00.000Z:UTC',
        to_char(target_date, 'YYYY-MM-DD'),
        to_char(target_date + 1, 'YYYY-MM-DD')
      ) THEN
      RAISE EXCEPTION 'daily canonical recovery v4 artifact scope is invalid';
    END IF;
  ELSE
    v_audit := supplied_audit;
  END IF;

  SELECT * INTO v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities"
  WHERE "tenant_id" = target_tenant_id
    AND "workspace_id" = target_workspace_id
    AND "requested_utc_date" = target_date
  FOR KEY SHARE;
  IF NOT FOUND THEN
    IF target_artifact_id IS NOT NULL THEN
      RAISE EXCEPTION 'daily canonical recovery v4 artifact is outside immutable authority';
    END IF;
    RETURN NULL;
  END IF;
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_leases"
  WHERE "tenant_id" = target_tenant_id
    AND "workspace_id" = target_workspace_id
    AND "requested_utc_date" = target_date
  FOR KEY SHARE;

  v_recovery := v_audit->'recoveryV4';
  v_projection := v_authority."source_authority_record"->'githubProjection';
  IF jsonb_typeof(v_audit) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_recovery) IS DISTINCT FROM 'object'
    OR jsonb_object_length(v_recovery) <> 13
    OR NOT (v_recovery ?& ARRAY[
      'schemaVersion', 'recoveryVersion', 'selectedOutputKind',
      'sourceAuthoritySchemaVersion', 'tenantId', 'workspaceId',
      'requestedUtcDate', 'ingestionCutoff', 'sourceAuthoritySha256',
      'modelJobIdentity', 'outputTextSha256', 'outputTextByteLength',
      'githubProjectionSha256'
    ])
    OR v_recovery->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.daily_canonical_recovery_provenance.v2'
    OR v_recovery->>'recoveryVersion' IS DISTINCT FROM
      'reader_summary.daily_canonical_recovery.v4'
    OR v_recovery->>'selectedOutputKind' IS DISTINCT FROM 'output_text'
    OR v_recovery->>'sourceAuthoritySchemaVersion' IS DISTINCT FROM '2'
    OR v_recovery->>'tenantId' IS DISTINCT FROM target_tenant_id::TEXT
    OR v_recovery->>'workspaceId' IS DISTINCT FROM target_workspace_id::TEXT
    OR v_recovery->>'requestedUtcDate' IS DISTINCT FROM to_char(target_date, 'YYYY-MM-DD')
    OR v_recovery->>'ingestionCutoff' IS DISTINCT FROM
      v_authority."source_authority_record"->>'ingestionCutoff'
    OR btrim(v_recovery->>'sourceAuthoritySha256') IS DISTINCT FROM
      btrim(v_authority."source_authority_sha256")
    OR btrim(v_recovery->>'modelJobIdentity') IS DISTINCT FROM
      btrim(v_lease."model_job_identity")
    OR btrim(v_recovery->>'outputTextSha256') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_recovery->>'outputTextByteLength', '') !~ '^[1-9][0-9]*$'
    OR btrim(v_recovery->>'githubProjectionSha256') IS DISTINCT FROM encode(
      sha256(convert_to(public."reader_summary_weekly_canonical_json"(v_projection), 'UTF8')),
      'hex'
    )
    OR v_lease."response_bytes" IS NULL
    OR v_lease."receipt_bytes" IS NULL
    OR btrim(v_recovery->>'outputTextSha256') IS DISTINCT FROM
      encode(sha256(v_lease."response_bytes"), 'hex')
    OR (v_recovery->>'outputTextByteLength')::INTEGER IS DISTINCT FROM
      octet_length(v_lease."response_bytes")
    OR v_lease."state" NOT IN ('COMPLETED', 'PUBLICATION_PENDING', 'FINALIZED') THEN
    RAISE EXCEPTION 'daily canonical recovery v4 provenance is invalid';
  END IF;

  BEGIN
    v_response := convert_from(v_lease."response_bytes", 'UTF8')::JSONB;
    v_receipt := convert_from(v_lease."receipt_bytes", 'UTF8')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'daily canonical recovery v4 output_text or receipt is invalid';
  END;
  IF jsonb_typeof(v_response) IS DISTINCT FROM 'object'
    OR v_lease."response_bytes" IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_response), 'UTF8'
    )
    OR jsonb_object_length(v_response) <> 12
    OR NOT (v_response ?& ARRAY[
      'headline', 'executiveSummary', 'narrativeSections', 'content', 'topStories',
      'interestHighlights', 'repeatedSignals', 'risksAndUnknowns', 'citationMap',
      'qualityFlags', 'confidence', 'noSignalReason'
    ])
    OR jsonb_typeof(v_receipt) IS DISTINCT FROM 'object'
    OR jsonb_object_length(v_receipt) <> 8
    OR NOT (v_receipt ?& ARRAY[
      'schemaVersion', 'modelJobIdentity', 'requestedUtcDate', 'sourceAuthoritySha256',
      'responseSha256', 'responseByteLength', 'attestationSha256', 'attestation'
    ])
    OR v_receipt->>'schemaVersion' IS DISTINCT FROM '1'
    OR v_receipt->>'modelJobIdentity' IS DISTINCT FROM v_recovery->>'modelJobIdentity'
    OR v_receipt->>'requestedUtcDate' IS DISTINCT FROM v_recovery->>'requestedUtcDate'
    OR v_receipt->>'sourceAuthoritySha256' IS DISTINCT FROM v_recovery->>'sourceAuthoritySha256'
    OR v_receipt->>'responseSha256' IS DISTINCT FROM v_recovery->>'outputTextSha256'
    OR v_receipt->>'responseByteLength' IS DISTINCT FROM v_recovery->>'outputTextByteLength'
    OR v_receipt->'attestation'->>'selectedOutputKind' IS DISTINCT FROM 'output_text'
    OR v_receipt->'attestation'->>'selectedOutputSha256' IS DISTINCT FROM
      v_recovery->>'outputTextSha256' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 output_text provenance diverged';
  END IF;

  IF v_projection->>'mode' = 'checked_at_collection_anchor' THEN
    IF jsonb_object_length(v_audit) <> 11
      OR v_audit->>'schemaVersion' IS DISTINCT FROM 'reader_summary.github_projection.v1'
      OR v_audit->>'status' IS DISTINCT FROM 'verified'
      OR v_audit->>'requestedUtcDay' IS DISTINCT FROM to_char(target_date, 'YYYY-MM-DD')
      OR v_audit->>'pageCount' IS DISTINCT FROM v_projection->>'pageCount'
      OR v_audit->>'scannedItemCount' IS DISTINCT FROM
        jsonb_array_length(v_projection->'items')::TEXT
      OR v_audit->'eligibleBindingIds' IS DISTINCT FROM v_projection->'eligibleBindingIds'
      OR v_audit->>'observedThrough' IS DISTINCT FROM v_recovery->>'ingestionCutoff'
      OR v_audit->'bindings' IS DISTINCT FROM '[]'::JSONB
      OR v_audit->'violationCodes' IS DISTINCT FROM '[]'::JSONB
      OR v_audit->'reasons' IS DISTINCT FROM '[]'::JSONB
      OR v_audit->'recoveryV4' IS DISTINCT FROM v_recovery THEN
      RAISE EXCEPTION 'daily canonical recovery v4 checked-at audit is invalid';
    END IF;
  ELSIF v_projection->>'mode' = 'historical_omission' THEN
    IF target_date NOT IN (DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-30')
      OR jsonb_object_length(v_audit) <> 11
      OR v_audit->>'schemaVersion' IS DISTINCT FROM 'reader_summary.github_projection.v1'
      OR v_audit->>'status' IS DISTINCT FROM 'not_required'
      OR v_audit->>'requestedUtcDay' IS DISTINCT FROM to_char(target_date, 'YYYY-MM-DD')
      OR v_audit->>'pageCount' IS DISTINCT FROM '0'
      OR v_audit->>'scannedItemCount' IS DISTINCT FROM '0'
      OR v_audit->'eligibleBindingIds' IS DISTINCT FROM '[]'::JSONB
      OR v_audit->'historicalOmission'->>'mode' IS DISTINCT FROM
        'github_projection_unavailable_historical'
      OR v_audit->'historicalOmission'->>'reason' IS DISTINCT FROM v_projection->>'reason'
      OR v_audit->'historicalOmission'->>'authorizedAt' IS DISTINCT FROM
        v_recovery->>'ingestionCutoff'
      OR v_audit->'bindings' IS DISTINCT FROM '[]'::JSONB
      OR v_audit->'violationCodes' IS DISTINCT FROM '[]'::JSONB
      OR v_audit->'reasons' IS DISTINCT FROM '[]'::JSONB
      OR v_audit->'recoveryV4' IS DISTINCT FROM v_recovery THEN
      RAISE EXCEPTION 'daily canonical recovery v4 historical omission audit is invalid';
    END IF;
  ELSE
    RAISE EXCEPTION 'daily canonical recovery v4 projection mode is invalid';
  END IF;
  RETURN TRUE;
END;
$function$;

CREATE FUNCTION public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_worker_id TEXT,
  target_fencing_token BIGINT,
  target_job_id UUID,
  target_artifact_id UUID,
  target_publication_id UUID,
  target_report_sha256 CHAR(64),
  target_proof_sha256 CHAR(64),
  target_weekly_evidence_sha256 CHAR(64),
  target_public_evidence_sha256 CHAR(64),
  target_public_frontend_sha256 CHAR(64)
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_lease public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_publication RECORD;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS capability ON capability.oid = membership.roleid
      JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
      WHERE capability.rolname = 'social_monitor_tenant_system_runtime'
        AND member.rolname = session_user
        AND NOT membership.admin_option
        AND membership.inherit_option
        AND NOT membership.set_option
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication session is invalid';
  END IF;
  PERFORM public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
    target_tenant_id,
    target_workspace_id,
    target_date,
    NULL,
    target_artifact_id
  );
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date
  FOR UPDATE;
  IF v_lease."state" IN ('PUBLICATION_PENDING', 'FINALIZED') THEN
    IF v_lease."reader_summary_job_id" IS DISTINCT FROM target_job_id
      OR v_lease."reader_summary_artifact_id" IS DISTINCT FROM target_artifact_id
      OR v_lease."publication_id" IS DISTINCT FROM target_publication_id
      OR btrim(v_lease."publication_report_sha256") IS DISTINCT FROM btrim(target_report_sha256)
      OR btrim(v_lease."publication_proof_sha256") IS DISTINCT FROM btrim(target_proof_sha256)
      OR btrim(v_lease."weekly_evidence_sha256") IS DISTINCT FROM btrim(target_weekly_evidence_sha256)
      OR btrim(v_lease."public_evidence_sha256") IS DISTINCT FROM btrim(target_public_evidence_sha256)
      OR btrim(v_lease."public_frontend_sha256") IS DISTINCT FROM btrim(target_public_frontend_sha256) THEN
      RAISE EXCEPTION 'daily canonical recovery v4 publication preparation replay diverged';
    END IF;
    RETURN TRUE;
  END IF;
  IF v_lease."state" <> 'COMPLETED'
    OR v_lease."lease_owner" IS DISTINCT FROM target_worker_id
    OR v_lease."fencing_token" IS DISTINCT FROM target_fencing_token
    OR v_now < v_lease."completed_at"
    OR v_now >= v_lease."lease_expires_at"
    OR v_now >= v_lease."absolute_expires_at"
    OR btrim(target_report_sha256) !~ '^[0-9a-f]{64}$'
    OR btrim(target_proof_sha256) !~ '^[0-9a-f]{64}$'
    OR btrim(target_weekly_evidence_sha256) !~ '^[0-9a-f]{64}$'
    OR btrim(target_public_evidence_sha256) !~ '^[0-9a-f]{64}$'
    OR btrim(target_public_frontend_sha256) !~ '^[0-9a-f]{64}$'
    OR target_publication_id IS DISTINCT FROM target_artifact_id THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication preparation has an incomplete receipt or stale fence';
  END IF;
  SELECT publication."report_sha256", publication."proof_sha256",
    evidence."canonical_sha256", publication."reader_summary_job_id",
    publication."reader_summary_artifact_id"
  INTO STRICT v_publication
  FROM public."reader_summary_publications" AS publication
  JOIN public."reader_summary_jobs" AS job
    ON job."id" = publication."reader_summary_job_id"
  JOIN public."reader_summary_artifacts" AS artifact
    ON artifact."id" = publication."reader_summary_artifact_id"
  JOIN public."reader_summary_weekly_publication_evidence" AS evidence
    ON evidence."publication_id" = publication."id"
  WHERE publication."id" = target_publication_id
    AND publication."tenant_id" = target_tenant_id
    AND publication."workspace_id" = target_workspace_id
    AND publication."requested_utc_date" = target_date
    AND publication."cadence" = 'daily'
    AND publication."semantic_status" IN ('COMPLETED', 'NO_SIGNAL')
    AND publication."reader_summary_job_id" = target_job_id
    AND publication."reader_summary_artifact_id" = target_artifact_id
    AND job."reader_summary_artifact_id" = target_artifact_id
    AND job."status" = publication."semantic_status"
    AND artifact."status" = publication."semantic_status"
    AND evidence."reader_summary_job_id" = target_job_id
    AND evidence."reader_summary_artifact_id" = target_artifact_id
    AND btrim(evidence."canonical_sha256") = encode(sha256(evidence."canonical_bytes"), 'hex')
  FOR KEY SHARE OF publication, job, artifact, evidence;
  IF btrim(v_publication."report_sha256") IS DISTINCT FROM btrim(target_report_sha256)
    OR btrim(v_publication."proof_sha256") IS DISTINCT FROM btrim(target_proof_sha256)
    OR btrim(v_publication."canonical_sha256") IS DISTINCT FROM btrim(target_weekly_evidence_sha256) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication preparation hashes diverged';
  END IF;
  UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  SET "state" = 'PUBLICATION_PENDING', "reader_summary_job_id" = target_job_id,
    "reader_summary_artifact_id" = target_artifact_id,
    "publication_id" = target_publication_id,
    "publication_report_sha256" = target_report_sha256,
    "publication_proof_sha256" = target_proof_sha256,
    "weekly_evidence_sha256" = target_weekly_evidence_sha256,
    "public_evidence_sha256" = target_public_evidence_sha256,
    "public_frontend_sha256" = target_public_frontend_sha256,
    "publication_prepared_at" = v_now
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date;
  RETURN TRUE;
END;
$function$;

CREATE FUNCTION public."finalize_reader_summary_daily_canonical_recovery_v4"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_worker_id TEXT,
  target_fencing_token BIGINT,
  target_job_id UUID,
  target_artifact_id UUID,
  target_publication_id UUID,
  target_report_sha256 CHAR(64),
  target_proof_sha256 CHAR(64),
  target_weekly_evidence_sha256 CHAR(64),
  target_public_evidence_sha256 CHAR(64),
  target_public_frontend_sha256 CHAR(64)
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_lease public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS capability ON capability.oid = membership.roleid
      JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
      WHERE capability.rolname = 'social_monitor_tenant_system_runtime'
        AND member.rolname = session_user
        AND NOT membership.admin_option
        AND membership.inherit_option
        AND NOT membership.set_option
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 finalization session is invalid';
  END IF;
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date
  FOR UPDATE;
  IF v_lease."state" = 'FINALIZED' THEN
    IF v_lease."reader_summary_job_id" IS DISTINCT FROM target_job_id
      OR v_lease."reader_summary_artifact_id" IS DISTINCT FROM target_artifact_id
      OR v_lease."publication_id" IS DISTINCT FROM target_publication_id
      OR btrim(v_lease."publication_report_sha256") IS DISTINCT FROM btrim(target_report_sha256)
      OR btrim(v_lease."publication_proof_sha256") IS DISTINCT FROM btrim(target_proof_sha256)
      OR btrim(v_lease."weekly_evidence_sha256") IS DISTINCT FROM btrim(target_weekly_evidence_sha256)
      OR btrim(v_lease."public_evidence_sha256") IS DISTINCT FROM btrim(target_public_evidence_sha256)
      OR btrim(v_lease."public_frontend_sha256") IS DISTINCT FROM btrim(target_public_frontend_sha256) THEN
      RAISE EXCEPTION 'daily canonical recovery v4 finalization replay diverged';
    END IF;
    RETURN TRUE;
  END IF;
  IF v_lease."state" <> 'PUBLICATION_PENDING'
    OR v_lease."lease_owner" IS DISTINCT FROM target_worker_id
    OR v_lease."fencing_token" IS DISTINCT FROM target_fencing_token
    OR v_now < v_lease."publication_prepared_at"
    OR v_now >= v_lease."lease_expires_at"
    OR v_now >= v_lease."absolute_expires_at"
    OR v_lease."reader_summary_job_id" IS DISTINCT FROM target_job_id
    OR v_lease."reader_summary_artifact_id" IS DISTINCT FROM target_artifact_id
    OR v_lease."publication_id" IS DISTINCT FROM target_publication_id
    OR btrim(v_lease."publication_report_sha256") IS DISTINCT FROM btrim(target_report_sha256)
    OR btrim(v_lease."publication_proof_sha256") IS DISTINCT FROM btrim(target_proof_sha256)
    OR btrim(v_lease."weekly_evidence_sha256") IS DISTINCT FROM btrim(target_weekly_evidence_sha256)
    OR btrim(v_lease."public_evidence_sha256") IS DISTINCT FROM btrim(target_public_evidence_sha256)
    OR btrim(v_lease."public_frontend_sha256") IS DISTINCT FROM btrim(target_public_frontend_sha256) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 finalization lacks a prepared publication or current fence';
  END IF;
  UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  SET "state" = 'FINALIZED', "finalized_at" = v_now, "lease_owner" = NULL,
    "leased_at" = NULL, "lease_expires_at" = NULL, "absolute_expires_at" = NULL
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date;
  RETURN TRUE;
END;
$function$;

CREATE FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_finalized"(
  target_tenant_id UUID,
  target_workspace_id UUID
) RETURNS TABLE (
  requested_utc_date DATE,
  source_authority_sha256 TEXT,
  model_job_identity TEXT,
  reader_summary_job_id UUID,
  reader_summary_artifact_id UUID,
  publication_id UUID,
  report_sha256 TEXT,
  proof_sha256 TEXT,
  weekly_evidence_sha256 TEXT,
  public_evidence_sha256 TEXT,
  public_frontend_sha256 TEXT
) LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 readback requires the dedicated terminal login';
  END IF;
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  RETURN QUERY
  SELECT lease."requested_utc_date", btrim(lease."source_authority_sha256"),
    btrim(lease."model_job_identity"), lease."reader_summary_job_id",
    lease."reader_summary_artifact_id", lease."publication_id",
    btrim(lease."publication_report_sha256"),
    btrim(lease."publication_proof_sha256"),
    btrim(lease."weekly_evidence_sha256"),
    btrim(lease."public_evidence_sha256"),
    btrim(lease."public_frontend_sha256")
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."state" = 'FINALIZED'
  ORDER BY lease."requested_utc_date";
END;
$function$;

REVOKE ALL PRIVILEGES ON TABLE
  public."reader_summary_daily_canonical_recovery_v4_plans",
  public."reader_summary_daily_canonical_recovery_v4_authorities",
  public."reader_summary_daily_canonical_recovery_v4_leases"
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."bootstrap_reader_summary_daily_canonical_recovery_v4"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."reader_summary_daily_canonical_recovery_v4_plan_ordered"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."reader_summary_daily_canonical_recovery_v4_plan_grouped"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_binding"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_legacy"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."reader_summary_daily_canonical_recovery_v4_source_authority"(
  UUID, UUID, DATE, TIMESTAMPTZ, JSONB, JSONB
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."reader_summary_daily_canonical_recovery_v4_model_identity"(
  UUID, UUID, DATE, TEXT
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."reject_reader_summary_daily_canonical_recovery_v4_plan_mutation"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."reject_rs_daily_recovery_v4_authority_mutation"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
-- The V4 recovery recorder is reachable only from the existing SECURITY
-- DEFINER publication path. Neither the terminal nor ordinary runtime can
-- invoke the dispatcher, the ordinary base, or the recovery-only branch.
REVOKE ALL ON FUNCTION
  public."record_reader_summary_weekly_publication_evidence_base"(UUID),
  public."record_reader_summary_daily_canonical_recovery_v4_evidence"(UUID),
  public."record_reader_summary_weekly_publication_evidence"(UUID)
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
REVOKE ALL ON FUNCTION public."claim_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."renew_reader_summary_daily_canonical_recovery_v4_lease"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."mark_reader_summary_daily_canonical_recovery_v4_running"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
  UUID, UUID, DATE, JSONB, UUID
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime";
REVOKE ALL ON FUNCTION public."complete_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR(64), JSONB,
  BYTEA, CHAR(64), BYTEA, CHAR(64)
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
  UUID, UUID, DATE, TEXT, BIGINT, UUID, UUID, UUID,
  CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
REVOKE ALL ON FUNCTION public."finalize_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, DATE, TEXT, BIGINT, UUID, UUID, UUID,
  CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
) FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
REVOKE ALL ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_finalized"(
  UUID, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public."claim_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, TEXT, TIMESTAMPTZ
) TO "social_monitor_reader_summary_daily_terminal";
GRANT EXECUTE ON FUNCTION public."renew_reader_summary_daily_canonical_recovery_v4_lease"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ
) TO "social_monitor_reader_summary_daily_terminal";
GRANT EXECUTE ON FUNCTION public."mark_reader_summary_daily_canonical_recovery_v4_running"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ
) TO "social_monitor_reader_summary_daily_terminal";
GRANT EXECUTE ON FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
  UUID, UUID, DATE, JSONB, UUID
) TO "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."complete_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR(64), JSONB,
  BYTEA, CHAR(64), BYTEA, CHAR(64)
) TO "social_monitor_reader_summary_daily_terminal";
GRANT EXECUTE ON FUNCTION public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
  UUID, UUID, DATE, TEXT, BIGINT, UUID, UUID, UUID,
  CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
) TO "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."finalize_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, DATE, TEXT, BIGINT, UUID, UUID, UUID,
  CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
) TO "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_finalized"(
  UUID, UUID
) TO "social_monitor_reader_summary_daily_terminal";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner" CASCADE;
RESET ROLE;

COMMIT;
