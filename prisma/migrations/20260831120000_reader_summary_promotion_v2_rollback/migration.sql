-- @social-monitor-forward-migration
-- Narrow publication-owner rollback for a completed Promotion V2 publication.
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
  "authority_receipt_format" TEXT NOT NULL,
  "authority_receipt_sha256" CHAR(64) NOT NULL,
  "rollback_identity" CHAR(64) NOT NULL,
  "prior_publication_id" UUID NOT NULL,
  "prior_artifact_id" UUID NOT NULL,
  "replaced_v2_publication_id" UUID NOT NULL,
  "replaced_v2_artifact_id" UUID NOT NULL,
  "fence_token" TEXT NOT NULL,
  "receipt" JSONB NOT NULL,
  "receipt_sha256" CHAR(64) NOT NULL,
  "rolled_back_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reader_summary_promotion_v2_rollback_authority_receipt_key"
    UNIQUE ("authority_receipt_sha256"),
  CONSTRAINT "reader_summary_promotion_v2_rollback_identity_key"
    UNIQUE ("rollback_identity"),
  CONSTRAINT "reader_summary_promotion_v2_rollback_replaced_key"
    UNIQUE ("replaced_v2_publication_id"),
  CONSTRAINT "reader_summary_promotion_v2_rollback_hash_check" CHECK (
    "authority_receipt_format" IN (
      'reader-summary-promotion-v2-historical-rebuild-receipt-v1',
      'reader-summary-promotion-v2-canary-publication-receipt-v1'
    )
    AND "authority_receipt_sha256" ~ '^[0-9a-f]{64}$'
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
GRANT REFERENCES ("id") ON TABLE
  public."reader_summary_publications",
  public."reader_summary_artifacts"
TO "social_monitor_public_schema_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
CREATE TABLE public."reader_summary_promotion_v2_canary_publication_receipts" (
  "v2_publication_id" UUID PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "requested_utc_date" DATE NOT NULL,
  "v2_artifact_id" UUID NOT NULL,
  "prior_v1_publication_id" UUID NOT NULL,
  "prior_v1_artifact_id" UUID NOT NULL,
  "receipt" JSONB NOT NULL,
  "receipt_sha256" CHAR(64) NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reader_summary_promotion_v2_canary_prior_key"
    UNIQUE ("prior_v1_publication_id", "v2_publication_id"),
  CONSTRAINT "reader_summary_promotion_v2_canary_receipt_hash_key"
    UNIQUE ("receipt_sha256"),
  CONSTRAINT "reader_summary_promotion_v2_canary_receipt_hash_check" CHECK (
    "receipt_sha256" ~ '^[0-9a-f]{64}$'
    AND btrim("receipt_sha256") = encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json"("receipt"),
      'UTF8'
    )), 'hex')
  ),
  CONSTRAINT "reader_summary_promotion_v2_canary_publication_fkey"
    FOREIGN KEY ("v2_publication_id") REFERENCES
      public."reader_summary_publications"("id")
      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "reader_summary_promotion_v2_canary_prior_publication_fkey"
    FOREIGN KEY ("prior_v1_publication_id") REFERENCES
      public."reader_summary_publications"("id")
      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "reader_summary_promotion_v2_canary_artifact_fkey"
    FOREIGN KEY ("v2_artifact_id") REFERENCES
      public."reader_summary_artifacts"("id")
      ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "reader_summary_promotion_v2_canary_prior_artifact_fkey"
    FOREIGN KEY ("prior_v1_artifact_id") REFERENCES
      public."reader_summary_artifacts"("id")
      ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "reader_summary_promotion_v2_canary_scope_day_idx"
ON public."reader_summary_promotion_v2_canary_publication_receipts"
  ("tenant_id", "workspace_id", "requested_utc_date");
ALTER TABLE "reader_summary_promotion_v2_canary_publication_receipts"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_promotion_v2_canary_publication_receipts"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation"
ON "reader_summary_promotion_v2_canary_publication_receipts"
USING (
  public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
)
WITH CHECK (
  public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
);
CREATE POLICY "reader_summary_promotion_v2_canary_owner_only"
ON "reader_summary_promotion_v2_canary_publication_receipts"
FOR ALL TO "social_monitor_reader_summary_publication_owner"
USING (TRUE) WITH CHECK (TRUE);
CREATE TRIGGER "reader_summary_promotion_v2_canary_receipts_immutable"
BEFORE UPDATE OR DELETE
ON public."reader_summary_promotion_v2_canary_publication_receipts"
FOR EACH ROW EXECUTE FUNCTION
  public."reject_reader_summary_promotion_v2_rollback_receipt_mutation"();
CREATE TRIGGER "reader_summary_promotion_v2_canary_receipts_no_truncate"
BEFORE TRUNCATE
ON public."reader_summary_promotion_v2_canary_publication_receipts"
FOR EACH STATEMENT EXECUTE FUNCTION
  public."reject_reader_summary_promotion_v2_rollback_receipt_mutation"();
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
REVOKE REFERENCES ("id") ON TABLE
  public."reader_summary_publications",
  public."reader_summary_artifacts"
FROM "social_monitor_public_schema_owner";
CREATE FUNCTION public."reader_summary_promotion_v2_exact_proof_matches"(
  publication public."reader_summary_publications"
) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $function$
  SELECT COALESCE(publication."exact_proof"->>'schemaVersion' =
      'reader_summary.publication_proof.v1'
    AND publication."exact_proof"->>'tenantId' =
      publication."tenant_id"::TEXT
    AND publication."exact_proof"->>'workspaceId' =
      publication."workspace_id"::TEXT
    AND publication."exact_proof"->'scope' = jsonb_build_object(
      'type', publication."scope_type", 'key', publication."scope_key"
    )
    AND publication."exact_proof"->'period' = jsonb_build_object(
      'cadence', publication."cadence",
      'startedAt', to_char(publication."period_started_at" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'endedAt', to_char(publication."period_ended_at" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'timezone', publication."period_timezone",
      'periodKey', publication."period_key"
    )
    AND publication."exact_proof"->>'requestedUtcDate' =
      publication."requested_utc_date"::TEXT
    AND publication."exact_proof"->>'requestedAt' = to_char(
      publication."requested_at" AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
    AND publication."exact_proof"->>'readerSummaryJobId' =
      publication."reader_summary_job_id"::TEXT
    AND publication."exact_proof"->>'readerSummaryArtifactId' =
      publication."reader_summary_artifact_id"::TEXT
    AND publication."exact_proof"->>'semanticStatus' =
      publication."semantic_status"::TEXT
    AND publication."exact_proof"->>'modelVersion' =
      publication."model_version"
    AND publication."exact_proof"->>'reportSha256' =
      btrim(publication."report_sha256"), FALSE)
$function$;
CREATE FUNCTION public."reader_summary_promotion_v2_legacy_proof_matches"(
  publication public."reader_summary_publications"
) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $function$
  SELECT COALESCE(
    publication."publication_kind" = 'LEGACY_BACKFILL'
    AND publication."reader_summary_job_id" IS NULL
    AND publication."outbox_event_id" IS NULL
    AND publication."exact_proof" = jsonb_build_object(
      'schemaVersion', 'reader_summary.legacy_publication_proof.v1',
      'migration', '20260716170000_reader_summary_fail_closed_publication',
      'tenantId', publication."tenant_id"::TEXT,
      'workspaceId', publication."workspace_id"::TEXT,
      'scope', jsonb_build_object(
        'type', publication."scope_type", 'key', publication."scope_key"
      ),
      'period', jsonb_build_object(
        'cadence', publication."cadence",
        'startedAt', to_char(
          publication."period_started_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'endedAt', to_char(
          publication."period_ended_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'timezone', publication."period_timezone",
        'periodKey', publication."period_key"
      ),
      'requestedUtcDate', publication."requested_utc_date"::TEXT,
      'requestedAt', to_char(
        publication."requested_at" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'readerSummaryArtifactId',
        publication."reader_summary_artifact_id"::TEXT,
      'semanticStatus', publication."semantic_status"::TEXT,
      'modelVersion', publication."model_version",
      'reportSha256', btrim(publication."report_sha256")
    ), FALSE)
$function$;
CREATE FUNCTION public."reader_summary_promotion_v2_artifact_is_strict_v1"(
  artifact public."reader_summary_artifacts"
) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $function$
  SELECT COALESCE(artifact."status" IN ('COMPLETED', 'SUPERSEDED')
    AND jsonb_typeof(artifact."artifact_payload"->
      'promotionAttestations') = 'array'
    AND jsonb_array_length(artifact."artifact_payload"->
      'promotionAttestations') > 0
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(artifact."artifact_payload"->
        'promotionAttestations') attestation
      WHERE COALESCE(attestation->>'schemaVersion' <>
          'reader_post_promotion_attestation.v1'
        OR attestation->>'policyVersion' <> 'reader_post_promotion.v1'
        OR attestation->>'digestVersion' <>
          'reader_post_promotion_digest.sha256.v1'
        OR attestation->>'artifactId' <> artifact."id"::TEXT
        OR attestation->>'digest' !~ '^[0-9a-f]{64}$'
        OR encode(sha256(convert_to(
          attestation->>'canonicalPayload', 'UTF8'
        )), 'hex') <> attestation->>'digest', TRUE)
    )
    AND jsonb_typeof(artifact."artifact_payload"->'content'->
      'topReads') = 'array'
    AND jsonb_typeof(artifact."artifact_payload"->'content'->
      'selectedPosts') = 'array'
    AND (
      SELECT count(*) FROM (
        SELECT card FROM jsonb_array_elements(
          artifact."artifact_payload"->'content'->'topReads'
        ) card
        UNION ALL
        SELECT card FROM jsonb_array_elements(
          artifact."artifact_payload"->'content'->'selectedPosts'
        ) card
      ) cards
      WHERE card->>'promotionMarker' = 'reader_post_promotion'
        AND card->>'promotionPolicyVersion' = 'reader_post_promotion.v1'
    ) = jsonb_array_length(artifact."artifact_payload"->
      'promotionAttestations'), FALSE)
$function$;
CREATE FUNCTION public."reader_summary_promotion_v2_artifact_is_valid_v2"(artifact public."reader_summary_artifacts"
) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $function$
  SELECT COALESCE(artifact."status" = 'COMPLETED' AND
    jsonb_typeof(artifact."artifact_payload"->'promotionAttestations') = 'array'
    AND jsonb_array_length(artifact."artifact_payload"->'promotionAttestations') > 0
    AND (SELECT count(*) FROM jsonb_array_elements(artifact."artifact_payload"->'content'->'topReads') card
      WHERE card->>'promotionMarker' = 'reader_post_promotion') <= 8
    AND (SELECT count(*) FROM jsonb_array_elements(artifact."artifact_payload"->'content'->'selectedPosts') card
      WHERE card->>'promotionMarker' = 'reader_post_promotion') <= 8
    AND jsonb_array_length(artifact."artifact_payload"->'promotionAttestations') =
      (SELECT count(*) FROM (
        SELECT card FROM jsonb_array_elements(artifact."artifact_payload"->
          'content'->'topReads') card
        UNION ALL SELECT card FROM jsonb_array_elements(artifact."artifact_payload"->
          'content'->'selectedPosts') card
      ) cards WHERE card->>'promotionMarker' = 'reader_post_promotion')
    AND (SELECT count(DISTINCT attestation->>'candidateId')
      FROM jsonb_array_elements(artifact."artifact_payload"->
        'promotionAttestations') attestation) = jsonb_array_length(
          artifact."artifact_payload"->'promotionAttestations')
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(artifact."artifact_payload"->
        'promotionAttestations') WITH ORDINALITY tuple(attestation, slot)
      JOIN LATERAL (SELECT card, placement, lane_slot, row_number()
        OVER (ORDER BY lane_order, lane_slot) AS attestation_slot
        FROM (
        SELECT card, 'top' AS placement, 1 AS lane_order, ordinal AS lane_slot
          FROM jsonb_array_elements(
          artifact."artifact_payload"->'content'->'topReads'
        ) WITH ORDINALITY top_lane(card, ordinal)
        UNION ALL SELECT card, 'additional', 2, ordinal
          FROM jsonb_array_elements(
          artifact."artifact_payload"->'content'->'selectedPosts'
        ) WITH ORDINALITY additional_lane(card, ordinal)
      ) lanes WHERE card->>'promotionMarker' = 'reader_post_promotion'
      ) selected ON selected.attestation_slot=tuple.slot
      WHERE COALESCE(attestation->>'schemaVersion' <>
          'reader_post_promotion_attestation.v2'
        OR attestation->>'policyVersion' <> 'reader_post_promotion.v2'
        OR attestation->>'digestVersion' <>
          'reader_post_promotion_digest.sha256.v2'
        OR attestation->>'artifactId' <> artifact."id"::TEXT
        OR attestation->>'digest' !~ '^[0-9a-f]{64}$'
        OR encode(sha256(convert_to(
          attestation->>'canonicalPayload', 'UTF8'
        )), 'hex') <> attestation->>'digest'
        OR selected.card->>'promotionMarker' <> 'reader_post_promotion'
        OR selected.card->>'promotionPolicyVersion' <> 'reader_post_promotion.v2'
        OR selected.card->>'promotionCandidateId' <> attestation->>'candidateId'
        OR selected.card->>'promotionCanonicalIdentity' <>
          attestation->>'canonicalIdentity'
        OR selected.card->'citationIds' <> attestation->'citationIds'
        OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(
          artifact."artifact_payload"->'citationMap') citation
          WHERE citation->>'citationId' = attestation->>'citationId'
            AND citation->>'feedItemId' = attestation->>'candidateId')
        OR attestation->>'placement' <> selected.placement
        OR (attestation->>'slot')::INTEGER <> selected.lane_slot, TRUE)
    ), FALSE)
$function$;
CREATE FUNCTION public."reader_summary_promotion_v2_artifact_is_no_signal"(
  artifact public."reader_summary_artifacts"
) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $function$
  SELECT COALESCE(
    artifact."status" = 'NO_SIGNAL'
    AND artifact."artifact_payload"->'promotionAttestations' = '[]'::JSONB
    AND artifact."artifact_payload"->'topStories' = '[]'::JSONB
    AND artifact."artifact_payload"->'citationMap' = '[]'::JSONB
    AND artifact."artifact_payload"->'content'->'topReads' = '[]'::JSONB
    AND artifact."artifact_payload"->'content'->'selectedPosts' = '[]'::JSONB
    AND artifact."artifact_payload"->'qualityFlags' ? 'no_signal'
    AND artifact."artifact_payload"->'lineage'->>'promptVersion' =
      'reader_summary.promotion_no_signal.v1'
    AND artifact."artifact_payload"->'lineage'->>'modelVersion' =
      'not_invoked'
    AND artifact."artifact_payload"->'lineage'->>'providerVersion' =
      'deterministic'
    AND artifact."artifact_payload"->'lineage'->>'rulesVersion' =
      'reader_promotion_policy.v2'
    AND artifact."artifact_payload"->'lineage'->>'evalDatasetVersion' =
      'reader_promotion_policy.v2'
  , FALSE)
$function$;
CREATE FUNCTION public."reader_summary_promotion_v2_artifact_is_target"(
  artifact public."reader_summary_artifacts"
) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $function$
  SELECT public."reader_summary_promotion_v2_artifact_is_valid_v2"(artifact)
    OR public."reader_summary_promotion_v2_artifact_is_no_signal"(artifact)
$function$;
CREATE FUNCTION public."record_reader_summary_promotion_v2_canary_receipt"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_slot public."reader_summary_publication_slots"%ROWTYPE;
  v_prior public."reader_summary_publications"%ROWTYPE;
  v_current_artifact public."reader_summary_artifacts"%ROWTYPE;
  v_prior_artifact public."reader_summary_artifacts"%ROWTYPE;
  v_receipt JSONB;
BEGIN
  IF current_user <> 'social_monitor_reader_summary_publication_owner' THEN
    RAISE EXCEPTION 'Promotion V2 canary receipt requires publication owner';
  END IF;
  SELECT * INTO v_slot
  FROM public."reader_summary_publication_slots" slot
  WHERE slot."tenant_id" = NEW."tenant_id"
    AND slot."workspace_id" = NEW."workspace_id"
    AND slot."scope_type" = NEW."scope_type"
    AND slot."scope_key" = NEW."scope_key"
    AND slot."cadence" = NEW."cadence"
    AND slot."period_started_at" = NEW."period_started_at"
    AND slot."period_ended_at" = NEW."period_ended_at"
    AND slot."period_timezone" = NEW."period_timezone";
  IF NOT FOUND OR v_slot."current_publication_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO STRICT v_prior
  FROM public."reader_summary_publications" publication
  WHERE publication."id" = v_slot."current_publication_id";
  SELECT * INTO STRICT v_current_artifact
  FROM public."reader_summary_artifacts" artifact
  WHERE artifact."id" = NEW."reader_summary_artifact_id";
  SELECT * INTO STRICT v_prior_artifact
  FROM public."reader_summary_artifacts" artifact
  WHERE artifact."id" = v_prior."reader_summary_artifact_id";

  IF NEW."id" = v_prior."id"
    OR NEW."scope_type" <> 'workspace'
    OR NEW."scope_key" <> 'workspace'
    OR NEW."cadence" <> 'daily'
    OR NEW."period_timezone" <> 'UTC'
    OR NEW."publication_kind" <> 'EXACT'
    OR v_prior."publication_kind" NOT IN ('EXACT', 'LEGACY_BACKFILL')
    OR ROW(NEW."tenant_id", NEW."workspace_id", NEW."scope_type",
      NEW."scope_key", NEW."cadence", NEW."period_started_at",
      NEW."period_ended_at", NEW."period_timezone") IS DISTINCT FROM
      ROW(v_prior."tenant_id", v_prior."workspace_id", v_prior."scope_type",
      v_prior."scope_key", v_prior."cadence", v_prior."period_started_at",
      v_prior."period_ended_at", v_prior."period_timezone")
    OR NEW."semantic_status" NOT IN ('COMPLETED', 'NO_SIGNAL')
    OR v_prior."semantic_status" <> 'COMPLETED'
    OR v_current_artifact."status" IS DISTINCT FROM NEW."semantic_status"
    OR v_prior_artifact."status" <> 'COMPLETED'
    OR jsonb_typeof(NEW."exact_proof") <> 'object'
    OR jsonb_typeof(v_prior."exact_proof") <> 'object'
    OR encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json"(NEW."exact_proof"),
      'UTF8'
    )), 'hex') <> btrim(NEW."proof_sha256")
    OR encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json"(v_prior."exact_proof"),
      'UTF8'
    )), 'hex') <> btrim(v_prior."proof_sha256")
    OR NOT public."reader_summary_promotion_v2_exact_proof_matches"(NEW)
    OR NOT public."reader_summary_promotion_v2_exact_proof_matches"(v_prior)
    OR NOT public."reader_summary_promotion_v2_artifact_is_target"(
      v_current_artifact
    )
    OR NOT public."reader_summary_promotion_v2_artifact_is_strict_v1"(
      v_prior_artifact
    ) THEN
    RETURN NEW;
  END IF;

  v_receipt := jsonb_build_object(
    'schemaVersion', 1,
    'format', 'reader-summary-promotion-v2-canary-publication-receipt-v1',
    'date', NEW."requested_utc_date"::TEXT,
    'status', 'published',
    'publishedAt', to_char(NEW."published_at" AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'outputIdentity', jsonb_build_object(
      'artifactId', NEW."reader_summary_artifact_id"::TEXT,
      'publicationId', NEW."id"::TEXT,
      'reportSha256', btrim(NEW."report_sha256"),
      'proofSha256', btrim(NEW."proof_sha256")
    ),
    'rollbackAuthority', jsonb_build_object(
      'priorPublicationId', v_prior."id"::TEXT,
      'priorArtifactId', v_prior."reader_summary_artifact_id"::TEXT,
      'priorReportSha256', btrim(v_prior."report_sha256"),
      'priorProofSha256', btrim(v_prior."proof_sha256"),
      'expectedCurrentPublicationId', NEW."id"::TEXT,
      'expectedCurrentArtifactId', NEW."reader_summary_artifact_id"::TEXT,
      'expectedCurrentReportSha256', btrim(NEW."report_sha256"),
      'expectedCurrentProofSha256', btrim(NEW."proof_sha256")
    )
  );
  INSERT INTO public."reader_summary_promotion_v2_canary_publication_receipts" (
    "v2_publication_id", "tenant_id", "workspace_id", "requested_utc_date",
    "v2_artifact_id", "prior_v1_publication_id", "prior_v1_artifact_id",
    "receipt", "receipt_sha256", "recorded_at"
  ) VALUES (
    NEW."id", NEW."tenant_id", NEW."workspace_id",
    NEW."requested_utc_date", NEW."reader_summary_artifact_id",
    v_prior."id", v_prior."reader_summary_artifact_id", v_receipt,
    encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json"(v_receipt), 'UTF8'
    )), 'hex'), NEW."published_at"
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER "reader_summary_promotion_v2_canary_receipt_recorded"
AFTER INSERT ON public."reader_summary_publications"
FOR EACH ROW EXECUTE FUNCTION
  public."record_reader_summary_promotion_v2_canary_receipt"();

CREATE FUNCTION public."reader_summary_promotion_v2_canary_receipt"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_requested_utc_date DATE,
  expected_v2_publication_id UUID
) RETURNS JSONB LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_receipt public."reader_summary_promotion_v2_canary_publication_receipts"%ROWTYPE;
BEGIN
  IF current_user <> 'social_monitor_reader_summary_publication_owner'
    OR NOT public.social_monitor_rls_workspace_match(
      target_tenant_id, target_workspace_id
    ) THEN
    RAISE EXCEPTION 'Promotion V2 canary receipt authority is unavailable';
  END IF;
  SELECT receipt.* INTO STRICT v_receipt
  FROM public."reader_summary_promotion_v2_canary_publication_receipts" receipt
  JOIN public."reader_summary_publication_slots" slot
    ON slot."current_publication_id" = receipt."v2_publication_id"
  JOIN public."reader_summary_publications" publication
    ON publication."id" = receipt."v2_publication_id"
  JOIN public."reader_summary_artifacts" artifact
    ON artifact."id" = publication."reader_summary_artifact_id"
  WHERE receipt."tenant_id" = target_tenant_id
    AND receipt."workspace_id" = target_workspace_id
    AND receipt."requested_utc_date" = target_requested_utc_date
    AND receipt."v2_publication_id" = expected_v2_publication_id
    AND publication."tenant_id" = receipt."tenant_id"
    AND publication."workspace_id" = receipt."workspace_id"
    AND publication."requested_utc_date" = receipt."requested_utc_date"
    AND publication."reader_summary_artifact_id" = receipt."v2_artifact_id"
    AND btrim(publication."report_sha256") =
      receipt."receipt"->'outputIdentity'->>'reportSha256'
    AND btrim(publication."proof_sha256") =
      receipt."receipt"->'outputIdentity'->>'proofSha256'
    AND artifact."tenant_id" = receipt."tenant_id"
    AND artifact."workspace_id" = receipt."workspace_id"
    AND artifact."status" = publication."semantic_status"
    AND public."reader_summary_promotion_v2_exact_proof_matches"(publication)
    AND public."reader_summary_promotion_v2_artifact_is_target"(artifact)
    AND slot."scope_type" = 'workspace'
    AND slot."scope_key" = 'workspace'
    AND slot."cadence" = 'daily'
    AND slot."period_started_at" =
      target_requested_utc_date::TIMESTAMP AT TIME ZONE 'UTC'
    AND slot."period_ended_at" =
      (target_requested_utc_date + 1)::TIMESTAMP AT TIME ZONE 'UTC'
    AND slot."period_timezone" = 'UTC';
  RETURN v_receipt."receipt" || jsonb_build_object(
    'receiptSha256', btrim(v_receipt."receipt_sha256")
  );
END;
$function$;

REVOKE ALL ON FUNCTION public."reader_summary_promotion_v2_canary_receipt"(
  UUID, UUID, DATE, UUID
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."reader_summary_promotion_v2_canary_receipt"(
  UUID, UUID, DATE, UUID
) TO "social_monitor_reader_summary_publication_runtime";

CREATE OR REPLACE FUNCTION public."guard_published_reader_summary_artifact_update"()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM public."reader_summary_publications"
    WHERE "reader_summary_artifact_id" = OLD."id"
  ) THEN
    IF current_user = 'social_monitor_reader_summary_publication_owner'
      AND (to_jsonb(NEW) - ARRAY['status', 'updated_at']) =
        (to_jsonb(OLD) - ARRAY['status', 'updated_at'])
      AND (
        (OLD."status" IN ('COMPLETED', 'NO_SIGNAL')
          AND NEW."status" = 'SUPERSEDED')
        OR (
          OLD."status" = 'SUPERSEDED'
          AND NEW."status" IN ('COMPLETED', 'NO_SIGNAL')
          AND current_setting(
            'social_monitor.authorized_promotion_v2_rollback', TRUE
          ) = OLD."id"::TEXT
        )
      ) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'published reader summary artifact is immutable';
  END IF;
  IF current_user <> 'social_monitor_reader_summary_publication_owner'
    AND NEW."status" IN ('COMPLETED', 'NO_SIGNAL') THEN
    RAISE EXCEPTION
      'visible reader summary artifact requires publish_reader_summary';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public."rollback_reader_summary_promotion_v2"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_requested_utc_date DATE,
  target_authority_receipt_format TEXT,
  target_authority_receipt_sha256 TEXT,
  expected_v2_publication_id UUID,
  expected_v2_artifact_id UUID,
  expected_v2_report_sha256 TEXT,
  expected_v2_proof_sha256 TEXT,
  expected_prior_v1_publication_id UUID,
  expected_prior_v1_artifact_id UUID,
  expected_prior_v1_report_sha256 TEXT,
  expected_prior_v1_proof_sha256 TEXT,
  expected_date_fence_token TEXT,
  target_rollback_at TIMESTAMPTZ
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
  v_updated INTEGER;
BEGIN
  IF current_user <> 'social_monitor_reader_summary_publication_owner' THEN
    RAISE EXCEPTION 'Promotion V2 rollback requires publication owner';
  END IF;
  IF target_authority_receipt_format NOT IN (
      'reader-summary-promotion-v2-historical-rebuild-receipt-v1',
      'reader-summary-promotion-v2-canary-publication-receipt-v1'
    )
    OR target_authority_receipt_sha256 !~ '^[0-9a-f]{64}$'
    OR expected_v2_report_sha256 !~ '^[0-9a-f]{64}$'
    OR expected_v2_proof_sha256 !~ '^[0-9a-f]{64}$'
    OR expected_prior_v1_report_sha256 !~ '^[0-9a-f]{64}$'
    OR expected_prior_v1_proof_sha256 !~ '^[0-9a-f]{64}$'
    OR expected_date_fence_token !~ ('^reader-summary-date:' ||
      target_requested_utc_date::TEXT || ':[1-9][0-9]*$')
    OR target_rollback_at > clock_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Promotion V2 rollback input proof is invalid';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."reader_summary_promotion_v2_rollback_receipts" r
    WHERE btrim(r."authority_receipt_sha256") =
        target_authority_receipt_sha256
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
  WHERE publication."id" = expected_prior_v1_publication_id
  FOR KEY SHARE;
  IF v_current."id" = v_prior."id"
    OR v_current."tenant_id" IS DISTINCT FROM target_tenant_id
    OR v_current."workspace_id" IS DISTINCT FROM target_workspace_id
    OR v_prior."tenant_id" IS DISTINCT FROM target_tenant_id
    OR v_prior."workspace_id" IS DISTINCT FROM target_workspace_id
    OR ROW(v_current."scope_type", v_current."scope_key", v_current."cadence",
      v_current."period_started_at", v_current."period_ended_at",
      v_current."period_timezone") IS DISTINCT FROM
      ROW(v_prior."scope_type", v_prior."scope_key", v_prior."cadence",
      v_prior."period_started_at", v_prior."period_ended_at",
      v_prior."period_timezone")
    OR v_current."requested_utc_date" IS DISTINCT FROM target_requested_utc_date
    OR v_current."publication_kind" IS DISTINCT FROM 'EXACT'
    OR v_prior."publication_kind" IS DISTINCT FROM 'EXACT'
    OR v_current."reader_summary_artifact_id" IS DISTINCT FROM
      expected_v2_artifact_id
    OR v_prior."reader_summary_artifact_id" IS DISTINCT FROM
      expected_prior_v1_artifact_id
    OR btrim(v_current."report_sha256") IS DISTINCT FROM
      expected_v2_report_sha256
    OR btrim(v_current."proof_sha256") IS DISTINCT FROM expected_v2_proof_sha256
    OR btrim(v_prior."report_sha256") IS DISTINCT FROM expected_prior_v1_report_sha256
    OR btrim(v_prior."proof_sha256") IS DISTINCT FROM expected_prior_v1_proof_sha256
    OR v_current."exact_proof"->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.publication_proof.v1'
    OR (
      (v_prior."publication_kind" = 'EXACT'
        AND v_prior."exact_proof"->>'schemaVersion' IS DISTINCT FROM
          'reader_summary.publication_proof.v1')
      OR (v_prior."publication_kind" = 'LEGACY_BACKFILL'
        AND v_prior."exact_proof"->>'schemaVersion' IS DISTINCT FROM
          'reader_summary.legacy_publication_proof.v1')
    )
    OR jsonb_typeof(v_current."exact_proof") IS DISTINCT FROM 'object'
    OR jsonb_typeof(v_prior."exact_proof") IS DISTINCT FROM 'object'
    OR encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json"(v_current."exact_proof"),
      'UTF8'
    )), 'hex') IS DISTINCT FROM btrim(v_current."proof_sha256")
    OR encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json"(v_prior."exact_proof"),
      'UTF8'
    )), 'hex') IS DISTINCT FROM btrim(v_prior."proof_sha256")
    OR NOT public."reader_summary_promotion_v2_exact_proof_matches"(v_current)
    OR NOT (
      (v_prior."publication_kind" = 'EXACT'
        AND public."reader_summary_promotion_v2_exact_proof_matches"(v_prior))
      OR (v_prior."publication_kind" = 'LEGACY_BACKFILL'
        AND public."reader_summary_promotion_v2_legacy_proof_matches"(v_prior))
    )
  THEN
    RAISE EXCEPTION 'Promotion V2 rollback publication slot/proof mismatch';
  END IF;

  SELECT * INTO STRICT v_current_artifact
  FROM public."reader_summary_artifacts" artifact
  WHERE artifact."id" = expected_v2_artifact_id
  FOR KEY SHARE;
  SELECT * INTO STRICT v_prior_artifact
  FROM public."reader_summary_artifacts" artifact
  WHERE artifact."id" = expected_prior_v1_artifact_id
  FOR KEY SHARE;
  IF v_current."reader_summary_job_id" IS NULL
    OR (v_prior."publication_kind" = 'EXACT'
      AND v_prior."reader_summary_job_id" IS NULL)
    OR (v_prior."publication_kind" = 'LEGACY_BACKFILL'
      AND v_prior."reader_summary_job_id" IS NOT NULL) THEN
    RAISE EXCEPTION 'Promotion V2 rollback job lineage is incomplete';
  END IF;
  SELECT * INTO STRICT v_current_job
  FROM public."reader_summary_jobs" job
  WHERE job."id" = v_current."reader_summary_job_id"
  FOR KEY SHARE;
  IF v_prior."publication_kind" = 'EXACT' THEN
    SELECT * INTO STRICT v_prior_job
    FROM public."reader_summary_jobs" job
    WHERE job."id" = v_prior."reader_summary_job_id"
    FOR KEY SHARE;
  END IF;
  IF v_current_artifact."status" NOT IN ('COMPLETED', 'NO_SIGNAL')
    OR v_current_job."status" IS DISTINCT FROM v_current_artifact."status"
    OR v_current."semantic_status" IS DISTINCT FROM v_current_artifact."status"
    OR v_prior_artifact."status" IS DISTINCT FROM 'SUPERSEDED'
    OR v_prior."semantic_status" IS DISTINCT FROM 'COMPLETED'
    OR (v_prior."publication_kind" = 'EXACT' AND (
      v_prior_job."status" IS DISTINCT FROM v_prior."semantic_status"
      OR v_prior_job."reader_summary_artifact_id" IS DISTINCT FROM
        v_prior_artifact."id"
    ))
    OR v_current_job."reader_summary_artifact_id" IS DISTINCT FROM
      v_current_artifact."id"
  THEN
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
  ) OR NOT public."reader_summary_promotion_v2_artifact_is_target"(
    v_current_artifact
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
    )
    OR NOT public."reader_summary_promotion_v2_artifact_is_strict_v1"(
      v_prior_artifact
    ) THEN
    RAISE EXCEPTION 'Promotion V2 rollback prior tuple is not strict V1';
  END IF;

  IF target_authority_receipt_format =
      'reader-summary-promotion-v2-canary-publication-receipt-v1'
    AND NOT EXISTS (
      SELECT 1
      FROM public."reader_summary_promotion_v2_canary_publication_receipts" r
      WHERE btrim(r."receipt_sha256") = target_authority_receipt_sha256
        AND r."tenant_id" = target_tenant_id
        AND r."workspace_id" = target_workspace_id
        AND r."requested_utc_date" = target_requested_utc_date
        AND r."v2_publication_id" = expected_v2_publication_id
        AND r."v2_artifact_id" = expected_v2_artifact_id
        AND r."prior_v1_publication_id" = expected_prior_v1_publication_id
        AND r."prior_v1_artifact_id" = expected_prior_v1_artifact_id
        AND r."receipt"->>'format' = target_authority_receipt_format
        AND r."receipt"->>'date' = target_requested_utc_date::TEXT
        AND r."receipt"->>'status' = 'published'
        AND r."receipt"->'outputIdentity'->>'publicationId' =
          expected_v2_publication_id::TEXT
        AND r."receipt"->'outputIdentity'->>'artifactId' =
          expected_v2_artifact_id::TEXT
        AND r."receipt"->'outputIdentity'->>'reportSha256' =
          expected_v2_report_sha256
        AND r."receipt"->'outputIdentity'->>'proofSha256' =
          expected_v2_proof_sha256
        AND r."receipt"->'rollbackAuthority'->>'priorPublicationId' =
          expected_prior_v1_publication_id::TEXT
        AND r."receipt"->'rollbackAuthority'->>'priorArtifactId' =
          expected_prior_v1_artifact_id::TEXT
        AND r."receipt"->'rollbackAuthority'->>'priorReportSha256' =
          expected_prior_v1_report_sha256
        AND r."receipt"->'rollbackAuthority'->>'priorProofSha256' =
          expected_prior_v1_proof_sha256
        AND r."receipt"->'rollbackAuthority'->>
          'expectedCurrentPublicationId' = expected_v2_publication_id::TEXT
        AND r."receipt"->'rollbackAuthority'->>
          'expectedCurrentArtifactId' = expected_v2_artifact_id::TEXT
        AND r."receipt"->'rollbackAuthority'->>
          'expectedCurrentReportSha256' = expected_v2_report_sha256
        AND r."receipt"->'rollbackAuthority'->>
          'expectedCurrentProofSha256' = expected_v2_proof_sha256
    ) THEN
    RAISE EXCEPTION 'Promotion V2 rollback canary publication receipt mismatch';
  END IF;

  v_identity := encode(sha256(convert_to(jsonb_build_object(
    'schemaVersion', 'reader_summary.promotion_v2_rollback_identity.v1',
    'tenantId', target_tenant_id::TEXT,
    'workspaceId', target_workspace_id::TEXT,
    'date', target_requested_utc_date::TEXT,
    'authorityReceiptFormat', target_authority_receipt_format,
    'authorityReceiptSha256', target_authority_receipt_sha256,
    'expectedV2PublicationId', expected_v2_publication_id::TEXT,
    'priorV1PublicationId', expected_prior_v1_publication_id::TEXT
  )::TEXT, 'UTF8')), 'hex');

  UPDATE public."reader_summary_artifacts"
  SET "status" = 'SUPERSEDED', "updated_at" = target_rollback_at
  WHERE "id" = expected_v2_artifact_id
    AND "tenant_id" = target_tenant_id
    AND "workspace_id" = target_workspace_id
    AND "status" = v_current."semantic_status";
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Promotion V2 rollback lost current lifecycle authority';
  END IF;

  PERFORM set_config(
    'social_monitor.authorized_promotion_v2_rollback',
    expected_prior_v1_artifact_id::TEXT,
    TRUE
  );
  UPDATE public."reader_summary_artifacts"
  SET "status" = v_prior."semantic_status", "updated_at" = target_rollback_at
  WHERE "id" = expected_prior_v1_artifact_id
    AND "tenant_id" = target_tenant_id
    AND "workspace_id" = target_workspace_id
    AND "status" = 'SUPERSEDED';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Promotion V2 rollback lost prior lifecycle authority';
  END IF;
  PERFORM set_config(
    'social_monitor.authorized_promotion_v2_rollback', '', TRUE
  );

  UPDATE public."reader_summary_publication_slots"
  SET "current_publication_id" = expected_prior_v1_publication_id,
      "updated_at" = target_rollback_at
  WHERE "tenant_id" = target_tenant_id
    AND "workspace_id" = target_workspace_id
    AND "scope_type" = v_slot."scope_type"
    AND "scope_key" = v_slot."scope_key"
    AND "cadence" = v_slot."cadence"
    AND "period_started_at" = v_slot."period_started_at"
    AND "period_ended_at" = v_slot."period_ended_at"
    AND "period_timezone" = v_slot."period_timezone";
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public."reader_summary_publication_slots" slot
    JOIN public."reader_summary_publications" publication
      ON publication."id" = slot."current_publication_id"
    JOIN public."reader_summary_artifacts" artifact
      ON artifact."id" = publication."reader_summary_artifact_id"
    WHERE slot."tenant_id" = target_tenant_id
      AND slot."workspace_id" = target_workspace_id
      AND slot."current_publication_id" = expected_prior_v1_publication_id
      AND artifact."id" = expected_prior_v1_artifact_id
      AND artifact."status" = 'COMPLETED'
      AND public."reader_summary_promotion_v2_artifact_is_strict_v1"(
        artifact
      )
  ) THEN
    RAISE EXCEPTION 'Promotion V2 rollback legacy V1 reader restoration failed';
  END IF;

  v_receipt := jsonb_build_object(
    'schemaVersion', 1,
    'format', 'reader-summary-promotion-v2-rollback-receipt-v1',
    'migration', '20260831120000_reader_summary_promotion_v2_rollback',
    'rolledBackAt', target_rollback_at,
    'date', target_requested_utc_date::TEXT,
    'authorityReceiptFormat', target_authority_receipt_format,
    'authorityReceiptSha256', target_authority_receipt_sha256,
    'rollbackIdentity', v_identity,
    'fenceToken', expected_date_fence_token,
    'restoredPublicationId', expected_prior_v1_publication_id::TEXT,
    'restoredArtifactId', expected_prior_v1_artifact_id::TEXT,
    'preservedV2PublicationId', expected_v2_publication_id::TEXT,
    'preservedV2ArtifactId', expected_v2_artifact_id::TEXT,
    'legacyV1ReaderVerified', TRUE
  );
  INSERT INTO public."reader_summary_promotion_v2_rollback_receipts" (
    "id", "tenant_id", "workspace_id", "requested_utc_date",
    "authority_receipt_format", "authority_receipt_sha256",
    "rollback_identity",
    "prior_publication_id", "prior_artifact_id",
    "replaced_v2_publication_id", "replaced_v2_artifact_id", "fence_token",
    "receipt", "receipt_sha256", "rolled_back_at"
  ) VALUES (
    gen_random_uuid(), target_tenant_id, target_workspace_id,
    target_requested_utc_date, target_authority_receipt_format,
    target_authority_receipt_sha256, v_identity,
    expected_prior_v1_publication_id, expected_prior_v1_artifact_id,
    expected_v2_publication_id, expected_v2_artifact_id, expected_date_fence_token,
    v_receipt,
    encode(sha256(convert_to(v_receipt::TEXT, 'UTF8')), 'hex'), target_rollback_at
  );
  RETURN v_receipt;
END;
$function$;

REVOKE ALL ON FUNCTION public."rollback_reader_summary_promotion_v2"(
  UUID, UUID, DATE, TEXT, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID, TEXT,
  TEXT, TEXT, TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public."rollback_reader_summary_promotion_v2"(
  UUID, UUID, DATE, TEXT, TEXT, UUID, UUID, TEXT, TEXT, UUID, UUID, TEXT,
  TEXT, TEXT, TIMESTAMPTZ
) TO "social_monitor_reader_summary_publication_runtime";

REVOKE ALL ON FUNCTION
  public."reader_summary_promotion_v2_exact_proof_matches"(
    public."reader_summary_publications"
  ),
  public."reader_summary_promotion_v2_legacy_proof_matches"(
    public."reader_summary_publications"
  ),
  public."reader_summary_promotion_v2_artifact_is_strict_v1"(
    public."reader_summary_artifacts"
  ),
  public."reader_summary_promotion_v2_artifact_is_valid_v2"(
    public."reader_summary_artifacts"
  ),
  public."reader_summary_promotion_v2_artifact_is_no_signal"(
    public."reader_summary_artifacts"
  ), public."reader_summary_promotion_v2_artifact_is_target"(
    public."reader_summary_artifacts"
  ),
  public."record_reader_summary_promotion_v2_canary_receipt"()
FROM PUBLIC;
RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE ALL ON TABLE
  public."reader_summary_promotion_v2_rollback_receipts",
  public."reader_summary_promotion_v2_canary_publication_receipts"
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT SELECT, INSERT ON TABLE
  public."reader_summary_promotion_v2_rollback_receipts",
  public."reader_summary_promotion_v2_canary_publication_receipts"
TO "social_monitor_reader_summary_publication_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
