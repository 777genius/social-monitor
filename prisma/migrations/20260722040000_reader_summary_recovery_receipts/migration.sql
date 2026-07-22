-- @social-monitor-forward-migration
-- Summary-only recovery is finalized through one transaction that creates the
-- ordinary publication proof and its immutable, hash-bound recovery receipt.

BEGIN;

-- The pre-migration bootstrap gives the migrator SET authority for these
-- NOLOGIN roles. Temporarily grant the protected owner schema creation only
-- for this forward migration, then remove it before commit.
SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE TABLE "reader_summary_recovery_receipts" (
    "publication_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "reader_summary_job_id" UUID NOT NULL,
    "reader_summary_artifact_id" UUID NOT NULL,
    "recovery_kind" TEXT NOT NULL,
    "provenance" JSONB NOT NULL,
    "provenance_sha256" CHAR(64) NOT NULL,
    "exact_receipt" JSONB NOT NULL,
    "receipt_sha256" CHAR(64) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reader_summary_recovery_receipts_pkey"
      PRIMARY KEY ("publication_id"),
    CONSTRAINT "reader_summary_recovery_receipts_publication_fkey"
      FOREIGN KEY ("publication_id")
      REFERENCES "reader_summary_publications"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reader_summary_recovery_receipts_job_fkey"
      FOREIGN KEY ("reader_summary_job_id")
      REFERENCES "reader_summary_jobs"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reader_summary_recovery_receipts_artifact_fkey"
      FOREIGN KEY ("reader_summary_artifact_id")
      REFERENCES "reader_summary_artifacts"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reader_summary_recovery_receipts_kind_check"
      CHECK ("recovery_kind" = 'SUMMARY_ONLY'),
    CONSTRAINT "reader_summary_recovery_receipts_provenance_sha_check"
      CHECK ("provenance_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "reader_summary_recovery_receipts_receipt_sha_check"
      CHECK ("receipt_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "reader_summary_recovery_receipts_provenance_schema_check"
      CHECK (
        "provenance"->>'schemaVersion'
          IS NOT DISTINCT FROM
            'reader_summary.summary_only_recovery_provenance.v1'
        AND "provenance"->>'mode' IS NOT DISTINCT FROM 'summary-only'
      ),
    CONSTRAINT "reader_summary_recovery_receipts_receipt_schema_check"
      CHECK (
        "exact_receipt"->>'schemaVersion'
          IS NOT DISTINCT FROM 'reader_summary.recovery_receipt.v1'
        AND "exact_receipt"->>'recoveryKind'
          IS NOT DISTINCT FROM 'SUMMARY_ONLY'
      )
);

CREATE UNIQUE INDEX "reader_summary_recovery_receipts_job_key"
  ON "reader_summary_recovery_receipts"("reader_summary_job_id");
CREATE UNIQUE INDEX "reader_summary_recovery_receipts_artifact_key"
  ON "reader_summary_recovery_receipts"("reader_summary_artifact_id");
CREATE UNIQUE INDEX "reader_summary_recovery_receipts_provenance_key"
  ON "reader_summary_recovery_receipts"("provenance_sha256");
CREATE INDEX "reader_summary_recovery_receipts_scope_recorded_idx"
  ON "reader_summary_recovery_receipts"
  ("tenant_id", "workspace_id", "recorded_at");

CREATE OR REPLACE FUNCTION "finalize_reader_summary_recovery"(
  publication_payload JSONB,
  receipt_payload JSONB
) RETURNS TABLE (
  outcome TEXT,
  publication_id UUID,
  receipt_id UUID,
  report_sha256 TEXT,
  proof_sha256 TEXT,
  provenance_sha256 TEXT,
  receipt_sha256 TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_workspace_id UUID;
  v_publication_id UUID;
  v_job_id UUID;
  v_artifact_id UUID;
  v_recorded_at TIMESTAMPTZ(6);
  v_provenance JSONB;
  v_expected_provenance JSONB;
  v_provenance_canonical TEXT;
  v_provenance_sha256 TEXT;
  v_exact_receipt JSONB;
  v_expected_receipt JSONB;
  v_receipt_canonical TEXT;
  v_receipt_sha256 TEXT;
  v_publication_outcome TEXT;
  v_publication_report_sha256 TEXT;
  v_publication_proof_sha256 TEXT;
  v_existing "reader_summary_recovery_receipts"%ROWTYPE;
BEGIN
  IF receipt_payload IS NULL OR jsonb_typeof(receipt_payload) <> 'object'
    OR receipt_payload->>'schemaVersion'
      IS DISTINCT FROM 'reader_summary.recovery_receipt.v1'
    OR receipt_payload->>'recoveryKind' IS DISTINCT FROM 'SUMMARY_ONLY' THEN
    RAISE EXCEPTION 'reader summary recovery receipt schema is invalid';
  END IF;

  BEGIN
    v_tenant_id := (receipt_payload->>'tenantId')::UUID;
    v_workspace_id := (receipt_payload->>'workspaceId')::UUID;
    v_publication_id := (receipt_payload->>'publicationId')::UUID;
    v_job_id := (receipt_payload->>'readerSummaryJobId')::UUID;
    v_artifact_id := (receipt_payload->>'readerSummaryArtifactId')::UUID;
    v_recorded_at := (receipt_payload->>'recordedAt')::TIMESTAMPTZ;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'reader summary recovery receipt binding is invalid';
  END;

  IF v_tenant_id IS NULL OR v_workspace_id IS NULL
    OR v_publication_id IS NULL OR v_job_id IS NULL OR v_artifact_id IS NULL
    OR v_recorded_at IS NULL
    OR v_tenant_id::TEXT IS DISTINCT FROM publication_payload->>'tenantId'
    OR v_workspace_id::TEXT
      IS DISTINCT FROM publication_payload->>'workspaceId'
    OR v_publication_id::TEXT
      IS DISTINCT FROM publication_payload->>'readerSummaryArtifactId'
    OR v_job_id::TEXT
      IS DISTINCT FROM publication_payload->>'readerSummaryJobId'
    OR v_artifact_id::TEXT
      IS DISTINCT FROM publication_payload->>'readerSummaryArtifactId'
    OR receipt_payload->>'reportSha256'
      IS DISTINCT FROM publication_payload->>'reportSha256'
    OR receipt_payload->>'proofSha256'
      IS DISTINCT FROM publication_payload->>'proofSha256'
    OR receipt_payload->>'recordedAt'
      IS DISTINCT FROM publication_payload->>'publishedAt' THEN
    RAISE EXCEPTION 'reader summary recovery receipt does not bind publication';
  END IF;

  v_provenance := receipt_payload->'provenance';
  IF jsonb_typeof(v_provenance) <> 'object'
    OR v_provenance->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.summary_only_recovery_provenance.v1'
    OR v_provenance->>'mode' IS DISTINCT FROM 'summary-only' THEN
    RAISE EXCEPTION 'reader summary recovery provenance schema is invalid';
  END IF;
  v_expected_provenance := jsonb_build_object(
    'schemaVersion', 'reader_summary.summary_only_recovery_provenance.v1',
    'mode', 'summary-only',
    'collectionUtcPeriod', jsonb_build_object(
      'startedAt', publication_payload->>'periodStartedAt',
      'endedAt', publication_payload->>'periodEndedAt',
      'timezone', publication_payload->>'periodTimezone'
    ),
    'priorCollectionProof', jsonb_build_object(
      'sourceAttempt', jsonb_build_object(
        'artifactFormat',
          v_provenance->'priorCollectionProof'->'sourceAttempt'
            ->>'artifactFormat',
        'sha256',
          v_provenance->'priorCollectionProof'->'sourceAttempt'->>'sha256'
      ),
      'collectionArtifact', jsonb_build_object(
        'artifactFormat',
          v_provenance->'priorCollectionProof'->'collectionArtifact'
            ->>'artifactFormat',
        'sha256',
          v_provenance->'priorCollectionProof'->'collectionArtifact'
            ->>'sha256'
      ),
      'collectionQualityReport', jsonb_build_object(
        'artifactFormat',
          v_provenance->'priorCollectionProof'->'collectionQualityReport'
            ->>'artifactFormat',
        'sha256',
          v_provenance->'priorCollectionProof'->'collectionQualityReport'
            ->>'sha256'
      )
    ),
    'regenerationInputManifest', jsonb_build_object(
      'artifactFormat',
        v_provenance->'regenerationInputManifest'->>'artifactFormat',
      'sha256', v_provenance->'regenerationInputManifest'->>'sha256',
      'datasetSha256',
        v_provenance->'regenerationInputManifest'->>'datasetSha256'
    )
  );
  IF v_provenance IS DISTINCT FROM v_expected_provenance
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(jsonb_build_array(
        v_provenance->'priorCollectionProof'->'sourceAttempt',
        v_provenance->'priorCollectionProof'->'collectionArtifact',
        v_provenance->'priorCollectionProof'->'collectionQualityReport',
        v_provenance->'regenerationInputManifest'
      )) AS artifact(value)
      WHERE artifact.value->>'artifactFormat' IS NULL
        OR artifact.value->>'artifactFormat'
          !~ '^[a-z0-9][a-z0-9._-]{2,127}$'
        OR artifact.value->>'sha256' IS NULL
        OR artifact.value->>'sha256' !~ '^[0-9a-f]{64}$'
    )
    OR v_provenance->'regenerationInputManifest'->>'datasetSha256' IS NULL
    OR v_provenance->'regenerationInputManifest'->>'datasetSha256'
      !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'reader summary recovery provenance is invalid';
  END IF;

  v_provenance_canonical := receipt_payload->>'provenanceCanonical';
  BEGIN
    IF v_provenance_canonical IS NULL
      OR v_provenance_canonical::JSONB IS DISTINCT FROM v_provenance THEN
      RAISE EXCEPTION 'reader summary recovery canonical provenance mismatch';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'reader summary recovery canonical provenance is invalid';
  END;
  v_provenance_sha256 := encode(
    sha256(convert_to(v_provenance_canonical, 'UTF8')),
    'hex'
  );
  IF receipt_payload->>'provenanceSha256'
    IS DISTINCT FROM v_provenance_sha256 THEN
    RAISE EXCEPTION 'reader summary recovery provenance SHA-256 mismatch';
  END IF;

  v_expected_receipt := jsonb_build_object(
    'schemaVersion', 'reader_summary.recovery_receipt.v1',
    'recoveryKind', 'SUMMARY_ONLY',
    'tenantId', v_tenant_id::TEXT,
    'workspaceId', v_workspace_id::TEXT,
    'publicationId', v_publication_id::TEXT,
    'readerSummaryJobId', v_job_id::TEXT,
    'readerSummaryArtifactId', v_artifact_id::TEXT,
    'reportSha256', publication_payload->>'reportSha256',
    'proofSha256', publication_payload->>'proofSha256',
    'recordedAt', receipt_payload->>'recordedAt',
    'provenance', v_provenance,
    'provenanceSha256', v_provenance_sha256
  );
  v_exact_receipt := receipt_payload->'exactReceipt';
  v_receipt_canonical := receipt_payload->>'receiptCanonical';
  IF v_exact_receipt IS DISTINCT FROM v_expected_receipt
    OR v_receipt_canonical IS NULL
    OR v_receipt_canonical::JSONB IS DISTINCT FROM v_exact_receipt THEN
    RAISE EXCEPTION 'reader summary exact recovery receipt mismatch';
  END IF;
  v_receipt_sha256 := encode(
    sha256(convert_to(v_receipt_canonical, 'UTF8')),
    'hex'
  );
  IF receipt_payload->>'receiptSha256' IS DISTINCT FROM v_receipt_sha256 THEN
    RAISE EXCEPTION 'reader summary recovery receipt SHA-256 mismatch';
  END IF;

  SELECT publication.outcome, publication.publication_id,
         publication.report_sha256, publication.proof_sha256
  INTO v_publication_outcome, v_publication_id,
       v_publication_report_sha256, v_publication_proof_sha256
  FROM "publish_reader_summary"(publication_payload) AS publication;

  IF v_publication_outcome = 'stale' THEN
    RAISE EXCEPTION 'stale reader summary cannot finalize recovery';
  END IF;
  IF v_publication_report_sha256
      IS DISTINCT FROM receipt_payload->>'reportSha256'
    OR v_publication_proof_sha256
      IS DISTINCT FROM receipt_payload->>'proofSha256' THEN
    RAISE EXCEPTION 'reader summary recovery publication proof mismatch';
  END IF;

  SELECT * INTO v_existing
  FROM "reader_summary_recovery_receipts" AS receipt
  WHERE receipt."publication_id" = v_publication_id;
  IF FOUND THEN
    IF v_existing."tenant_id" = v_tenant_id
      AND v_existing."workspace_id" = v_workspace_id
      AND v_existing."reader_summary_job_id" = v_job_id
      AND v_existing."reader_summary_artifact_id" = v_artifact_id
      AND v_existing."recovery_kind" = 'SUMMARY_ONLY'
      AND v_existing."provenance" = v_provenance
      AND btrim(v_existing."provenance_sha256") = v_provenance_sha256
      AND v_existing."exact_receipt" = v_exact_receipt
      AND btrim(v_existing."receipt_sha256") = v_receipt_sha256
      AND v_existing."recorded_at" = v_recorded_at THEN
      RETURN QUERY SELECT
        'replayed'::TEXT,
        v_publication_id,
        v_publication_id,
        v_publication_report_sha256,
        v_publication_proof_sha256,
        v_provenance_sha256,
        v_receipt_sha256;
      RETURN;
    END IF;
    RAISE EXCEPTION 'reader summary recovery provenance conflict';
  END IF;

  IF v_publication_outcome <> 'published' THEN
    RAISE EXCEPTION
      'reader summary publication was finalized without a recovery receipt';
  END IF;

  BEGIN
    INSERT INTO "reader_summary_recovery_receipts" (
      "publication_id", "tenant_id", "workspace_id",
      "reader_summary_job_id", "reader_summary_artifact_id", "recovery_kind",
      "provenance", "provenance_sha256", "exact_receipt", "receipt_sha256",
      "recorded_at"
    ) VALUES (
      v_publication_id, v_tenant_id, v_workspace_id, v_job_id, v_artifact_id,
      'SUMMARY_ONLY', v_provenance, v_provenance_sha256, v_exact_receipt,
      v_receipt_sha256, v_recorded_at
    );
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'reader summary recovery provenance conflict';
  END;

  RETURN QUERY SELECT
    'published'::TEXT,
    v_publication_id,
    v_publication_id,
    v_publication_report_sha256,
    v_publication_proof_sha256,
    v_provenance_sha256,
    v_receipt_sha256;
END;
$$;

CREATE OR REPLACE FUNCTION "guard_reader_summary_recovery_receipt_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'social_monitor_reader_summary_publication_owner' THEN
    RAISE EXCEPTION
      'recovery receipt insert requires finalize_reader_summary_recovery';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "reader_summary_recovery_receipts_insert_guarded"
BEFORE INSERT ON "reader_summary_recovery_receipts"
FOR EACH ROW
EXECUTE FUNCTION "guard_reader_summary_recovery_receipt_insert"();

CREATE OR REPLACE FUNCTION "reject_reader_summary_recovery_receipt_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reader summary recovery receipt is immutable';
END;
$$;

CREATE TRIGGER "reader_summary_recovery_receipts_immutable"
BEFORE UPDATE OR DELETE ON "reader_summary_recovery_receipts"
FOR EACH ROW
EXECUTE FUNCTION "reject_reader_summary_recovery_receipt_mutation"();

REVOKE ALL PRIVILEGES ON TABLE "reader_summary_recovery_receipts"
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT SELECT ON TABLE "reader_summary_recovery_receipts"
TO "social_monitor_reader_summary_publication_runtime";

REVOKE ALL PRIVILEGES ON FUNCTION
  "finalize_reader_summary_recovery"(JSONB, JSONB),
  "guard_reader_summary_recovery_receipt_insert"(),
  "reject_reader_summary_recovery_receipt_mutation"()
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT EXECUTE ON FUNCTION
  "finalize_reader_summary_recovery"(JSONB, JSONB)
TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner" CASCADE;
RESET ROLE;

COMMIT;
