-- @social-monitor-forward-migration
-- Serialize weekly artifact persistence through the canonical publication
-- slot. The artifact and both copies of its immutable proof are one row and
-- therefore one transaction; the empty slot is the DB-owned race authority.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";

GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";

RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION "guard_reader_summary_weekly_artifact_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."cadence" = 'weekly' THEN
      RAISE EXCEPTION
        'reader summary weekly artifacts are immutable'
        USING ERRCODE = '55000';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."cadence" <> 'weekly'
    AND (TG_OP = 'INSERT' OR OLD."cadence" <> 'weekly')
  THEN
    RETURN NEW;
  END IF;

  IF current_user <> 'social_monitor_reader_summary_publication_owner' THEN
    RAISE EXCEPTION
      'weekly artifact persistence requires database publication authority'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW."cadence" <> 'weekly'
      OR (to_jsonb(NEW) - ARRAY['status', 'updated_at'])
        <> (to_jsonb(OLD) - ARRAY['status', 'updated_at'])
    )
  THEN
    RAISE EXCEPTION
      'reader summary weekly artifact proof is immutable'
      USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "reader_summary_weekly_artifacts_guarded"
BEFORE INSERT OR UPDATE OR DELETE
ON "reader_summary_artifacts"
FOR EACH ROW
EXECUTE FUNCTION "guard_reader_summary_weekly_artifact_mutation"();

CREATE FUNCTION "persist_reader_summary_weekly_artifact"(payload JSONB)
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
  v_artifact_found BOOLEAN;
  v_artifact_id UUID;
  v_artifact_payload JSONB;
  v_artifact_payload_sha256 TEXT;
  v_citations JSONB;
  v_existing_count INTEGER;
  v_interest_id UUID;
  v_manifest_seal_id TEXT;
  v_manifest_seal_sha256 TEXT;
  v_period_ended_at TIMESTAMPTZ;
  v_period_started_at TIMESTAMPTZ;
  v_proof JSONB;
  v_proof_body JSONB;
  v_proof_sha256 TEXT;
  v_quality_signals JSONB;
  v_scope_key TEXT;
  v_scope_type TEXT;
  v_seal_id TEXT;
  v_seal_sha256 TEXT;
  v_tenant_id UUID;
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
    OR (
      v_scope_type = 'workspace'
      AND (v_scope_key <> 'workspace' OR v_interest_id IS NOT NULL)
    )
    OR (
      v_scope_type = 'interest'
      AND (
        v_interest_id IS NULL
        OR v_scope_key <> 'interest:' || v_interest_id::TEXT
      )
    )
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
      'weekly:' || to_char(v_week_started_on, 'YYYY-MM-DD')
      || 'T00:00:00.000Z:'
      || to_char(v_week_started_on + 7, 'YYYY-MM-DD')
      || 'T00:00:00.000Z:UTC'
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
    OR v_quality_signals - ARRAY[
      'kind', 'editorialQuality', 'weeklyPublicationProof'
    ]::TEXT[] <> '{}'::JSONB
    OR NOT v_quality_signals ?& ARRAY[
      'kind', 'editorialQuality', 'weeklyPublicationProof'
    ]::TEXT[]
    OR v_quality_signals->>'kind' <> 'weekly'
    OR jsonb_typeof(v_quality_signals->'editorialQuality') <> 'object'
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
    OR v_seal_sha256 !~ '^[0-9a-f]{64}$'
    OR v_seal_id <>
      'reader_summary.weekly_model_input.v1:' || v_seal_sha256
    OR v_artifact_payload_sha256 !~ '^[0-9a-f]{64}$'
    OR v_artifact_payload_sha256 <> encode(
      sha256(convert_to(
        "reader_summary_weekly_canonical_json"(v_artifact_payload),
        'UTF8'
      )),
      'hex'
    )
    OR v_proof_sha256 !~ '^[0-9a-f]{64}$'
    OR v_proof_sha256 <> encode(
      sha256(convert_to(
        "reader_summary_weekly_canonical_json"(v_proof_body),
        'UTF8'
      )),
      'hex'
    )
    OR v_proof->>'authorizationId' <>
      'reader_summary.weekly_publication_authorization.v1:'
      || v_proof_sha256
    OR v_proof->>'schemaVersion'
      <> 'reader_summary.weekly_publication_proof.v1'
    OR v_proof->>'artifactId' <> v_artifact_id::TEXT
    OR v_proof->>'tenantId' <> v_tenant_id::TEXT
    OR v_proof->>'workspaceId' <> v_workspace_id::TEXT
    OR v_proof->>'weekStartedOn' <> payload->>'weekStartedOn'
    OR v_proof->>'weekEndedOn' <> payload->>'weekEndedOn'
    OR v_proof->>'modelInputSealId' <> v_seal_id
    OR v_proof->>'modelInputSealSha256' <> v_seal_sha256
    OR v_artifact_payload->'output'->>'sealId' <> v_seal_id
    OR v_artifact_payload->'output'->>'sealSha' <> v_seal_sha256
    OR v_artifact_payload->'output'->>'weekStartedOn'
      <> payload->>'weekStartedOn'
    OR v_artifact_payload->'output'->>'weekEndedOn'
      <> payload->>'weekEndedOn'
    OR v_artifact_payload->'publicationProof' <> v_proof
    OR v_quality_signals->'weeklyPublicationProof' <> v_proof
    OR v_citations <> v_proof->'citations'
    OR v_proof->>'artifactSha256' <> encode(
      sha256(convert_to(
        "reader_summary_weekly_canonical_json"(
          v_artifact_payload->'output'
        ),
        'UTF8'
      )),
      'hex'
    )
    OR v_proof->>'editorialQualitySha256' <> encode(
      sha256(convert_to(
        "reader_summary_weekly_canonical_json"(
          v_quality_signals->'editorialQuality'
        ),
        'UTF8'
      )),
      'hex'
    )
    OR v_artifact_payload->'output'->>'headline' <> payload->>'headline'
    OR v_artifact_payload->'output'->>'synthesis' <> payload->>'summaryText'
    OR v_artifact_payload->'output'->>'schemaVersion'
      <> payload->>'modelVersion'
  THEN
    RAISE EXCEPTION 'weekly artifact immutable proof binding is invalid';
  END IF;

  IF (
      v_scope_type = 'workspace'
      AND v_proof->'scope' <> jsonb_build_object('type', 'workspace')
    ) OR (
      v_scope_type = 'interest'
      AND v_proof->'scope' <> jsonb_build_object(
        'type', 'interest', 'interestId', v_interest_id::TEXT
      )
    )
  THEN
    RAISE EXCEPTION 'weekly artifact proof scope diverged';
  END IF;

  SELECT seal."seal_id", btrim(seal."seal_sha256")
  INTO v_manifest_seal_id, v_manifest_seal_sha256
  FROM "reader_summary_weekly_certification_seals" AS seal
  WHERE seal."tenant_id" = v_tenant_id
    AND seal."workspace_id" = v_workspace_id
    AND seal."scope_type" = v_scope_type
    AND seal."scope_key" = v_scope_key
    AND seal."week_started_on" = v_week_started_on
    AND seal."week_ended_on" = v_week_ended_on
  FOR SHARE;

  IF NOT FOUND
    OR payload->>'manifestSealId' <> v_manifest_seal_id
    OR payload->>'manifestSealSha256' <> v_manifest_seal_sha256
    OR v_proof->>'manifestSealId' <> v_manifest_seal_id
    OR v_proof->>'manifestSealSha256' <> v_manifest_seal_sha256
  THEN
    RAISE EXCEPTION
      'weekly artifact persistence requires the immutable database certification seal';
  END IF;

  INSERT INTO "reader_summary_publication_slots" (
    "tenant_id", "workspace_id", "scope_type", "scope_key", "cadence",
    "period_started_at", "period_ended_at", "period_timezone",
    "current_publication_id", "updated_at"
  ) VALUES (
    v_tenant_id, v_workspace_id, v_scope_type, v_scope_key, 'weekly',
    v_period_started_at, v_period_ended_at, 'UTC', NULL,
    transaction_timestamp()
  ) ON CONFLICT DO NOTHING;

  PERFORM slot."tenant_id"
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'weekly artifact persistence slot was not locked';
  END IF;

  SELECT artifact.*
  INTO v_artifact
  FROM "reader_summary_artifacts" AS artifact
  WHERE artifact."tenant_id" = v_tenant_id
    AND artifact."workspace_id" = v_workspace_id
    AND artifact."scope_type" = v_scope_type
    AND artifact."scope_key" = v_scope_key
    AND artifact."cadence" = 'weekly'
    AND artifact."period_started_at" = v_period_started_at
    AND artifact."period_ended_at" = v_period_ended_at
    AND artifact."period_timezone" = 'UTC'
  ORDER BY artifact."id"
  LIMIT 1
  FOR UPDATE;
  v_artifact_found := FOUND;

  SELECT count(*)::INTEGER
  INTO STRICT v_existing_count
  FROM "reader_summary_artifacts" AS artifact
  WHERE artifact."tenant_id" = v_tenant_id
    AND artifact."workspace_id" = v_workspace_id
    AND artifact."scope_type" = v_scope_type
    AND artifact."scope_key" = v_scope_key
    AND artifact."cadence" = 'weekly'
    AND artifact."period_started_at" = v_period_started_at
    AND artifact."period_ended_at" = v_period_ended_at
    AND artifact."period_timezone" = 'UTC';

  IF v_existing_count > 1 THEN
    RAISE EXCEPTION 'weekly artifact persistence slot contains divergent rows';
  END IF;

  IF v_artifact_found THEN
    IF v_artifact."id" <> v_artifact_id
      OR v_artifact."interest_id" IS DISTINCT FROM v_interest_id
      OR v_artifact."period_key" <> payload->>'periodKey'
      OR v_artifact."model_version" <> payload->>'modelVersion'
      OR v_artifact."prompt_version" <> payload->>'promptVersion'
      OR v_artifact."headline" <> payload->>'headline'
      OR v_artifact."summary_text" <> payload->>'summaryText'
      OR v_artifact."artifact_payload" <> v_artifact_payload
      OR v_artifact."citations" <> v_citations
      OR v_artifact."quality_signals" <> v_quality_signals
    THEN
      RAISE EXCEPTION
        'weekly artifact persistence replay diverged from immutable sealId or sealSha';
    END IF;

    RETURN QUERY SELECT
      'replayed'::TEXT,
      v_artifact."id",
      v_artifact_payload_sha256,
      v_proof_sha256;
    RETURN;
  END IF;

  INSERT INTO "reader_summary_artifacts" (
    "id", "tenant_id", "workspace_id", "scope_type", "scope_key",
    "interest_id", "cadence", "period_started_at", "period_ended_at",
    "period_timezone", "period_key", "user_id", "subscription_id",
    "status", "schema_version", "model_version", "prompt_version",
    "headline", "summary_text", "artifact_payload", "citations",
    "quality_signals", "updated_at"
  ) VALUES (
    v_artifact_id, v_tenant_id, v_workspace_id, v_scope_type, v_scope_key,
    v_interest_id, 'weekly', v_period_started_at, v_period_ended_at,
    'UTC', payload->>'periodKey', NULL, NULL, 'RUNNING', 1,
    payload->>'modelVersion', payload->>'promptVersion',
    payload->>'headline', payload->>'summaryText', v_artifact_payload,
    v_citations, v_quality_signals, transaction_timestamp()
  );

  RETURN QUERY SELECT
    'persisted'::TEXT,
    v_artifact_id,
    v_artifact_payload_sha256,
    v_proof_sha256;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  "guard_reader_summary_weekly_artifact_mutation"(),
  "persist_reader_summary_weekly_artifact"(JSONB)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

GRANT EXECUTE ON FUNCTION
  "persist_reader_summary_weekly_artifact"(JSONB)
TO "social_monitor_reader_summary_publication_owner";

DO $grant_weekly_atomic_runtime_execute$
DECLARE
  v_runtime_role NAME;
  v_runtime_attributes RECORD;
BEGIN
  SELECT member.rolname
  INTO STRICT v_runtime_role
  FROM pg_auth_members AS membership
  JOIN pg_roles AS granted ON granted.oid = membership.roleid
  JOIN pg_roles AS member ON member.oid = membership.member
  WHERE granted.rolname =
      'social_monitor_reader_summary_publication_runtime'
    AND NOT membership.admin_option
    AND membership.inherit_option
    AND NOT membership.set_option;

  SELECT *
  INTO STRICT v_runtime_attributes
  FROM pg_roles
  WHERE rolname = v_runtime_role;

  IF NOT v_runtime_attributes.rolcanlogin
    OR v_runtime_attributes.rolsuper
    OR v_runtime_attributes.rolcreatedb
    OR v_runtime_attributes.rolcreaterole
    OR v_runtime_attributes.rolreplication
    OR v_runtime_attributes.rolbypassrls
  THEN
    RAISE EXCEPTION 'weekly atomic concrete runtime login is unsafe';
  END IF;

  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON FUNCTION public.persist_reader_summary_weekly_artifact(JSONB) FROM %I',
    v_runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.persist_reader_summary_weekly_artifact(JSONB) TO %I',
    v_runtime_role
  );
END
$grant_weekly_atomic_runtime_execute$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";

RESET ROLE;
COMMIT;
