-- @social-monitor-forward-migration
-- Reader summaries become public only through publish_reader_summary(jsonb).
-- The immutable ledger retains every winning proof while the locked slot row
-- identifies the sole public artifact for a canonical scope and period.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "reader_summary_publications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "period_started_at" TIMESTAMPTZ(6) NOT NULL,
    "period_ended_at" TIMESTAMPTZ(6) NOT NULL,
    "period_timezone" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "requested_utc_date" DATE NOT NULL,
    "publication_kind" TEXT NOT NULL,
    "reader_summary_job_id" UUID,
    "reader_summary_artifact_id" UUID NOT NULL,
    "semantic_status" "SummaryStatus" NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "model_version" TEXT NOT NULL,
    "model_authority" SMALLINT NOT NULL,
    "report_sha256" CHAR(64) NOT NULL,
    "proof_sha256" CHAR(64) NOT NULL,
    "exact_proof" JSONB NOT NULL,
    "outbox_event_id" UUID,
    "published_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reader_summary_publications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reader_summary_publications_status_check"
      CHECK ("semantic_status" IN ('COMPLETED', 'NO_SIGNAL')),
    CONSTRAINT "reader_summary_publications_model_authority_check"
      CHECK ("model_authority" BETWEEN 1 AND 3),
    CONSTRAINT "reader_summary_publications_kind_check"
      CHECK (
        (
          "publication_kind" = 'EXACT'
          AND "reader_summary_job_id" IS NOT NULL
          AND "outbox_event_id" IS NOT NULL
          AND "exact_proof"->>'schemaVersion'
            = 'reader_summary.publication_proof.v1'
        ) OR (
          "publication_kind" = 'LEGACY_BACKFILL'
          AND "reader_summary_job_id" IS NULL
          AND "outbox_event_id" IS NULL
          AND "exact_proof"->>'schemaVersion'
            = 'reader_summary.legacy_publication_proof.v1'
        )
      ),
    CONSTRAINT "reader_summary_publications_report_sha_check"
      CHECK ("report_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "reader_summary_publications_proof_sha_check"
      CHECK ("proof_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "reader_summary_publications_job_fkey"
      FOREIGN KEY ("reader_summary_job_id")
      REFERENCES "reader_summary_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reader_summary_publications_artifact_fkey"
      FOREIGN KEY ("reader_summary_artifact_id")
      REFERENCES "reader_summary_artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "reader_summary_publications_outbox_fkey"
      FOREIGN KEY ("outbox_event_id")
      REFERENCES "outbox_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reader_summary_publications_job_key"
  ON "reader_summary_publications"("reader_summary_job_id");
CREATE UNIQUE INDEX "reader_summary_publications_artifact_key"
  ON "reader_summary_publications"("reader_summary_artifact_id");
CREATE UNIQUE INDEX "reader_summary_publications_outbox_key"
  ON "reader_summary_publications"("outbox_event_id");
CREATE INDEX "reader_summary_publications_scope_requested_idx"
  ON "reader_summary_publications"
  ("tenant_id", "workspace_id", "scope_key", "requested_at");

CREATE TABLE "reader_summary_publication_slots" (
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "period_started_at" TIMESTAMPTZ(6) NOT NULL,
    "period_ended_at" TIMESTAMPTZ(6) NOT NULL,
    "period_timezone" TEXT NOT NULL,
    "current_publication_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reader_summary_publication_slots_pkey" PRIMARY KEY
      ("tenant_id", "workspace_id", "scope_type", "scope_key", "cadence",
       "period_started_at", "period_ended_at", "period_timezone"),
    CONSTRAINT "reader_summary_publication_slots_current_fkey"
      FOREIGN KEY ("current_publication_id")
      REFERENCES "reader_summary_publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "reader_summary_publication_slots_current_key"
  ON "reader_summary_publication_slots"("current_publication_id");

CREATE OR REPLACE FUNCTION "reader_summary_model_authority_rank"(
  model_version TEXT
) RETURNS SMALLINT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE
    WHEN lower(btrim(model_version)) LIKE 'codex:%'
      OR lower(btrim(model_version)) LIKE 'claude:%'
      OR lower(btrim(model_version)) LIKE '%agent-runtime%'
      THEN 3::SMALLINT
    WHEN lower(btrim(model_version)) LIKE '%deterministic%'
      THEN 1::SMALLINT
    ELSE 2::SMALLINT
  END
$$;

CREATE OR REPLACE FUNCTION "publish_reader_summary"(payload JSONB)
RETURNS TABLE (
  outcome TEXT,
  publication_id UUID,
  report_sha256 TEXT,
  proof_sha256 TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_tenant_id UUID;
  v_workspace_id UUID;
  v_scope_type TEXT;
  v_scope_key TEXT;
  v_interest_id UUID;
  v_cadence TEXT;
  v_period_started_at TIMESTAMPTZ(6);
  v_period_ended_at TIMESTAMPTZ(6);
  v_period_timezone TEXT;
  v_period_key TEXT;
  v_requested_at TIMESTAMPTZ(6);
  v_requested_utc_date DATE;
  v_job_id UUID;
  v_artifact_id UUID;
  v_semantic_status "SummaryStatus";
  v_model_version TEXT;
  v_model_authority SMALLINT;
  v_report JSONB;
  v_report_canonical TEXT;
  v_report_sha256 TEXT;
  v_exact_proof JSONB;
  v_expected_proof JSONB;
  v_proof_canonical TEXT;
  v_proof_sha256 TEXT;
  v_published_at TIMESTAMPTZ(6);
  v_event JSONB;
  v_event_id UUID;
  v_current_publication_id UUID;
  v_current "reader_summary_publications"%ROWTYPE;
  v_replay "reader_summary_publications"%ROWTYPE;
  v_job "reader_summary_jobs"%ROWTYPE;
  v_updated_count INTEGER;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
    OR payload->>'schemaVersion'
      IS DISTINCT FROM 'reader_summary.publication.v1' THEN
    RAISE EXCEPTION 'reader summary publication payload schema is invalid';
  END IF;

  BEGIN
    v_tenant_id := (payload->>'tenantId')::UUID;
    v_workspace_id := (payload->>'workspaceId')::UUID;
    v_scope_type := payload->>'scopeType';
    v_scope_key := payload->>'scopeKey';
    v_interest_id := NULLIF(payload->>'interestId', '')::UUID;
    v_cadence := payload->>'cadence';
    v_period_started_at := (payload->>'periodStartedAt')::TIMESTAMPTZ;
    v_period_ended_at := (payload->>'periodEndedAt')::TIMESTAMPTZ;
    v_period_timezone := payload->>'periodTimezone';
    v_period_key := payload->>'periodKey';
    v_requested_at := (payload->>'requestedAt')::TIMESTAMPTZ;
    v_job_id := (payload->>'readerSummaryJobId')::UUID;
    v_artifact_id := (payload->>'readerSummaryArtifactId')::UUID;
    v_semantic_status := (payload->>'semanticStatus')::"SummaryStatus";
    v_model_version := payload->>'modelVersion';
    v_published_at := (payload->>'publishedAt')::TIMESTAMPTZ;
    v_event_id := (payload->'readyEvent'->>'eventId')::UUID;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'reader summary publication binding is invalid';
  END;

  IF v_tenant_id IS NULL OR v_workspace_id IS NULL
    OR v_job_id IS NULL OR v_artifact_id IS NULL OR v_event_id IS NULL
    OR v_scope_type IS NULL OR btrim(v_scope_type) = ''
    OR v_scope_key IS NULL OR btrim(v_scope_key) = ''
    OR v_cadence IS NULL OR btrim(v_cadence) = ''
    OR v_period_timezone IS NULL OR btrim(v_period_timezone) = ''
    OR v_period_key IS NULL OR btrim(v_period_key) = ''
    OR v_model_version IS NULL OR btrim(v_model_version) = ''
    OR v_requested_at IS NULL OR v_published_at IS NULL
    OR v_period_ended_at <= v_period_started_at
    OR v_published_at < v_requested_at
    OR v_scope_type NOT IN ('workspace', 'interest')
    OR (v_scope_type = 'workspace'
      AND (v_scope_key <> 'workspace' OR v_interest_id IS NOT NULL))
    OR (v_scope_type = 'interest'
      AND (v_interest_id IS NULL
        OR v_scope_key <> 'interest:' || v_interest_id::TEXT))
    OR v_semantic_status NOT IN ('COMPLETED', 'NO_SIGNAL') THEN
    RAISE EXCEPTION 'reader summary publication binding is incomplete';
  END IF;

  v_requested_utc_date := (v_requested_at AT TIME ZONE 'UTC')::DATE;
  IF payload->>'requestedUtcDate'
    IS DISTINCT FROM to_char(v_requested_utc_date, 'YYYY-MM-DD') THEN
    RAISE EXCEPTION 'reader summary requested UTC date does not match requestedAt';
  END IF;

  v_report := payload->'report';
  v_report_canonical := payload->>'reportCanonical';
  IF jsonb_typeof(v_report) <> 'object' OR v_report_canonical IS NULL THEN
    RAISE EXCEPTION 'reader summary report proof is missing';
  END IF;
  BEGIN
    IF v_report_canonical::JSONB <> v_report THEN
      RAISE EXCEPTION 'reader summary canonical report does not match report JSON';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'reader summary canonical report is invalid JSON';
  END;
  v_report_sha256 := encode(
    digest(convert_to(v_report_canonical, 'UTF8'), 'sha256'),
    'hex'
  );
  IF payload->>'reportSha256' IS DISTINCT FROM v_report_sha256 THEN
    RAISE EXCEPTION 'reader summary report SHA-256 mismatch';
  END IF;

  IF v_report->>'schemaVersion'
      IS DISTINCT FROM 'reader_summary.publication_report.v1'
    OR v_report->>'modelVersion' IS DISTINCT FROM v_model_version
    OR v_report->>'semanticStatus' IS DISTINCT FROM v_semantic_status::TEXT
    OR jsonb_typeof(v_report->'artifactPayload') <> 'object'
    OR jsonb_typeof(v_report->'citations') <> 'array'
    OR jsonb_typeof(v_report->'qualitySignals') <> 'object'
    OR jsonb_typeof(v_report->'qualitySignals'->'qualityFlags') <> 'array'
    OR v_report->'qualitySignals'->'publicationDecision'->>'status'
      IS DISTINCT FROM 'published'
    OR v_report->'qualitySignals'->'publicationDecision'->'qualityPassed'
      IS DISTINCT FROM 'true'::JSONB
    OR v_report->'qualitySignals'->'publicationGeneration'->>'requestedAt'
      IS DISTINCT FROM payload->>'requestedAt'
    OR v_report->'artifactPayload'->>'schemaVersion'
      IS DISTINCT FROM 'reader_summary.artifact.v1'
    OR v_report->'artifactPayload'->>'readerSummaryId'
      IS DISTINCT FROM v_artifact_id::TEXT
    OR v_report->'artifactPayload'->>'tenantId'
      IS DISTINCT FROM v_tenant_id::TEXT
    OR v_report->'artifactPayload'->>'workspaceId'
      IS DISTINCT FROM v_workspace_id::TEXT
    OR v_report->'artifactPayload'->>'userId'
      IS DISTINCT FROM NULLIF(payload->>'userId', '')
    OR v_report->'artifactPayload'->>'subscriptionId'
      IS DISTINCT FROM NULLIF(payload->>'subscriptionId', '')
    OR v_report->'artifactPayload'->'scope'->>'type'
      IS DISTINCT FROM v_scope_type
    OR (v_scope_type = 'workspace'
      AND v_report->'artifactPayload'->'scope'
        IS DISTINCT FROM jsonb_build_object('type', 'workspace'))
    OR (v_scope_type = 'interest'
      AND v_report->'artifactPayload'->'scope'->>'interestId'
        IS DISTINCT FROM v_interest_id::TEXT)
    OR v_report->'artifactPayload'->'period'->>'cadence'
      IS DISTINCT FROM v_cadence
    OR v_report->'artifactPayload'->'period'->>'startedAt'
      IS DISTINCT FROM payload->>'periodStartedAt'
    OR v_report->'artifactPayload'->'period'->>'endedAt'
      IS DISTINCT FROM payload->>'periodEndedAt'
    OR v_report->'artifactPayload'->'period'->>'timezone'
      IS DISTINCT FROM v_period_timezone
    OR v_report->'artifactPayload'->'period'->>'periodKey'
      IS DISTINCT FROM v_period_key
    OR v_report->'artifactPayload'->'lineage'->>'modelVersion'
      IS DISTINCT FROM v_model_version
    OR v_report->'artifactPayload'->'lineage'->>'promptVersion'
      IS DISTINCT FROM v_report->>'promptVersion'
    OR v_report->'artifactPayload'->>'headline'
      IS DISTINCT FROM v_report->>'headline'
    OR v_report->'artifactPayload'->>'executiveSummary'
      IS DISTINCT FROM v_report->>'summaryText'
    OR v_report->'artifactPayload'->'citationMap'
      IS DISTINCT FROM v_report->'citations'
    OR v_report->'artifactPayload'->'qualityFlags'
      IS DISTINCT FROM v_report->'qualitySignals'->'qualityFlags'
    OR (
      v_semantic_status = 'NO_SIGNAL'
      AND NOT COALESCE(
        v_report->'qualitySignals'->'qualityFlags' ? 'no_signal',
        FALSE
      )
    )
    OR (
      v_semantic_status = 'COMPLETED'
      AND COALESCE(
        v_report->'qualitySignals'->'qualityFlags' ? 'no_signal',
        FALSE
      )
    ) THEN
    RAISE EXCEPTION 'reader summary report semantics are invalid';
  END IF;

  v_expected_proof := jsonb_build_object(
    'schemaVersion', 'reader_summary.publication_proof.v1',
    'tenantId', v_tenant_id::TEXT,
    'workspaceId', v_workspace_id::TEXT,
    'scope', jsonb_build_object('type', v_scope_type, 'key', v_scope_key),
    'period', jsonb_build_object(
      'cadence', v_cadence,
      'startedAt', payload->>'periodStartedAt',
      'endedAt', payload->>'periodEndedAt',
      'timezone', v_period_timezone,
      'periodKey', v_period_key
    ),
    'requestedUtcDate', to_char(v_requested_utc_date, 'YYYY-MM-DD'),
    'requestedAt', payload->>'requestedAt',
    'readerSummaryJobId', v_job_id::TEXT,
    'readerSummaryArtifactId', v_artifact_id::TEXT,
    'semanticStatus', v_semantic_status::TEXT,
    'modelVersion', v_model_version,
    'reportSha256', v_report_sha256
  );
  v_exact_proof := payload->'exactProof';
  v_proof_canonical := payload->>'proofCanonical';
  IF v_exact_proof IS DISTINCT FROM v_expected_proof
    OR v_proof_canonical IS NULL
    OR v_proof_canonical::JSONB IS DISTINCT FROM v_exact_proof THEN
    RAISE EXCEPTION 'reader summary exact publication proof mismatch';
  END IF;
  v_proof_sha256 := encode(
    digest(convert_to(v_proof_canonical, 'UTF8'), 'sha256'),
    'hex'
  );
  IF payload->>'proofSha256' IS DISTINCT FROM v_proof_sha256 THEN
    RAISE EXCEPTION 'reader summary publication proof SHA-256 mismatch';
  END IF;

  v_event := payload->'readyEvent';
  IF jsonb_typeof(v_event) <> 'object'
    OR v_event->>'eventType' IS DISTINCT FROM 'reader_summary.ready'
    OR v_event->>'schemaVersion' IS DISTINCT FROM '1'
    OR v_event->>'occurredAt' IS DISTINCT FROM payload->>'publishedAt'
    OR v_event->>'tenantId' IS DISTINCT FROM v_tenant_id::TEXT
    OR v_event->>'workspaceId' IS DISTINCT FROM v_workspace_id::TEXT
    OR v_event->>'correlationId' IS DISTINCT FROM v_job_id::TEXT
    OR v_event->>'causationId' IS DISTINCT FROM v_job_id::TEXT
    OR v_event->'payload'->>'readerSummaryJobId'
      IS DISTINCT FROM v_job_id::TEXT
    OR v_event->'payload'->>'readerSummaryId'
      IS DISTINCT FROM v_artifact_id::TEXT
    OR v_event->'payload'->>'tenantId' IS DISTINCT FROM v_tenant_id::TEXT
    OR v_event->'payload'->>'workspaceId'
      IS DISTINCT FROM v_workspace_id::TEXT
    OR v_event->'payload'->>'userId'
      IS DISTINCT FROM NULLIF(payload->>'userId', '')
    OR v_event->'payload'->>'subscriptionId'
      IS DISTINCT FROM NULLIF(payload->>'subscriptionId', '')
    OR v_event->'payload'->'scope'
      IS DISTINCT FROM v_report->'artifactPayload'->'scope'
    OR v_event->'payload'->'period'
      IS DISTINCT FROM v_report->'artifactPayload'->'period'
    OR v_event->'payload'->>'status'
      IS DISTINCT FROM lower(v_semantic_status::TEXT) THEN
    RAISE EXCEPTION 'reader summary ready event does not match publication proof';
  END IF;

  SELECT * INTO v_job
  FROM "reader_summary_jobs"
  WHERE "id" = v_job_id
    AND "tenant_id" = v_tenant_id
    AND "workspace_id" = v_workspace_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reader summary running job does not match publication proof';
  END IF;

  -- Locking the job before replay lookup makes concurrent delivery of the
  -- same semantic JSON idempotent instead of racing the terminal job update.
  SELECT * INTO v_replay
  FROM "reader_summary_publications"
  WHERE "reader_summary_job_id" = v_job_id;
  IF FOUND THEN
    IF v_replay."reader_summary_artifact_id" = v_artifact_id
      AND v_replay."semantic_status" = v_semantic_status
      AND v_replay."requested_at" = v_requested_at
      AND v_replay."model_version" = v_model_version
      AND btrim(v_replay."report_sha256") = v_report_sha256
      AND btrim(v_replay."proof_sha256") = v_proof_sha256
      AND v_replay."exact_proof" = v_exact_proof
      AND v_replay."outbox_event_id" = v_event_id THEN
      RETURN QUERY SELECT
        'replayed'::TEXT,
        v_replay."id",
        v_report_sha256,
        v_proof_sha256;
      RETURN;
    END IF;
    RAISE EXCEPTION 'reader summary publication idempotency conflict';
  END IF;

  IF v_job."status" <> 'RUNNING'
    OR v_job."scope_type" <> v_scope_type
    OR v_job."scope_key" <> v_scope_key
    OR v_job."interest_id" IS DISTINCT FROM v_interest_id
    OR v_job."user_id" IS DISTINCT FROM NULLIF(payload->>'userId', '')
    OR v_job."subscription_id"
      IS DISTINCT FROM NULLIF(payload->>'subscriptionId', '')::UUID
    OR v_job."cadence" <> v_cadence
    OR v_job."period_started_at" <> v_period_started_at
    OR v_job."period_ended_at" <> v_period_ended_at
    OR v_job."period_timezone" <> v_period_timezone
    OR v_job."period_key" <> v_period_key
    OR v_job."requested_at" <> v_requested_at THEN
    RAISE EXCEPTION 'reader summary running job does not match publication proof';
  END IF;

  INSERT INTO "reader_summary_publication_slots" (
    "tenant_id", "workspace_id", "scope_type", "scope_key", "cadence",
    "period_started_at", "period_ended_at", "period_timezone",
    "current_publication_id", "updated_at"
  ) VALUES (
    v_tenant_id, v_workspace_id, v_scope_type, v_scope_key, v_cadence,
    v_period_started_at, v_period_ended_at, v_period_timezone,
    NULL, v_published_at
  ) ON CONFLICT DO NOTHING;

  SELECT "current_publication_id" INTO v_current_publication_id
  FROM "reader_summary_publication_slots"
  WHERE "tenant_id" = v_tenant_id
    AND "workspace_id" = v_workspace_id
    AND "scope_type" = v_scope_type
    AND "scope_key" = v_scope_key
    AND "cadence" = v_cadence
    AND "period_started_at" = v_period_started_at
    AND "period_ended_at" = v_period_ended_at
    AND "period_timezone" = v_period_timezone
  FOR UPDATE;

  IF v_current_publication_id IS NOT NULL THEN
    SELECT * INTO STRICT v_current
    FROM "reader_summary_publications"
    WHERE "id" = v_current_publication_id;

    -- Strict time monotonicity is deliberately evaluated before model
    -- authority. Missing timestamps were rejected during payload parsing.
    IF v_requested_at <= v_current."requested_at" THEN
      RETURN QUERY SELECT
        'stale'::TEXT,
        v_current."id",
        v_report_sha256,
        v_proof_sha256;
      RETURN;
    END IF;

    v_model_authority := "reader_summary_model_authority_rank"(v_model_version);
    IF v_model_authority < v_current."model_authority" THEN
      RETURN QUERY SELECT
        'stale'::TEXT,
        v_current."id",
        v_report_sha256,
        v_proof_sha256;
      RETURN;
    END IF;
  ELSE
    v_model_authority := "reader_summary_model_authority_rank"(v_model_version);
  END IF;

  INSERT INTO "reader_summary_artifacts" (
    "id", "tenant_id", "workspace_id", "scope_type", "scope_key",
    "interest_id", "cadence", "period_started_at", "period_ended_at",
    "period_timezone", "period_key", "user_id", "subscription_id",
    "status", "schema_version", "model_version", "prompt_version",
    "headline", "summary_text", "artifact_payload", "citations",
    "quality_signals", "created_at", "updated_at"
  ) VALUES (
    v_artifact_id, v_tenant_id, v_workspace_id, v_scope_type, v_scope_key,
    v_interest_id, v_cadence,
    v_period_started_at, v_period_ended_at, v_period_timezone, v_period_key,
    NULLIF(payload->>'userId', ''), NULLIF(payload->>'subscriptionId', '')::UUID,
    v_semantic_status, 1, v_model_version, v_report->>'promptVersion',
    v_report->>'headline', v_report->>'summaryText',
    v_report->'artifactPayload', v_report->'citations',
    v_report->'qualitySignals', v_published_at, v_published_at
  )
  ON CONFLICT ("id") DO UPDATE SET
    "scope_type" = EXCLUDED."scope_type",
    "scope_key" = EXCLUDED."scope_key",
    "interest_id" = EXCLUDED."interest_id",
    "cadence" = EXCLUDED."cadence",
    "period_started_at" = EXCLUDED."period_started_at",
    "period_ended_at" = EXCLUDED."period_ended_at",
    "period_timezone" = EXCLUDED."period_timezone",
    "period_key" = EXCLUDED."period_key",
    "user_id" = EXCLUDED."user_id",
    "subscription_id" = EXCLUDED."subscription_id",
    "status" = EXCLUDED."status",
    "schema_version" = EXCLUDED."schema_version",
    "model_version" = EXCLUDED."model_version",
    "prompt_version" = EXCLUDED."prompt_version",
    "headline" = EXCLUDED."headline",
    "summary_text" = EXCLUDED."summary_text",
    "artifact_payload" = EXCLUDED."artifact_payload",
    "citations" = EXCLUDED."citations",
    "quality_signals" = EXCLUDED."quality_signals",
    "updated_at" = EXCLUDED."updated_at"
  WHERE "reader_summary_artifacts"."tenant_id" = EXCLUDED."tenant_id"
    AND "reader_summary_artifacts"."workspace_id" = EXCLUDED."workspace_id"
    AND "reader_summary_artifacts"."status" = 'RUNNING';
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'reader summary candidate cannot be promoted';
  END IF;

  UPDATE "reader_summary_jobs"
  SET "status" = v_semantic_status,
      "completed_at" = v_published_at,
      "failed_at" = NULL,
      "reader_summary_artifact_id" = v_artifact_id,
      "failure_reason" = NULL,
      "updated_at" = v_published_at
  WHERE "id" = v_job_id
    AND "tenant_id" = v_tenant_id
    AND "workspace_id" = v_workspace_id
    AND "status" = 'RUNNING'
    AND "requested_at" = v_requested_at;
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'reader summary job publication update lost authority';
  END IF;

  INSERT INTO "outbox_events" (
    "id", "tenant_id", "workspace_id", "event_type", "schema_version",
    "payload", "status", "correlation_id", "causation_id", "created_at"
  ) VALUES (
    v_event_id, v_tenant_id, v_workspace_id, v_event->>'eventType',
    (v_event->>'schemaVersion')::INTEGER,
    (v_event->'payload') || jsonb_build_object(
      'publicationProof', v_exact_proof,
      'reportSha256', v_report_sha256,
      'proofSha256', v_proof_sha256
    ),
    'PENDING', v_event->>'correlationId', v_event->>'causationId',
    v_published_at
  );

  INSERT INTO "reader_summary_publications" (
    "id", "tenant_id", "workspace_id", "scope_type", "scope_key",
    "cadence", "period_started_at", "period_ended_at", "period_timezone",
    "period_key", "requested_utc_date", "publication_kind",
    "reader_summary_job_id",
    "reader_summary_artifact_id", "semantic_status", "requested_at",
    "model_version", "model_authority", "report_sha256", "proof_sha256",
    "exact_proof", "outbox_event_id", "published_at"
  ) VALUES (
    v_artifact_id, v_tenant_id, v_workspace_id, v_scope_type, v_scope_key,
    v_cadence, v_period_started_at, v_period_ended_at, v_period_timezone,
    v_period_key, v_requested_utc_date, 'EXACT', v_job_id, v_artifact_id,
    v_semantic_status, v_requested_at, v_model_version, v_model_authority,
    v_report_sha256, v_proof_sha256, v_exact_proof, v_event_id, v_published_at
  );

  IF v_current_publication_id IS NOT NULL THEN
    UPDATE "reader_summary_artifacts"
    SET "status" = 'SUPERSEDED', "updated_at" = v_published_at
    WHERE "id" = v_current."reader_summary_artifact_id"
      AND "status" IN ('COMPLETED', 'NO_SIGNAL');
  END IF;

  UPDATE "reader_summary_publication_slots"
  SET "current_publication_id" = v_artifact_id,
      "updated_at" = v_published_at
  WHERE "tenant_id" = v_tenant_id
    AND "workspace_id" = v_workspace_id
    AND "scope_type" = v_scope_type
    AND "scope_key" = v_scope_key
    AND "cadence" = v_cadence
    AND "period_started_at" = v_period_started_at
    AND "period_ended_at" = v_period_ended_at
    AND "period_timezone" = v_period_timezone;

  RETURN QUERY SELECT
    'published'::TEXT,
    v_artifact_id,
    v_report_sha256,
    v_proof_sha256;
END;
$$;

-- Existing public rows predate the exact-proof protocol. Preserve exactly one
-- historical generation in each canonical slot with a deterministic,
-- explicitly legacy proof. COMPLETED was the only reader-visible legacy
-- status, so it takes precedence over NO_SIGNAL even when the NO_SIGNAL row is
-- newer. Within the preferred semantic status, newest created_at wins and id
-- descending is the stable tie-break. The trigger installed after backfill
-- makes LEGACY_BACKFILL migration-only; every future publication must be EXACT.

WITH "legacy_candidates" AS (
  SELECT
    artifact.*,
    row_number() OVER (
      PARTITION BY
        artifact."tenant_id",
        artifact."workspace_id",
        artifact."scope_type",
        artifact."scope_key",
        artifact."cadence",
        artifact."period_started_at",
        artifact."period_ended_at",
        artifact."period_timezone"
      ORDER BY
        CASE artifact."status" WHEN 'COMPLETED' THEN 0 ELSE 1 END,
        artifact."created_at" DESC,
        artifact."id" DESC
    ) AS "slot_rank"
  FROM "reader_summary_artifacts" AS artifact
  WHERE artifact."status" IN ('COMPLETED', 'NO_SIGNAL')
),
"legacy_reports" AS (
  SELECT
    candidate.*,
    jsonb_build_object(
      'schemaVersion', 'reader_summary.legacy_publication_report.v1',
      'semanticStatus', candidate."status"::TEXT,
      'modelVersion', candidate."model_version",
      'promptVersion', candidate."prompt_version",
      'headline', candidate."headline",
      'summaryText', candidate."summary_text",
      'artifactPayload', candidate."artifact_payload",
      'citations', candidate."citations",
      'qualitySignals', candidate."quality_signals"
    ) AS "legacy_report"
  FROM "legacy_candidates" AS candidate
  WHERE candidate."slot_rank" = 1
),
"legacy_proofs" AS (
  SELECT
    report.*,
    encode(
      digest(convert_to(report."legacy_report"::TEXT, 'UTF8'), 'sha256'),
      'hex'
    ) AS "legacy_report_sha256",
    jsonb_build_object(
      'schemaVersion', 'reader_summary.legacy_publication_proof.v1',
      'migration', '20260716170000_reader_summary_fail_closed_publication',
      'tenantId', report."tenant_id"::TEXT,
      'workspaceId', report."workspace_id"::TEXT,
      'scope', jsonb_build_object(
        'type', report."scope_type",
        'key', report."scope_key"
      ),
      'period', jsonb_build_object(
        'cadence', report."cadence",
        'startedAt', to_char(
          report."period_started_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'endedAt', to_char(
          report."period_ended_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'timezone', report."period_timezone",
        'periodKey', report."period_key"
      ),
      'requestedUtcDate', to_char(
        report."created_at" AT TIME ZONE 'UTC',
        'YYYY-MM-DD'
      ),
      'requestedAt', to_char(
        report."created_at" AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'readerSummaryArtifactId', report."id"::TEXT,
      'semanticStatus', report."status"::TEXT,
      'modelVersion', report."model_version",
      'reportSha256', encode(
        digest(convert_to(report."legacy_report"::TEXT, 'UTF8'), 'sha256'),
        'hex'
      )
    ) AS "legacy_proof"
  FROM "legacy_reports" AS report
)
INSERT INTO "reader_summary_publications" (
  "id", "tenant_id", "workspace_id", "scope_type", "scope_key",
  "cadence", "period_started_at", "period_ended_at", "period_timezone",
  "period_key", "requested_utc_date", "publication_kind",
  "reader_summary_job_id", "reader_summary_artifact_id", "semantic_status",
  "requested_at", "model_version", "model_authority", "report_sha256",
  "proof_sha256", "exact_proof", "outbox_event_id", "published_at"
)
SELECT
  proof."id", proof."tenant_id", proof."workspace_id",
  proof."scope_type", proof."scope_key", proof."cadence",
  proof."period_started_at", proof."period_ended_at",
  proof."period_timezone", proof."period_key",
  (proof."created_at" AT TIME ZONE 'UTC')::DATE,
  'LEGACY_BACKFILL', NULL, proof."id", proof."status",
  proof."created_at", proof."model_version",
  "reader_summary_model_authority_rank"(proof."model_version"),
  proof."legacy_report_sha256",
  encode(digest(convert_to(proof."legacy_proof"::TEXT, 'UTF8'), 'sha256'), 'hex'),
  proof."legacy_proof", NULL, proof."updated_at"
FROM "legacy_proofs" AS proof;

INSERT INTO "reader_summary_publication_slots" (
  "tenant_id", "workspace_id", "scope_type", "scope_key", "cadence",
  "period_started_at", "period_ended_at", "period_timezone",
  "current_publication_id", "updated_at"
)
SELECT
  publication."tenant_id", publication."workspace_id",
  publication."scope_type", publication."scope_key", publication."cadence",
  publication."period_started_at", publication."period_ended_at",
  publication."period_timezone", publication."id", publication."published_at"
FROM "reader_summary_publications" AS publication
WHERE publication."publication_kind" = 'LEGACY_BACKFILL';

-- Keep every non-selected legacy row as durable history while removing its
-- former public status. The selected artifact remains COMPLETED or NO_SIGNAL
-- and is the only row reachable through the active publication slot.
UPDATE "reader_summary_artifacts" AS artifact
SET "status" = 'SUPERSEDED'
FROM "reader_summary_publication_slots" AS slot
WHERE artifact."tenant_id" = slot."tenant_id"
  AND artifact."workspace_id" = slot."workspace_id"
  AND artifact."scope_type" = slot."scope_type"
  AND artifact."scope_key" = slot."scope_key"
  AND artifact."cadence" = slot."cadence"
  AND artifact."period_started_at" = slot."period_started_at"
  AND artifact."period_ended_at" = slot."period_ended_at"
  AND artifact."period_timezone" = slot."period_timezone"
  AND artifact."id" <> slot."current_publication_id"
  AND artifact."status" IN ('COMPLETED', 'NO_SIGNAL');

CREATE OR REPLACE FUNCTION "guard_reader_summary_publication_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."publication_kind" = 'LEGACY_BACKFILL' THEN
    RAISE EXCEPTION 'reader summary legacy publication backfill is closed';
  ELSIF NEW."publication_kind" = 'EXACT'
    AND current_user <> 'social_monitor_reader_summary_publication_owner' THEN
    RAISE EXCEPTION
      'exact publication insert requires publish_reader_summary';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "reader_summary_publications_insert_guarded"
BEFORE INSERT ON "reader_summary_publications"
FOR EACH ROW
EXECUTE FUNCTION "guard_reader_summary_publication_insert"();

CREATE OR REPLACE FUNCTION "reject_reader_summary_publication_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'reader summary publication ledger is immutable';
END;
$$;

CREATE TRIGGER "reader_summary_publications_immutable"
BEFORE UPDATE OR DELETE ON "reader_summary_publications"
FOR EACH ROW
EXECUTE FUNCTION "reject_reader_summary_publication_mutation"();

CREATE OR REPLACE FUNCTION "guard_published_reader_summary_artifact_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1
    FROM "reader_summary_publications"
    WHERE "reader_summary_artifact_id" = OLD."id"
  ) THEN
    IF current_user = 'social_monitor_reader_summary_publication_owner'
      AND OLD."status" IN ('COMPLETED', 'NO_SIGNAL')
      AND NEW."status" = 'SUPERSEDED'
      AND (to_jsonb(NEW) - ARRAY['status', 'updated_at'])
        = (to_jsonb(OLD) - ARRAY['status', 'updated_at']) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'published reader summary artifact is immutable';
  END IF;
  -- Runtime and rollback binaries retain candidate INSERT/UPDATE privileges,
  -- but only the SECURITY DEFINER publisher may create a reader-visible row.
  IF current_user <> 'social_monitor_reader_summary_publication_owner'
    AND NEW."status" IN ('COMPLETED', 'NO_SIGNAL') THEN
    RAISE EXCEPTION
      'visible reader summary artifact requires publish_reader_summary';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "reader_summary_artifacts_published_immutable"
BEFORE INSERT OR UPDATE ON "reader_summary_artifacts"
FOR EACH ROW
EXECUTE FUNCTION "guard_published_reader_summary_artifact_update"();

CREATE OR REPLACE FUNCTION "guard_reader_summary_active_slot_update"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user <> 'social_monitor_reader_summary_publication_owner' THEN
    RAISE EXCEPTION
      'active reader summary slot update requires publish_reader_summary';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "reader_summary_publication_slots_guarded"
BEFORE INSERT OR UPDATE OR DELETE ON "reader_summary_publication_slots"
FOR EACH ROW
EXECUTE FUNCTION "guard_reader_summary_active_slot_update"();

-- A separate NOLOGIN role owns every object that can make or hide a public
-- reader summary. The deployment bootstrap creates these roles before Prisma
-- applies this migration and grants the application login only membership in
-- the narrow runtime capability role. PostgreSQL ownership, rather than a
-- user-settable session value, is the publication authority.
ALTER TABLE "reader_summary_publications"
  OWNER TO "social_monitor_reader_summary_publication_owner";
ALTER TABLE "reader_summary_publication_slots"
  OWNER TO "social_monitor_reader_summary_publication_owner";
ALTER TABLE "reader_summary_artifacts"
  OWNER TO "social_monitor_reader_summary_publication_owner";

ALTER FUNCTION "reader_summary_model_authority_rank"(TEXT)
  OWNER TO "social_monitor_reader_summary_publication_owner";
ALTER FUNCTION "publish_reader_summary"(JSONB)
  OWNER TO "social_monitor_reader_summary_publication_owner";
ALTER FUNCTION "guard_reader_summary_publication_insert"()
  OWNER TO "social_monitor_reader_summary_publication_owner";
ALTER FUNCTION "reject_reader_summary_publication_mutation"()
  OWNER TO "social_monitor_reader_summary_publication_owner";
ALTER FUNCTION "guard_published_reader_summary_artifact_update"()
  OWNER TO "social_monitor_reader_summary_publication_owner";
ALTER FUNCTION "guard_reader_summary_active_slot_update"()
  OWNER TO "social_monitor_reader_summary_publication_owner";

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

REVOKE ALL PRIVILEGES ON TABLE
  "reader_summary_publications",
  "reader_summary_publication_slots",
  "reader_summary_artifacts"
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT SELECT ON TABLE
  "reader_summary_publications",
  "reader_summary_publication_slots"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT, INSERT, UPDATE ON TABLE "reader_summary_artifacts"
TO "social_monitor_reader_summary_publication_runtime";

REVOKE ALL PRIVILEGES ON FUNCTION
  "reader_summary_model_authority_rank"(TEXT),
  "publish_reader_summary"(JSONB),
  "guard_reader_summary_publication_insert"(),
  "reject_reader_summary_publication_mutation"(),
  "guard_published_reader_summary_artifact_update"(),
  "guard_reader_summary_active_slot_update"()
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT EXECUTE ON FUNCTION "publish_reader_summary"(JSONB)
TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;

GRANT USAGE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner",
  "social_monitor_reader_summary_publication_runtime";
REVOKE CREATE ON SCHEMA public
FROM PUBLIC,
  "social_monitor_reader_summary_publication_owner",
  "social_monitor_reader_summary_publication_runtime";

COMMIT;
