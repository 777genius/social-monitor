-- @social-monitor-forward-migration
-- Immutable, seal-bound weekly review manifests. This authority is separate
-- from weekly publication output and accepts only an exact sealed replay.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";

GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE TABLE "reader_summary_weekly_review_manifests" (
  "manifest_id" TEXT NOT NULL,
  "manifest_sha256" CHAR(64) NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "scope_type" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "week_started_on" DATE NOT NULL,
  "week_ended_on" DATE NOT NULL,
  "seal_id" TEXT NOT NULL,
  "seal_sha256" CHAR(64) NOT NULL,
  "review_authority" JSONB NOT NULL,
  "review_authority_sha256" CHAR(64) NOT NULL,
  "observations" JSONB NOT NULL,
  "citations" JSONB NOT NULL,
  "model_response_sha256" CHAR(64) NOT NULL,
  "execution_attestation" JSONB NOT NULL,
  "execution_attestation_sha256" CHAR(64) NOT NULL,
  "canonical_record" JSONB NOT NULL,
  "canonical_bytes" BYTEA NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reader_summary_weekly_review_manifests_pkey"
    PRIMARY KEY ("manifest_id"),
  CONSTRAINT "reader_summary_weekly_review_manifests_sha_key"
    UNIQUE ("manifest_sha256"),
  CONSTRAINT "reader_summary_weekly_review_manifests_seal_key"
    UNIQUE ("seal_id"),
  CONSTRAINT "reader_summary_weekly_review_manifests_scope_week_key"
    UNIQUE (
      "tenant_id",
      "workspace_id",
      "scope_type",
      "scope_key",
      "week_started_on"
    ),
  CONSTRAINT "reader_summary_weekly_review_manifests_seal_fkey"
    FOREIGN KEY ("seal_id")
    REFERENCES "reader_summary_weekly_certification_seals" ("seal_id")
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT "reader_summary_weekly_review_manifests_scope_check"
    CHECK (
      ("scope_type" = 'workspace' AND "scope_key" = 'workspace')
      OR (
        "scope_type" = 'interest'
        AND "scope_key" ~
          '^interest:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    ),
  CONSTRAINT "reader_summary_weekly_review_manifests_window_check"
    CHECK (
      extract(isodow FROM "week_started_on") = 1
      AND "week_ended_on" = "week_started_on" + 6
    ),
  CONSTRAINT "reader_summary_weekly_review_manifests_json_check"
    CHECK (
      jsonb_typeof("review_authority") = 'object'
      AND jsonb_typeof("observations") = 'array'
      AND jsonb_typeof("citations") = 'array'
      AND jsonb_typeof("execution_attestation") = 'object'
    ),
  CONSTRAINT "reader_summary_weekly_review_manifests_digest_check"
    CHECK (
      btrim("manifest_sha256") ~ '^[0-9a-f]{64}$'
      AND btrim("seal_sha256") ~ '^[0-9a-f]{64}$'
      AND btrim("review_authority_sha256") ~ '^[0-9a-f]{64}$'
      AND btrim("model_response_sha256") ~ '^[0-9a-f]{64}$'
      AND btrim("execution_attestation_sha256") ~ '^[0-9a-f]{64}$'
      AND "manifest_id" =
        'reader_summary.weekly_review_manifest.v1:' || btrim("manifest_sha256")
      AND btrim("manifest_sha256") = encode(sha256("canonical_bytes"), 'hex')
      AND "canonical_record"->>'schemaVersion' =
        'reader_summary.weekly_review_manifest.v1'
      AND "canonical_record"->>'manifestId' = "manifest_id"
      AND "canonical_record"->>'manifestSha256' = btrim("manifest_sha256")
      AND "canonical_record"->>'tenantId' = "tenant_id"::TEXT
      AND "canonical_record"->>'workspaceId' = "workspace_id"::TEXT
      AND "canonical_record"->>'scopeKey' = "scope_key"
      AND "canonical_record"->>'weekStartedOn' =
        to_char("week_started_on", 'YYYY-MM-DD')
      AND "canonical_record"->>'weekEndedOn' =
        to_char("week_ended_on", 'YYYY-MM-DD')
      AND "canonical_record"->>'sealId' = "seal_id"
      AND "canonical_record"->>'sealSha256' = btrim("seal_sha256")
      AND "canonical_record"->'reviewAuthority' = "review_authority"
      AND "canonical_record"->>'reviewAuthoritySha256' =
        btrim("review_authority_sha256")
      AND "canonical_record"->'observations' = "observations"
      AND "canonical_record"->'citations' = "citations"
      AND "canonical_record"->>'modelResponseSha256' =
        btrim("model_response_sha256")
      AND "canonical_record"->'executionAttestation' = "execution_attestation"
      AND "canonical_record"->>'executionAttestationSha256' =
        btrim("execution_attestation_sha256")
    )
);

ALTER TABLE "reader_summary_weekly_review_manifests"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_weekly_review_manifests"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON "reader_summary_weekly_review_manifests"
  USING (public.social_monitor_rls_workspace_match("tenant_id", "workspace_id"))
  WITH CHECK (public.social_monitor_rls_workspace_match("tenant_id", "workspace_id"));

REVOKE ALL PRIVILEGES ON TABLE "reader_summary_weekly_review_manifests"
FROM PUBLIC, "pg_database_owner", "social_monitor_reader_summary_publication_runtime";

DO $grant_weekly_review_manifest_runtime_select$
DECLARE
  v_runtime_role NAME;
  v_runtime_attributes RECORD;
BEGIN
  SELECT member_row.rolname
  INTO STRICT v_runtime_role
  FROM pg_auth_members AS membership_row
  JOIN pg_roles AS granted_row ON granted_row.oid = membership_row.roleid
  JOIN pg_roles AS member_row ON member_row.oid = membership_row.member
  WHERE granted_row.rolname = 'social_monitor_reader_summary_publication_runtime'
    AND NOT membership_row.admin_option
    AND membership_row.inherit_option
    AND NOT membership_row.set_option;

  SELECT * INTO STRICT v_runtime_attributes
  FROM pg_roles WHERE rolname = v_runtime_role;
  IF NOT v_runtime_attributes.rolcanlogin
    OR v_runtime_attributes.rolsuper
    OR v_runtime_attributes.rolcreatedb
    OR v_runtime_attributes.rolcreaterole
    OR v_runtime_attributes.rolreplication
    OR v_runtime_attributes.rolbypassrls
  THEN
    RAISE EXCEPTION 'weekly review manifest concrete runtime login is unsafe';
  END IF;

  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON TABLE public.reader_summary_weekly_review_manifests FROM %I',
    v_runtime_role
  );
  EXECUTE format(
    'GRANT SELECT ON TABLE public.reader_summary_weekly_review_manifests TO %I',
    v_runtime_role
  );
END
$grant_weekly_review_manifest_runtime_select$;

CREATE FUNCTION "reject_reader_summary_weekly_review_manifest_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'reader summary weekly review manifests are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION "persist_reader_summary_weekly_review_manifest"(payload JSONB)
RETURNS TABLE (
  outcome TEXT,
  manifest_id TEXT,
  manifest_sha256 TEXT,
  seal_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attestation JSONB;
  v_attestation_bytes BYTEA;
  v_attestation_sha256 TEXT;
  v_canonical_bytes BYTEA;
  v_canonical_record JSONB;
  v_citations JSONB;
  v_citation_count INTEGER;
  v_existing "reader_summary_weekly_review_manifests"%ROWTYPE;
  v_expected_authority JSONB;
  v_expected_days JSONB;
  v_locked_daily_count INTEGER;
  v_manifest_id TEXT;
  v_manifest_sha256 TEXT;
  v_model_response_sha256 TEXT;
  v_observations JSONB;
  v_review_authority JSONB;
  v_review_authority_bytes BYTEA;
  v_review_authority_sha256 TEXT;
  v_scope JSONB;
  v_scope_key TEXT;
  v_scope_type TEXT;
  v_certification_seal "reader_summary_weekly_certification_seals"%ROWTYPE;
  v_seal_id TEXT;
  v_seal_sha256 TEXT;
  v_tenant_id UUID;
  v_week_ended_on DATE;
  v_week_started_on DATE;
  v_workspace_id UUID;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR current_setting('social_monitor.system_access', TRUE) IS DISTINCT FROM 'false'
    OR NOT pg_has_role(
      session_user,
      'social_monitor_reader_summary_publication_runtime',
      'USAGE'
    )
  THEN
    RAISE EXCEPTION
      'weekly review manifest persistence requires a writable SERIALIZABLE tenant session';
  END IF;

  IF jsonb_typeof(payload) <> 'object'
    OR NOT payload ?& ARRAY[
      'schemaVersion', 'manifestId', 'manifestSha256', 'tenantId',
      'workspaceId', 'scope', 'scopeKey', 'weekStartedOn', 'weekEndedOn',
      'sealId', 'sealSha256', 'reviewAuthority', 'reviewAuthoritySha256',
      'reviewAuthorityBytesBase64', 'observations', 'citations',
      'modelResponseSha256', 'executionAttestation',
      'executionAttestationSha256', 'executionAttestationBytesBase64',
      'canonicalRecord', 'canonicalBytesBase64'
    ]::TEXT[]
    OR payload - ARRAY[
      'schemaVersion', 'manifestId', 'manifestSha256', 'tenantId',
      'workspaceId', 'scope', 'scopeKey', 'weekStartedOn', 'weekEndedOn',
      'sealId', 'sealSha256', 'reviewAuthority', 'reviewAuthoritySha256',
      'reviewAuthorityBytesBase64', 'observations', 'citations',
      'modelResponseSha256', 'executionAttestation',
      'executionAttestationSha256', 'executionAttestationBytesBase64',
      'canonicalRecord', 'canonicalBytesBase64'
    ]::TEXT[] <> '{}'::JSONB
    OR payload->>'schemaVersion' <>
      'reader_summary.weekly_review_manifest_persistence.v1'
  THEN
    RAISE EXCEPTION 'weekly review manifest persistence payload shape is invalid';
  END IF;

  BEGIN
    v_tenant_id := (payload->>'tenantId')::UUID;
    v_workspace_id := (payload->>'workspaceId')::UUID;
    v_week_started_on := (payload->>'weekStartedOn')::DATE;
    v_week_ended_on := (payload->>'weekEndedOn')::DATE;
    v_canonical_bytes := decode(payload->>'canonicalBytesBase64', 'base64');
    v_review_authority_bytes := decode(payload->>'reviewAuthorityBytesBase64', 'base64');
    v_attestation_bytes := decode(payload->>'executionAttestationBytesBase64', 'base64');
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow OR invalid_parameter_value THEN
      RAISE EXCEPTION 'weekly review manifest persistence identity or bytes are invalid';
  END;

  IF current_setting('social_monitor.tenant_id', TRUE) IS DISTINCT FROM v_tenant_id::TEXT
    OR current_setting('social_monitor.workspace_id', TRUE) IS DISTINCT FROM v_workspace_id::TEXT
  THEN
    RAISE EXCEPTION 'weekly review manifest persistence session scope diverged';
  END IF;

  v_scope_type := payload->'scope'->>'type';
  v_scope_key := payload->>'scopeKey';
  v_scope := payload->'scope';
  IF v_scope_type NOT IN ('workspace', 'interest')
    OR btrim(COALESCE(v_scope_key, '')) <> v_scope_key
    OR v_scope_key = ''
    OR (
      v_scope_type = 'workspace'
      AND (v_scope_key <> 'workspace' OR v_scope IS DISTINCT FROM jsonb_build_object('type', 'workspace'))
    )
    OR (
      v_scope_type = 'interest'
      AND (
        v_scope_key !~
          '^interest:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR v_scope IS DISTINCT FROM jsonb_build_object(
          'type', 'interest', 'interestId', substring(v_scope_key FROM 10)
        )
      )
    )
  THEN
    RAISE EXCEPTION 'weekly review manifest persistence scope is invalid';
  END IF;

  IF extract(isodow FROM v_week_started_on) <> 1
    OR v_week_ended_on <> v_week_started_on + 6
    OR payload->>'weekStartedOn' <> to_char(v_week_started_on, 'YYYY-MM-DD')
    OR payload->>'weekEndedOn' <> to_char(v_week_ended_on, 'YYYY-MM-DD')
  THEN
    RAISE EXCEPTION 'weekly review manifest persistence window is invalid';
  END IF;

  v_manifest_id := payload->>'manifestId';
  v_manifest_sha256 := payload->>'manifestSha256';
  v_seal_id := payload->>'sealId';
  v_seal_sha256 := payload->>'sealSha256';
  v_review_authority := payload->'reviewAuthority';
  v_review_authority_sha256 := payload->>'reviewAuthoritySha256';
  v_observations := payload->'observations';
  v_citations := payload->'citations';
  v_model_response_sha256 := payload->>'modelResponseSha256';
  v_attestation := payload->'executionAttestation';
  v_attestation_sha256 := payload->>'executionAttestationSha256';
  v_canonical_record := payload->'canonicalRecord';

  IF jsonb_typeof(v_review_authority) <> 'object'
    OR jsonb_typeof(v_observations) <> 'array'
    OR jsonb_typeof(v_citations) <> 'array'
    OR jsonb_typeof(v_attestation) <> 'object'
    OR jsonb_typeof(v_canonical_record) <> 'object'
    OR COALESCE(v_manifest_sha256, '') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_seal_sha256, '') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_review_authority_sha256, '') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_model_response_sha256, '') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_attestation_sha256, '') !~ '^[0-9a-f]{64}$'
    OR v_manifest_id IS DISTINCT FROM
      'reader_summary.weekly_review_manifest.v1:' || v_manifest_sha256
    OR encode(sha256(v_canonical_bytes), 'hex') IS DISTINCT FROM v_manifest_sha256
    OR encode(sha256(v_review_authority_bytes), 'hex') IS DISTINCT FROM v_review_authority_sha256
    OR encode(sha256(v_attestation_bytes), 'hex') IS DISTINCT FROM v_attestation_sha256
    OR convert_from(v_review_authority_bytes, 'UTF8') IS DISTINCT FROM
      "reader_summary_weekly_canonical_json"(v_review_authority)
    OR convert_from(v_attestation_bytes, 'UTF8') IS DISTINCT FROM
      "reader_summary_weekly_canonical_json"(v_attestation)
    OR convert_from(v_canonical_bytes, 'UTF8') IS DISTINCT FROM
      "reader_summary_weekly_canonical_json"(
        v_canonical_record - ARRAY['manifestId', 'manifestSha256']::TEXT[]
      )
    OR v_canonical_record - ARRAY[
      'schemaVersion', 'tenantId', 'workspaceId', 'scope', 'scopeKey',
      'weekStartedOn', 'weekEndedOn', 'sealId', 'sealSha256',
      'reviewAuthority', 'reviewAuthoritySha256', 'observations', 'citations',
      'modelResponseSha256', 'executionAttestation',
      'executionAttestationSha256', 'manifestId', 'manifestSha256'
    ]::TEXT[] <> '{}'::JSONB
    OR NOT v_canonical_record ?& ARRAY[
      'schemaVersion', 'tenantId', 'workspaceId', 'scope', 'scopeKey',
      'weekStartedOn', 'weekEndedOn', 'sealId', 'sealSha256',
      'reviewAuthority', 'reviewAuthoritySha256', 'observations', 'citations',
      'modelResponseSha256', 'executionAttestation',
      'executionAttestationSha256', 'manifestId', 'manifestSha256'
    ]::TEXT[]
    OR v_canonical_record->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.weekly_review_manifest.v1'
    OR v_canonical_record->>'manifestId' IS DISTINCT FROM v_manifest_id
    OR v_canonical_record->>'manifestSha256' IS DISTINCT FROM v_manifest_sha256
    OR v_canonical_record->>'tenantId' IS DISTINCT FROM v_tenant_id::TEXT
    OR v_canonical_record->>'workspaceId' IS DISTINCT FROM v_workspace_id::TEXT
    OR v_canonical_record->'scope' IS DISTINCT FROM v_scope
    OR v_canonical_record->>'scopeKey' IS DISTINCT FROM v_scope_key
    OR v_canonical_record->>'weekStartedOn' IS DISTINCT FROM payload->>'weekStartedOn'
    OR v_canonical_record->>'weekEndedOn' IS DISTINCT FROM payload->>'weekEndedOn'
    OR v_canonical_record->>'sealId' IS DISTINCT FROM v_seal_id
    OR v_canonical_record->>'sealSha256' IS DISTINCT FROM v_seal_sha256
    OR v_canonical_record->'reviewAuthority' IS DISTINCT FROM v_review_authority
    OR v_canonical_record->>'reviewAuthoritySha256' IS DISTINCT FROM v_review_authority_sha256
    OR v_canonical_record->'observations' IS DISTINCT FROM v_observations
    OR v_canonical_record->'citations' IS DISTINCT FROM v_citations
    OR v_canonical_record->>'modelResponseSha256' IS DISTINCT FROM v_model_response_sha256
    OR v_canonical_record->'executionAttestation' IS DISTINCT FROM v_attestation
    OR v_canonical_record->>'executionAttestationSha256' IS DISTINCT FROM v_attestation_sha256
  THEN
    RAISE EXCEPTION 'weekly review manifest canonical binding is invalid';
  END IF;

  IF jsonb_array_length(v_observations) > 64 OR jsonb_array_length(v_citations) > 448 THEN
    RAISE EXCEPTION 'weekly review manifest observations or citations are not bounded';
  END IF;

  IF v_attestation - ARRAY[
      'schemaVersion', 'requestId', 'purpose', 'canonicalRequestSha256',
      'provider', 'model', 'reasoningEffort', 'runtimeEngine',
      'runtimePackageVersion', 'launcherSha256', 'selectedOutputKind',
      'selectedOutputSha256'
    ]::TEXT[] <> '{}'::JSONB
    OR NOT v_attestation ?& ARRAY[
      'schemaVersion', 'requestId', 'purpose', 'canonicalRequestSha256',
      'provider', 'model', 'reasoningEffort', 'runtimeEngine',
      'runtimePackageVersion', 'launcherSha256', 'selectedOutputKind',
      'selectedOutputSha256'
    ]::TEXT[]
    OR v_attestation->>'schemaVersion' <> '1'
    OR btrim(COALESCE(v_attestation->>'requestId', '')) = ''
    OR v_attestation->>'purpose' <> 'social_monitor.reader_summary.weekly.review'
    OR v_attestation->>'provider' <> 'codex'
    OR v_attestation->>'model' <> 'gpt-5.6-sol'
    OR v_attestation->>'reasoningEffort' <> 'xhigh'
    OR v_attestation->>'runtimeEngine' <> 'subscription-runtime-cli'
    OR COALESCE(v_attestation->>'runtimePackageVersion', '') !~
      '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
    OR COALESCE(v_attestation->>'canonicalRequestSha256', '') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_attestation->>'launcherSha256', '') !~ '^[0-9a-f]{64}$'
    OR v_attestation->>'selectedOutputKind' <> 'structured_output'
    OR v_attestation->>'selectedOutputSha256' IS DISTINCT FROM v_model_response_sha256
  THEN
    RAISE EXCEPTION 'weekly review manifest execution attestation is invalid';
  END IF;

  -- The immutable weekly seal serializes competing manifest writers.
  SELECT certification_seal.* INTO v_certification_seal
  FROM "reader_summary_weekly_certification_seals" AS certification_seal
  WHERE certification_seal."seal_id" = v_seal_id
    AND certification_seal."tenant_id" = v_tenant_id
    AND certification_seal."workspace_id" = v_workspace_id
    AND certification_seal."scope_type" = v_scope_type
    AND certification_seal."scope_key" = v_scope_key
    AND certification_seal."week_started_on" = v_week_started_on
    AND certification_seal."week_ended_on" = v_week_ended_on
    AND btrim(certification_seal."seal_sha256") = v_seal_sha256
  FOR UPDATE;
  IF NOT FOUND
    OR jsonb_typeof(v_certification_seal."days") <> 'array'
    OR jsonb_array_length(v_certification_seal."days") <> 7
  THEN
    RAISE EXCEPTION 'weekly review manifest requires the exact certification seal';
  END IF;

  PERFORM evidence_row."publication_id"
  FROM jsonb_array_elements(v_certification_seal."days") WITH ORDINALITY
    AS seal_day(value, ordinal_position)
  JOIN "reader_summary_weekly_publication_evidence" AS evidence_row
    ON evidence_row."publication_id"::TEXT IS NOT DISTINCT FROM seal_day.value->>'publicationId'
    AND evidence_row."tenant_id" = v_tenant_id
    AND evidence_row."workspace_id" = v_workspace_id
    AND evidence_row."scope_type" = v_scope_type
    AND evidence_row."scope_key" = v_scope_key
    AND evidence_row."requested_utc_date"::TEXT IS NOT DISTINCT FROM seal_day.value->>'requestedUtcDate'
    AND evidence_row."identity" IS NOT DISTINCT FROM seal_day.value->>'publicationEvidenceIdentity'
    AND btrim(evidence_row."canonical_sha256") IS NOT DISTINCT FROM seal_day.value->>'publicationEvidenceSha256'
  ORDER BY seal_day.ordinal_position
  FOR SHARE OF evidence_row;
  GET DIAGNOSTICS v_locked_daily_count = ROW_COUNT;
  IF v_locked_daily_count <> 7 THEN
    RAISE EXCEPTION 'weekly review manifest daily seal authority is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_certification_seal."days") AS seal_day(value)
    JOIN "reader_summary_weekly_publication_evidence" AS evidence_row
      ON evidence_row."publication_id"::TEXT IS NOT DISTINCT FROM seal_day.value->>'publicationId'
      AND evidence_row."tenant_id" = v_tenant_id
      AND evidence_row."workspace_id" = v_workspace_id
      AND evidence_row."scope_type" = v_scope_type
      AND evidence_row."scope_key" = v_scope_key
      AND evidence_row."requested_utc_date"::TEXT IS NOT DISTINCT FROM seal_day.value->>'requestedUtcDate'
      AND evidence_row."identity" IS NOT DISTINCT FROM seal_day.value->>'publicationEvidenceIdentity'
      AND btrim(evidence_row."canonical_sha256") IS NOT DISTINCT FROM seal_day.value->>'publicationEvidenceSha256'
    WHERE evidence_row."github_evidence"->>'mode' = 'historical_unavailable'
      AND (
        evidence_row."requested_utc_date" <> DATE '2026-07-23'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(evidence_row."provider_evidence") AS provider_item(value)
          WHERE provider_item.value->>'providerKey' = 'github-trending-page'
        )
      )
  ) THEN
    RAISE EXCEPTION 'weekly review manifest historical GitHub authority is not honest';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'requestedUtcDate', to_char(evidence_row."requested_utc_date", 'YYYY-MM-DD'),
      'publicationId', evidence_row."publication_id"::TEXT,
      'publicationEvidenceIdentity', evidence_row."identity",
      'publicationEvidenceSha256', btrim(evidence_row."canonical_sha256"),
      'providerEvidenceSha256', btrim(evidence_row."provider_evidence_sha256"),
      'githubEvidenceSha256', evidence_row."github_evidence"->>'sha256',
      'semanticStatus', evidence_row."semantic_status"::TEXT,
      'githubMode', evidence_row."github_evidence"->>'mode'
    ) ORDER BY seal_day.ordinal_position
  ) INTO v_expected_days
  FROM jsonb_array_elements(v_certification_seal."days") WITH ORDINALITY
    AS seal_day(value, ordinal_position)
  JOIN "reader_summary_weekly_publication_evidence" AS evidence_row
    ON evidence_row."publication_id"::TEXT IS NOT DISTINCT FROM seal_day.value->>'publicationId'
    AND evidence_row."tenant_id" = v_tenant_id
    AND evidence_row."workspace_id" = v_workspace_id
    AND evidence_row."scope_type" = v_scope_type
    AND evidence_row."scope_key" = v_scope_key
    AND evidence_row."requested_utc_date"::TEXT IS NOT DISTINCT FROM seal_day.value->>'requestedUtcDate'
    AND evidence_row."identity" IS NOT DISTINCT FROM seal_day.value->>'publicationEvidenceIdentity'
    AND btrim(evidence_row."canonical_sha256") IS NOT DISTINCT FROM seal_day.value->>'publicationEvidenceSha256';

  v_expected_authority := jsonb_build_object(
    'schemaVersion', 'reader_summary.weekly_review_authority.v1',
    'sealId', v_certification_seal."seal_id",
    'sealSha256', btrim(v_certification_seal."seal_sha256"),
    'tenantId', v_tenant_id::TEXT,
    'workspaceId', v_workspace_id::TEXT,
    'scope', v_scope,
    'scopeKey', v_scope_key,
    'weekStartedOn', to_char(v_week_started_on, 'YYYY-MM-DD'),
    'weekEndedOn', to_char(v_week_ended_on, 'YYYY-MM-DD'),
    'days', v_expected_days
  );
  IF v_review_authority IS DISTINCT FROM v_expected_authority THEN
    RAISE EXCEPTION 'weekly review manifest review authority diverged from sealed days';
  END IF;

  IF jsonb_array_length(v_citations) = 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_certification_seal."days") AS seal_day(value)
      JOIN "reader_summary_weekly_publication_evidence" AS evidence_row
        ON evidence_row."publication_id"::TEXT IS NOT DISTINCT FROM seal_day.value->>'publicationId'
        AND evidence_row."tenant_id" = v_tenant_id
        AND evidence_row."workspace_id" = v_workspace_id
        AND evidence_row."scope_type" = v_scope_type
        AND evidence_row."scope_key" = v_scope_key
      WHERE evidence_row."semantic_status" = 'COMPLETED'
        AND jsonb_array_length(evidence_row."provider_evidence") > 0
    )
  THEN
    RAISE EXCEPTION 'weekly review manifest is missing sealed evidence';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_citations) AS citation_row(value)
    WHERE jsonb_typeof(citation_row.value) <> 'object'
      OR citation_row.value - ARRAY[
        'selector', 'storyId', 'requestedUtcDate', 'publicationId',
        'publicationEvidenceIdentity', 'publicationEvidenceSha256',
        'providerKey', 'citationId', 'sourceItemId', 'sourceContentHash'
      ]::TEXT[] <> '{}'::JSONB
      OR NOT citation_row.value ?& ARRAY[
        'selector', 'storyId', 'requestedUtcDate', 'publicationId',
        'publicationEvidenceIdentity', 'publicationEvidenceSha256',
        'providerKey', 'citationId', 'sourceItemId', 'sourceContentHash'
      ]::TEXT[]
      OR COALESCE(citation_row.value->>'selector', '') !~ '^citation:[0-9a-f]{64}$'
      OR COALESCE(citation_row.value->>'storyId', '') !~
        '^reader_summary[.]weekly_story_identity[.]v1:[0-9a-f]{64}$'
      OR COALESCE(citation_row.value->>'requestedUtcDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
      OR COALESCE(citation_row.value->>'publicationEvidenceSha256', '') !~ '^[0-9a-f]{64}$'
      OR COALESCE(citation_row.value->>'sourceContentHash', '') !~ '^[0-9a-f]{64}$'
      OR NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_certification_seal."days") AS seal_day(value)
        JOIN "reader_summary_weekly_publication_evidence" AS evidence_row
          ON evidence_row."publication_id"::TEXT IS NOT DISTINCT FROM seal_day.value->>'publicationId'
          AND evidence_row."tenant_id" = v_tenant_id
          AND evidence_row."workspace_id" = v_workspace_id
          AND evidence_row."scope_type" = v_scope_type
          AND evidence_row."scope_key" = v_scope_key
          AND evidence_row."requested_utc_date"::TEXT IS NOT DISTINCT FROM citation_row.value->>'requestedUtcDate'
          AND evidence_row."publication_id"::TEXT IS NOT DISTINCT FROM citation_row.value->>'publicationId'
          AND evidence_row."identity" IS NOT DISTINCT FROM citation_row.value->>'publicationEvidenceIdentity'
          AND btrim(evidence_row."canonical_sha256") IS NOT DISTINCT FROM citation_row.value->>'publicationEvidenceSha256'
        CROSS JOIN LATERAL jsonb_array_elements(evidence_row."provider_evidence") AS provider_item(value)
        CROSS JOIN LATERAL (
          SELECT encode(sha256(convert_to(
            "reader_summary_weekly_canonical_json"(
              jsonb_build_object('canonicalUrl', provider_item.value->>'canonicalUrl')
            ), 'UTF8'
          )), 'hex') AS url_sha
        ) AS url_hash
        CROSS JOIN LATERAL (
          SELECT encode(sha256(convert_to(
            "reader_summary_weekly_canonical_json"(jsonb_build_object(
              'schemaVersion', 'reader_summary.weekly_story_identity.v1',
              'subjectKey', 'provider:' || provider_item.value->>'providerKey',
              'actionKey', 'action:tracked',
              'objectKeys', jsonb_build_array('resource:' || url_hash.url_sha),
              'qualifierKeys', jsonb_build_array('review:aggregate')
            )), 'UTF8'
          )), 'hex') AS story_sha
        ) AS story_hash
        CROSS JOIN LATERAL (
          SELECT encode(sha256(convert_to(
            "reader_summary_weekly_canonical_json"(jsonb_build_object(
              'requestedUtcDate', to_char(evidence_row."requested_utc_date", 'YYYY-MM-DD'),
              'publicationId', evidence_row."publication_id"::TEXT,
              'publicationEvidenceSha256', btrim(evidence_row."canonical_sha256"),
              'providerKey', provider_item.value->>'providerKey',
              'citationId', provider_item.value->>'citationId',
              'sourceItemId', provider_item.value->>'sourceItemId',
              'sourceContentHash', provider_item.value->>'sourceContentHash'
            )), 'UTF8'
          )), 'hex') AS citation_sha
        ) AS selector_hash
        WHERE citation_row.value->>'providerKey' IS NOT DISTINCT FROM provider_item.value->>'providerKey'
          AND citation_row.value->>'citationId' IS NOT DISTINCT FROM provider_item.value->>'citationId'
          AND citation_row.value->>'sourceItemId' IS NOT DISTINCT FROM provider_item.value->>'sourceItemId'
          AND citation_row.value->>'sourceContentHash' IS NOT DISTINCT FROM provider_item.value->>'sourceContentHash'
          AND citation_row.value->>'storyId' IS NOT DISTINCT FROM
            'reader_summary.weekly_story_identity.v1:' || story_hash.story_sha
          AND citation_row.value->>'selector' IS NOT DISTINCT FROM
            'citation:' || selector_hash.citation_sha
          AND NOT (
            evidence_row."github_evidence"->>'mode' = 'historical_unavailable'
            AND provider_item.value->>'providerKey' = 'github-trending-page'
          )
      )
  ) THEN
    RAISE EXCEPTION 'weekly review manifest citation is not sealed daily provider evidence';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_citations) AS citation_row(value)
    GROUP BY citation_row.value->>'storyId', citation_row.value->>'requestedUtcDate'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'weekly review manifest cannot duplicate a story on one date';
  END IF;

  SELECT count(*)::INTEGER INTO v_citation_count FROM jsonb_array_elements(v_citations);
  IF v_citation_count <> (
    SELECT count(DISTINCT citation_row.value->>'selector')
    FROM jsonb_array_elements(v_citations) AS citation_row(value)
  ) THEN
    RAISE EXCEPTION 'weekly review manifest citations are ambiguous';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_observations) AS observation_row(value)
    WHERE jsonb_typeof(observation_row.value) <> 'object'
      OR observation_row.value - ARRAY[
        'storyId', 'story', 'label', 'citationSelectors',
        'beforeCitationSelector', 'afterCitationSelector',
        'terminalCitationSelector'
      ]::TEXT[] <> '{}'::JSONB
      OR NOT (
        (observation_row.value->>'label' = 'observation'
          AND observation_row.value ?& ARRAY['storyId', 'story', 'label', 'citationSelectors']::TEXT[]
          AND jsonb_object_length(observation_row.value) = 4)
        OR (observation_row.value->>'label' = 'evolution'
          AND observation_row.value ?& ARRAY[
            'storyId', 'story', 'label', 'citationSelectors',
            'beforeCitationSelector', 'afterCitationSelector'
          ]::TEXT[] AND jsonb_object_length(observation_row.value) = 6)
        OR (observation_row.value->>'label' = 'resolution'
          AND observation_row.value ?& ARRAY[
            'storyId', 'story', 'label', 'citationSelectors', 'terminalCitationSelector'
          ]::TEXT[] AND jsonb_object_length(observation_row.value) = 5)
      )
      OR COALESCE(observation_row.value->>'storyId', '') !~
        '^reader_summary[.]weekly_story_identity[.]v1:[0-9a-f]{64}$'
      OR observation_row.value->>'story' IS DISTINCT FROM
        'story:' || substring(observation_row.value->>'storyId' FROM 41)
      OR jsonb_typeof(observation_row.value->'citationSelectors') <> 'array'
      OR jsonb_array_length(observation_row.value->'citationSelectors') < 1
      OR jsonb_array_length(observation_row.value->'citationSelectors') > 7
      OR (
        SELECT count(*) FROM jsonb_array_elements_text(observation_row.value->'citationSelectors')
      ) <> (
        SELECT count(DISTINCT selected_row.selector)
        FROM jsonb_array_elements_text(observation_row.value->'citationSelectors')
          AS selected_row(selector)
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(observation_row.value->'citationSelectors')
          AS selected_row(selector)
        WHERE selected_row.selector !~ '^citation:[0-9a-f]{64}$'
          OR NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_citations) AS citation_row(value)
            WHERE citation_row.value->>'selector' = selected_row.selector
              AND citation_row.value->>'storyId' = observation_row.value->>'storyId'
          )
      )
      OR (
        observation_row.value->>'label' = 'evolution' AND (
          NOT (observation_row.value->'citationSelectors' ? (observation_row.value->>'beforeCitationSelector'))
          OR NOT (observation_row.value->'citationSelectors' ? (observation_row.value->>'afterCitationSelector'))
          OR NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_citations) AS before_citation(value)
            JOIN jsonb_array_elements(v_citations) AS after_citation(value)
              ON after_citation.value->>'selector' = observation_row.value->>'afterCitationSelector'
            WHERE before_citation.value->>'selector' = observation_row.value->>'beforeCitationSelector'
              AND before_citation.value->>'storyId' = observation_row.value->>'storyId'
              AND after_citation.value->>'storyId' = observation_row.value->>'storyId'
              AND before_citation.value->>'requestedUtcDate' < after_citation.value->>'requestedUtcDate'
          )
        )
      )
      OR (
        observation_row.value->>'label' = 'resolution' AND (
          NOT (observation_row.value->'citationSelectors' ? (observation_row.value->>'terminalCitationSelector'))
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_citations) AS selected_citation(value)
            JOIN jsonb_array_elements(v_citations) AS terminal_citation(value)
              ON terminal_citation.value->>'selector' = observation_row.value->>'terminalCitationSelector'
            WHERE selected_citation.value->>'storyId' = observation_row.value->>'storyId'
              AND terminal_citation.value->>'storyId' = observation_row.value->>'storyId'
              AND observation_row.value->'citationSelectors' ? (selected_citation.value->>'selector')
              AND selected_citation.value->>'requestedUtcDate' > terminal_citation.value->>'requestedUtcDate'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'weekly review manifest observation labels or selectors are invalid';
  END IF;

  IF (
    SELECT count(*) FROM jsonb_array_elements(v_observations)
  ) <> (
    SELECT count(DISTINCT observation_row.value->>'story')
    FROM jsonb_array_elements(v_observations) AS observation_row(value)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_citations) AS citation_row(value)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_observations) AS observation_row(value)
      WHERE citation_row.value->>'storyId' = observation_row.value->>'storyId'
        AND observation_row.value->'citationSelectors' ? (citation_row.value->>'selector')
    )
  ) THEN
    RAISE EXCEPTION 'weekly review manifest observations must account for every citation';
  END IF;

  SELECT manifest_row.* INTO v_existing
  FROM "reader_summary_weekly_review_manifests" AS manifest_row
  WHERE manifest_row."seal_id" = v_seal_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing."manifest_id" <> v_manifest_id
      OR btrim(v_existing."manifest_sha256") <> v_manifest_sha256
      OR v_existing."tenant_id" <> v_tenant_id
      OR v_existing."workspace_id" <> v_workspace_id
      OR v_existing."scope_type" <> v_scope_type
      OR v_existing."scope_key" <> v_scope_key
      OR v_existing."week_started_on" <> v_week_started_on
      OR v_existing."week_ended_on" <> v_week_ended_on
      OR btrim(v_existing."seal_sha256") <> v_seal_sha256
      OR v_existing."review_authority" <> v_review_authority
      OR btrim(v_existing."review_authority_sha256") <> v_review_authority_sha256
      OR v_existing."observations" <> v_observations
      OR v_existing."citations" <> v_citations
      OR btrim(v_existing."model_response_sha256") <> v_model_response_sha256
      OR v_existing."execution_attestation" <> v_attestation
      OR btrim(v_existing."execution_attestation_sha256") <> v_attestation_sha256
      OR v_existing."canonical_record" <> v_canonical_record
      OR v_existing."canonical_bytes" <> v_canonical_bytes
    THEN
      RAISE EXCEPTION 'weekly review manifest conflicts with immutable seal-bound replay';
    END IF;
    RETURN QUERY SELECT
      'replayed'::TEXT, v_existing."manifest_id",
      btrim(v_existing."manifest_sha256"), v_existing."seal_id";
    RETURN;
  END IF;

  BEGIN
    INSERT INTO "reader_summary_weekly_review_manifests" (
      "manifest_id", "manifest_sha256", "tenant_id", "workspace_id",
      "scope_type", "scope_key", "week_started_on", "week_ended_on",
      "seal_id", "seal_sha256", "review_authority", "review_authority_sha256",
      "observations", "citations", "model_response_sha256", "execution_attestation",
      "execution_attestation_sha256", "canonical_record", "canonical_bytes"
    ) VALUES (
      v_manifest_id, v_manifest_sha256, v_tenant_id, v_workspace_id,
      v_scope_type, v_scope_key, v_week_started_on, v_week_ended_on,
      v_seal_id, v_seal_sha256, v_review_authority, v_review_authority_sha256,
      v_observations, v_citations, v_model_response_sha256, v_attestation,
      v_attestation_sha256, v_canonical_record, v_canonical_bytes
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION
        'weekly review manifest concurrent replay requires SERIALIZABLE retry'
        USING ERRCODE = '40001';
  END;

  RETURN QUERY SELECT 'persisted'::TEXT, v_manifest_id, v_manifest_sha256, v_seal_id;
END;
$$;

CREATE TRIGGER "reader_summary_weekly_review_manifests_append_only_update"
BEFORE UPDATE ON "reader_summary_weekly_review_manifests"
FOR EACH ROW
EXECUTE FUNCTION "reject_reader_summary_weekly_review_manifest_mutation"();

CREATE TRIGGER "reader_summary_weekly_review_manifests_append_only_delete"
BEFORE DELETE ON "reader_summary_weekly_review_manifests"
FOR EACH ROW
EXECUTE FUNCTION "reject_reader_summary_weekly_review_manifest_mutation"();

CREATE TRIGGER "reader_summary_weekly_review_manifests_append_only_truncate"
BEFORE TRUNCATE ON "reader_summary_weekly_review_manifests"
FOR EACH STATEMENT
EXECUTE FUNCTION "reject_reader_summary_weekly_review_manifest_mutation"();

REVOKE ALL PRIVILEGES ON FUNCTION
  "reject_reader_summary_weekly_review_manifest_mutation"(),
  "persist_reader_summary_weekly_review_manifest"(JSONB)
FROM PUBLIC, "pg_database_owner", "social_monitor_reader_summary_publication_runtime";

DO $grant_weekly_review_manifest_runtime_execute$
DECLARE
  v_runtime_role NAME;
BEGIN
  SELECT member_row.rolname INTO STRICT v_runtime_role
  FROM pg_auth_members AS membership_row
  JOIN pg_roles AS granted_row ON granted_row.oid = membership_row.roleid
  JOIN pg_roles AS member_row ON member_row.oid = membership_row.member
  WHERE granted_row.rolname = 'social_monitor_reader_summary_publication_runtime'
    AND NOT membership_row.admin_option
    AND membership_row.inherit_option
    AND NOT membership_row.set_option;
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON FUNCTION public.persist_reader_summary_weekly_review_manifest(jsonb) FROM %I',
    v_runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.persist_reader_summary_weekly_review_manifest(jsonb) TO %I',
    v_runtime_role
  );
END
$grant_weekly_review_manifest_runtime_execute$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";

RESET ROLE;
COMMIT;
