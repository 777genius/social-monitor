-- @social-monitor-forward-migration
-- Expand-only telemetry for the existing daily model-job receipt authority.
-- Existing rows remain explicitly historical/incomplete; no usage is inferred.
BEGIN;

CREATE TEMPORARY TABLE "reader_summary_daily_model_telemetry_session_roles" (
  "session_user_oid" OID NOT NULL,
  "current_user_oid" OID NOT NULL
) ON COMMIT DROP;
INSERT INTO "reader_summary_daily_model_telemetry_session_roles" (
  "session_user_oid", "current_user_oid"
)
SELECT session_principal.oid, current_principal.oid
FROM pg_catalog.pg_roles AS session_principal
CROSS JOIN pg_catalog.pg_roles AS current_principal
WHERE session_principal.rolname = session_user
  AND current_principal.rolname = current_user;

SET LOCAL ROLE social_monitor_public_schema_owner;

ALTER TABLE public."reader_summary_daily_model_jobs"
  ADD COLUMN "input_tokens" BIGINT,
  ADD COLUMN "output_tokens" BIGINT,
  ADD COLUMN "total_tokens" BIGINT,
  ADD COLUMN "usage_source" TEXT NOT NULL DEFAULT 'UNAVAILABLE',
  ADD COLUMN "duration_ms" BIGINT;

UPDATE public."reader_summary_daily_model_jobs"
SET "usage_source" = 'HISTORICAL_INCOMPLETE';

ALTER TABLE public."reader_summary_daily_model_jobs"
  DROP CONSTRAINT "reader_summary_daily_model_jobs_identity_check";

ALTER TABLE public."reader_summary_daily_model_jobs"
  ADD CONSTRAINT "reader_summary_daily_model_jobs_identity_check" CHECK (
    btrim("provider") <> '' AND btrim("model") <> ''
    AND btrim("reasoning_effort") <> '' AND btrim("runtime_engine") <> ''
    AND "source_authority_sha256" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "reader_summary_daily_model_jobs_telemetry_check" CHECK (
    "usage_source" IN (
      'PROVIDER_REPORTED', 'ESTIMATED', 'UNAVAILABLE',
      'HISTORICAL_INCOMPLETE'
    )
    AND CASE "usage_source"
      WHEN 'PROVIDER_REPORTED' THEN
        "input_tokens" BETWEEN 0 AND 9007199254740991
        AND "output_tokens" BETWEEN 0 AND 9007199254740991
        AND "total_tokens" BETWEEN 0 AND 9007199254740991
        AND "total_tokens" = "input_tokens" + "output_tokens"
        AND "duration_ms" BETWEEN 1 AND 9007199254740991
      WHEN 'ESTIMATED' THEN
        "input_tokens" BETWEEN 0 AND 9007199254740991
        AND "output_tokens" BETWEEN 0 AND 9007199254740991
        AND "total_tokens" BETWEEN 0 AND 9007199254740991
        AND "total_tokens" = "input_tokens" + "output_tokens"
        AND "duration_ms" BETWEEN 1 AND 9007199254740991
      ELSE "input_tokens" IS NULL AND "output_tokens" IS NULL
        AND "total_tokens" IS NULL
        AND "duration_ms" IS NULL
    END
  );

-- A RUNNING v1 job may already have crossed the provider-effect boundary.
-- Refuse the whole transactional migration rather than relabeling, retrying,
-- or revoking the only completion authority for an unknown-effect execution.
DO $guard_daily_model_job_upgrade_state$
DECLARE
  v_blocked RECORD;
BEGIN
  SELECT job."tenant_id", job."workspace_id", job."requested_utc_date",
    job."state"
  INTO v_blocked
  FROM public."reader_summary_daily_model_jobs" AS job
  WHERE job."state" = 'RUNNING'
  ORDER BY job."tenant_id", job."workspace_id", job."requested_utc_date"
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'daily telemetry migration blocked: % job for tenant %, workspace %, date % has unknown provider effect; reconcile it through the existing ambiguity protocol before deploy',
      v_blocked."state", v_blocked."tenant_id", v_blocked."workspace_id",
      v_blocked."requested_utc_date";
  END IF;
END;
$guard_daily_model_job_upgrade_state$;

-- RESERVED is pre-effect by protocol, but an unexpired lease still belongs to
-- a live worker that claimed the v1/xhigh binding. Require that worker to stop
-- and the lease to expire before this migration can deterministically adopt it.
DO $guard_live_daily_model_job_reservation$
DECLARE
  v_blocked RECORD;
BEGIN
  SELECT job."tenant_id", job."workspace_id", job."requested_utc_date"
  INTO v_blocked
  FROM public."reader_summary_daily_model_jobs" AS job
  JOIN public."reader_summary_daily_execution_cursors" AS cursor_row
    ON cursor_row."tenant_id" = job."tenant_id"
   AND cursor_row."workspace_id" = job."workspace_id"
  WHERE job."state" = 'RESERVED'
    AND cursor_row."active_requested_utc_date" = job."requested_utc_date"
    AND cursor_row."lease_expires_at" > pg_catalog.transaction_timestamp()
  ORDER BY job."tenant_id", job."workspace_id", job."requested_utc_date"
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'daily telemetry migration blocked: RESERVED v1 job for tenant %, workspace %, date % still has a live lease; quiesce the daily terminal and wait for lease expiry before deploy',
      v_blocked."tenant_id", v_blocked."workspace_id",
      v_blocked."requested_utc_date";
  END IF;
END;
$guard_live_daily_model_job_reservation$;

-- Only a structurally exact, pre-effect v1 reservation can be adopted. This
-- validates every immutable binding and the absence of response/publication
-- evidence before changing its identity.
DO $guard_adoptable_daily_model_job_reservation$
DECLARE
  v_blocked RECORD;
BEGIN
  SELECT job."tenant_id", job."workspace_id", job."requested_utc_date"
  INTO v_blocked
  FROM public."reader_summary_daily_model_jobs" AS job
  LEFT JOIN public."reader_summary_daily_source_authorities" AS source
    ON source."tenant_id" = job."tenant_id"
   AND source."workspace_id" = job."workspace_id"
   AND source."requested_utc_date" = job."requested_utc_date"
  LEFT JOIN public."reader_summary_daily_execution_cursors" AS cursor_row
    ON cursor_row."tenant_id" = job."tenant_id"
   AND cursor_row."workspace_id" = job."workspace_id"
  WHERE job."state" = 'RESERVED'
    AND (
      source."tenant_id" IS NULL
      OR cursor_row."tenant_id" IS NULL
      OR cursor_row."next_unresolved_utc_date" <> job."requested_utc_date"
      OR cursor_row."active_requested_utc_date" IS NOT NULL
        AND cursor_row."active_requested_utc_date" <> job."requested_utc_date"
      OR pg_catalog.btrim(job."source_authority_sha256") <>
        pg_catalog.btrim(source."canonical_sha256")
      OR job."provider" IS DISTINCT FROM 'codex'
      OR job."model" IS DISTINCT FROM 'gpt-5.6-sol'
      OR job."reasoning_effort" IS DISTINCT FROM 'xhigh'
      OR job."runtime_engine" IS DISTINCT FROM 'subscription-runtime-cli'
      OR job."identity" IS DISTINCT FROM pg_catalog.encode(pg_catalog.sha256(
        pg_catalog.convert_to(pg_catalog.concat_ws('|',
          'reader-summary-daily:v1', job."tenant_id"::TEXT,
          job."workspace_id"::TEXT,
          pg_catalog.to_char(job."requested_utc_date", 'YYYY-MM-DD'),
          pg_catalog.btrim(source."canonical_sha256"), 'codex',
          'gpt-5.6-sol', 'xhigh'
        ), 'UTF8')), 'hex')
      OR job."running_at" IS NOT NULL OR job."completed_at" IS NOT NULL
      OR job."failed_ambiguous_at" IS NOT NULL
      OR job."response_bytes" IS NOT NULL OR job."response_sha256" IS NOT NULL
      OR job."attestation" IS NOT NULL OR job."attestation_bytes" IS NOT NULL
      OR job."attestation_sha256" IS NOT NULL
      OR job."receipt_bytes" IS NOT NULL OR job."receipt_sha256" IS NOT NULL
      OR job."reader_summary_job_id" IS NOT NULL
      OR job."reader_summary_artifact_id" IS NOT NULL
      OR job."publication_id" IS NOT NULL
      OR job."publication_report_sha256" IS NOT NULL
      OR job."publication_proof_sha256" IS NOT NULL
      OR job."weekly_evidence_sha256" IS NOT NULL
      OR job."public_evidence_sha256" IS NOT NULL
      OR job."public_frontend_sha256" IS NOT NULL
      OR job."publication_finalized_at" IS NOT NULL
    )
  ORDER BY job."tenant_id", job."workspace_id", job."requested_utc_date"
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'daily telemetry migration blocked: RESERVED v1 job for tenant %, workspace %, date % is not an exact pre-effect reservation',
      v_blocked."tenant_id", v_blocked."workspace_id",
      v_blocked."requested_utc_date";
  END IF;
END;
$guard_adoptable_daily_model_job_reservation$;

UPDATE public."reader_summary_daily_execution_cursors" AS cursor_row
SET "active_requested_utc_date" = NULL, "lease_owner" = NULL,
  "leased_at" = NULL, "lease_expires_at" = NULL,
  "absolute_expires_at" = NULL,
  "updated_at" = pg_catalog.transaction_timestamp()
FROM public."reader_summary_daily_model_jobs" AS job
WHERE job."tenant_id" = cursor_row."tenant_id"
  AND job."workspace_id" = cursor_row."workspace_id"
  AND job."requested_utc_date" = cursor_row."active_requested_utc_date"
  AND job."state" = 'RESERVED';

UPDATE public."reader_summary_daily_model_jobs" AS job
SET "identity" = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.concat_ws('|', 'reader-summary-daily:v2',
        job."tenant_id"::TEXT, job."workspace_id"::TEXT,
        pg_catalog.to_char(job."requested_utc_date", 'YYYY-MM-DD'),
        pg_catalog.btrim(job."source_authority_sha256"), 'codex',
        'gpt-5.6-sol', 'high'
      ), 'UTF8')), 'hex'),
  "reasoning_effort" = 'high',
  "usage_source" = 'UNAVAILABLE'
WHERE job."state" = 'RESERVED';

CREATE FUNCTION public."complete_reader_summary_daily_model_job_v2"(
  target_tenant_id UUID, target_workspace_id UUID, target_date DATE,
  target_worker_id TEXT, target_fencing_token BIGINT, finished_at TIMESTAMPTZ,
  exact_response BYTEA, exact_response_sha256 CHAR(64),
  verified_attestation JSONB, exact_attestation_bytes BYTEA,
  exact_attestation_sha256 CHAR(64), exact_receipt_bytes BYTEA,
  exact_receipt_sha256 CHAR(64), observed_input_tokens BIGINT,
  observed_output_tokens BIGINT, observed_total_tokens BIGINT,
  observed_usage_source TEXT, observed_duration_ms BIGINT
)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_cursor public."reader_summary_daily_execution_cursors"%ROWTYPE;
DECLARE v_job public."reader_summary_daily_model_jobs"%ROWTYPE;
DECLARE v_response JSONB;
DECLARE v_receipt JSONB;
DECLARE v_expected_attestation_bytes BYTEA;
DECLARE v_expected_receipt_bytes BYTEA;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'daily telemetry completion requires SERIALIZABLE';
  END IF;
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily telemetry completion requires the dedicated terminal login';
  END IF;
  IF finished_at < pg_catalog.transaction_timestamp() - INTERVAL '5 minutes'
     OR finished_at > pg_catalog.transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily telemetry completion time is not current';
  END IF;
  IF observed_usage_source IS DISTINCT FROM 'PROVIDER_REPORTED'
     OR observed_input_tokens < 0 OR observed_output_tokens < 0
     OR observed_total_tokens <> observed_input_tokens + observed_output_tokens
     OR observed_input_tokens > 9007199254740991
     OR observed_output_tokens > 9007199254740991
     OR observed_total_tokens > 9007199254740991
     OR observed_duration_ms < 1 OR observed_duration_ms > 9007199254740991 THEN
    RAISE EXCEPTION 'daily completion telemetry is unavailable or invalid';
  END IF;

  SELECT * INTO STRICT v_cursor
  FROM public."reader_summary_daily_execution_cursors" AS cursor_row
  WHERE cursor_row."tenant_id" = target_tenant_id
    AND cursor_row."workspace_id" = target_workspace_id
  FOR UPDATE;
  SELECT * INTO STRICT v_job
  FROM public."reader_summary_daily_model_jobs" AS job
  WHERE job."tenant_id" = target_tenant_id
    AND job."workspace_id" = target_workspace_id
    AND job."requested_utc_date" = target_date
  FOR UPDATE;

  -- Validate the complete canonical envelope before either first completion or
  -- idempotent replay. A replay is successful only for inputs that could have
  -- validly produced the already-sealed row.
  BEGIN
    v_response := pg_catalog.convert_from(exact_response, 'UTF8')::JSONB;
    v_receipt := pg_catalog.convert_from(exact_receipt_bytes, 'UTF8')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'daily structured response or receipt is not JSON';
  END;
  IF pg_catalog.jsonb_typeof(v_response) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(v_receipt) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(verified_attestation) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(v_receipt->'attestation')
      IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(v_receipt->'executionUsage')
      IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'daily response receipt envelope is invalid';
  END IF;
  IF (SELECT pg_catalog.count(*)
      FROM pg_catalog.jsonb_object_keys(v_receipt)) <> 9
    OR NOT v_receipt ?& ARRAY[
      'schemaVersion', 'modelJobIdentity', 'requestedUtcDate',
      'sourceAuthoritySha256', 'responseSha256', 'responseByteLength',
      'attestationSha256', 'attestation', 'executionUsage'
    ]
    OR (SELECT pg_catalog.count(*)
        FROM pg_catalog.jsonb_object_keys(verified_attestation)) <> 12
    OR NOT verified_attestation ?& ARRAY[
      'schemaVersion', 'requestId', 'purpose', 'canonicalRequestSha256',
      'provider', 'model', 'reasoningEffort', 'runtimeEngine',
      'runtimePackageVersion', 'launcherSha256', 'selectedOutputKind',
      'selectedOutputSha256'
    ]
    OR (SELECT pg_catalog.count(*)
        FROM pg_catalog.jsonb_object_keys(v_receipt->'executionUsage')) <> 5
    OR NOT (v_receipt->'executionUsage') ?& ARRAY[
      'inputTokens', 'outputTokens', 'totalTokens', 'usageSource', 'durationMs'
    ] THEN
    RAISE EXCEPTION 'daily response receipt key shape is invalid';
  END IF;

  v_expected_attestation_bytes := pg_catalog.convert_to(pg_catalog.concat(
    '{"canonicalRequestSha256":', verified_attestation->'canonicalRequestSha256',
    ',"launcherSha256":', verified_attestation->'launcherSha256',
    ',"model":', verified_attestation->'model',
    ',"provider":', verified_attestation->'provider',
    ',"purpose":', verified_attestation->'purpose',
    ',"reasoningEffort":', verified_attestation->'reasoningEffort',
    ',"requestId":', verified_attestation->'requestId',
    ',"runtimeEngine":', verified_attestation->'runtimeEngine',
    ',"runtimePackageVersion":', verified_attestation->'runtimePackageVersion',
    ',"schemaVersion":1,"selectedOutputKind":',
    verified_attestation->'selectedOutputKind',
    ',"selectedOutputSha256":', verified_attestation->'selectedOutputSha256', '}'
  ), 'UTF8');
  v_expected_receipt_bytes := pg_catalog.convert_to(pg_catalog.concat(
    '{"attestation":', pg_catalog.convert_from(v_expected_attestation_bytes, 'UTF8'),
    ',"attestationSha256":',
    pg_catalog.to_jsonb(pg_catalog.btrim(exact_attestation_sha256)),
    ',"executionUsage":{"durationMs":', observed_duration_ms,
    ',"inputTokens":', observed_input_tokens,
    ',"outputTokens":', observed_output_tokens,
    ',"totalTokens":', observed_total_tokens,
    ',"usageSource":', pg_catalog.to_jsonb(observed_usage_source),
    '},"modelJobIdentity":', pg_catalog.to_jsonb(v_job."identity"),
    ',"requestedUtcDate":', pg_catalog.to_jsonb(
      pg_catalog.to_char(target_date, 'YYYY-MM-DD')),
    ',"responseByteLength":', pg_catalog.octet_length(exact_response),
    ',"responseSha256":',
    pg_catalog.to_jsonb(pg_catalog.btrim(exact_response_sha256)),
    ',"schemaVersion":2,"sourceAuthoritySha256":',
    pg_catalog.to_jsonb(pg_catalog.btrim(v_job."source_authority_sha256")), '}'
  ), 'UTF8');
  IF pg_catalog.btrim(exact_response_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(exact_response), 'hex')
    OR pg_catalog.btrim(exact_attestation_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(exact_attestation_bytes), 'hex')
    OR pg_catalog.btrim(exact_receipt_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(exact_receipt_bytes), 'hex')
    OR pg_catalog.convert_from(exact_attestation_bytes, 'UTF8')::JSONB <>
      verified_attestation
    OR exact_attestation_bytes <> v_expected_attestation_bytes
    OR exact_receipt_bytes <> v_expected_receipt_bytes
    OR v_receipt->'schemaVersion' IS DISTINCT FROM '2'::JSONB
    OR v_receipt->>'modelJobIdentity' IS DISTINCT FROM v_job."identity"
    OR v_receipt->>'requestedUtcDate' IS DISTINCT FROM
      pg_catalog.to_char(target_date, 'YYYY-MM-DD')
    OR v_receipt->>'sourceAuthoritySha256' IS DISTINCT FROM
      pg_catalog.btrim(v_job."source_authority_sha256")
    OR v_receipt->>'responseSha256' IS DISTINCT FROM
      pg_catalog.btrim(exact_response_sha256)
    OR v_receipt->'responseByteLength' IS DISTINCT FROM
      pg_catalog.to_jsonb(pg_catalog.octet_length(exact_response))
    OR v_receipt->>'attestationSha256' IS DISTINCT FROM
      pg_catalog.btrim(exact_attestation_sha256)
    OR v_receipt->'attestation' IS DISTINCT FROM verified_attestation
    OR v_receipt->'executionUsage'->'inputTokens' IS DISTINCT FROM
      pg_catalog.to_jsonb(observed_input_tokens)
    OR v_receipt->'executionUsage'->'outputTokens' IS DISTINCT FROM
      pg_catalog.to_jsonb(observed_output_tokens)
    OR v_receipt->'executionUsage'->'totalTokens' IS DISTINCT FROM
      pg_catalog.to_jsonb(observed_total_tokens)
    OR v_receipt->'executionUsage'->>'usageSource'
      IS DISTINCT FROM observed_usage_source
    OR v_receipt->'executionUsage'->'durationMs' IS DISTINCT FROM
      pg_catalog.to_jsonb(observed_duration_ms)
    OR verified_attestation->'schemaVersion' IS DISTINCT FROM '1'::JSONB
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_each(verified_attestation) AS field
      WHERE field.key <> 'schemaVersion'
        AND pg_catalog.jsonb_typeof(field.value) <> 'string'
    )
    OR pg_catalog.length(verified_attestation->>'requestId') < 1
    OR verified_attestation->>'canonicalRequestSha256' !~ '^[0-9a-f]{64}$'
    OR verified_attestation->>'launcherSha256' !~ '^[0-9a-f]{64}$'
    OR verified_attestation->>'runtimePackageVersion' !~
      '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$'
    OR verified_attestation->>'provider' IS DISTINCT FROM v_job."provider"
    OR verified_attestation->>'model' IS DISTINCT FROM v_job."model"
    OR verified_attestation->>'reasoningEffort'
      IS DISTINCT FROM v_job."reasoning_effort"
    OR verified_attestation->>'runtimeEngine'
      IS DISTINCT FROM v_job."runtime_engine"
    OR verified_attestation->>'selectedOutputSha256' IS DISTINCT FROM
      pg_catalog.btrim(exact_response_sha256)
    OR verified_attestation->>'selectedOutputKind' IS DISTINCT FROM
      'structured_output'
    OR v_job."provider" IS DISTINCT FROM 'codex'
    OR v_job."model" IS DISTINCT FROM 'gpt-5.6-sol'
    OR v_job."reasoning_effort" IS DISTINCT FROM 'high'
    OR v_job."runtime_engine" IS DISTINCT FROM 'subscription-runtime-cli'
    OR verified_attestation->>'purpose' IS DISTINCT FROM
      'social_monitor.reader_summary.generate.v2' THEN
    RAISE EXCEPTION 'daily response, receipt, attestation, or telemetry is invalid';
  END IF;

  IF v_job."state" = 'COMPLETED' THEN
    IF v_job."response_bytes" <> exact_response
      OR pg_catalog.btrim(v_job."response_sha256") <>
        pg_catalog.btrim(exact_response_sha256)
      OR v_job."attestation" <> verified_attestation
      OR v_job."attestation_bytes" <> exact_attestation_bytes
      OR v_job."receipt_bytes" <> exact_receipt_bytes
      OR pg_catalog.btrim(v_job."attestation_sha256") <>
        pg_catalog.btrim(exact_attestation_sha256)
      OR pg_catalog.btrim(v_job."receipt_sha256") <>
        pg_catalog.btrim(exact_receipt_sha256)
      OR v_job."input_tokens" IS DISTINCT FROM observed_input_tokens
      OR v_job."output_tokens" IS DISTINCT FROM observed_output_tokens
      OR v_job."total_tokens" IS DISTINCT FROM observed_total_tokens
      OR v_job."usage_source" IS DISTINCT FROM observed_usage_source
      OR v_job."duration_ms" IS DISTINCT FROM observed_duration_ms THEN
      RAISE EXCEPTION 'daily COMPLETED telemetry replay diverged';
    END IF;
    RETURN TRUE;
  END IF;
  IF v_job."state" <> 'RUNNING'
    OR v_cursor."active_requested_utc_date" <> target_date
    OR v_cursor."lease_owner" <> target_worker_id
    OR v_cursor."fencing_token" <> target_fencing_token
    OR finished_at >= v_cursor."lease_expires_at"
    OR finished_at >= v_cursor."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily telemetry completion has a stale fence or state';
  END IF;

  UPDATE public."reader_summary_daily_model_jobs" SET
    "state" = 'COMPLETED', "completed_at" = finished_at,
    "response_bytes" = exact_response,
    "response_sha256" = exact_response_sha256,
    "attestation" = verified_attestation,
    "attestation_bytes" = exact_attestation_bytes,
    "attestation_sha256" = exact_attestation_sha256,
    "receipt_bytes" = exact_receipt_bytes,
    "receipt_sha256" = exact_receipt_sha256,
    "input_tokens" = observed_input_tokens,
    "output_tokens" = observed_output_tokens,
    "total_tokens" = observed_total_tokens,
    "usage_source" = observed_usage_source,
    "duration_ms" = observed_duration_ms
  WHERE "tenant_id" = target_tenant_id
    AND "workspace_id" = target_workspace_id
    AND "requested_utc_date" = target_date;
  RETURN TRUE;
END
$$;

RESET ROLE;
GRANT social_monitor_reader_summary_daily_publication_definer
  TO social_monitor_public_schema_owner
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
SET LOCAL ROLE social_monitor_public_schema_owner;
GRANT CREATE ON SCHEMA public
  TO social_monitor_reader_summary_daily_publication_definer;
ALTER FUNCTION public."complete_reader_summary_daily_model_job_v2"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR,
  JSONB, BYTEA, CHAR, BYTEA, CHAR, BIGINT, BIGINT, BIGINT, TEXT, BIGINT
) OWNER TO social_monitor_reader_summary_daily_publication_definer;
REVOKE CREATE ON SCHEMA public
  FROM social_monitor_reader_summary_daily_publication_definer;
SET LOCAL ROLE social_monitor_reader_summary_daily_publication_definer;

-- Historical rows remain readable and replayable through their persisted
-- bytes, but the pre-telemetry completion authority cannot complete a new
-- v2/high claim without the equality-bound telemetry contract above.
REVOKE ALL ON FUNCTION public."complete_reader_summary_daily_model_job"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR,
  JSONB, BYTEA, CHAR, BYTEA, CHAR
) FROM social_monitor_reader_summary_daily_terminal;

REVOKE ALL ON FUNCTION public."complete_reader_summary_daily_model_job_v2"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR,
  JSONB, BYTEA, CHAR, BYTEA, CHAR, BIGINT, BIGINT, BIGINT, TEXT, BIGINT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."complete_reader_summary_daily_model_job_v2"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR,
  JSONB, BYTEA, CHAR, BYTEA, CHAR, BIGINT, BIGINT, BIGINT, TEXT, BIGINT
) TO social_monitor_reader_summary_daily_terminal;
RESET ROLE;

-- Cut new daily reservations over to the active v2/high execution identity.
-- The guarded definition rewrite preserves the existing claim concurrency,
-- source-authority, fencing, and bounded-maintenance behavior byte-for-byte.
DO $daily_active_claim_profile$
DECLARE
  v_definition TEXT;
  v_owner_oid OID;
  v_owner_name NAME;
  v_session_user_oid OID;
  v_boundary_current_user_oid OID;
  v_version_from CONSTANT TEXT := '''reader-summary-daily:v1''';
  v_version_to CONSTANT TEXT := '''reader-summary-daily:v2''';
  v_effort_from CONSTANT TEXT := '''xhigh''';
  v_effort_to CONSTANT TEXT := '''high''';
BEGIN
  SELECT "session_user_oid", "current_user_oid"
  INTO STRICT v_session_user_oid, v_boundary_current_user_oid
  FROM pg_temp."reader_summary_daily_model_telemetry_session_roles";
  SELECT proc.proowner, owner_role.rolname,
    pg_catalog.pg_get_functiondef(proc.oid)
  INTO STRICT v_owner_oid, v_owner_name, v_definition
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = proc.proowner
  WHERE proc.oid =
    'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure;
  IF (v_owner_oid = ANY (ARRAY[
    v_session_user_oid,
    v_boundary_current_user_oid,
    pg_catalog.to_regrole('social_monitor_public_schema_owner')::OID,
    pg_catalog.to_regrole(
      'social_monitor_reader_summary_daily_publication_definer'
    )::OID
  ])) IS NOT TRUE THEN
    RAISE EXCEPTION 'daily active claim has unexpected owner';
  END IF;
  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_owner_name);
  IF (pg_catalog.length(v_definition) - pg_catalog.length(
        pg_catalog.replace(v_definition, v_version_from, '')))
      / pg_catalog.length(v_version_from) <> 1
    OR (pg_catalog.length(v_definition) - pg_catalog.length(
          pg_catalog.replace(v_definition, v_effort_from, '')))
      / pg_catalog.length(v_effort_from) <> 2
    OR pg_catalog.strpos(v_definition, v_version_to) <> 0 THEN
    RAISE EXCEPTION 'daily active claim profile is not the expected v1/xhigh definition';
  END IF;
  EXECUTE pg_catalog.replace(
    pg_catalog.replace(v_definition, v_version_from, v_version_to),
    v_effort_from,
    v_effort_to
  );
END;
$daily_active_claim_profile$;
RESET ROLE;

DO $daily_bounded_active_claim_profile$
DECLARE
  v_definition TEXT;
  v_owner_oid OID;
  v_owner_name NAME;
  v_session_user_oid OID;
  v_boundary_current_user_oid OID;
  v_version_from CONSTANT TEXT := '''reader-summary-daily:v1''';
  v_version_to CONSTANT TEXT := '''reader-summary-daily:v2''';
  v_effort_from CONSTANT TEXT := '''xhigh''';
  v_effort_to CONSTANT TEXT := '''high''';
BEGIN
  SELECT "session_user_oid", "current_user_oid"
  INTO STRICT v_session_user_oid, v_boundary_current_user_oid
  FROM pg_temp."reader_summary_daily_model_telemetry_session_roles";
  SELECT proc.proowner, owner_role.rolname,
    pg_catalog.pg_get_functiondef(proc.oid)
  INTO STRICT v_owner_oid, v_owner_name, v_definition
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = proc.proowner
  WHERE proc.oid =
    'public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure;
  IF (v_owner_oid = ANY (ARRAY[
    v_session_user_oid,
    v_boundary_current_user_oid,
    pg_catalog.to_regrole('social_monitor_public_schema_owner')::OID,
    pg_catalog.to_regrole(
      'social_monitor_reader_summary_daily_publication_definer'
    )::OID
  ])) IS NOT TRUE THEN
    RAISE EXCEPTION 'bounded daily active claim has unexpected owner';
  END IF;
  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_owner_name);
  IF (pg_catalog.length(v_definition) - pg_catalog.length(
        pg_catalog.replace(v_definition, v_version_from, '')))
      / pg_catalog.length(v_version_from) <> 1
    OR (pg_catalog.length(v_definition) - pg_catalog.length(
          pg_catalog.replace(v_definition, v_effort_from, '')))
      / pg_catalog.length(v_effort_from) <> 2
    OR pg_catalog.strpos(v_definition, v_version_to) <> 0 THEN
    RAISE EXCEPTION 'bounded daily active claim profile is not the expected v1/xhigh definition';
  END IF;
  EXECUTE pg_catalog.replace(
    pg_catalog.replace(v_definition, v_version_from, v_version_to),
    v_effort_from,
    v_effort_to
  );
END;
$daily_bounded_active_claim_profile$;
RESET ROLE;
REVOKE social_monitor_reader_summary_daily_publication_definer
  FROM social_monitor_public_schema_owner GRANTED BY CURRENT_USER;

COMMIT;
