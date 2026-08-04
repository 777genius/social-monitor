-- @social-monitor-forward-migration
-- All V4 consumers read the effective successful attempt, while physical
-- finalization updates retain the original -> retry fence ordering.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

-- The date/worker/fence-only publication callbacks can target the replacement
-- when an authorized retry inherits attempt 1's worker and fencing token.
-- Remove them before installing the exact identity-and-ordinal callbacks.
DROP FUNCTION IF EXISTS public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
  UUID, UUID, DATE, TEXT, BIGINT, UUID, UUID, UUID,
  CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
);
DROP FUNCTION IF EXISTS public."finalize_reader_summary_daily_canonical_recovery_v4"(
  UUID, UUID, DATE, TEXT, BIGINT, UUID, UUID, UUID,
  CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
);

CREATE OR REPLACE FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
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
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
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
  PERFORM public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
    target_tenant_id, target_workspace_id, target_date
  );
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases"
  WHERE "tenant_id" = target_tenant_id
    AND "workspace_id" = target_workspace_id
    AND "requested_utc_date" = target_date;
  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = target_tenant_id
      AND retry."workspace_id" = target_workspace_id
      AND retry."requested_utc_date" = target_date
  ) THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      target_tenant_id, target_workspace_id, target_date
    );
  END IF;

  v_recovery := v_audit->'recoveryV4';
  v_projection := v_authority."source_authority_record"->'githubProjection';
  IF jsonb_typeof(v_audit) IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_recovery) IS DISTINCT FROM 'object'
    OR public.jsonb_object_length(v_recovery) <> 13
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
      sha256(convert_to(public."reader_summary_weekly_canonical_json_unbounded"(v_projection), 'UTF8')),
      'hex'
    )
    OR v_lease."response_bytes" IS NULL
    OR v_lease."receipt_bytes" IS NULL
    OR btrim(v_recovery->>'outputTextSha256') IS DISTINCT FROM
      encode(sha256(v_lease."response_bytes"), 'hex')
    OR (v_recovery->>'outputTextByteLength')::INTEGER IS DISTINCT FROM
      octet_length(v_lease."response_bytes")
    OR v_lease."state" NOT IN ('COMPLETED', 'PUBLICATION_PENDING', 'FINALIZED') THEN
    RAISE EXCEPTION 'daily canonical recovery v4 provenance is invalid: %',
      CASE
        WHEN jsonb_typeof(v_audit) IS DISTINCT FROM 'object' THEN 'audit_type'
        WHEN jsonb_typeof(v_recovery) IS DISTINCT FROM 'object' THEN
          'recovery_type:' || COALESCE(v_audit->'reasons'->>0, 'missing reason')
        WHEN public.jsonb_object_length(v_recovery) <> 13 THEN 'recovery_keys'
        WHEN v_recovery->>'recoveryVersion' IS DISTINCT FROM 'reader_summary.daily_canonical_recovery.v4' THEN 'recovery_version'
        WHEN v_recovery->>'tenantId' IS DISTINCT FROM target_tenant_id::TEXT THEN 'tenant'
        WHEN v_recovery->>'workspaceId' IS DISTINCT FROM target_workspace_id::TEXT THEN 'workspace'
        WHEN v_recovery->>'requestedUtcDate' IS DISTINCT FROM to_char(target_date, 'YYYY-MM-DD') THEN 'date'
        WHEN btrim(v_recovery->>'sourceAuthoritySha256') IS DISTINCT FROM btrim(v_authority."source_authority_sha256") THEN 'authority_sha'
        WHEN btrim(v_recovery->>'modelJobIdentity') IS DISTINCT FROM btrim(v_lease."model_job_identity") THEN 'model_identity'
        WHEN btrim(v_recovery->>'githubProjectionSha256') IS DISTINCT FROM encode(sha256(convert_to(public."reader_summary_weekly_canonical_json_unbounded"(v_projection), 'UTF8')), 'hex') THEN 'github_projection_sha'
        WHEN v_lease."response_bytes" IS NULL THEN 'response_missing'
        WHEN v_lease."receipt_bytes" IS NULL THEN 'receipt_missing'
        WHEN btrim(v_recovery->>'outputTextSha256') IS DISTINCT FROM encode(sha256(v_lease."response_bytes"), 'hex') THEN 'response_sha'
        WHEN (v_recovery->>'outputTextByteLength')::INTEGER IS DISTINCT FROM octet_length(v_lease."response_bytes") THEN 'response_length'
        ELSE 'lease_state:' || v_lease."state"
      END;
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
    OR public.jsonb_object_length(v_response) <> 12
    OR NOT (v_response ?& ARRAY[
      'headline', 'executiveSummary', 'narrativeSections', 'content', 'topStories',
      'interestHighlights', 'repeatedSignals', 'risksAndUnknowns', 'citationMap',
      'qualityFlags', 'confidence', 'noSignalReason'
    ])
    OR jsonb_typeof(v_receipt) IS DISTINCT FROM 'object'
    OR public.jsonb_object_length(v_receipt) <> 8
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
  IF target_artifact_id IS NOT NULL AND (
    v_artifact."headline" IS DISTINCT FROM v_response->>'headline'
    OR v_artifact."summary_text" IS DISTINCT FROM v_response->>'executiveSummary'
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 artifact diverged from output_text: %',
      CASE
        WHEN v_artifact."headline" IS DISTINCT FROM v_response->>'headline' THEN 'headline'
        ELSE 'executiveSummary'
      END;
  END IF;

  IF v_projection->>'mode' = 'checked_at_collection_anchor' THEN
    IF public.jsonb_object_length(v_audit) <> 11
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
    IF target_date NOT IN (DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30')
      OR public.jsonb_object_length(v_audit) <> 11
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

CREATE OR REPLACE FUNCTION public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_model_job_identity CHAR(64),
  target_attempt_ordinal SMALLINT,
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
  v_attempt SMALLINT;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
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
    )
    OR btrim(target_model_job_identity) !~ '^[0-9a-f]{64}$'
    OR target_attempt_ordinal NOT IN (1, 2) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication session is invalid';
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
    RAISE EXCEPTION 'daily canonical recovery v4 publication preparation has a stale attempt identity';
  END IF;
  PERFORM public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
    target_tenant_id, target_workspace_id, target_date, NULL, target_artifact_id
  );
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
  IF v_attempt = 2 THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    SET "state" = 'PUBLICATION_PENDING', "reader_summary_job_id" = target_job_id,
      "reader_summary_artifact_id" = target_artifact_id,
      "publication_id" = target_publication_id,
      "publication_report_sha256" = target_report_sha256,
      "publication_proof_sha256" = target_proof_sha256,
      "weekly_evidence_sha256" = target_weekly_evidence_sha256,
      "public_evidence_sha256" = target_public_evidence_sha256,
      "public_frontend_sha256" = target_public_frontend_sha256,
      "publication_prepared_at" = v_now
    WHERE retry."tenant_id" = target_tenant_id
      AND retry."workspace_id" = target_workspace_id
      AND retry."requested_utc_date" = target_date
      AND retry."attempt_ordinal" = target_attempt_ordinal
      AND btrim(retry."model_job_identity") = btrim(target_model_job_identity);
  ELSE
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
      AND lease."requested_utc_date" = target_date
      AND target_attempt_ordinal = 1
      AND btrim(lease."model_job_identity") = btrim(target_model_job_identity);
  END IF;
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public."finalize_reader_summary_daily_canonical_recovery_v4"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_model_job_identity CHAR(64),
  target_attempt_ordinal SMALLINT,
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
  v_attempt SMALLINT;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
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
    )
    OR btrim(target_model_job_identity) !~ '^[0-9a-f]{64}$'
    OR target_attempt_ordinal NOT IN (1, 2) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 finalization session is invalid';
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
    RAISE EXCEPTION 'daily canonical recovery v4 finalization has a stale attempt identity';
  END IF;
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
  IF v_attempt = 2 THEN
    UPDATE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    SET "state" = 'FINALIZED', "finalized_at" = v_now, "lease_owner" = NULL,
      "leased_at" = NULL, "lease_expires_at" = NULL, "absolute_expires_at" = NULL
    WHERE retry."tenant_id" = target_tenant_id
      AND retry."workspace_id" = target_workspace_id
      AND retry."requested_utc_date" = target_date
      AND retry."attempt_ordinal" = target_attempt_ordinal
      AND btrim(retry."model_job_identity") = btrim(target_model_job_identity);
  ELSE
    UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    SET "state" = 'FINALIZED', "finalized_at" = v_now, "lease_owner" = NULL,
      "leased_at" = NULL, "lease_expires_at" = NULL, "absolute_expires_at" = NULL
    WHERE lease."tenant_id" = target_tenant_id
      AND lease."workspace_id" = target_workspace_id
      AND lease."requested_utc_date" = target_date
      AND target_attempt_ordinal = 1
      AND btrim(lease."model_job_identity") = btrim(target_model_job_identity);
  END IF;
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public."read_reader_summary_daily_canonical_recovery_v4_finalized"(
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
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 readback requires the dedicated terminal login';
  END IF;
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = target_tenant_id
      AND retry."workspace_id" = target_workspace_id
      AND retry."requested_utc_date" = DATE '2026-07-23'
  ) THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      target_tenant_id, target_workspace_id, DATE '2026-07-23'
    );
  END IF;
  RETURN QUERY
  SELECT lease."requested_utc_date", btrim(lease."source_authority_sha256"),
    btrim(lease."model_job_identity"), lease."reader_summary_job_id",
    lease."reader_summary_artifact_id", lease."publication_id",
    btrim(lease."publication_report_sha256"),
    btrim(lease."publication_proof_sha256"),
    btrim(lease."weekly_evidence_sha256"),
    btrim(lease."public_evidence_sha256"),
    btrim(lease."public_frontend_sha256")
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."state" = 'FINALIZED'
  ORDER BY lease."requested_utc_date";
END;
$function$;

REVOKE ALL ON FUNCTION
  public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, UUID, UUID, UUID,
    CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
  ),
  public."finalize_reader_summary_daily_canonical_recovery_v4"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, UUID, UUID, UUID,
    CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
  )
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION
  public."prepare_reader_summary_daily_canonical_recovery_v4_publication"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, UUID, UUID, UUID,
    CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
  ),
  public."finalize_reader_summary_daily_canonical_recovery_v4"(
    UUID, UUID, DATE, CHAR(64), SMALLINT, TEXT, BIGINT, UUID, UUID, UUID,
    CHAR(64), CHAR(64), CHAR(64), CHAR(64), CHAR(64)
  ) TO "social_monitor_tenant_system_runtime";

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
