-- @social-monitor-forward-migration
-- A single, explicitly authorized second attempt for the terminal Jul23 V4
-- ambiguity. The original consumed history is never reset or rewritten.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE TABLE public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "requested_utc_date" DATE NOT NULL,
  "attempt_ordinal" SMALLINT NOT NULL DEFAULT 2,
  "supersedes_model_job_identity" CHAR(64) NOT NULL,
  "superseded_pre_model_consumed_at" TIMESTAMPTZ(6) NOT NULL,
  "superseded_running_at" TIMESTAMPTZ(6) NOT NULL,
  "superseded_failed_ambiguous_at" TIMESTAMPTZ(6) NOT NULL,
  "source_authority_sha256" CHAR(64) NOT NULL,
  "authorization_sha256" CHAR(64) NOT NULL,
  "authorization_reason" TEXT NOT NULL,
  "authorized_by" TEXT NOT NULL,
  "authorized_at" TIMESTAMPTZ(6) NOT NULL,
  "model_job_identity" CHAR(64) NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'AUTHORIZED',
  "pre_model_consumed_at" TIMESTAMPTZ(6),
  "lease_owner" TEXT,
  "fencing_token" BIGINT NOT NULL DEFAULT 0,
  "leased_at" TIMESTAMPTZ(6),
  "lease_expires_at" TIMESTAMPTZ(6),
  "absolute_expires_at" TIMESTAMPTZ(6),
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
  "reader_summary_job_id" UUID,
  "reader_summary_artifact_id" UUID,
  "publication_id" UUID,
  "publication_report_sha256" CHAR(64),
  "publication_proof_sha256" CHAR(64),
  "weekly_evidence_sha256" CHAR(64),
  "public_evidence_sha256" CHAR(64),
  "public_frontend_sha256" CHAR(64),
  "publication_prepared_at" TIMESTAMPTZ(6),
  "finalized_at" TIMESTAMPTZ(6),
  CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id", "requested_utc_date"),
  CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_identity_key"
    UNIQUE ("model_job_identity"),
  CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_original_fkey"
    FOREIGN KEY ("tenant_id", "workspace_id", "requested_utc_date")
    REFERENCES public."reader_summary_daily_canonical_recovery_v4_leases"
      ("tenant_id", "workspace_id", "requested_utc_date")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_scope_check" CHECK (
    "tenant_id" = UUID '00000000-0000-7000-8000-000000000901'
    AND "workspace_id" = UUID '00000000-0000-7000-8000-000000000902'
    AND "requested_utc_date" = DATE '2026-07-23'
    AND "attempt_ordinal" = 2
    AND "authorization_reason" =
      'user_authorized_single_retry_after_failed_ambiguous'
    AND "authorized_by" = 'social_monitor_reader_summary_daily_terminal'
  ),
  CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_state_check" CHECK (
    "state" IN (
      'AUTHORIZED', 'CONSUMED', 'RUNNING', 'COMPLETED',
      'PUBLICATION_PENDING', 'FINALIZED', 'FAILED_AMBIGUOUS'
    )
  ),
  CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_sha_check" CHECK (
    "supersedes_model_job_identity" ~ '^[0-9a-f]{64}$'
    AND "source_authority_sha256" ~ '^[0-9a-f]{64}$'
    AND "authorization_sha256" ~ '^[0-9a-f]{64}$'
    AND "model_job_identity" ~ '^[0-9a-f]{64}$'
    AND ("response_sha256" IS NULL OR "response_sha256" ~ '^[0-9a-f]{64}$')
    AND ("attestation_sha256" IS NULL OR "attestation_sha256" ~ '^[0-9a-f]{64}$')
    AND ("receipt_sha256" IS NULL OR "receipt_sha256" ~ '^[0-9a-f]{64}$')
    AND ("publication_report_sha256" IS NULL OR "publication_report_sha256" ~ '^[0-9a-f]{64}$')
    AND ("publication_proof_sha256" IS NULL OR "publication_proof_sha256" ~ '^[0-9a-f]{64}$')
    AND ("weekly_evidence_sha256" IS NULL OR "weekly_evidence_sha256" ~ '^[0-9a-f]{64}$')
    AND ("public_evidence_sha256" IS NULL OR "public_evidence_sha256" ~ '^[0-9a-f]{64}$')
    AND ("public_frontend_sha256" IS NULL OR "public_frontend_sha256" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_consumed_check" CHECK (
    ("state" = 'AUTHORIZED' AND "pre_model_consumed_at" IS NULL)
    OR ("state" <> 'AUTHORIZED' AND "pre_model_consumed_at" IS NOT NULL)
  ),
  CONSTRAINT "rs_daily_recovery_v4_ambiguity_retries_chronology_check" CHECK (
    ("running_at" IS NULL OR "running_at" >= "pre_model_consumed_at")
    AND ("completed_at" IS NULL OR (
      "running_at" IS NOT NULL AND "completed_at" >= "running_at"
    ))
    AND ("failed_ambiguous_at" IS NULL OR
      "failed_ambiguous_at" >= "pre_model_consumed_at")
    AND ("finalized_at" IS NULL OR (
      "completed_at" IS NOT NULL AND "finalized_at" >= "completed_at"
    ))
    AND ("state" <> 'RUNNING' OR "running_at" IS NOT NULL)
    AND ("state" NOT IN ('COMPLETED', 'PUBLICATION_PENDING', 'FINALIZED') OR (
      "running_at" IS NOT NULL AND "completed_at" IS NOT NULL
      AND "response_bytes" IS NOT NULL AND "receipt_bytes" IS NOT NULL
    ))
    AND ("publication_prepared_at" IS NULL OR (
      "completed_at" IS NOT NULL AND "publication_prepared_at" >= "completed_at"
    ))
    AND ("state" NOT IN ('PUBLICATION_PENDING', 'FINALIZED') OR (
      "publication_prepared_at" IS NOT NULL
      AND "reader_summary_job_id" IS NOT NULL
      AND "reader_summary_artifact_id" IS NOT NULL
      AND "publication_id" IS NOT NULL
      AND "public_evidence_sha256" IS NOT NULL
      AND "public_frontend_sha256" IS NOT NULL
    ))
    AND ("state" <> 'FINALIZED' OR "finalized_at" IS NOT NULL)
  )
);

-- The deploy bootstrap accepts the ordered 0/3/4-table migration window. Once
-- this schema exists, the reviewed terminal state is exactly four V4 tables
-- under the publication owner; a partial ambiguity schema must fail closed.
DO $ambiguity_retry_final_owner_inventory$
DECLARE
  v_owner_count INTEGER;
  v_weekly_review_manifest_table_count INTEGER;
  v_v4_table_count INTEGER;
BEGIN
  SELECT count(*) INTO v_owner_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_roles owner ON owner.oid = relation.relowner
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p')
    AND relation.relname IN (
      'reader_summary_artifacts',
      'reader_summary_publications',
      'reader_summary_publication_slots',
      'reader_summary_weekly_publication_evidence',
      'reader_summary_weekly_review_manifests',
      'reader_summary_daily_canonical_recovery_v4_plans',
      'reader_summary_daily_canonical_recovery_v4_authorities',
      'reader_summary_daily_canonical_recovery_v4_leases',
      'reader_summary_daily_canonical_recovery_v4_ambiguity_retries'
    )
    AND owner.rolname = 'social_monitor_reader_summary_publication_owner';
  SELECT count(*) INTO v_weekly_review_manifest_table_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p')
    AND relation.relname = 'reader_summary_weekly_review_manifests';
  SELECT count(*) INTO v_v4_table_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('r', 'p')
    AND relation.relname IN (
      'reader_summary_daily_canonical_recovery_v4_plans',
      'reader_summary_daily_canonical_recovery_v4_authorities',
      'reader_summary_daily_canonical_recovery_v4_leases',
      'reader_summary_daily_canonical_recovery_v4_ambiguity_retries'
    );
  IF v_weekly_review_manifest_table_count NOT IN (0, 1)
    OR v_v4_table_count <> 4
    OR v_owner_count <> 4 + v_weekly_review_manifest_table_count
      + v_v4_table_count THEN
    RAISE EXCEPTION 'ambiguity retry final protected-table ownership is unsafe';
  END IF;
END
$ambiguity_retry_final_owner_inventory$;

CREATE INDEX "rs_daily_recovery_v4_ambiguity_retries_state_idx"
  ON public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
    ("tenant_id", "workspace_id", "state", "requested_utc_date");

ALTER TABLE "reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "rs_daily_recovery_v4_ambiguity_retries_owner_only"
  ON "reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
  FOR ALL TO "social_monitor_reader_summary_publication_owner"
  USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "tenant_isolation"
  ON "reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );

CREATE FUNCTION public."reject_rs_daily_recovery_v4_ambiguity_retry_identity_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry identity is immutable';
  END IF;
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
    OR NEW."workspace_id" IS DISTINCT FROM OLD."workspace_id"
    OR NEW."requested_utc_date" IS DISTINCT FROM OLD."requested_utc_date"
    OR NEW."attempt_ordinal" IS DISTINCT FROM OLD."attempt_ordinal"
    OR NEW."supersedes_model_job_identity" IS DISTINCT FROM
      OLD."supersedes_model_job_identity"
    OR NEW."superseded_pre_model_consumed_at" IS DISTINCT FROM
      OLD."superseded_pre_model_consumed_at"
    OR NEW."superseded_running_at" IS DISTINCT FROM OLD."superseded_running_at"
    OR NEW."superseded_failed_ambiguous_at" IS DISTINCT FROM
      OLD."superseded_failed_ambiguous_at"
    OR NEW."source_authority_sha256" IS DISTINCT FROM
      OLD."source_authority_sha256"
    OR NEW."authorization_sha256" IS DISTINCT FROM OLD."authorization_sha256"
    OR NEW."authorization_reason" IS DISTINCT FROM OLD."authorization_reason"
    OR NEW."authorized_by" IS DISTINCT FROM OLD."authorized_by"
    OR NEW."authorized_at" IS DISTINCT FROM OLD."authorized_at"
    OR NEW."model_job_identity" IS DISTINCT FROM OLD."model_job_identity" THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry identity is immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER "rs_daily_recovery_v4_ambiguity_retries_identity_immutable"
BEFORE UPDATE OR DELETE
ON public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"
FOR EACH ROW EXECUTE FUNCTION
  public."reject_rs_daily_recovery_v4_ambiguity_retry_identity_mutation"();

-- The original lease remains an immutable historical record once the one
-- authorized superseding attempt exists. Normal V4 transitions are routed to
-- the retry row, so this is also a fail-closed guard against accidental reuse.
CREATE FUNCTION public."reject_rs_daily_recovery_v4_superseded_original_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = OLD."tenant_id"
      AND retry."workspace_id" = OLD."workspace_id"
      AND retry."requested_utc_date" = OLD."requested_utc_date"
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 superseded original history is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER "rs_daily_recovery_v4_superseded_original_immutable"
BEFORE UPDATE OR DELETE
ON public."reader_summary_daily_canonical_recovery_v4_leases"
FOR EACH ROW EXECUTE FUNCTION
  public."reject_rs_daily_recovery_v4_superseded_original_mutation"();

CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_authorization_sha256"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  original_model_job_identity TEXT,
  source_authority_sha256 TEXT
) RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog AS $function$
  SELECT encode(sha256(convert_to(concat_ws('|',
    'reader-summary-daily:v4:ambiguity-retry-authorization',
    target_tenant_id::TEXT, target_workspace_id::TEXT,
    to_char(target_date, 'YYYY-MM-DD'), btrim(original_model_job_identity),
    btrim(source_authority_sha256), 'attempt=2',
    'user_authorized_single_retry_after_failed_ambiguous',
    'social_monitor_reader_summary_daily_terminal'
  ), 'UTF8')), 'hex')
$function$;

CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_model_identity"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  source_authority_sha256 TEXT,
  original_model_job_identity TEXT,
  authorization_sha256 TEXT
) RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE SECURITY DEFINER
SET search_path = pg_catalog AS $function$
  SELECT encode(sha256(convert_to(concat_ws('|',
    'reader-summary-daily:v4:ambiguity-retry',
    target_tenant_id::TEXT, target_workspace_id::TEXT,
    to_char(target_date, 'YYYY-MM-DD'), btrim(source_authority_sha256),
    btrim(original_model_job_identity), btrim(authorization_sha256), 'attempt=2',
    'codex', 'gpt-5.6-sol', 'xhigh', 'output_text'
  ), 'UTF8')), 'hex')
$function$;

CREATE VIEW public."reader_summary_daily_canonical_recovery_v4_effective_leases"
WITH (security_barrier = true) AS
  SELECT lease."tenant_id", lease."workspace_id", lease."requested_utc_date",
    lease."source_authority_sha256", lease."model_job_identity", lease."state",
    lease."pre_model_consumed_at", lease."lease_owner", lease."fencing_token",
    lease."leased_at", lease."lease_expires_at", lease."absolute_expires_at",
    lease."running_at", lease."completed_at", lease."failed_ambiguous_at",
    lease."response_bytes", lease."response_sha256", lease."attestation",
    lease."attestation_bytes", lease."attestation_sha256", lease."receipt_bytes",
    lease."receipt_sha256", lease."reader_summary_job_id",
    lease."reader_summary_artifact_id", lease."publication_id",
    lease."publication_report_sha256", lease."publication_proof_sha256",
    lease."weekly_evidence_sha256", lease."public_evidence_sha256",
    lease."public_frontend_sha256", lease."publication_prepared_at",
    lease."finalized_at"
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."state" <> 'FAILED_AMBIGUOUS'
    OR NOT EXISTS (
      SELECT 1
      FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
      WHERE retry."tenant_id" = lease."tenant_id"
        AND retry."workspace_id" = lease."workspace_id"
        AND retry."requested_utc_date" = lease."requested_utc_date"
    )
  UNION ALL
  SELECT retry."tenant_id", retry."workspace_id", retry."requested_utc_date",
    retry."source_authority_sha256", retry."model_job_identity", retry."state",
    retry."pre_model_consumed_at", retry."lease_owner", retry."fencing_token",
    retry."leased_at", retry."lease_expires_at", retry."absolute_expires_at",
    retry."running_at", retry."completed_at", retry."failed_ambiguous_at",
    retry."response_bytes", retry."response_sha256", retry."attestation",
    retry."attestation_bytes", retry."attestation_sha256", retry."receipt_bytes",
    retry."receipt_sha256", retry."reader_summary_job_id",
    retry."reader_summary_artifact_id", retry."publication_id",
    retry."publication_report_sha256", retry."publication_proof_sha256",
    retry."weekly_evidence_sha256", retry."public_evidence_sha256",
    retry."public_frontend_sha256", retry."publication_prepared_at",
    retry."finalized_at"
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  JOIN public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    ON retry."tenant_id" = lease."tenant_id"
    AND retry."workspace_id" = lease."workspace_id"
    AND retry."requested_utc_date" = lease."requested_utc_date"
  WHERE lease."state" = 'FAILED_AMBIGUOUS';

CREATE FUNCTION public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE
) RETURNS SMALLINT LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_original public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
BEGIN
  SELECT * INTO v_original
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."requested_utc_date" = target_date
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF v_original."state" = 'FAILED_AMBIGUOUS' THEN
    PERFORM 1
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = target_tenant_id
      AND retry."workspace_id" = target_workspace_id
      AND retry."requested_utc_date" = target_date
    FOR UPDATE;
    IF FOUND THEN
      RETURN 2;
    END IF;
  ELSIF EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = target_tenant_id
      AND retry."workspace_id" = target_workspace_id
      AND retry."requested_utc_date" = target_date
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry lost its FAILED_AMBIGUOUS original binding';
  END IF;
  RETURN 1;
END;
$function$;

CREATE FUNCTION public."authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  expected_original_model_job_identity CHAR(64),
  expected_source_authority_sha256 CHAR(64),
  authorized_at TIMESTAMPTZ
) RETURNS TABLE (
  model_job_identity TEXT,
  authorization_sha256 TEXT
) LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_date CONSTANT DATE := DATE '2026-07-23';
  v_original public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
  v_retry public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_has_retry BOOLEAN := FALSE;
  v_authorization_sha TEXT;
  v_model_identity TEXT;
  v_now CONSTANT TIMESTAMPTZ := transaction_timestamp();
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR session_user <> 'social_monitor_reader_summary_daily_terminal'
    OR target_tenant_id IS DISTINCT FROM c_tenant_id
    OR target_workspace_id IS DISTINCT FROM c_workspace_id
    OR target_date IS DISTINCT FROM c_date
    OR btrim(expected_original_model_job_identity) !~ '^[0-9a-f]{64}$'
    OR btrim(expected_source_authority_sha256) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry authorization session is invalid';
  END IF;

  -- Every path locks original history before its superseding retry row.
  SELECT * INTO STRICT v_original
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND lease."requested_utc_date" = c_date
  FOR UPDATE;
  SELECT * INTO v_retry
  FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
  WHERE retry."tenant_id" = c_tenant_id
    AND retry."workspace_id" = c_workspace_id
    AND retry."requested_utc_date" = c_date
  FOR UPDATE;
  v_has_retry := FOUND;
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id
    AND authority."workspace_id" = c_workspace_id
    AND authority."requested_utc_date" = c_date
  FOR KEY SHARE;

  IF v_original."state" IS DISTINCT FROM 'FAILED_AMBIGUOUS'
    OR v_original."pre_model_consumed_at" IS NULL
    OR v_original."running_at" IS NULL
    OR v_original."failed_ambiguous_at" IS NULL
    OR v_original."fencing_token" <= 0
    OR v_original."running_at" < v_original."pre_model_consumed_at"
    OR v_original."failed_ambiguous_at" < v_original."running_at"
    OR v_original."response_bytes" IS NOT NULL
    OR v_original."response_sha256" IS NOT NULL
    OR v_original."attestation" IS NOT NULL
    OR v_original."attestation_bytes" IS NOT NULL
    OR v_original."attestation_sha256" IS NOT NULL
    OR v_original."receipt_bytes" IS NOT NULL
    OR v_original."receipt_sha256" IS NOT NULL
    OR v_original."completed_at" IS NOT NULL
    OR v_original."reader_summary_job_id" IS NOT NULL
    OR v_original."reader_summary_artifact_id" IS NOT NULL
    OR v_original."publication_id" IS NOT NULL
    OR v_original."publication_report_sha256" IS NOT NULL
    OR v_original."publication_proof_sha256" IS NOT NULL
    OR v_original."weekly_evidence_sha256" IS NOT NULL
    OR v_original."public_evidence_sha256" IS NOT NULL
    OR v_original."public_frontend_sha256" IS NOT NULL
    OR v_original."publication_prepared_at" IS NOT NULL
    OR v_original."finalized_at" IS NOT NULL
    OR v_original."lease_owner" IS NOT NULL
    OR v_original."leased_at" IS NOT NULL
    OR v_original."lease_expires_at" IS NOT NULL
    OR v_original."absolute_expires_at" IS NOT NULL
    OR btrim(v_original."model_job_identity") IS DISTINCT FROM
      btrim(expected_original_model_job_identity)
    OR btrim(v_original."source_authority_sha256") IS DISTINCT FROM
      btrim(expected_source_authority_sha256)
    OR btrim(v_authority."source_authority_sha256") IS DISTINCT FROM
      btrim(expected_source_authority_sha256)
    OR btrim(v_authority."source_authority_sha256") IS DISTINCT FROM encode(
      sha256(v_authority."source_authority_bytes"), 'hex'
    )
    OR btrim(v_original."model_job_identity") IS DISTINCT FROM btrim(
      public."reader_summary_daily_canonical_recovery_v4_model_identity"(
        c_tenant_id, c_workspace_id, c_date,
        v_authority."source_authority_sha256"
      )
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry original binding is invalid';
  END IF;

  v_authorization_sha :=
    public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_authorization_sha256"(
      c_tenant_id, c_workspace_id, c_date,
      v_original."model_job_identity", v_authority."source_authority_sha256"
    );
  v_model_identity :=
    public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_model_identity"(
      c_tenant_id, c_workspace_id, c_date,
      v_authority."source_authority_sha256", v_original."model_job_identity",
      v_authorization_sha
    );
  -- A committed authorization can lose its client acknowledgement. Replays are
  -- read-only only when every immutable original/retry/authority binding is
  -- still exact; mismatched input never creates a third attempt.
  IF v_has_retry THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      c_tenant_id, c_workspace_id, c_date
    );
    IF v_retry."attempt_ordinal" <> 2
      OR btrim(v_retry."supersedes_model_job_identity") IS DISTINCT FROM
        btrim(expected_original_model_job_identity)
      OR btrim(v_retry."source_authority_sha256") IS DISTINCT FROM
        btrim(expected_source_authority_sha256)
      OR btrim(v_retry."authorization_sha256") IS DISTINCT FROM
        btrim(v_authorization_sha)
      OR btrim(v_retry."model_job_identity") IS DISTINCT FROM
        btrim(v_model_identity) THEN
      RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry replay binding is invalid';
    END IF;
    RETURN QUERY SELECT btrim(v_retry."model_job_identity"),
      btrim(v_retry."authorization_sha256");
    RETURN;
  END IF;
  IF authorized_at < v_now - INTERVAL '5 minutes'
    OR authorized_at > v_now + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry authorization time is invalid';
  END IF;
  PERFORM publication."id"
  FROM public."reader_summary_publications" AS publication
  WHERE publication."tenant_id" = c_tenant_id
    AND publication."workspace_id" = c_workspace_id
    AND (
      publication."requested_utc_date" = c_date
      OR (publication."period_started_at" AT TIME ZONE 'UTC')::DATE = c_date
    )
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry cannot supersede published history';
  END IF;
  PERFORM evidence."publication_id"
  FROM public."reader_summary_weekly_publication_evidence" AS evidence
  WHERE evidence."tenant_id" = c_tenant_id
    AND evidence."workspace_id" = c_workspace_id
    AND evidence."requested_utc_date" = c_date
  FOR KEY SHARE;
  IF FOUND THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ambiguity retry cannot supersede recorded evidence';
  END IF;

  INSERT INTO public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" (
    "tenant_id", "workspace_id", "requested_utc_date", "attempt_ordinal",
    "supersedes_model_job_identity", "superseded_pre_model_consumed_at",
    "superseded_running_at", "superseded_failed_ambiguous_at",
    "source_authority_sha256",
    "authorization_sha256", "authorization_reason", "authorized_by",
    "authorized_at", "model_job_identity", "state"
  ) VALUES (
    c_tenant_id, c_workspace_id, c_date, 2,
    v_original."model_job_identity", v_original."pre_model_consumed_at",
    v_original."running_at", v_original."failed_ambiguous_at",
    v_authority."source_authority_sha256",
    v_authorization_sha, 'user_authorized_single_retry_after_failed_ambiguous',
    session_user, v_now, v_model_identity, 'AUTHORIZED'
  );
  RETURN QUERY SELECT v_model_identity, v_authorization_sha;
END;
$function$;

REVOKE ALL PRIVILEGES ON TABLE
  public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries",
  public."reader_summary_daily_canonical_recovery_v4_effective_leases"
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
REVOKE ALL ON FUNCTION
  public."reject_rs_daily_recovery_v4_ambiguity_retry_identity_mutation"(),
  public."reject_rs_daily_recovery_v4_superseded_original_mutation"(),
  public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_authorization_sha256"(
    UUID, UUID, DATE, TEXT, TEXT
  ),
  public."reader_summary_daily_canonical_recovery_v4_ambiguity_retry_model_identity"(
    UUID, UUID, DATE, TEXT, TEXT, TEXT
  ),
  public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
    UUID, UUID, DATE
  ),
  public."authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry"(
    UUID, UUID, DATE, CHAR(64), CHAR(64), TIMESTAMPTZ
  )
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";
GRANT EXECUTE ON FUNCTION
  public."authorize_reader_summary_daily_canonical_recovery_v4_ambiguity_retry"(
    UUID, UUID, DATE, CHAR(64), CHAR(64), TIMESTAMPTZ
  ) TO "social_monitor_reader_summary_daily_terminal";

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
