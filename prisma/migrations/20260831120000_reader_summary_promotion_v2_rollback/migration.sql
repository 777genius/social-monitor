-- @social-monitor-forward-migration
-- Narrow publication-owner rollback for a completed Promotion V2 migration.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";

CREATE TABLE public."reader_summary_promotion_v2_rollback_receipts" (
  "id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "requested_utc_date" DATE NOT NULL,
  "migration_receipt_sha256" CHAR(64) NOT NULL,
  "rollback_identity" CHAR(64) NOT NULL,
  "prior_publication_id" UUID NOT NULL,
  "prior_artifact_id" UUID NOT NULL,
  "replaced_v2_publication_id" UUID NOT NULL,
  "replaced_v2_artifact_id" UUID NOT NULL,
  "fence_token" TEXT NOT NULL,
  "receipt" JSONB NOT NULL,
  "receipt_sha256" CHAR(64) NOT NULL,
  "rolled_back_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reader_summary_promotion_v2_rollback_migration_receipt_key"
    UNIQUE ("migration_receipt_sha256"),
  CONSTRAINT "reader_summary_promotion_v2_rollback_identity_key"
    UNIQUE ("rollback_identity"),
  CONSTRAINT "reader_summary_promotion_v2_rollback_replaced_key"
    UNIQUE ("replaced_v2_publication_id"),
  CONSTRAINT "reader_summary_promotion_v2_rollback_hash_check" CHECK (
    "migration_receipt_sha256" ~ '^[0-9a-f]{64}$'
    AND "rollback_identity" ~ '^[0-9a-f]{64}$'
    AND "receipt_sha256" ~ '^[0-9a-f]{64}$'
    AND btrim("receipt_sha256") = encode(
      sha256(convert_to("receipt"::TEXT, 'UTF8')), 'hex'
    )
  ),
  CONSTRAINT "reader_summary_promotion_v2_rollback_fence_check" CHECK (
    "fence_token" ~ '^reader-summary-date:[0-9]{4}-[0-9]{2}-[0-9]{2}:[1-9][0-9]*$'
  )
);

CREATE INDEX "reader_summary_promotion_v2_rollback_scope_day_idx"
ON public."reader_summary_promotion_v2_rollback_receipts"
  ("tenant_id", "workspace_id", "requested_utc_date");

ALTER TABLE "reader_summary_promotion_v2_rollback_receipts"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_promotion_v2_rollback_receipts"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation"
ON "reader_summary_promotion_v2_rollback_receipts"
USING (
  public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
)
WITH CHECK (
  public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
);
CREATE POLICY "reader_summary_promotion_v2_rollback_owner_only"
ON "reader_summary_promotion_v2_rollback_receipts"
FOR ALL TO "social_monitor_reader_summary_publication_owner"
USING (TRUE) WITH CHECK (TRUE);

CREATE FUNCTION public."reject_reader_summary_promotion_v2_rollback_receipt_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  RAISE EXCEPTION 'reader summary Promotion V2 rollback receipts are immutable';
END;
$function$;

CREATE TRIGGER "reader_summary_promotion_v2_rollback_receipts_immutable"
BEFORE UPDATE OR DELETE
ON public."reader_summary_promotion_v2_rollback_receipts"
FOR EACH ROW EXECUTE FUNCTION
  public."reject_reader_summary_promotion_v2_rollback_receipt_mutation"();
CREATE TRIGGER "reader_summary_promotion_v2_rollback_receipts_no_truncate"
BEFORE TRUNCATE
ON public."reader_summary_promotion_v2_rollback_receipts"
FOR EACH STATEMENT EXECUTE FUNCTION
  public."reject_reader_summary_promotion_v2_rollback_receipt_mutation"();

RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION public."rollback_reader_summary_promotion_v2"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_requested_utc_date DATE,
  migration_receipt_sha256 TEXT,
  expected_v2_publication_id UUID,
  expected_v2_artifact_id UUID,
  expected_v2_report_sha256 TEXT,
  expected_v2_proof_sha256 TEXT,
  prior_v1_publication_id UUID,
  prior_v1_artifact_id UUID,
  prior_v1_report_sha256 TEXT,
  prior_v1_proof_sha256 TEXT,
  date_fence_token TEXT,
  rollback_at TIMESTAMPTZ
) RETURNS JSONB LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_slot public."reader_summary_publication_slots"%ROWTYPE;
  v_current public."reader_summary_publications"%ROWTYPE;
  v_prior public."reader_summary_publications"%ROWTYPE;
  v_current_artifact public."reader_summary_artifacts"%ROWTYPE;
  v_prior_artifact public."reader_summary_artifacts"%ROWTYPE;
  v_current_job public."reader_summary_jobs"%ROWTYPE;
  v_prior_job public."reader_summary_jobs"%ROWTYPE;
  v_identity TEXT;
  v_receipt JSONB;
BEGIN
  IF current_user <> 'social_monitor_reader_summary_publication_owner' THEN
    RAISE EXCEPTION 'Promotion V2 rollback requires publication owner';
  END IF;
  IF migration_receipt_sha256 !~ '^[0-9a-f]{64}$'
    OR expected_v2_report_sha256 !~ '^[0-9a-f]{64}$'
    OR expected_v2_proof_sha256 !~ '^[0-9a-f]{64}$'
    OR prior_v1_report_sha256 !~ '^[0-9a-f]{64}$'
    OR prior_v1_proof_sha256 !~ '^[0-9a-f]{64}$'
    OR date_fence_token !~ ('^reader-summary-date:' ||
      target_requested_utc_date::TEXT || ':[1-9][0-9]*$')
    OR rollback_at > clock_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Promotion V2 rollback input proof is invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."reader_summary_promotion_v2_rollback_receipts" r
    WHERE btrim(r."migration_receipt_sha256") = migration_receipt_sha256
      OR r."replaced_v2_publication_id" = expected_v2_publication_id
  ) THEN
    RAISE EXCEPTION 'Promotion V2 rollback receipt is stale or replayed';
  END IF;

  SELECT * INTO STRICT v_slot
  FROM public."reader_summary_publication_slots" slot
  WHERE slot."tenant_id" = target_tenant_id
    AND slot."workspace_id" = target_workspace_id
    AND slot."scope_type" = 'workspace'
    AND slot."scope_key" = 'workspace'
    AND slot."cadence" = 'daily'
    AND slot."period_started_at" = target_requested_utc_date::TIMESTAMP
      AT TIME ZONE 'UTC'
    AND slot."period_ended_at" = (target_requested_utc_date + 1)::TIMESTAMP
      AT TIME ZONE 'UTC'
    AND slot."period_timezone" = 'UTC'
  FOR UPDATE;
  IF v_slot."current_publication_id" IS DISTINCT FROM
      expected_v2_publication_id THEN
    RAISE EXCEPTION 'Promotion V2 rollback active publication is stale';
  END IF;

  SELECT * INTO STRICT v_current
  FROM public."reader_summary_publications" publication
  WHERE publication."id" = expected_v2_publication_id
  FOR KEY SHARE;
  SELECT * INTO STRICT v_prior
  FROM public."reader_summary_publications" publication
  WHERE publication."id" = prior_v1_publication_id
  FOR KEY SHARE;
  IF v_current."id" = v_prior."id"
    OR v_current."tenant_id" IS DISTINCT FROM target_tenant_id
    OR v_current."workspace_id" IS DISTINCT FROM target_workspace_id
    OR v_prior."tenant_id" IS DISTINCT FROM target_tenant_id
    OR v_prior."workspace_id" IS DISTINCT FROM target_workspace_id
    OR ROW(v_current."scope_type", v_current."scope_key", v_current."cadence",
      v_current."period_started_at", v_current."period_ended_at",
      v_current."period_timezone", v_current."requested_utc_date") IS DISTINCT FROM
      ROW(v_prior."scope_type", v_prior."scope_key", v_prior."cadence",
      v_prior."period_started_at", v_prior."period_ended_at",
      v_prior."period_timezone", v_prior."requested_utc_date")
    OR v_current."requested_utc_date" IS DISTINCT FROM target_requested_utc_date
    OR v_current."publication_kind" IS DISTINCT FROM 'EXACT'
    OR v_prior."publication_kind" NOT IN ('EXACT', 'LEGACY_BACKFILL')
    OR v_current."reader_summary_artifact_id" IS DISTINCT FROM
      expected_v2_artifact_id
    OR v_prior."reader_summary_artifact_id" IS DISTINCT FROM
      prior_v1_artifact_id
    OR btrim(v_current."report_sha256") IS DISTINCT FROM
      expected_v2_report_sha256
    OR btrim(v_current."proof_sha256") IS DISTINCT FROM expected_v2_proof_sha256
    OR btrim(v_prior."report_sha256") IS DISTINCT FROM prior_v1_report_sha256
    OR btrim(v_prior."proof_sha256") IS DISTINCT FROM prior_v1_proof_sha256
    OR v_current."exact_proof"->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.publication_proof.v1'
    OR v_prior."exact_proof"->>'schemaVersion' NOT IN (
      'reader_summary.publication_proof.v1',
      'reader_summary.legacy_publication_proof.v1'
    )
    OR jsonb_typeof(v_current."exact_proof") IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_prior."exact_proof") IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Promotion V2 rollback publication slot/proof mismatch';
  END IF;

  SELECT * INTO STRICT v_current_artifact
  FROM public."reader_summary_artifacts" artifact
  WHERE artifact."id" = expected_v2_artifact_id
  FOR KEY SHARE;
  SELECT * INTO STRICT v_prior_artifact
  FROM public."reader_summary_artifacts" artifact
  WHERE artifact."id" = prior_v1_artifact_id
  FOR KEY SHARE;
  IF v_current."reader_summary_job_id" IS NULL
    OR v_prior."reader_summary_job_id" IS NULL THEN
    RAISE EXCEPTION 'Promotion V2 rollback job lineage is incomplete';
  END IF;
  SELECT * INTO STRICT v_current_job
  FROM public."reader_summary_jobs" job
  WHERE job."id" = v_current."reader_summary_job_id"
  FOR KEY SHARE;
  SELECT * INTO STRICT v_prior_job
  FROM public."reader_summary_jobs" job
  WHERE job."id" = v_prior."reader_summary_job_id"
  FOR KEY SHARE;
  IF v_current_artifact."status" NOT IN ('COMPLETED', 'NO_SIGNAL')
    OR v_current_job."status" IS DISTINCT FROM v_current_artifact."status"
    OR v_current."semantic_status" IS DISTINCT FROM v_current_artifact."status"
    OR v_prior_artifact."status" NOT IN ('COMPLETED', 'NO_SIGNAL')
    OR v_prior_job."status" IS DISTINCT FROM v_prior_artifact."status"
    OR v_prior."semantic_status" IS DISTINCT FROM v_prior_artifact."status"
    OR v_current_job."reader_summary_artifact_id" IS DISTINCT FROM
      v_current_artifact."id"
    OR v_prior_job."reader_summary_artifact_id" IS DISTINCT FROM
      v_prior_artifact."id" THEN
    RAISE EXCEPTION 'Promotion V2 rollback lifecycle lineage is invalid';
  END IF;

  IF NOT (
    (jsonb_typeof(v_current_artifact."artifact_payload"->
        'promotionAttestations') = 'array'
      AND jsonb_array_length(v_current_artifact."artifact_payload"->
        'promotionAttestations') > 0
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_current_artifact."artifact_payload"->
          'promotionAttestations') a
        WHERE a->>'schemaVersion' <> 'reader_post_promotion_attestation.v2'
          OR a->>'policyVersion' <> 'reader_post_promotion.v2'
          OR a->>'digestVersion' <> 'reader_post_promotion_digest.sha256.v2'
      ))
    OR (v_current_artifact."status" = 'NO_SIGNAL'
      AND v_current_artifact."artifact_payload"->'promotionAttestations' =
        '[]'::JSONB
      AND v_current_artifact."artifact_payload"->'qualityFlags' ? 'no_signal'
      AND v_current_artifact."artifact_payload"->'lineage'->>'promptVersion' =
        'reader_summary.promotion_no_signal.v1'
      AND v_current_artifact."artifact_payload"->'lineage'->>'modelVersion' =
        'not_invoked'
      AND v_current_artifact."artifact_payload"->'lineage'->>'rulesVersion' =
        'reader_promotion_policy.v2'
      AND v_current_artifact."artifact_payload"->'lineage'->>'evalDatasetVersion' =
        'reader_promotion_policy.v2')
  ) THEN
    RAISE EXCEPTION 'Promotion V2 rollback expected current tuple is not V2';
  END IF;
  IF jsonb_typeof(v_prior_artifact."artifact_payload"->
        'promotionAttestations') <> 'array'
    OR jsonb_array_length(v_prior_artifact."artifact_payload"->
        'promotionAttestations') = 0
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_prior_artifact."artifact_payload"->
        'promotionAttestations') a
      WHERE a->>'schemaVersion' <> 'reader_post_promotion_attestation.v1'
        OR a->>'policyVersion' <> 'reader_post_promotion.v1'
        OR a->>'digestVersion' <> 'reader_post_promotion_digest.sha256.v1'
    ) THEN
    RAISE EXCEPTION 'Promotion V2 rollback prior tuple is not strict V1';
  END IF;

  v_identity := encode(sha256(convert_to(jsonb_build_object(
    'schemaVersion', 'reader_summary.promotion_v2_rollback_identity.v1',
    'tenantId', target_tenant_id::TEXT,
    'workspaceId', target_workspace_id::TEXT,
    'date', target_requested_utc_date::TEXT,
    'migrationReceiptSha256', migration_receipt_sha256,
    'expectedV2PublicationId', expected_v2_publication_id::TEXT,
    'priorV1PublicationId', prior_v1_publication_id::TEXT
  )::TEXT, 'UTF8')), 'hex');

  UPDATE public."reader_summary_publication_slots"
  SET "current_publication_id" = prior_v1_publication_id,
      "updated_at" = rollback_at
  WHERE "tenant_id" = target_tenant_id
    AND "workspace_id" = target_workspace_id
    AND "scope_type" = v_slot."scope_type"
    AND "scope_key" = v_slot."scope_key"
    AND "cadence" = v_slot."cadence"
    AND "period_started_at" = v_slot."period_started_at"
    AND "period_ended_at" = v_slot."period_ended_at"
    AND "period_timezone" = v_slot."period_timezone";

  v_receipt := jsonb_build_object(
    'schemaVersion', 1,
    'format', 'reader-summary-promotion-v2-rollback-receipt-v1',
    'migration', '20260831120000_reader_summary_promotion_v2_rollback',
    'rolledBackAt', rollback_at,
    'date', target_requested_utc_date::TEXT,
    'migrationReceiptSha256', migration_receipt_sha256,
    'rollbackIdentity', v_identity,
    'fenceToken', date_fence_token,
    'restoredPublicationId', prior_v1_publication_id::TEXT,
    'restoredArtifactId', prior_v1_artifact_id::TEXT,
    'preservedV2PublicationId', expected_v2_publication_id::TEXT,
    'preservedV2ArtifactId', expected_v2_artifact_id::TEXT,
    'legacyV1ReaderVerified', TRUE
  );
  INSERT INTO public."reader_summary_promotion_v2_rollback_receipts" (
    "id", "tenant_id", "workspace_id", "requested_utc_date",
    "migration_receipt_sha256", "rollback_identity",
    "prior_publication_id", "prior_artifact_id",
    "replaced_v2_publication_id", "replaced_v2_artifact_id", "fence_token",
    "receipt", "receipt_sha256", "rolled_back_at"
  ) VALUES (
    gen_random_uuid(), target_tenant_id, target_workspace_id,
    target_requested_utc_date, migration_receipt_sha256, v_identity,
    prior_v1_publication_id, prior_v1_artifact_id,
    expected_v2_publication_id, expected_v2_artifact_id, date_fence_token,
    v_receipt,
    encode(sha256(convert_to(v_receipt::TEXT, 'UTF8')), 'hex'), rollback_at
  );
  RETURN v_receipt;
END;
$function$;

REVOKE ALL ON FUNCTION public."rollback_reader_summary_promotion_v2"(
  UUID, UUID, DATE, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID, TEXT, TEXT,
  TEXT, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."rollback_reader_summary_promotion_v2"(
  UUID, UUID, DATE, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID, TEXT, TEXT,
  TEXT, TIMESTAMPTZ
) TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE ALL ON TABLE
  public."reader_summary_promotion_v2_rollback_receipts"
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT SELECT, INSERT ON TABLE
  public."reader_summary_promotion_v2_rollback_receipts"
TO "social_monitor_reader_summary_publication_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
