-- @social-monitor-forward-migration
-- Expand-only telemetry for the existing daily model-job receipt authority.
-- Existing rows remain explicitly historical/incomplete; no usage is inferred.
BEGIN;

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
DECLARE v_receipt JSONB;
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
  IF observed_usage_source NOT IN ('PROVIDER_REPORTED', 'ESTIMATED')
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

  IF v_job."state" = 'COMPLETED' THEN
    IF v_job."response_bytes" <> exact_response
      OR v_job."receipt_bytes" <> exact_receipt_bytes
      OR pg_catalog.btrim(v_job."attestation_sha256") <>
        pg_catalog.btrim(exact_attestation_sha256)
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

  v_receipt := pg_catalog.convert_from(exact_receipt_bytes, 'UTF8')::JSONB;
  IF pg_catalog.btrim(exact_response_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(exact_response), 'hex')
    OR pg_catalog.btrim(exact_attestation_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(exact_attestation_bytes), 'hex')
    OR pg_catalog.btrim(exact_receipt_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(exact_receipt_bytes), 'hex')
    OR pg_catalog.convert_from(exact_attestation_bytes, 'UTF8')::JSONB <>
      verified_attestation
    OR v_receipt->>'schemaVersion' IS DISTINCT FROM '2'
    OR v_receipt->>'modelJobIdentity' IS DISTINCT FROM v_job."identity"
    OR v_receipt->>'responseSha256' IS DISTINCT FROM
      pg_catalog.btrim(exact_response_sha256)
    OR v_receipt->>'attestationSha256' IS DISTINCT FROM
      pg_catalog.btrim(exact_attestation_sha256)
    OR v_receipt->'attestation' IS DISTINCT FROM verified_attestation
    OR (v_receipt->'executionUsage'->>'inputTokens')::BIGINT
      IS DISTINCT FROM observed_input_tokens
    OR (v_receipt->'executionUsage'->>'outputTokens')::BIGINT
      IS DISTINCT FROM observed_output_tokens
    OR (v_receipt->'executionUsage'->>'totalTokens')::BIGINT
      IS DISTINCT FROM observed_total_tokens
    OR v_receipt->'executionUsage'->>'usageSource'
      IS DISTINCT FROM observed_usage_source
    OR (v_receipt->'executionUsage'->>'durationMs')::BIGINT
      IS DISTINCT FROM observed_duration_ms
    OR verified_attestation->>'provider' IS DISTINCT FROM v_job."provider"
    OR verified_attestation->>'model' IS DISTINCT FROM v_job."model"
    OR verified_attestation->>'reasoningEffort'
      IS DISTINCT FROM v_job."reasoning_effort"
    OR verified_attestation->>'runtimeEngine'
      IS DISTINCT FROM v_job."runtime_engine"
    OR verified_attestation->>'selectedOutputSha256' IS DISTINCT FROM
      pg_catalog.btrim(exact_response_sha256)
    OR v_job."provider" IS DISTINCT FROM 'codex'
    OR v_job."model" IS DISTINCT FROM 'gpt-5.6-sol'
    OR v_job."reasoning_effort" IS DISTINCT FROM 'high'
    OR v_job."runtime_engine" IS DISTINCT FROM 'subscription-runtime-cli'
    OR verified_attestation->>'purpose' IS DISTINCT FROM
      'social_monitor.reader_summary.generate.v2' THEN
    RAISE EXCEPTION 'daily response, receipt, attestation, or telemetry is invalid';
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
ALTER FUNCTION public."complete_reader_summary_daily_model_job_v2"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR,
  JSONB, BYTEA, CHAR, BYTEA, CHAR, BIGINT, BIGINT, BIGINT, TEXT, BIGINT
) OWNER TO social_monitor_reader_summary_daily_publication_definer;
RESET ROLE;
REVOKE social_monitor_reader_summary_daily_publication_definer
  FROM social_monitor_public_schema_owner GRANTED BY CURRENT_USER;

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
SET LOCAL ROLE social_monitor_public_schema_owner;
DO $daily_active_claim_profile$
DECLARE
  v_definition TEXT;
  v_version_from CONSTANT TEXT := '''reader-summary-daily:v1''';
  v_version_to CONSTANT TEXT := '''reader-summary-daily:v2''';
  v_effort_from CONSTANT TEXT := '''xhigh''';
  v_effort_to CONSTANT TEXT := '''high''';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
  ) INTO STRICT v_definition;
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

DO $daily_bounded_active_claim_profile$
DECLARE
  v_definition TEXT;
  v_version_from CONSTANT TEXT := '''reader-summary-daily:v1''';
  v_version_to CONSTANT TEXT := '''reader-summary-daily:v2''';
  v_effort_from CONSTANT TEXT := '''xhigh''';
  v_effort_to CONSTANT TEXT := '''high''';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
  ) INTO STRICT v_definition;
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

COMMIT;
