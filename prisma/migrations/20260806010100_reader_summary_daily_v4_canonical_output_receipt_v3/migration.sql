-- @social-monitor-forward-migration
-- Keep the historical 13-field V2 verifier byte-for-byte available while the
-- admitted V4 output_text route moves to the raw/canonical V3 receipt shape.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $clone_reader_summary_daily_canonical_recovery_v4_provenance_verifiers$
DECLARE
  v_definition TEXT;
  v_v2_definition TEXT;
  v_v3_definition TEXT;
  v_recovery_keys CONSTANT TEXT := $keys$
      'modelJobIdentity', 'outputTextSha256', 'outputTextByteLength',
      'githubProjectionSha256'$keys$;
  v_v3_recovery_keys CONSTANT TEXT := $keys$
      'modelJobIdentity', 'canonicalOutputSha256', 'canonicalOutputByteLength',
      'rawOutputSha256', 'rawOutputByteLength', 'githubProjectionSha256'$keys$;
  v_receipt_keys CONSTANT TEXT := $keys$
      'schemaVersion', 'modelJobIdentity', 'requestedUtcDate', 'sourceAuthoritySha256',
      'canonicalOutputSha256', 'canonicalOutputByteLength', 'attestationSha256', 'attestation'$keys$;
  v_v3_receipt_keys CONSTANT TEXT := $keys$
      'schemaVersion', 'modelJobIdentity', 'requestedUtcDate', 'sourceAuthoritySha256',
      'canonicalOutputSha256', 'canonicalOutputByteLength', 'rawOutputSha256',
      'rawOutputByteLength', 'attestationSha256', 'attestation'$keys$;
  v_recovery_sha_marker CONSTANT TEXT := $marker$
    OR btrim(v_recovery->>'githubProjectionSha256') IS DISTINCT FROM encode($marker$;
  v_v3_recovery_sha_marker CONSTANT TEXT := $marker$
    OR (v_recovery->>'canonicalOutputByteLength')::INTEGER > 1000000
    OR btrim(v_recovery->>'rawOutputSha256') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_recovery->>'rawOutputByteLength', '') !~ '^[1-9][0-9]*$'
    OR (v_recovery->>'rawOutputByteLength')::INTEGER > 1000000
    OR btrim(v_recovery->>'githubProjectionSha256') IS DISTINCT FROM encode($marker$;
  v_receipt_tail CONSTANT TEXT := $tail$
    OR v_receipt->'attestation'->>'selectedOutputKind' IS DISTINCT FROM 'output_text'
    OR v_receipt->'attestation'->>'selectedOutputSha256' IS DISTINCT FROM
      v_recovery->>'canonicalOutputSha256' THEN$tail$;
  v_v3_receipt_tail CONSTANT TEXT := $tail$
    OR btrim(v_receipt->>'rawOutputSha256') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_receipt->>'rawOutputByteLength', '') !~ '^[1-9][0-9]*$'
    OR (v_receipt->>'rawOutputByteLength')::INTEGER > 1000000
    OR v_receipt->>'rawOutputSha256' IS DISTINCT FROM v_recovery->>'rawOutputSha256'
    OR v_receipt->>'rawOutputByteLength' IS DISTINCT FROM
      v_recovery->>'rawOutputByteLength'
    OR jsonb_typeof(v_receipt->'attestation') IS DISTINCT FROM 'object'
    OR public.jsonb_object_length(v_receipt->'attestation') <> 12
    OR NOT (v_receipt->'attestation' ?& ARRAY[
      'schemaVersion', 'requestId', 'purpose', 'canonicalRequestSha256',
      'provider', 'model', 'reasoningEffort', 'runtimeEngine',
      'runtimePackageVersion', 'launcherSha256', 'selectedOutputKind',
      'selectedOutputSha256'
    ])
    OR v_receipt->'attestation'->>'schemaVersion' IS DISTINCT FROM '1'
    OR v_receipt->'attestation'->>'purpose' IS DISTINCT FROM
      'social_monitor.reader_summary.weekly.generate'
    OR v_receipt->'attestation'->>'provider' IS DISTINCT FROM 'codex'
    OR v_receipt->'attestation'->>'model' IS DISTINCT FROM 'gpt-5.6-sol'
    OR v_receipt->'attestation'->>'reasoningEffort' IS DISTINCT FROM 'xhigh'
    OR v_receipt->'attestation'->>'runtimeEngine' IS DISTINCT FROM
      'subscription-runtime-cli'
    OR v_receipt->'attestation'->>'selectedOutputKind' IS DISTINCT FROM 'output_text'
    OR btrim(v_receipt->'attestation'->>'selectedOutputSha256') IS DISTINCT FROM
      btrim(v_recovery->>'rawOutputSha256')
    OR btrim(v_receipt->'attestation'->>'canonicalRequestSha256') !~
      '^[0-9a-f]{64}$'
    OR btrim(v_receipt->'attestation'->>'launcherSha256') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_receipt->'attestation'->>'requestId', '') = ''
    OR COALESCE(v_receipt->'attestation'->>'runtimePackageVersion', '') !~
      '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'
    OR btrim(v_receipt->>'attestationSha256') IS DISTINCT FROM encode(sha256(
      convert_to(public."reader_summary_weekly_canonical_json"(
        v_receipt->'attestation'
      ), 'UTF8')
    ), 'hex')
    OR v_lease."receipt_bytes" IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_receipt), 'UTF8'
    ) THEN$tail$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.verify_reader_summary_daily_canonical_recovery_v4_provenance(uuid,uuid,date,jsonb,uuid)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  v_v2_definition := pg_catalog.regexp_replace(
    v_definition,
    '^CREATE OR REPLACE FUNCTION public\."?verify_reader_summary_daily_canonical_recovery_v4_provenance"?',
    'CREATE OR REPLACE FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance_v2"'
  );
  IF v_v2_definition = v_definition THEN
    RAISE EXCEPTION 'daily canonical recovery v4 V2 provenance verifier clone target diverged';
  END IF;
  EXECUTE v_v2_definition;

  v_v3_definition := pg_catalog.regexp_replace(
    v_definition,
    '^CREATE OR REPLACE FUNCTION public\."?verify_reader_summary_daily_canonical_recovery_v4_provenance"?',
    'CREATE OR REPLACE FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance_v3"'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition,
    'public.jsonb_object_length(v_recovery) <> 13',
    'public.jsonb_object_length(v_recovery) <> 15'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, v_recovery_keys, v_v3_recovery_keys
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition,
    'reader_summary.daily_canonical_recovery_provenance.v2',
    'reader_summary.daily_canonical_recovery_provenance.v3'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, 'outputTextSha256', 'canonicalOutputSha256'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, 'outputTextByteLength', 'canonicalOutputByteLength'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, 'responseSha256', 'canonicalOutputSha256'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, 'responseByteLength', 'canonicalOutputByteLength'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, v_recovery_sha_marker, v_v3_recovery_sha_marker
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition,
    'public.jsonb_object_length(v_receipt) <> 8',
    'public.jsonb_object_length(v_receipt) <> 10'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, v_receipt_keys, v_v3_receipt_keys
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition,
    'v_receipt->>''schemaVersion'' IS DISTINCT FROM ''1''',
    'v_receipt->>''schemaVersion'' IS DISTINCT FROM ''2'''
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, v_receipt_tail, v_v3_receipt_tail
  );
  IF v_v3_definition = v_definition
    OR pg_catalog.strpos(v_v3_definition,
      'reader_summary.daily_canonical_recovery_provenance.v3') = 0
    OR pg_catalog.strpos(v_v3_definition, 'rawOutputSha256') = 0
    OR pg_catalog.strpos(v_v3_definition, 'rawOutputByteLength') = 0
    OR pg_catalog.strpos(v_v3_definition,
      'v_receipt->>''schemaVersion'' IS DISTINCT FROM ''2''') = 0
    OR pg_catalog.strpos(v_v3_definition, 'responseSha256') <> 0
    OR pg_catalog.strpos(v_v3_definition, 'responseByteLength') <> 0
    OR pg_catalog.strpos(v_v3_definition,
      'public.jsonb_object_length(v_receipt) <> 10') = 0
    OR pg_catalog.strpos(v_v3_definition, v_v3_recovery_sha_marker) = 0
    OR pg_catalog.strpos(v_v3_definition, v_v3_receipt_tail) = 0
    OR pg_catalog.strpos(v_v3_definition,
      'selectedOutputSha256'') IS DISTINCT FROM') = 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 V3 provenance verifier rewrite target diverged';
  END IF;
  EXECUTE v_v3_definition;
END;
$clone_reader_summary_daily_canonical_recovery_v4_provenance_verifiers$;

CREATE OR REPLACE FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  supplied_audit JSONB,
  target_artifact_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_recovery JSONB;
BEGIN
  IF target_artifact_id IS NULL THEN
    v_recovery := supplied_audit->'recoveryV4';
  ELSE
    SELECT artifact."quality_signals"->'githubProjectionAudit'->'recoveryV4'
    INTO STRICT v_recovery
    FROM public."reader_summary_artifacts" AS artifact
    WHERE artifact."id" = target_artifact_id
    FOR KEY SHARE;
  END IF;
  IF jsonb_typeof(v_recovery) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 provenance schema is invalid';
  END IF;
  IF v_recovery->>'schemaVersion' =
    'reader_summary.daily_canonical_recovery_provenance.v2' THEN
    RETURN public."verify_reader_summary_daily_canonical_recovery_v4_provenance_v2"(
      target_tenant_id, target_workspace_id, target_date, supplied_audit, target_artifact_id
    );
  END IF;
  IF v_recovery->>'schemaVersion' =
    'reader_summary.daily_canonical_recovery_provenance.v3' THEN
    RETURN public."verify_reader_summary_daily_canonical_recovery_v4_provenance_v3"(
      target_tenant_id, target_workspace_id, target_date, supplied_audit, target_artifact_id
    );
  END IF;
  RAISE EXCEPTION 'daily canonical recovery v4 provenance schema is invalid';
END;
$function$;

-- The evidence recorder has the same V2 receipt assumptions as the original
-- verifier. Keep that path byte-for-byte available, then admit V3 only through
-- a separately rewritten clone selected from immutable recovery provenance.
DO $clone_reader_summary_daily_canonical_recovery_v4_evidence_recorders$
DECLARE
  v_definition TEXT;
  v_v2_definition TEXT;
  v_v3_definition TEXT;
  v_recovery_keys CONSTANT TEXT := $keys$
      'schemaVersion', 'recoveryVersion', 'selectedOutputKind',
      'sourceAuthoritySchemaVersion', 'tenantId', 'workspaceId',
      'requestedUtcDate', 'ingestionCutoff', 'sourceAuthoritySha256',
      'modelJobIdentity', 'outputTextSha256', 'outputTextByteLength',
      'githubProjectionSha256'$keys$;
  v_v3_recovery_keys CONSTANT TEXT := $keys$
      'schemaVersion', 'recoveryVersion', 'selectedOutputKind',
      'sourceAuthoritySchemaVersion', 'tenantId', 'workspaceId',
      'requestedUtcDate', 'ingestionCutoff', 'sourceAuthoritySha256',
      'modelJobIdentity', 'canonicalOutputSha256', 'canonicalOutputByteLength',
      'rawOutputSha256', 'rawOutputByteLength', 'githubProjectionSha256'$keys$;
  v_receipt_keys CONSTANT TEXT := $keys$
      'schemaVersion', 'modelJobIdentity', 'requestedUtcDate', 'sourceAuthoritySha256',
      'responseSha256', 'responseByteLength', 'attestationSha256', 'attestation'$keys$;
  v_v3_receipt_keys CONSTANT TEXT := $keys$
      'schemaVersion', 'modelJobIdentity', 'requestedUtcDate', 'sourceAuthoritySha256',
      'canonicalOutputSha256', 'canonicalOutputByteLength', 'rawOutputSha256',
      'rawOutputByteLength', 'attestationSha256', 'attestation'$keys$;
  v_canonical_receipt_tail CONSTANT TEXT := $tail$
    OR v_receipt->'attestation'->>'selectedOutputSha256' IS DISTINCT FROM
      v_recovery->>'canonicalOutputSha256'
  THEN$tail$;
  v_v3_receipt_tail CONSTANT TEXT := $tail$
    OR btrim(v_receipt->>'rawOutputSha256') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_receipt->>'rawOutputByteLength', '') !~ '^[1-9][0-9]*$'
    OR (v_receipt->>'rawOutputByteLength')::INTEGER > 1000000
    OR v_receipt->>'rawOutputSha256' IS DISTINCT FROM v_recovery->>'rawOutputSha256'
    OR v_receipt->>'rawOutputByteLength' IS DISTINCT FROM
      v_recovery->>'rawOutputByteLength'
    OR jsonb_typeof(v_receipt->'attestation') IS DISTINCT FROM 'object'
    OR public.jsonb_object_length(v_receipt->'attestation') <> 12
    OR NOT (v_receipt->'attestation' ?& ARRAY[
      'schemaVersion', 'requestId', 'purpose', 'canonicalRequestSha256',
      'provider', 'model', 'reasoningEffort', 'runtimeEngine',
      'runtimePackageVersion', 'launcherSha256', 'selectedOutputKind',
      'selectedOutputSha256'
    ])
    OR v_receipt->'attestation'->>'schemaVersion' IS DISTINCT FROM '1'
    OR v_receipt->'attestation'->>'purpose' IS DISTINCT FROM
      'social_monitor.reader_summary.weekly.generate'
    OR v_receipt->'attestation'->>'provider' IS DISTINCT FROM 'codex'
    OR v_receipt->'attestation'->>'model' IS DISTINCT FROM 'gpt-5.6-sol'
    OR v_receipt->'attestation'->>'reasoningEffort' IS DISTINCT FROM 'xhigh'
    OR v_receipt->'attestation'->>'runtimeEngine' IS DISTINCT FROM
      'subscription-runtime-cli'
    OR v_receipt->'attestation'->>'selectedOutputKind' IS DISTINCT FROM 'output_text'
    OR btrim(v_receipt->'attestation'->>'selectedOutputSha256') IS DISTINCT FROM
      btrim(v_recovery->>'rawOutputSha256')
    OR btrim(v_receipt->'attestation'->>'canonicalRequestSha256') !~
      '^[0-9a-f]{64}$'
    OR btrim(v_receipt->'attestation'->>'launcherSha256') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_receipt->'attestation'->>'requestId', '') = ''
    OR COALESCE(v_receipt->'attestation'->>'runtimePackageVersion', '') !~
      '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'
    OR btrim(v_receipt->>'attestationSha256') IS DISTINCT FROM encode(sha256(
      convert_to(public."reader_summary_weekly_canonical_json"(
        v_receipt->'attestation'
      ), 'UTF8')
    ), 'hex')
    OR v_lease."receipt_bytes" IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_receipt), 'UTF8'
    )
  THEN$tail$;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.record_reader_summary_daily_canonical_recovery_v4_evidence(uuid)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  v_v2_definition := pg_catalog.regexp_replace(
    v_definition,
    '^CREATE OR REPLACE FUNCTION public\."?record_reader_summary_daily_canonical_recovery_v4_evidence"?',
    'CREATE OR REPLACE FUNCTION public."record_reader_summary_daily_canonical_recovery_v4_evidence_v2"'
  );
  IF v_v2_definition = v_definition THEN
    RAISE EXCEPTION 'daily canonical recovery v4 V2 evidence recorder clone target diverged';
  END IF;
  EXECUTE v_v2_definition;

  v_v3_definition := pg_catalog.regexp_replace(
    v_definition,
    '^CREATE OR REPLACE FUNCTION public\."?record_reader_summary_daily_canonical_recovery_v4_evidence"?',
    'CREATE OR REPLACE FUNCTION public."record_reader_summary_daily_canonical_recovery_v4_evidence_v3"'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition,
    'public.jsonb_object_length(v_recovery) <> 13',
    'public.jsonb_object_length(v_recovery) <> 15'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, v_recovery_keys, v_v3_recovery_keys
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition,
    'reader_summary.daily_canonical_recovery_provenance.v2',
    'reader_summary.daily_canonical_recovery_provenance.v3'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, 'outputTextSha256', 'canonicalOutputSha256'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, 'outputTextByteLength', 'canonicalOutputByteLength'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition,
    'public.jsonb_object_length(v_receipt) <> 8',
    'public.jsonb_object_length(v_receipt) <> 10'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, v_receipt_keys, v_v3_receipt_keys
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition,
    'v_receipt->>''schemaVersion'' IS DISTINCT FROM ''1''',
    'v_receipt->>''schemaVersion'' IS DISTINCT FROM ''2'''
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, 'responseSha256', 'canonicalOutputSha256'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, 'responseByteLength', 'canonicalOutputByteLength'
  );
  v_v3_definition := pg_catalog.replace(
    v_v3_definition, v_canonical_receipt_tail, v_v3_receipt_tail
  );
  IF v_v3_definition = v_definition
    OR pg_catalog.strpos(v_v3_definition,
      'reader_summary.daily_canonical_recovery_provenance.v3') = 0
    OR pg_catalog.strpos(v_v3_definition, 'canonicalOutputSha256') = 0
    OR pg_catalog.strpos(v_v3_definition, 'canonicalOutputByteLength') = 0
    OR pg_catalog.strpos(v_v3_definition, 'rawOutputSha256') = 0
    OR pg_catalog.strpos(v_v3_definition, 'rawOutputByteLength') = 0
    OR pg_catalog.strpos(v_v3_definition,
      'v_receipt->>''schemaVersion'' IS DISTINCT FROM ''2''') = 0
    OR pg_catalog.strpos(v_v3_definition, 'outputTextSha256') <> 0
    OR pg_catalog.strpos(v_v3_definition, 'outputTextByteLength') <> 0
    OR pg_catalog.strpos(v_v3_definition, 'responseSha256') <> 0
    OR pg_catalog.strpos(v_v3_definition, 'responseByteLength') <> 0
    OR pg_catalog.strpos(v_v3_definition,
      'public.jsonb_object_length(v_receipt) <> 10') = 0
    OR pg_catalog.strpos(v_v3_definition, v_v3_receipt_tail) = 0 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 V3 evidence recorder rewrite target diverged';
  END IF;
  EXECUTE v_v3_definition;
END;
$clone_reader_summary_daily_canonical_recovery_v4_evidence_recorders$;

CREATE OR REPLACE FUNCTION public."record_reader_summary_daily_canonical_recovery_v4_evidence"(
  target_publication_id UUID
) RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog AS $function$
DECLARE
  v_recovery JSONB;
BEGIN
  SELECT artifact."quality_signals"->'githubProjectionAudit'->'recoveryV4'
  INTO STRICT v_recovery
  FROM public."reader_summary_publications" AS publication
  JOIN public."reader_summary_artifacts" AS artifact
    ON artifact."id" = publication."reader_summary_artifact_id"
  WHERE publication."id" = target_publication_id
  FOR KEY SHARE OF publication, artifact;
  IF jsonb_typeof(v_recovery) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication provenance is invalid';
  END IF;
  IF v_recovery->>'schemaVersion' =
    'reader_summary.daily_canonical_recovery_provenance.v2' THEN
    PERFORM public."record_reader_summary_daily_canonical_recovery_v4_evidence_v2"(
      target_publication_id
    );
    RETURN;
  END IF;
  IF v_recovery->>'schemaVersion' =
    'reader_summary.daily_canonical_recovery_provenance.v3' THEN
    PERFORM public."record_reader_summary_daily_canonical_recovery_v4_evidence_v3"(
      target_publication_id
    );
    RETURN;
  END IF;
  RAISE EXCEPTION 'daily canonical recovery v4 publication provenance is invalid';
END;
$function$;

-- The terminal receives only canonical output bytes.  V2 receipts bind the
-- attestation to those bytes directly; V3 receipts bind it to the transient
-- raw selected-output digest while independently binding canonical bytes.
-- Keep the completed transition itself closed over both shapes so the V3
-- receipt can be persisted before the provenance verifier reads it.
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
    OR NOT (
      (v_receipt->>'schemaVersion' IS NOT DISTINCT FROM '1'
        AND v_attestation->>'selectedOutputSha256' IS NOT DISTINCT FROM
          btrim(exact_response_sha256))
      OR
      (v_receipt->>'schemaVersion' IS NOT DISTINCT FROM '2'
        AND v_attestation->>'selectedOutputSha256' IS NOT DISTINCT FROM
          btrim(v_receipt->>'rawOutputSha256'))
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 output text attestation is invalid';
  END IF;
  IF jsonb_typeof(v_receipt) <> 'object'
    OR NOT (
      (
        (SELECT count(*) FROM jsonb_object_keys(v_receipt)) = 8
        AND v_receipt ?& ARRAY[
          'schemaVersion', 'modelJobIdentity', 'requestedUtcDate', 'sourceAuthoritySha256',
          'responseSha256', 'responseByteLength', 'attestationSha256', 'attestation'
        ]
        AND v_receipt->>'schemaVersion' IS NOT DISTINCT FROM '1'
        AND v_receipt->>'modelJobIdentity' IS NOT DISTINCT FROM btrim(v_lease."model_job_identity")
        AND v_receipt->>'requestedUtcDate' IS NOT DISTINCT FROM to_char(target_date, 'YYYY-MM-DD')
        AND v_receipt->>'sourceAuthoritySha256' IS NOT DISTINCT FROM btrim(v_lease."source_authority_sha256")
        AND v_receipt->>'responseSha256' IS NOT DISTINCT FROM btrim(exact_response_sha256)
        AND (v_receipt->>'responseByteLength')::INTEGER IS NOT DISTINCT FROM octet_length(exact_response)
        AND v_receipt->>'attestationSha256' IS NOT DISTINCT FROM btrim(exact_attestation_sha256)
        AND v_receipt->'attestation' IS NOT DISTINCT FROM v_attestation
      )
      OR
      (
        (SELECT count(*) FROM jsonb_object_keys(v_receipt)) = 10
        AND v_receipt ?& ARRAY[
          'schemaVersion', 'modelJobIdentity', 'requestedUtcDate', 'sourceAuthoritySha256',
          'canonicalOutputSha256', 'canonicalOutputByteLength', 'rawOutputSha256',
          'rawOutputByteLength', 'attestationSha256', 'attestation'
        ]
        AND v_receipt->>'schemaVersion' IS NOT DISTINCT FROM '2'
        AND v_receipt->>'modelJobIdentity' IS NOT DISTINCT FROM btrim(v_lease."model_job_identity")
        AND v_receipt->>'requestedUtcDate' IS NOT DISTINCT FROM to_char(target_date, 'YYYY-MM-DD')
        AND v_receipt->>'sourceAuthoritySha256' IS NOT DISTINCT FROM btrim(v_lease."source_authority_sha256")
        AND v_receipt->>'canonicalOutputSha256' IS NOT DISTINCT FROM btrim(exact_response_sha256)
        AND COALESCE(v_receipt->>'canonicalOutputByteLength', '') ~ '^[1-9][0-9]*$'
        AND (v_receipt->>'canonicalOutputByteLength')::INTEGER IS NOT DISTINCT FROM octet_length(exact_response)
        AND octet_length(exact_response) <= 1000000
        AND COALESCE(v_receipt->>'rawOutputSha256', '') ~ '^[0-9a-f]{64}$'
        AND COALESCE(v_receipt->>'rawOutputByteLength', '') ~ '^[1-9][0-9]*$'
        AND (v_receipt->>'rawOutputByteLength')::INTEGER <= 1000000
        AND v_receipt->>'attestationSha256' IS NOT DISTINCT FROM btrim(exact_attestation_sha256)
        AND v_receipt->'attestation' IS NOT DISTINCT FROM v_attestation
      )
    )
    OR exact_receipt_bytes IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_receipt), 'UTF8'
    ) THEN
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
  public."verify_reader_summary_daily_canonical_recovery_v4_provenance_v2"(
    UUID, UUID, DATE, JSONB, UUID
  ),
  public."verify_reader_summary_daily_canonical_recovery_v4_provenance_v3"(
    UUID, UUID, DATE, JSONB, UUID
  ),
  public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
    UUID, UUID, DATE, JSONB, UUID
  ),
  public."record_reader_summary_daily_canonical_recovery_v4_evidence_v2"(
    UUID
  ),
  public."record_reader_summary_daily_canonical_recovery_v4_evidence_v3"(
    UUID
  ),
  public."record_reader_summary_daily_canonical_recovery_v4_evidence"(
    UUID
  )
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION public."verify_reader_summary_daily_canonical_recovery_v4_provenance"(
  UUID, UUID, DATE, JSONB, UUID
) TO "social_monitor_tenant_system_runtime";

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
