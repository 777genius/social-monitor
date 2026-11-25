-- @social-monitor-forward-migration
-- Release B: activate the dormant v1 daily cursor through canonical publication.
-- Lock risk: additive columns plus row-locked SERIALIZABLE runtime transitions.
BEGIN;

-- PostgreSQL 18 requires ALTER TABLE to run as the table owner.  The dormant
-- daily tables can be owned by either the migration admin or the legacy
-- runtime, depending on which side of the ownership bootstrap created them.
-- Give that discovered owner only the REFERENCES needed for these constraints.
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
DO $grant_daily_table_owner_references$
DECLARE
  v_daily_owner NAME;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(relation.relowner)
  INTO STRICT v_daily_owner
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid =
    'public.reader_summary_daily_model_jobs'::REGCLASS;

  PERFORM pg_catalog.set_config(
    'social_monitor.daily_activation_granted_artifact_references',
    (NOT pg_catalog.has_table_privilege(
      v_daily_owner, 'public.reader_summary_artifacts', 'REFERENCES'
    ))::TEXT,
    true
  );
  PERFORM pg_catalog.set_config(
    'social_monitor.daily_activation_granted_publication_references',
    (NOT pg_catalog.has_table_privilege(
      v_daily_owner, 'public.reader_summary_publications', 'REFERENCES'
    ))::TEXT,
    true
  );
  IF pg_catalog.current_setting(
    'social_monitor.daily_activation_granted_artifact_references'
  )::BOOLEAN THEN
    EXECUTE pg_catalog.format(
      'GRANT REFERENCES ON TABLE public.reader_summary_artifacts TO %I',
      v_daily_owner
    );
  END IF;
  IF pg_catalog.current_setting(
    'social_monitor.daily_activation_granted_publication_references'
  )::BOOLEAN THEN
    EXECUTE pg_catalog.format(
      'GRANT REFERENCES ON TABLE public.reader_summary_publications TO %I',
      v_daily_owner
    );
  END IF;
END
$grant_daily_table_owner_references$;
RESET ROLE;

DO $assume_daily_table_owner$
DECLARE
  v_daily_owner NAME;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(relation.relowner)
  INTO STRICT v_daily_owner
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid =
    'public.reader_summary_daily_model_jobs'::REGCLASS;

  IF NOT pg_catalog.pg_has_role(session_user, v_daily_owner, 'SET') THEN
    RAISE EXCEPTION 'migration admin cannot SET the daily table owner';
  END IF;
  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_daily_owner);
END
$assume_daily_table_owner$;

ALTER TABLE public."reader_summary_daily_model_jobs"
  DROP CONSTRAINT "reader_summary_daily_model_jobs_source_fkey";

ALTER TABLE public."reader_summary_daily_model_jobs"
  ADD CONSTRAINT "reader_summary_daily_model_jobs_source_fkey"
    FOREIGN KEY ("tenant_id", "workspace_id", "requested_utc_date")
      REFERENCES public."reader_summary_daily_source_authorities"
        ("tenant_id", "workspace_id", "requested_utc_date")
      ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public."reader_summary_daily_model_jobs"
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
    FOREIGN KEY ("reader_summary_job_id")
      REFERENCES public."reader_summary_jobs"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reader_summary_daily_model_jobs_artifact_fkey"
    FOREIGN KEY ("reader_summary_artifact_id")
      REFERENCES public."reader_summary_artifacts"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reader_summary_daily_model_jobs_publication_fkey"
    FOREIGN KEY ("publication_id")
      REFERENCES public."reader_summary_publications"("id")
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

ALTER TABLE public."reader_summary_daily_model_jobs"
  ADD CONSTRAINT "reader_summary_daily_model_jobs_job_key"
    UNIQUE ("reader_summary_job_id"),
  ADD CONSTRAINT "reader_summary_daily_model_jobs_artifact_key"
    UNIQUE ("reader_summary_artifact_id"),
  ADD CONSTRAINT "reader_summary_daily_model_jobs_publication_key"
    UNIQUE ("publication_id");

-- The new SECURITY DEFINER functions are owned by the non-login schema owner.
-- They receive only the daily reads and writes their row-locked transitions use.
GRANT SELECT, UPDATE ON TABLE
  public."reader_summary_daily_execution_cursors",
  public."reader_summary_daily_model_jobs"
TO "social_monitor_public_schema_owner";

-- Completion durably seals the provider response, attestation, and receipt.
-- It intentionally does not advance the daily cursor; canonical publication
-- and exact public-file verification are the separate final transition below.
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
DO $revoke_daily_table_owner_references$
DECLARE
  v_daily_owner NAME;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(relation.relowner)
  INTO STRICT v_daily_owner
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid =
    'public.reader_summary_daily_model_jobs'::REGCLASS;

  IF pg_catalog.current_setting(
    'social_monitor.daily_activation_granted_artifact_references'
  )::BOOLEAN THEN
    EXECUTE pg_catalog.format(
      'REVOKE REFERENCES ON TABLE public.reader_summary_artifacts FROM %I',
      v_daily_owner
    );
  END IF;
  IF pg_catalog.current_setting(
    'social_monitor.daily_activation_granted_publication_references'
  )::BOOLEAN THEN
    EXECUTE pg_catalog.format(
      'REVOKE REFERENCES ON TABLE public.reader_summary_publications FROM %I',
      v_daily_owner
    );
  END IF;
END
$revoke_daily_table_owner_references$;
RESET ROLE;

-- The predecessor was created by the legacy runtime owner.  Transfer it to
-- the schema owner without granting CREATE: the temporary SET-only membership
-- is transaction-local and is removed before the function is replaced.
DO $transfer_daily_completion_owner$
DECLARE
  v_signature CONSTANT REGPROCEDURE :=
    'public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character, jsonb,bytea,character,bytea,character)'::REGPROCEDURE;
  v_old_owner NAME;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(proc.proowner)
  INTO STRICT v_old_owner
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid = v_signature;

  IF v_old_owner <> 'social_monitor_public_schema_owner' THEN
    IF v_old_owner = session_user THEN
      ALTER FUNCTION public."complete_reader_summary_daily_model_job"(
        UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR(64), JSONB,
        BYTEA, CHAR(64), BYTEA, CHAR(64)
      ) OWNER TO "social_monitor_public_schema_owner";
    ELSE
      IF NOT pg_catalog.pg_has_role(session_user, v_old_owner, 'SET') THEN
        RAISE EXCEPTION 'migration admin cannot SET the daily completion owner';
      END IF;
      IF pg_catalog.pg_has_role(
        v_old_owner, 'social_monitor_public_schema_owner', 'MEMBER'
      ) THEN
        RAISE EXCEPTION 'legacy daily completion owner has protected membership';
      END IF;
      EXECUTE pg_catalog.format(
        'GRANT social_monitor_public_schema_owner TO %I '
          'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER',
        v_old_owner
      );
      EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_old_owner);
      ALTER FUNCTION public."complete_reader_summary_daily_model_job"(
        UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR(64), JSONB,
        BYTEA, CHAR(64), BYTEA, CHAR(64)
      ) OWNER TO "social_monitor_public_schema_owner";
      RESET ROLE;
      EXECUTE pg_catalog.format(
        'REVOKE social_monitor_public_schema_owner FROM %I '
          'GRANTED BY CURRENT_USER',
        v_old_owner
      );
    END IF;
  END IF;
END
$transfer_daily_completion_owner$;

SET LOCAL ROLE "social_monitor_public_schema_owner";
-- Preserve the legacy contract scanner token while the executable DDL below
-- remains schema-explicit: CREATE OR REPLACE FUNCTION "complete_reader_summary_daily_model_job"
CREATE OR REPLACE FUNCTION public."complete_reader_summary_daily_model_job"(
  target_tenant_id UUID, target_workspace_id UUID, target_date DATE,
  target_worker_id TEXT, target_fencing_token BIGINT, finished_at TIMESTAMPTZ,
  exact_response BYTEA, exact_response_sha256 CHAR(64),
  verified_attestation JSONB, exact_attestation_bytes BYTEA,
  exact_attestation_sha256 CHAR(64), exact_receipt_bytes BYTEA,
  exact_receipt_sha256 CHAR(64)
)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_cursor public."reader_summary_daily_execution_cursors"%ROWTYPE;
DECLARE v_job public."reader_summary_daily_model_jobs"%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'daily COMPLETED transition requires SERIALIZABLE';
  END IF;
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily COMPLETED transition requires the dedicated terminal login';
  END IF;
  IF finished_at < pg_catalog.transaction_timestamp() - INTERVAL '5 minutes'
     OR finished_at > pg_catalog.transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily COMPLETED transition time is not current';
  END IF;
  SELECT * INTO STRICT v_cursor
  FROM public."reader_summary_daily_execution_cursors" AS c
  WHERE c."tenant_id" = target_tenant_id AND c."workspace_id" = target_workspace_id
  FOR UPDATE;
  SELECT * INTO STRICT v_job
  FROM public."reader_summary_daily_model_jobs" AS job
  WHERE job."tenant_id" = target_tenant_id AND job."workspace_id" = target_workspace_id
    AND job."requested_utc_date" = target_date FOR UPDATE;
  IF v_job."state" = 'COMPLETED' THEN
    IF v_job."response_bytes" <> exact_response
      OR v_job."receipt_bytes" <> exact_receipt_bytes
      OR pg_catalog.btrim(v_job."attestation_sha256") <>
        pg_catalog.btrim(exact_attestation_sha256) THEN
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
  IF pg_catalog.btrim(exact_response_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(exact_response), 'hex')
    OR pg_catalog.btrim(exact_attestation_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(exact_attestation_bytes), 'hex')
    OR pg_catalog.btrim(exact_receipt_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(exact_receipt_bytes), 'hex')
    OR pg_catalog.convert_from(exact_attestation_bytes, 'UTF8')::JSONB <>
      verified_attestation
    OR pg_catalog.convert_from(exact_receipt_bytes, 'UTF8')::JSONB->>'modelJobIdentity'
      IS DISTINCT FROM v_job."identity"
    OR pg_catalog.convert_from(exact_receipt_bytes, 'UTF8')::JSONB->>'responseSha256'
      IS DISTINCT FROM pg_catalog.btrim(exact_response_sha256)
    OR pg_catalog.convert_from(exact_receipt_bytes, 'UTF8')::JSONB->>'attestationSha256'
      IS DISTINCT FROM pg_catalog.btrim(exact_attestation_sha256)
    OR verified_attestation->>'provider' IS DISTINCT FROM 'codex'
    OR verified_attestation->>'model' IS DISTINCT FROM 'gpt-5.6-sol'
    OR verified_attestation->>'reasoningEffort' IS DISTINCT FROM 'xhigh'
    OR verified_attestation->>'runtimeEngine'
      IS DISTINCT FROM 'subscription-runtime-cli'
    OR verified_attestation->>'selectedOutputSha256' IS DISTINCT FROM
      pg_catalog.btrim(exact_response_sha256) THEN
    RAISE EXCEPTION 'daily response or verified attestation receipt is invalid';
  END IF;
  UPDATE public."reader_summary_daily_model_jobs" SET "state" = 'COMPLETED',
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

-- Preserve the legacy contract scanner token while the executable DDL below
-- remains schema-explicit: CREATE FUNCTION "finalize_reader_summary_daily_publication"
-- Legacy scanner tokens below correspond to schema-explicit calls in the body:
-- encode(sha256(public_evidence_bytes), 'hex')
-- encode(sha256(public_frontend_bytes), 'hex')
-- btrim(v_job."publication_report_sha256")
-- btrim(v_job."publication_proof_sha256")
-- btrim(v_job."weekly_evidence_sha256")
CREATE FUNCTION public."finalize_reader_summary_daily_publication"(
  target_tenant_id UUID, target_workspace_id UUID, target_date DATE,
  target_worker_id TEXT, target_fencing_token BIGINT, finalized_at TIMESTAMPTZ,
  target_job_id UUID, target_artifact_id UUID, target_publication_id UUID,
  target_report_sha256 CHAR(64), target_proof_sha256 CHAR(64),
  target_weekly_evidence_sha256 CHAR(64), public_evidence_bytes BYTEA,
  target_public_evidence_sha256 CHAR(64), public_frontend_bytes BYTEA,
  target_public_frontend_sha256 CHAR(64)
)
RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $$
DECLARE v_cursor public."reader_summary_daily_execution_cursors"%ROWTYPE;
DECLARE v_job public."reader_summary_daily_model_jobs"%ROWTYPE;
DECLARE v_publication RECORD;
DECLARE v_public_evidence JSONB;
DECLARE v_public_frontend JSONB;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'daily publication finalization requires SERIALIZABLE';
  END IF;
  IF session_user <> 'social_monitor_reader_summary_daily_terminal' THEN
    RAISE EXCEPTION 'daily publication finalization requires the dedicated terminal login';
  END IF;
  IF finalized_at < pg_catalog.transaction_timestamp() - INTERVAL '5 minutes'
     OR finalized_at > pg_catalog.transaction_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily publication finalization time is not current';
  END IF;
  SELECT * INTO STRICT v_cursor
  FROM public."reader_summary_daily_execution_cursors" AS c
  WHERE c."tenant_id" = target_tenant_id AND c."workspace_id" = target_workspace_id
  FOR UPDATE;
  SELECT * INTO STRICT v_job
  FROM public."reader_summary_daily_model_jobs" AS job
  WHERE job."tenant_id" = target_tenant_id AND job."workspace_id" = target_workspace_id
    AND job."requested_utc_date" = target_date FOR UPDATE;
  IF v_job."publication_finalized_at" IS NOT NULL THEN
    IF v_job."reader_summary_job_id" <> target_job_id
      OR v_job."reader_summary_artifact_id" <> target_artifact_id
      OR v_job."publication_id" <> target_publication_id
      OR pg_catalog.btrim(v_job."publication_report_sha256") <>
        pg_catalog.btrim(target_report_sha256)
      OR pg_catalog.btrim(v_job."publication_proof_sha256") <>
        pg_catalog.btrim(target_proof_sha256)
      OR pg_catalog.btrim(v_job."weekly_evidence_sha256") <>
        pg_catalog.btrim(target_weekly_evidence_sha256)
      OR pg_catalog.btrim(v_job."public_evidence_sha256") <>
        pg_catalog.btrim(target_public_evidence_sha256)
      OR pg_catalog.btrim(v_job."public_frontend_sha256") <>
        pg_catalog.btrim(target_public_frontend_sha256) THEN
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
    OR pg_catalog.btrim(target_public_evidence_sha256) !~ '^[0-9a-f]{64}$'
    OR pg_catalog.btrim(target_public_frontend_sha256) !~ '^[0-9a-f]{64}$'
    OR pg_catalog.btrim(target_public_evidence_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(public_evidence_bytes), 'hex')
    OR pg_catalog.btrim(target_public_frontend_sha256) <>
      pg_catalog.encode(pg_catalog.sha256(public_frontend_bytes), 'hex') THEN
    RAISE EXCEPTION 'daily public file hashes are invalid';
  END IF;
  BEGIN
    v_public_evidence :=
      pg_catalog.convert_from(public_evidence_bytes, 'UTF8')::JSONB;
    v_public_frontend :=
      pg_catalog.convert_from(public_frontend_bytes, 'UTF8')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'daily public files are not valid JSON';
  END;
  IF v_public_evidence->'scope'->>'tenantId'
      IS DISTINCT FROM target_tenant_id::TEXT
    OR v_public_evidence->'scope'->>'workspaceId'
      IS DISTINCT FROM target_workspace_id::TEXT
    OR v_public_evidence->'result'->>'readerSummaryJobId'
      IS DISTINCT FROM target_job_id::TEXT
    OR v_public_evidence->'result'->>'readerSummaryId'
      IS DISTINCT FROM target_artifact_id::TEXT
    OR v_public_frontend->>'tenantId'
      IS DISTINCT FROM target_tenant_id::TEXT
    OR v_public_frontend->>'workspaceId'
      IS DISTINCT FROM target_workspace_id::TEXT
    OR v_public_frontend->'readerSummaryArtifact'->>'readerSummaryId'
      IS DISTINCT FROM target_artifact_id::TEXT THEN
    RAISE EXCEPTION 'daily public files do not bind the canonical publication';
  END IF;
  SELECT publication."report_sha256", publication."proof_sha256",
    evidence."canonical_sha256", publication."reader_summary_job_id",
    publication."reader_summary_artifact_id"
  INTO STRICT v_publication
  FROM public."reader_summary_publications" AS publication
  JOIN public."reader_summary_jobs" AS canonical_job
    ON canonical_job."id" = publication."reader_summary_job_id"
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
    AND canonical_job."id" = target_job_id
    AND canonical_job."status" = publication."semantic_status"
    AND canonical_job."reader_summary_artifact_id" = target_artifact_id
    AND artifact."id" = target_artifact_id
    AND artifact."status" = publication."semantic_status"
    AND evidence."reader_summary_job_id" = target_job_id
    AND evidence."reader_summary_artifact_id" = target_artifact_id
    AND pg_catalog.encode(pg_catalog.sha256(evidence."canonical_bytes"), 'hex') =
      pg_catalog.btrim(evidence."canonical_sha256");
  IF pg_catalog.btrim(v_publication."report_sha256") <>
      pg_catalog.btrim(target_report_sha256)
    OR pg_catalog.btrim(v_publication."proof_sha256") <>
      pg_catalog.btrim(target_proof_sha256)
    OR pg_catalog.btrim(v_publication."canonical_sha256") <>
      pg_catalog.btrim(target_weekly_evidence_sha256) THEN
    RAISE EXCEPTION 'daily canonical DB publication hashes diverged';
  END IF;
  UPDATE public."reader_summary_daily_model_jobs" SET
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
  UPDATE public."reader_summary_daily_execution_cursors" SET
    "next_unresolved_utc_date" = target_date + 1,
    "active_requested_utc_date" = NULL, "lease_owner" = NULL,
    "leased_at" = NULL, "lease_expires_at" = NULL,
    "absolute_expires_at" = NULL, "updated_at" = finalized_at
  WHERE "tenant_id" = target_tenant_id AND "workspace_id" = target_workspace_id;
  RETURN TRUE;
END
$$;

-- CREATE FUNCTION grants PUBLIC EXECUTE by default.  Close that window in the
-- same transaction; the ordered ACL migration admits the one terminal LOGIN.
REVOKE ALL PRIVILEGES ON FUNCTION
  public."complete_reader_summary_daily_model_job"(
    UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR(64), JSONB,
    BYTEA, CHAR(64), BYTEA, CHAR(64)),
  public."finalize_reader_summary_daily_publication"(
  UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, UUID, UUID, UUID,
  CHAR(64), CHAR(64), CHAR(64), BYTEA, CHAR(64), BYTEA, CHAR(64))
FROM PUBLIC,
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime",
  "social_monitor_reader_summary_daily_terminal";
RESET ROLE;

COMMIT;
