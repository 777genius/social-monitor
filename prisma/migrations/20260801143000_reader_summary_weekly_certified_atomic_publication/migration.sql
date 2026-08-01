-- @social-monitor-forward-migration
-- Complete weekly certification as one immutable publication transaction.
-- Audit marker: 'migration', '20260801143000_reader_summary_weekly_certified_atomic_publication'.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";

GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";

RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

ALTER TABLE "reader_summary_publications"
  DROP CONSTRAINT "reader_summary_publications_kind_check";
ALTER TABLE "reader_summary_publications"
  ADD CONSTRAINT "reader_summary_publications_kind_check" CHECK (
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
    ) OR (
      "publication_kind" = 'WEEKLY_CERTIFIED'
      AND "reader_summary_job_id" IS NULL
      AND "outbox_event_id" IS NULL
      AND "semantic_status" = 'COMPLETED'
      AND "cadence" = 'weekly'
      AND "period_timezone" = 'UTC'
      AND "exact_proof"->>'schemaVersion'
        = 'reader_summary.weekly_publication_proof.v1'
    )
  );

CREATE OR REPLACE FUNCTION "guard_reader_summary_publication_insert"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW."publication_kind" = 'LEGACY_BACKFILL' THEN
    RAISE EXCEPTION 'reader summary legacy publication backfill is closed';
  ELSIF NEW."publication_kind" IN ('EXACT', 'WEEKLY_CERTIFIED')
    AND current_user <> 'social_monitor_reader_summary_publication_owner'
  THEN
    RAISE EXCEPTION
      'reader summary publication insert requires database publication authority';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "persist_reader_summary_weekly_artifact"(payload JSONB)
RETURNS TABLE (
  outcome TEXT,
  artifact_id UUID,
  artifact_payload_sha256 TEXT,
  proof_sha256 TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_artifact "reader_summary_artifacts"%ROWTYPE;
  v_artifact_count INTEGER;
  v_artifact_exact BOOLEAN;
  v_artifact_found BOOLEAN;
  v_artifact_id UUID;
  v_artifact_payload JSONB;
  v_artifact_payload_sha256 TEXT;
  v_citations JSONB;
  v_expected_authorities JSONB;
  v_interest_id UUID;
  v_manifest_seal_id TEXT;
  v_manifest_seal_sha256 TEXT;
  v_now TIMESTAMPTZ(6);
  v_period_ended_at TIMESTAMPTZ(6);
  v_period_started_at TIMESTAMPTZ(6);
  v_proof JSONB;
  v_proof_body JSONB;
  v_proof_sha256 TEXT;
  v_publication "reader_summary_publications"%ROWTYPE;
  v_publication_count INTEGER;
  v_publication_exact BOOLEAN;
  v_publication_found BOOLEAN;
  v_quality_signals JSONB;
  v_scope_key TEXT;
  v_scope_type TEXT;
  v_seal_days JSONB;
  v_seal_id TEXT;
  v_seal_sha256 TEXT;
  v_slot "reader_summary_publication_slots"%ROWTYPE;
  v_slot_found BOOLEAN;
  v_tenant_id UUID;
  v_updated INTEGER;
  v_week_ended_on DATE;
  v_week_started_on DATE;
  v_workspace_id UUID;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR current_setting('social_monitor.system_access', TRUE)
      IS DISTINCT FROM 'false'
    OR NOT pg_has_role(
      session_user,
      'social_monitor_reader_summary_publication_runtime',
      'USAGE'
    )
  THEN
    RAISE EXCEPTION
      'weekly artifact persistence requires a writable SERIALIZABLE tenant session';
  END IF;

  IF jsonb_typeof(payload) <> 'object'
    OR NOT payload ?& ARRAY[
      'schemaVersion', 'artifactId', 'tenantId', 'workspaceId',
      'scopeType', 'scopeKey', 'interestId', 'cadence',
      'weekStartedOn', 'weekEndedOn', 'periodStartedAt', 'periodEndedAt',
      'periodTimezone', 'periodKey', 'sealId', 'sealSha256',
      'manifestSealId', 'manifestSealSha256', 'headline', 'summaryText',
      'modelVersion', 'promptVersion', 'artifactPayload',
      'artifactPayloadSha256', 'citations', 'qualitySignals', 'proof'
    ]::TEXT[]
    OR payload - ARRAY[
      'schemaVersion', 'artifactId', 'tenantId', 'workspaceId',
      'scopeType', 'scopeKey', 'interestId', 'cadence',
      'weekStartedOn', 'weekEndedOn', 'periodStartedAt', 'periodEndedAt',
      'periodTimezone', 'periodKey', 'sealId', 'sealSha256',
      'manifestSealId', 'manifestSealSha256', 'headline', 'summaryText',
      'modelVersion', 'promptVersion', 'artifactPayload',
      'artifactPayloadSha256', 'citations', 'qualitySignals', 'proof'
    ]::TEXT[] <> '{}'::JSONB
    OR payload->>'schemaVersion'
      <> 'reader_summary.weekly_artifact_persistence.v2'
    OR payload->>'cadence' <> 'weekly'
  THEN
    RAISE EXCEPTION 'weekly artifact persistence payload shape is invalid';
  END IF;

  BEGIN
    v_artifact_id := (payload->>'artifactId')::UUID;
    v_tenant_id := (payload->>'tenantId')::UUID;
    v_workspace_id := (payload->>'workspaceId')::UUID;
    v_interest_id := NULLIF(payload->>'interestId', '')::UUID;
    v_week_started_on := (payload->>'weekStartedOn')::DATE;
    v_week_ended_on := (payload->>'weekEndedOn')::DATE;
    v_period_started_at := (payload->>'periodStartedAt')::TIMESTAMPTZ;
    v_period_ended_at := (payload->>'periodEndedAt')::TIMESTAMPTZ;
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'weekly artifact persistence identity or week is invalid';
  END;

  IF current_setting('social_monitor.tenant_id', TRUE)
      IS DISTINCT FROM v_tenant_id::TEXT
    OR current_setting('social_monitor.workspace_id', TRUE)
      IS DISTINCT FROM v_workspace_id::TEXT
  THEN
    RAISE EXCEPTION 'weekly artifact persistence session scope diverged';
  END IF;

  v_scope_type := payload->>'scopeType';
  v_scope_key := payload->>'scopeKey';
  IF v_scope_type NOT IN ('workspace', 'interest')
    OR btrim(COALESCE(v_scope_key, '')) <> v_scope_key
    OR v_scope_key = ''
    OR (v_scope_type = 'workspace'
      AND (v_scope_key <> 'workspace' OR v_interest_id IS NOT NULL))
    OR (v_scope_type = 'interest'
      AND (v_interest_id IS NULL
        OR v_scope_key <> 'interest:' || v_interest_id::TEXT))
  THEN
    RAISE EXCEPTION 'weekly artifact persistence scope is invalid';
  END IF;

  IF extract(isodow FROM v_week_started_on) <> 1
    OR v_week_ended_on <> v_week_started_on + 6
    OR payload->>'periodTimezone' <> 'UTC'
    OR v_period_started_at <>
      v_week_started_on::TIMESTAMP AT TIME ZONE 'UTC'
    OR v_period_ended_at <>
      (v_week_started_on + 7)::TIMESTAMP AT TIME ZONE 'UTC'
    OR payload->>'periodStartedAt' <>
      to_char(v_week_started_on, 'YYYY-MM-DD') || 'T00:00:00.000Z'
    OR payload->>'periodEndedAt' <>
      to_char(v_week_started_on + 7, 'YYYY-MM-DD') || 'T00:00:00.000Z'
    OR payload->>'periodKey' <>
      ('weekly:' || (payload->>'periodStartedAt') || ':'
      || (payload->>'periodEndedAt') || ':UTC')
  THEN
    RAISE EXCEPTION 'weekly artifact persistence week binding is invalid';
  END IF;

  v_artifact_payload := payload->'artifactPayload';
  v_citations := payload->'citations';
  v_quality_signals := payload->'qualitySignals';
  v_proof := payload->'proof';
  IF jsonb_typeof(v_artifact_payload) <> 'object'
    OR jsonb_typeof(v_citations) <> 'array'
    OR jsonb_typeof(v_quality_signals) <> 'object'
    OR jsonb_typeof(v_proof) <> 'object'
    OR v_artifact_payload - ARRAY[
      'schemaVersion', 'output', 'publicationProof'
    ]::TEXT[] <> '{}'::JSONB
    OR NOT v_artifact_payload ?& ARRAY[
      'schemaVersion', 'output', 'publicationProof'
    ]::TEXT[]
    OR v_artifact_payload->>'schemaVersion'
      <> 'reader_summary.weekly_persisted_artifact.v1'
    OR jsonb_typeof(v_artifact_payload->'output') <> 'object'
    OR ((v_artifact_payload->'output') - ARRAY[
      'schemaVersion', 'sealId', 'sealSha', 'weekStartedOn', 'weekEndedOn',
      'headline', 'headlineCitationIds', 'takeaway', 'takeawayCitationIds',
      'synthesis', 'synthesisCitationIds', 'stories', 'sections'
    ]::TEXT[]) <> '{}'::JSONB
    OR NOT ((v_artifact_payload->'output') ?& ARRAY[
      'schemaVersion', 'sealId', 'sealSha', 'weekStartedOn', 'weekEndedOn',
      'headline', 'headlineCitationIds', 'takeaway', 'takeawayCitationIds',
      'synthesis', 'synthesisCitationIds', 'stories', 'sections'
    ]::TEXT[])
    OR jsonb_typeof(v_artifact_payload->'output'->'headlineCitationIds')
      <> 'array'
    OR jsonb_typeof(v_artifact_payload->'output'->'takeawayCitationIds')
      <> 'array'
    OR jsonb_typeof(v_artifact_payload->'output'->'synthesisCitationIds')
      <> 'array'
    OR jsonb_typeof(v_artifact_payload->'output'->'stories') <> 'array'
    OR jsonb_typeof(v_artifact_payload->'output'->'sections') <> 'array'
    OR v_quality_signals - ARRAY[
      'kind', 'editorialQuality', 'weeklyPublicationProof'
    ]::TEXT[] <> '{}'::JSONB
    OR NOT v_quality_signals ?& ARRAY[
      'kind', 'editorialQuality', 'weeklyPublicationProof'
    ]::TEXT[]
    OR v_quality_signals->>'kind' <> 'weekly'
    OR jsonb_typeof(v_quality_signals->'editorialQuality') <> 'object'
    OR ((v_quality_signals->'editorialQuality') - ARRAY[
      'policyVersion', 'publicationDecision', 'metrics', 'qualityGates',
      'issues', 'blockingPassed'
    ]::TEXT[]) <> '{}'::JSONB
    OR NOT ((v_quality_signals->'editorialQuality') ?& ARRAY[
      'policyVersion', 'publicationDecision', 'metrics', 'qualityGates',
      'issues', 'blockingPassed'
    ]::TEXT[])
    OR v_quality_signals->'editorialQuality'->>'policyVersion'
      IS DISTINCT FROM 'reader_summary.weekly_editorial_quality.v2'
    OR v_quality_signals->'editorialQuality'->>'publicationDecision'
      IS DISTINCT FROM 'allow'
    OR v_quality_signals->'editorialQuality'->'blockingPassed'
      IS DISTINCT FROM 'true'::JSONB
    OR jsonb_typeof(v_quality_signals->'editorialQuality'->'metrics')
      <> 'object'
    OR jsonb_typeof(v_quality_signals->'editorialQuality'->'qualityGates')
      <> 'object'
    OR jsonb_typeof(v_quality_signals->'editorialQuality'->'issues')
      <> 'array'
    OR v_proof - ARRAY[
      'schemaVersion', 'artifactId', 'tenantId', 'workspaceId', 'scope',
      'weekStartedOn', 'weekEndedOn', 'manifestSealId',
      'manifestSealSha256', 'modelInputSealId', 'modelInputSealSha256',
      'artifactSha256', 'editorialQualitySha256', 'authorities',
      'citations', 'authorizationId', 'sha256'
    ]::TEXT[] <> '{}'::JSONB
    OR NOT v_proof ?& ARRAY[
      'schemaVersion', 'artifactId', 'tenantId', 'workspaceId', 'scope',
      'weekStartedOn', 'weekEndedOn', 'manifestSealId',
      'manifestSealSha256', 'modelInputSealId', 'modelInputSealSha256',
      'artifactSha256', 'editorialQualitySha256', 'authorities',
      'citations', 'authorizationId', 'sha256'
    ]::TEXT[]
    OR jsonb_typeof(v_proof->'authorities') <> 'array'
    OR jsonb_array_length(v_proof->'authorities') <> 7
    OR jsonb_typeof(v_proof->'citations') <> 'array'
  THEN
    RAISE EXCEPTION 'weekly artifact or proof shape is invalid';
  END IF;

  v_seal_id := payload->>'sealId';
  v_seal_sha256 := payload->>'sealSha256';
  v_artifact_payload_sha256 := payload->>'artifactPayloadSha256';
  v_proof_sha256 := v_proof->>'sha256';
  v_proof_body := v_proof - ARRAY['authorizationId', 'sha256'];
  IF btrim(COALESCE(payload->>'headline', '')) = ''
    OR btrim(COALESCE(payload->>'summaryText', '')) = ''
    OR btrim(COALESCE(payload->>'modelVersion', '')) = ''
    OR btrim(COALESCE(payload->>'promptVersion', '')) = ''
    OR COALESCE(v_seal_sha256, '') !~ '^[0-9a-f]{64}$'
    OR v_seal_id IS DISTINCT FROM
      'reader_summary.weekly_model_input.v1:' || v_seal_sha256
    OR COALESCE(v_artifact_payload_sha256, '') !~ '^[0-9a-f]{64}$'
    OR v_artifact_payload_sha256 IS DISTINCT FROM encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_artifact_payload), 'UTF8'
    )), 'hex')
    OR COALESCE(v_proof_sha256, '') !~ '^[0-9a-f]{64}$'
    OR v_proof_sha256 IS DISTINCT FROM encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_proof_body), 'UTF8'
    )), 'hex')
    OR v_proof->>'authorizationId' IS DISTINCT FROM
      'reader_summary.weekly_publication_authorization.v1:' || v_proof_sha256
    OR v_proof->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.weekly_publication_proof.v1'
    OR v_proof->>'artifactId' IS DISTINCT FROM v_artifact_id::TEXT
    OR v_proof->>'tenantId' IS DISTINCT FROM v_tenant_id::TEXT
    OR v_proof->>'workspaceId' IS DISTINCT FROM v_workspace_id::TEXT
    OR v_proof->>'weekStartedOn' IS DISTINCT FROM payload->>'weekStartedOn'
    OR v_proof->>'weekEndedOn' IS DISTINCT FROM payload->>'weekEndedOn'
    OR v_proof->>'modelInputSealId' IS DISTINCT FROM v_seal_id
    OR v_proof->>'modelInputSealSha256' IS DISTINCT FROM v_seal_sha256
    OR v_artifact_payload->'output'->>'sealId' IS DISTINCT FROM v_seal_id
    OR v_artifact_payload->'output'->>'sealSha' IS DISTINCT FROM v_seal_sha256
    OR v_artifact_payload->'output'->>'weekStartedOn'
      IS DISTINCT FROM payload->>'weekStartedOn'
    OR v_artifact_payload->'output'->>'weekEndedOn'
      IS DISTINCT FROM payload->>'weekEndedOn'
    OR v_artifact_payload->'publicationProof' IS DISTINCT FROM v_proof
    OR v_quality_signals->'weeklyPublicationProof' IS DISTINCT FROM v_proof
    OR v_citations IS DISTINCT FROM v_proof->'citations'
    OR v_proof->>'artifactSha256' IS DISTINCT FROM encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_artifact_payload->'output'),
      'UTF8'
    )), 'hex')
    OR v_proof->>'editorialQualitySha256' IS DISTINCT FROM encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(
        v_quality_signals->'editorialQuality'
      ), 'UTF8'
    )), 'hex')
    OR v_artifact_payload->'output'->>'headline'
      IS DISTINCT FROM payload->>'headline'
    OR v_artifact_payload->'output'->>'synthesis'
      IS DISTINCT FROM payload->>'summaryText'
    OR v_artifact_payload->'output'->>'schemaVersion'
      IS DISTINCT FROM payload->>'modelVersion'
  THEN
    RAISE EXCEPTION 'weekly artifact immutable proof binding is invalid';
  END IF;

  IF (v_scope_type = 'workspace'
      AND v_proof->'scope' IS DISTINCT FROM
        jsonb_build_object('type', 'workspace'))
    OR (v_scope_type = 'interest'
      AND v_proof->'scope' IS DISTINCT FROM jsonb_build_object(
        'type', 'interest', 'interestId', v_interest_id::TEXT
      ))
  THEN
    RAISE EXCEPTION 'weekly artifact proof scope diverged';
  END IF;

  SELECT seal."seal_id", btrim(seal."seal_sha256"), seal."days"
  INTO v_manifest_seal_id, v_manifest_seal_sha256, v_seal_days
  FROM "reader_summary_weekly_certification_seals" AS seal
  WHERE seal."tenant_id" = v_tenant_id
    AND seal."workspace_id" = v_workspace_id
    AND seal."scope_type" = v_scope_type
    AND seal."scope_key" = v_scope_key
    AND seal."week_started_on" = v_week_started_on
    AND seal."week_ended_on" = v_week_ended_on;

  IF NOT FOUND
    OR jsonb_typeof(v_seal_days) <> 'array'
    OR jsonb_array_length(v_seal_days) <> 7
    OR payload->>'manifestSealId' IS DISTINCT FROM v_manifest_seal_id
    OR payload->>'manifestSealSha256' IS DISTINCT FROM v_manifest_seal_sha256
    OR v_proof->>'manifestSealId' IS DISTINCT FROM v_manifest_seal_id
    OR v_proof->>'manifestSealSha256' IS DISTINCT FROM v_manifest_seal_sha256
  THEN
    RAISE EXCEPTION
      'weekly artifact persistence requires the immutable database certification seal';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'requestedUtcDate', seal_day.value->>'requestedUtcDate',
      'publicationId', evidence."publication_id"::TEXT,
      'publicationEvidenceIdentity', evidence."identity",
      'publicationEvidenceSha256', btrim(evidence."canonical_sha256"),
      'storyAuthorityIdentity',
        'reader_summary.weekly_story_authority.v1:' || story.sha256,
      'storyAuthoritySha256', story.sha256,
      'githubBoardIdentity',
        'reader_summary.weekly_publication_github_evidence.v1:'
          || github.sha256,
      'githubBoardSha256', github.sha256
    )
    ORDER BY seal_day.position
  )
  INTO v_expected_authorities
  FROM jsonb_array_elements(v_seal_days)
    WITH ORDINALITY AS seal_day(value, position)
  JOIN "reader_summary_weekly_publication_evidence" AS evidence
    ON evidence."publication_id"::TEXT
      IS NOT DISTINCT FROM seal_day.value->>'publicationId'
    AND evidence."tenant_id" = v_tenant_id
    AND evidence."workspace_id" = v_workspace_id
    AND evidence."scope_type" = v_scope_type
    AND evidence."scope_key" = v_scope_key
    AND evidence."requested_utc_date"::TEXT
      IS NOT DISTINCT FROM seal_day.value->>'requestedUtcDate'
    AND evidence."identity"
      IS NOT DISTINCT FROM seal_day.value->>'publicationEvidenceIdentity'
    AND btrim(evidence."canonical_sha256")
      IS NOT DISTINCT FROM seal_day.value->>'publicationEvidenceSha256'
  CROSS JOIN LATERAL (
    SELECT evidence."github_evidence"->>'sha256' AS sha256
  ) AS github
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      provider.value - ARRAY['title', 'sourceText']::TEXT[]
      ORDER BY
        CASE provider.value->>'providerKey'
          WHEN 'github-trending-page' THEN 1
          WHEN 'hacker-news' THEN 2
          WHEN 'reddit' THEN 3
          WHEN 'rss' THEN 4
          WHEN 'x-twitter' THEN 5
          ELSE 6
        END,
        provider.value->>'sourceItemId',
        provider.value->>'citationId'
    ), '[]'::JSONB) AS value
    FROM jsonb_array_elements(evidence."provider_evidence") AS provider(value)
  ) AS story_evidence
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object(
      'schemaVersion', 'reader_summary.weekly_story_authority.v1',
      'tenantId', evidence."tenant_id"::TEXT,
      'workspaceId', evidence."workspace_id"::TEXT,
      'scope', evidence."canonical_record"->'scope',
      'requestedUtcDate', evidence."requested_utc_date"::TEXT,
      'publicationId', evidence."publication_id"::TEXT,
      'artifactId', evidence."reader_summary_artifact_id"::TEXT,
      'jobId', evidence."reader_summary_job_id"::TEXT,
      'reportId', evidence."report_id",
      'proofId', evidence."proof_id",
      'publicationEvidenceIdentity', evidence."identity",
      'publicationEvidenceSha256', btrim(evidence."canonical_sha256"),
      'reportSha256', btrim(evidence."report_sha256"),
      'proofSha256', btrim(evidence."proof_sha256"),
      'artifactPayloadSha256', btrim(evidence."artifact_payload_sha256"),
      'providerEvidenceSha256', btrim(evidence."provider_evidence_sha256"),
      'githubEvidenceSha256', github.sha256,
      'semanticStatus', evidence."semantic_status"::TEXT,
      'publishedAt', evidence."canonical_record"->>'publishedAt',
      'evidence', story_evidence.value
    ) AS value
  ) AS story_body
  CROSS JOIN LATERAL (
    SELECT encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(story_body.value), 'UTF8'
    )), 'hex') AS sha256
  ) AS story
  WHERE jsonb_typeof(evidence."provider_evidence") = 'array'
    AND jsonb_typeof(evidence."github_evidence") = 'object'
    AND COALESCE(github.sha256, '') ~ '^[0-9a-f]{64}$'
    AND github.sha256 IS NOT DISTINCT FROM encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(
        evidence."github_evidence" - 'sha256'
      ), 'UTF8'
    )), 'hex');

  IF v_expected_authorities IS DISTINCT FROM v_proof->'authorities'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_proof->'citations') AS citation(value)
      WHERE NOT citation.value ?& ARRAY[
          'citationId', 'requestedUtcDate', 'publicationId',
          'publicationEvidenceIdentity', 'providerKey', 'feedItemId',
          'sourceItemId', 'sourceBindingId', 'providerItemId', 'canonicalUrl',
          'sourceContentHash'
        ]::TEXT[]
        OR citation.value - ARRAY[
          'citationId', 'requestedUtcDate', 'publicationId',
          'publicationEvidenceIdentity', 'providerKey', 'feedItemId',
          'sourceItemId', 'sourceBindingId', 'providerItemId', 'canonicalUrl',
          'sourceContentHash'
        ]::TEXT[] <> '{}'::JSONB
        OR COALESCE(
          citation.value->>'sourceContentHash', ''
        ) !~ '^[0-9a-f]{64}$'
        OR btrim(COALESCE(citation.value->>'citationId', '')) = ''
        OR btrim(COALESCE(citation.value->>'providerKey', '')) = ''
        OR btrim(COALESCE(citation.value->>'feedItemId', '')) = ''
        OR btrim(COALESCE(citation.value->>'sourceItemId', '')) = ''
        OR btrim(COALESCE(citation.value->>'sourceBindingId', '')) = ''
        OR btrim(COALESCE(citation.value->>'providerItemId', '')) = ''
        OR btrim(COALESCE(citation.value->>'canonicalUrl', '')) = ''
        OR NOT EXISTS (
          SELECT 1
          FROM "reader_summary_weekly_publication_evidence" AS evidence
          CROSS JOIN LATERAL jsonb_array_elements(
            evidence."provider_evidence"
          ) AS provider(value)
          WHERE evidence."tenant_id" = v_tenant_id
            AND evidence."workspace_id" = v_workspace_id
            AND evidence."scope_type" = v_scope_type
            AND evidence."scope_key" = v_scope_key
            AND evidence."requested_utc_date"::TEXT
              IS NOT DISTINCT FROM citation.value->>'requestedUtcDate'
            AND evidence."publication_id"::TEXT
              IS NOT DISTINCT FROM citation.value->>'publicationId'
            AND evidence."identity"
              IS NOT DISTINCT FROM
                citation.value->>'publicationEvidenceIdentity'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements(v_expected_authorities)
                AS authority(value)
              WHERE authority.value->>'requestedUtcDate'
                  IS NOT DISTINCT FROM citation.value->>'requestedUtcDate'
                AND authority.value->>'publicationId'
                  IS NOT DISTINCT FROM citation.value->>'publicationId'
                AND authority.value->>'publicationEvidenceIdentity'
                  IS NOT DISTINCT FROM
                    citation.value->>'publicationEvidenceIdentity'
            )
            AND citation.value IS NOT DISTINCT FROM jsonb_build_object(
              'citationId', provider.value->>'citationId',
              'requestedUtcDate', evidence."requested_utc_date"::TEXT,
              'publicationId', evidence."publication_id"::TEXT,
              'publicationEvidenceIdentity', evidence."identity",
              'providerKey', provider.value->>'providerKey',
              'feedItemId', provider.value->>'feedItemId',
              'sourceItemId', provider.value->>'sourceItemId',
              'sourceBindingId', provider.value->>'sourceBindingId',
              'providerItemId', provider.value->>'providerItemId',
              'canonicalUrl', provider.value->>'canonicalUrl',
              'sourceContentHash', provider.value->>'sourceContentHash'
            )
        )
    )
  THEN
    RAISE EXCEPTION
      'weekly artifact persistence requires the immutable database certification seal';
  END IF;

  SELECT slot.*
  INTO v_slot
  FROM "reader_summary_publication_slots" AS slot
  WHERE slot."tenant_id" = v_tenant_id
    AND slot."workspace_id" = v_workspace_id
    AND slot."scope_type" = v_scope_type
    AND slot."scope_key" = v_scope_key
    AND slot."cadence" = 'weekly'
    AND slot."period_started_at" = v_period_started_at
    AND slot."period_ended_at" = v_period_ended_at
    AND slot."period_timezone" = 'UTC'
  FOR UPDATE;
  v_slot_found := FOUND;
  IF NOT v_slot_found THEN
    RAISE EXCEPTION
      'weekly artifact persistence requires a precreated canonical slot';
  END IF;

  SELECT count(*)::INTEGER
  INTO STRICT v_artifact_count
  FROM "reader_summary_artifacts" AS artifact
  WHERE artifact."tenant_id" = v_tenant_id
    AND artifact."workspace_id" = v_workspace_id
    AND artifact."scope_type" = v_scope_type
    AND artifact."scope_key" = v_scope_key
    AND artifact."cadence" = 'weekly'
    AND artifact."period_started_at" = v_period_started_at
    AND artifact."period_ended_at" = v_period_ended_at
    AND artifact."period_timezone" = 'UTC';

  SELECT artifact.*
  INTO v_artifact
  FROM "reader_summary_artifacts" AS artifact
  WHERE artifact."tenant_id" = v_tenant_id
    AND artifact."workspace_id" = v_workspace_id
    AND artifact."id" = v_artifact_id;
  v_artifact_found := FOUND;

  v_artifact_exact := v_artifact_found
    AND v_artifact_count = 1
    AND v_artifact."scope_type" = v_scope_type
    AND v_artifact."scope_key" = v_scope_key
    AND v_artifact."interest_id" IS NOT DISTINCT FROM v_interest_id
    AND v_artifact."cadence" = 'weekly'
    AND v_artifact."period_started_at" = v_period_started_at
    AND v_artifact."period_ended_at" = v_period_ended_at
    AND v_artifact."period_timezone" = 'UTC'
    AND v_artifact."period_key" = payload->>'periodKey'
    AND v_artifact."user_id" IS NULL
    AND v_artifact."subscription_id" IS NULL
    AND v_artifact."schema_version" = 1
    AND v_artifact."model_version" = payload->>'modelVersion'
    AND v_artifact."prompt_version" = payload->>'promptVersion'
    AND v_artifact."headline" = payload->>'headline'
    AND v_artifact."summary_text" = payload->>'summaryText'
    AND v_artifact."artifact_payload" = v_artifact_payload
    AND v_artifact."citations" = v_citations
    AND v_artifact."quality_signals" = v_quality_signals;

  SELECT count(*)::INTEGER
  INTO STRICT v_publication_count
  FROM "reader_summary_publications" AS publication
  WHERE publication."tenant_id" = v_tenant_id
    AND publication."workspace_id" = v_workspace_id
    AND publication."scope_type" = v_scope_type
    AND publication."scope_key" = v_scope_key
    AND publication."cadence" = 'weekly'
    AND publication."period_started_at" = v_period_started_at
    AND publication."period_ended_at" = v_period_ended_at
    AND publication."period_timezone" = 'UTC';

  SELECT publication.*
  INTO v_publication
  FROM "reader_summary_publications" AS publication
  WHERE publication."reader_summary_artifact_id" = v_artifact_id;
  v_publication_found := FOUND;

  v_publication_exact := v_publication_found
    AND v_publication_count = 1
    AND v_publication."id" = v_artifact_id
    AND v_publication."tenant_id" = v_tenant_id
    AND v_publication."workspace_id" = v_workspace_id
    AND v_publication."scope_type" = v_scope_type
    AND v_publication."scope_key" = v_scope_key
    AND v_publication."cadence" = 'weekly'
    AND v_publication."period_started_at" = v_period_started_at
    AND v_publication."period_ended_at" = v_period_ended_at
    AND v_publication."period_timezone" = 'UTC'
    AND v_publication."period_key" = payload->>'periodKey'
    AND v_publication."requested_utc_date" = v_week_started_on
    AND v_publication."publication_kind" = 'WEEKLY_CERTIFIED'
    AND v_publication."reader_summary_job_id" IS NULL
    AND v_publication."semantic_status" = 'COMPLETED'
    AND v_publication."model_version" = payload->>'modelVersion'
    AND v_publication."model_authority" =
      "reader_summary_model_authority_rank"(payload->>'modelVersion')
    AND btrim(v_publication."report_sha256") = v_artifact_payload_sha256
    AND btrim(v_publication."proof_sha256") = v_proof_sha256
    AND v_publication."exact_proof" = v_proof
    AND v_publication."outbox_event_id" IS NULL
    AND v_publication."requested_at" = v_publication."published_at";

  IF v_artifact_exact
    AND v_artifact."status" = 'COMPLETED'
    AND v_publication_exact
    AND v_slot_found
    AND v_slot."current_publication_id" = v_publication."id"
    AND v_artifact."updated_at" = v_publication."published_at"
    AND v_slot."updated_at" = v_publication."published_at"
  THEN
    RETURN QUERY SELECT
      'replayed'::TEXT, v_artifact_id,
      v_artifact_payload_sha256, v_proof_sha256;
    RETURN;
  END IF;

  IF v_artifact_count <> 0
    OR v_publication_count <> 0
    OR v_artifact_found
    OR v_publication_found
  THEN
    IF NOT (
      v_artifact_exact
      AND v_artifact."status" = 'RUNNING'
      AND v_publication_count = 0
      AND NOT v_publication_found
      AND v_slot."current_publication_id" IS NULL
    ) THEN
      RAISE EXCEPTION
        'weekly artifact persistence replay diverged from immutable sealId or sealSha or publication state';
    END IF;

    PERFORM artifact."id"
    FROM "reader_summary_artifacts" AS artifact
    WHERE artifact."id" = v_artifact_id
      AND artifact."tenant_id" = v_tenant_id
      AND artifact."workspace_id" = v_workspace_id
      AND artifact."status" = 'RUNNING'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'weekly legacy candidate lock was lost';
    END IF;

  ELSIF v_slot."current_publication_id" IS NOT NULL THEN
    RAISE EXCEPTION
      'weekly artifact persistence replay diverged from immutable sealId or sealSha or publication state';
  END IF;

  v_now := transaction_timestamp();
  IF v_artifact_count = 0 THEN
    INSERT INTO "reader_summary_artifacts" (
      "id", "tenant_id", "workspace_id", "scope_type", "scope_key",
      "interest_id", "cadence", "period_started_at", "period_ended_at",
      "period_timezone", "period_key", "user_id", "subscription_id",
      "status", "schema_version", "model_version", "prompt_version",
      "headline", "summary_text", "artifact_payload", "citations",
      "quality_signals", "created_at", "updated_at"
    ) VALUES (
      v_artifact_id, v_tenant_id, v_workspace_id, v_scope_type, v_scope_key,
      v_interest_id, 'weekly', v_period_started_at, v_period_ended_at,
      'UTC', payload->>'periodKey', NULL, NULL, 'COMPLETED', 1,
      payload->>'modelVersion', payload->>'promptVersion',
      payload->>'headline', payload->>'summaryText', v_artifact_payload,
      v_citations, v_quality_signals, v_now, v_now
    );
  ELSE
    UPDATE "reader_summary_artifacts"
    SET "status" = 'COMPLETED', "updated_at" = v_now
    WHERE "id" = v_artifact_id
      AND "tenant_id" = v_tenant_id
      AND "workspace_id" = v_workspace_id
      AND "status" = 'RUNNING';
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'weekly legacy candidate adoption lost authority';
    END IF;
  END IF;

  INSERT INTO "reader_summary_publications" (
    "id", "tenant_id", "workspace_id", "scope_type", "scope_key",
    "cadence", "period_started_at", "period_ended_at", "period_timezone",
    "period_key", "requested_utc_date", "publication_kind",
    "reader_summary_job_id", "reader_summary_artifact_id", "semantic_status",
    "requested_at", "model_version", "model_authority", "report_sha256",
    "proof_sha256", "exact_proof", "outbox_event_id", "published_at"
  ) VALUES (
    v_artifact_id, v_tenant_id, v_workspace_id, v_scope_type, v_scope_key,
    'weekly', v_period_started_at, v_period_ended_at, 'UTC',
    payload->>'periodKey', v_week_started_on, 'WEEKLY_CERTIFIED',
    NULL, v_artifact_id, 'COMPLETED', v_now, payload->>'modelVersion',
    "reader_summary_model_authority_rank"(payload->>'modelVersion'),
    v_artifact_payload_sha256, v_proof_sha256, v_proof, NULL, v_now
  );

  UPDATE "reader_summary_publication_slots"
  SET "current_publication_id" = v_artifact_id, "updated_at" = v_now
  WHERE "tenant_id" = v_tenant_id
    AND "workspace_id" = v_workspace_id
    AND "scope_type" = v_scope_type
    AND "scope_key" = v_scope_key
    AND "cadence" = 'weekly'
    AND "period_started_at" = v_period_started_at
    AND "period_ended_at" = v_period_ended_at
    AND "period_timezone" = 'UTC'
    AND "current_publication_id" IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'weekly publication slot adoption lost authority';
  END IF;

  RETURN QUERY SELECT
    'persisted'::TEXT, v_artifact_id,
    v_artifact_payload_sha256, v_proof_sha256;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  "guard_reader_summary_publication_insert"(),
  "persist_reader_summary_weekly_artifact"(JSONB)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

DO $verify_weekly_runtime_execute$
DECLARE
  v_function_oid OID;
  v_runtime_name NAME;
  v_runtime_oid OID;
  v_unexpected_execute_count INTEGER;
BEGIN
  SELECT member.oid, member.rolname
  INTO STRICT v_runtime_oid, v_runtime_name
  FROM pg_auth_members AS membership
  JOIN pg_roles AS granted ON granted.oid = membership.roleid
  JOIN pg_roles AS member ON member.oid = membership.member
  WHERE granted.rolname = 'social_monitor_reader_summary_publication_runtime'
    AND NOT membership.admin_option
    AND membership.inherit_option
    AND NOT membership.set_option;

  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON FUNCTION public.persist_reader_summary_weekly_artifact(JSONB) FROM %I',
    v_runtime_name
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.persist_reader_summary_weekly_artifact(JSONB) TO %I',
    v_runtime_name
  );

  SELECT routine.oid
  INTO STRICT v_function_oid
  FROM pg_proc AS routine
  WHERE routine.oid =
    'public.persist_reader_summary_weekly_artifact(JSONB)'::regprocedure;

  SELECT count(*)::INTEGER
  INTO STRICT v_unexpected_execute_count
  FROM pg_proc AS routine
  CROSS JOIN LATERAL aclexplode(COALESCE(
    routine.proacl,
    acldefault('f', routine.proowner)
  )) AS privilege
  WHERE routine.oid = v_function_oid
    AND privilege.privilege_type = 'EXECUTE'
    AND privilege.grantee NOT IN (routine.proowner, v_runtime_oid);

  IF v_unexpected_execute_count <> 0
    OR NOT EXISTS (
      SELECT 1
      FROM pg_proc AS routine
      CROSS JOIN LATERAL aclexplode(COALESCE(
        routine.proacl,
        acldefault('f', routine.proowner)
      )) AS privilege
      WHERE routine.oid = v_function_oid
        AND privilege.privilege_type = 'EXECUTE'
        AND privilege.grantee = v_runtime_oid
    )
    OR NOT has_function_privilege(
      v_runtime_oid,
      v_function_oid,
      'EXECUTE'
    )
  THEN
    RAISE EXCEPTION 'weekly atomic runtime execute ACL is not exact';
  END IF;
END
$verify_weekly_runtime_execute$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";

RESET ROLE;
COMMIT;
