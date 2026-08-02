-- @social-monitor-forward-migration
-- Release B: activate the dormant v1 daily cursor through canonical publication.
-- Lock risk: additive columns plus row-locked SERIALIZABLE runtime transitions.
BEGIN;

ALTER TABLE "reader_summary_daily_model_jobs"
  ADD COLUMN "reader_summary_job_id" UUID,
  ADD COLUMN "reader_summary_artifact_id" UUID,
  ADD COLUMN "publication_id" UUID,
  ADD COLUMN "publication_report_sha256" CHAR(64),
  ADD COLUMN "publication_proof_sha256" CHAR(64),
  ADD COLUMN "weekly_evidence_sha256" CHAR(64),
  ADD COLUMN "public_evidence_sha256" CHAR(64),
  ADD COLUMN "public_frontend_sha256" CHAR(64),
  ADD COLUMN "publication_finalized_at" TIMESTAMPTZ(6),
  ADD CONSTRAINT "reader_summary_daily_model_jobs_job_fkey"
    FOREIGN KEY ("reader_summary_job_id") REFERENCES "reader_summary_jobs"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reader_summary_daily_model_jobs_artifact_fkey"
    FOREIGN KEY ("reader_summary_artifact_id") REFERENCES "reader_summary_artifacts"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reader_summary_daily_model_jobs_publication_fkey"
    FOREIGN KEY ("publication_id") REFERENCES "reader_summary_publications"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reader_summary_daily_model_jobs_publication_check" CHECK (
    ("publication_finalized_at" IS NULL
      AND "reader_summary_job_id" IS NULL
      AND "reader_summary_artifact_id" IS NULL
      AND "publication_id" IS NULL
      AND "publication_report_sha256" IS NULL
      AND "publication_proof_sha256" IS NULL
      AND "weekly_evidence_sha256" IS NULL
      AND "public_evidence_sha256" IS NULL
      AND "public_frontend_sha256" IS NULL)
    OR
    ("state" = 'COMPLETED' AND "publication_finalized_at" IS NOT NULL
      AND "reader_summary_job_id" IS NOT NULL
      AND "reader_summary_artifact_id" IS NOT NULL
      AND "publication_id" = "reader_summary_artifact_id"
      AND "publication_report_sha256" ~ '^[0-9a-f]{64}$'
      AND "publication_proof_sha256" ~ '^[0-9a-f]{64}$'
      AND "weekly_evidence_sha256" ~ '^[0-9a-f]{64}$'
      AND "public_evidence_sha256" ~ '^[0-9a-f]{64}$'
      AND "public_frontend_sha256" ~ '^[0-9a-f]{64}$')
  );

ALTER TABLE "reader_summary_daily_model_jobs"
  ADD CONSTRAINT "reader_summary_daily_model_jobs_job_key"
    UNIQUE ("reader_summary_job_id"),
  ADD CONSTRAINT "reader_summary_daily_model_jobs_artifact_key"
    UNIQUE ("reader_summary_artifact_id"),
  ADD CONSTRAINT "reader_summary_daily_model_jobs_publication_key"
    UNIQUE ("publication_id");

-- Completion durably seals the provider response, attestation, and receipt.
-- It intentionally does not advance the daily cursor; canonical publication
-- and exact public-file verification are the separate final transition below.
CREATE OR REPLACE FUNCTION "complete_reader_summary_daily_model_job"(
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
      OR v_job."receipt_bytes" <> exact_receipt_bytes
      OR btrim(v_job."attestation_sha256") <> btrim(exact_attestation_sha256) THEN
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
  RETURN TRUE;
END
$$;

CREATE FUNCTION "finalize_reader_summary_daily_publication"(
  target_tenant_id UUID, target_workspace_id UUID, target_date DATE,
  target_worker_id TEXT, target_fencing_token BIGINT, finalized_at TIMESTAMPTZ,
  target_job_id UUID, target_artifact_id UUID, target_publication_id UUID,
  target_report_sha256 CHAR(64), target_proof_sha256 CHAR(64),
  target_weekly_evidence_sha256 CHAR(64), public_evidence_bytes BYTEA,
  target_public_evidence_sha256 CHAR(64), public_frontend_bytes BYTEA,
  target_public_frontend_sha256 CHAR(64)
)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_cursor "reader_summary_daily_execution_cursors"%ROWTYPE;
DECLARE v_job "reader_summary_daily_model_jobs"%ROWTYPE;
DECLARE v_publication RECORD;
DECLARE v_public_evidence JSONB;
DECLARE v_public_frontend JSONB;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'daily publication finalization requires SERIALIZABLE';
  END IF;
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily publication finalization requires the dedicated terminal login';
  END IF;
  IF finalized_at < transaction_timestamp() - INTERVAL '5 minutes'
     OR finalized_at > transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily publication finalization time is not current';
  END IF;
  SELECT * INTO STRICT v_cursor FROM "reader_summary_daily_execution_cursors" c
  WHERE c."tenant_id" = target_tenant_id AND c."workspace_id" = target_workspace_id
  FOR UPDATE;
  SELECT * INTO STRICT v_job FROM "reader_summary_daily_model_jobs" job
  WHERE job."tenant_id" = target_tenant_id AND job."workspace_id" = target_workspace_id
    AND job."requested_utc_date" = target_date FOR UPDATE;
  IF v_job."publication_finalized_at" IS NOT NULL THEN
    IF v_job."reader_summary_job_id" <> target_job_id
      OR v_job."reader_summary_artifact_id" <> target_artifact_id
      OR v_job."publication_id" <> target_publication_id
      OR btrim(v_job."publication_report_sha256") <> btrim(target_report_sha256)
      OR btrim(v_job."publication_proof_sha256") <> btrim(target_proof_sha256)
      OR btrim(v_job."weekly_evidence_sha256") <>
        btrim(target_weekly_evidence_sha256)
      OR btrim(v_job."public_evidence_sha256") <> btrim(target_public_evidence_sha256)
      OR btrim(v_job."public_frontend_sha256") <> btrim(target_public_frontend_sha256) THEN
      RAISE EXCEPTION 'daily publication replay binding diverged';
    END IF;
    RETURN TRUE;
  END IF;
  IF v_job."state" <> 'COMPLETED' OR v_job."receipt_bytes" IS NULL
    OR v_cursor."next_unresolved_utc_date" <> target_date
    OR v_cursor."active_requested_utc_date" <> target_date
    OR v_cursor."lease_owner" <> target_worker_id
    OR v_cursor."fencing_token" <> target_fencing_token
    OR finalized_at >= v_cursor."lease_expires_at"
    OR finalized_at >= v_cursor."absolute_expires_at" THEN
    RAISE EXCEPTION 'daily publication finalization has a stale fence or incomplete receipt';
  END IF;
  IF target_publication_id <> target_artifact_id
    OR btrim(target_public_evidence_sha256) !~ '^[0-9a-f]{64}$'
    OR btrim(target_public_frontend_sha256) !~ '^[0-9a-f]{64}$'
    OR btrim(target_public_evidence_sha256) <> encode(sha256(public_evidence_bytes), 'hex')
    OR btrim(target_public_frontend_sha256) <> encode(sha256(public_frontend_bytes), 'hex') THEN
    RAISE EXCEPTION 'daily public file hashes are invalid';
  END IF;
  BEGIN
    v_public_evidence := convert_from(public_evidence_bytes, 'UTF8')::JSONB;
    v_public_frontend := convert_from(public_frontend_bytes, 'UTF8')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'daily public files are not valid JSON';
  END;
  IF v_public_evidence->'scope'->>'tenantId' <> target_tenant_id::TEXT
    OR v_public_evidence->'scope'->>'workspaceId' <> target_workspace_id::TEXT
    OR v_public_evidence->'result'->>'readerSummaryJobId' <> target_job_id::TEXT
    OR v_public_evidence->'result'->>'readerSummaryId' <> target_artifact_id::TEXT
    OR v_public_frontend->>'tenantId' <> target_tenant_id::TEXT
    OR v_public_frontend->>'workspaceId' <> target_workspace_id::TEXT THEN
    RAISE EXCEPTION 'daily public files do not bind the canonical publication';
  END IF;
  SELECT publication."report_sha256", publication."proof_sha256",
    evidence."canonical_sha256", publication."reader_summary_job_id",
    publication."reader_summary_artifact_id"
  INTO STRICT v_publication
  FROM "reader_summary_publications" publication
  JOIN "reader_summary_jobs" canonical_job
    ON canonical_job."id" = publication."reader_summary_job_id"
  JOIN "reader_summary_artifacts" artifact
    ON artifact."id" = publication."reader_summary_artifact_id"
  JOIN "reader_summary_weekly_publication_evidence" evidence
    ON evidence."publication_id" = publication."id"
  WHERE publication."id" = target_publication_id
    AND publication."tenant_id" = target_tenant_id
    AND publication."workspace_id" = target_workspace_id
    AND publication."requested_utc_date" = target_date
    AND publication."cadence" = 'daily'
    AND publication."semantic_status" IN ('COMPLETED', 'NO_SIGNAL')
    AND canonical_job."id" = target_job_id
    AND canonical_job."status" = publication."semantic_status"
    AND canonical_job."reader_summary_artifact_id" = target_artifact_id
    AND artifact."id" = target_artifact_id
    AND artifact."status" = publication."semantic_status"
    AND evidence."reader_summary_job_id" = target_job_id
    AND evidence."reader_summary_artifact_id" = target_artifact_id
    AND encode(sha256(evidence."canonical_bytes"), 'hex') =
      btrim(evidence."canonical_sha256");
  IF btrim(v_publication."report_sha256") <> btrim(target_report_sha256)
    OR btrim(v_publication."proof_sha256") <> btrim(target_proof_sha256)
    OR btrim(v_publication."canonical_sha256") <>
      btrim(target_weekly_evidence_sha256) THEN
    RAISE EXCEPTION 'daily canonical DB publication hashes diverged';
  END IF;
  UPDATE "reader_summary_daily_model_jobs" SET
    "reader_summary_job_id" = target_job_id,
    "reader_summary_artifact_id" = target_artifact_id,
    "publication_id" = target_publication_id,
    "publication_report_sha256" = target_report_sha256,
    "publication_proof_sha256" = target_proof_sha256,
    "weekly_evidence_sha256" = target_weekly_evidence_sha256,
    "public_evidence_sha256" = target_public_evidence_sha256,
    "public_frontend_sha256" = target_public_frontend_sha256,
    "publication_finalized_at" = finalized_at
  WHERE "tenant_id" = target_tenant_id AND "workspace_id" = target_workspace_id
    AND "requested_utc_date" = target_date;
  UPDATE "reader_summary_daily_execution_cursors" SET
    "next_unresolved_utc_date" = target_date + 1,
    "active_requested_utc_date" = NULL, "lease_owner" = NULL,
    "leased_at" = NULL, "lease_expires_at" = NULL,
    "absolute_expires_at" = NULL, "updated_at" = finalized_at
  WHERE "tenant_id" = target_tenant_id AND "workspace_id" = target_workspace_id;
  RETURN TRUE;
END
$$;

REVOKE ALL ON FUNCTION "finalize_reader_summary_daily_publication"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, UUID, UUID, UUID,
  CHAR(64), CHAR(64), CHAR(64), BYTEA, CHAR(64), BYTEA, CHAR(64)) FROM PUBLIC;

DO $grant_daily_activation_if_present$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles
    WHERE rolname = 'social_monitor_reader_summary_daily_terminal') THEN
    GRANT EXECUTE ON FUNCTION "finalize_reader_summary_daily_publication"(
      UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, UUID, UUID, UUID,
      CHAR(64), CHAR(64), CHAR(64), BYTEA, CHAR(64), BYTEA, CHAR(64))
    TO social_monitor_reader_summary_daily_terminal;
  END IF;
END
$grant_daily_activation_if_present$;

COMMIT;
