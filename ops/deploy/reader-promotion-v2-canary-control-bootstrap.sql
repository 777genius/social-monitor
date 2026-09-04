-- Manual one-shot canary provisioning, never an application migration.
-- Isolated singleton control plane: it has no product-domain authority.
BEGIN;

DO $roles$
BEGIN
  IF NOT (SELECT rolsuper FROM pg_catalog.pg_roles
      WHERE rolname = CURRENT_USER) THEN
    RAISE EXCEPTION 'canary bootstrap requires the independent provisioning administrator';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('reader-promotion-v2-canary-bootstrap-v1', 0));
  IF pg_catalog.to_regnamespace('reader_promotion_v2_canary_control') IS NOT NULL THEN
    RAISE EXCEPTION 'canary already provisioned; inspect the existing receipt instead of replaying bootstrap';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles
    WHERE rolname = 'social_monitor_reader_promotion_canary_owner') THEN
    CREATE ROLE social_monitor_reader_promotion_canary_owner NOLOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles
    WHERE rolname = 'social_monitor_reader_promotion_canary_invoker') THEN
    CREATE ROLE social_monitor_reader_promotion_canary_invoker LOGIN
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION
      NOBYPASSRLS CONNECTION LIMIT 2;
  END IF;
END
$roles$;

DO $role_audit$
BEGIN
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname IN (
      'social_monitor_reader_promotion_canary_owner',
      'social_monitor_reader_promotion_canary_invoker'
    ) AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR
      rolreplication OR rolbypassrls OR
      (rolname = 'social_monitor_reader_promotion_canary_owner' AND rolcanlogin) OR
      (rolname = 'social_monitor_reader_promotion_canary_invoker' AND
        (NOT rolcanlogin OR rolconnlimit <> 2)) OR
      (rolconfig IS NOT NULL AND rolconfig <>
        ARRAY['search_path=pg_catalog, reader_promotion_v2_canary_control']))) THEN
    RAISE EXCEPTION 'reader promotion V2 canary pre-existing role is unsafe';
  END IF;
  IF EXISTS (
    SELECT FROM pg_catalog.pg_roles role
    JOIN (
      SELECT relowner AS owner, relacl AS acl FROM pg_catalog.pg_class
      UNION ALL SELECT proowner, proacl FROM pg_catalog.pg_proc
      UNION ALL SELECT nspowner, nspacl FROM pg_catalog.pg_namespace
      UNION ALL SELECT typowner, typacl FROM pg_catalog.pg_type
      UNION ALL SELECT datdba, datacl FROM pg_catalog.pg_database
      UNION ALL SELECT 0::OID, attacl FROM pg_catalog.pg_attribute
    ) object_acl ON object_acl.owner = role.oid OR EXISTS (
      SELECT FROM pg_catalog.aclexplode(object_acl.acl) grant_entry
      WHERE grant_entry.grantee = role.oid
    )
    WHERE role.rolname IN (
      'social_monitor_reader_promotion_canary_owner',
      'social_monitor_reader_promotion_canary_invoker'
    )
  ) THEN
    RAISE EXCEPTION 'reader promotion V2 canary role has pre-existing object authority';
  END IF;
END
$role_audit$;
CREATE SCHEMA reader_promotion_v2_canary_control
  AUTHORIZATION social_monitor_reader_promotion_canary_owner;
REVOKE ALL ON SCHEMA reader_promotion_v2_canary_control FROM PUBLIC;
GRANT USAGE ON SCHEMA reader_promotion_v2_canary_control
  TO social_monitor_reader_promotion_canary_invoker;

CREATE FUNCTION reader_promotion_v2_canary_control.canonical_json(value JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog AS $body$
DECLARE result TEXT;
BEGIN
  CASE jsonb_typeof(value)
    WHEN 'object' THEN
      SELECT '{' || COALESCE(string_agg(
        to_jsonb(key)::TEXT || ':' ||
          reader_promotion_v2_canary_control.canonical_json(value->key),
        ',' ORDER BY key), '') || '}' INTO result
      FROM jsonb_object_keys(value) key;
    WHEN 'array' THEN
      SELECT '[' || COALESCE(string_agg(
        reader_promotion_v2_canary_control.canonical_json(item),
        ',' ORDER BY ordinal), '') || ']' INTO result
      FROM jsonb_array_elements(value) WITH ORDINALITY items(item, ordinal);
    ELSE result := value::TEXT;
  END CASE;
  RETURN result;
END
$body$;

CREATE TABLE reader_promotion_v2_canary_control.jobs (
  singleton_id TEXT PRIMARY KEY CHECK (
    singleton_id = 'reader-promotion-v2-production-canary-v1'
  ),
  state TEXT NOT NULL CHECK (state IN (
    'CLAIMED', 'MODEL_RUNNING', 'MODEL_COMPLETED', 'SUCCEEDED', 'REJECTED'
  )),
  outcome TEXT CHECK (outcome IN (
    'RESPONSE', 'EXPLICIT_FAILURE', 'UNCERTAIN'
  )),
  binding JSONB NOT NULL,
  owner_id TEXT NOT NULL CHECK (btrim(owner_id) <> ''),
  fence TEXT NOT NULL CHECK (btrim(fence) <> ''),
  reconciliation_deadline TIMESTAMPTZ(6) NOT NULL,
  artifact_sha256 CHAR(64),
  receipt_sha256 CHAR(64),
  rejection_code TEXT,
  claimed_at TIMESTAMPTZ(6) NOT NULL,
  model_running_at TIMESTAMPTZ(6),
  model_completed_at TIMESTAMPTZ(6),
  terminal_at TIMESTAMPTZ(6),
  CHECK (artifact_sha256 IS NULL OR artifact_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK (receipt_sha256 IS NULL OR receipt_sha256 ~ '^[0-9a-f]{64}$'),
  CHECK ((state IN ('CLAIMED', 'MODEL_RUNNING')) = (outcome IS NULL)),
  CHECK (reconciliation_deadline > claimed_at)
);

CREATE TABLE reader_promotion_v2_canary_control.job_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_id TEXT NOT NULL CHECK (
    singleton_id = 'reader-promotion-v2-production-canary-v1'
  ),
  state TEXT NOT NULL CHECK (state IN (
    'CLAIMED', 'MODEL_RUNNING', 'MODEL_COMPLETED', 'SUCCEEDED', 'REJECTED'
  )),
  outcome TEXT CHECK (outcome IN (
    'RESPONSE', 'EXPLICIT_FAILURE', 'UNCERTAIN'
  )),
  occurred_at TIMESTAMPTZ(6) NOT NULL,
  FOREIGN KEY (singleton_id) REFERENCES
    reader_promotion_v2_canary_control.jobs(singleton_id) ON DELETE RESTRICT
);

CREATE TABLE reader_promotion_v2_canary_control.artifacts (
  singleton_id TEXT PRIMARY KEY,
  artifact JSONB NOT NULL,
  artifact_sha256 CHAR(64) NOT NULL UNIQUE CHECK (
    artifact_sha256 ~ '^[0-9a-f]{64}$'
  ),
  recorded_at TIMESTAMPTZ(6) NOT NULL,
  FOREIGN KEY (singleton_id) REFERENCES
    reader_promotion_v2_canary_control.jobs(singleton_id) ON DELETE RESTRICT
);

CREATE TABLE reader_promotion_v2_canary_control.receipts (
  singleton_id TEXT PRIMARY KEY,
  receipt JSONB NOT NULL,
  receipt_sha256 CHAR(64) NOT NULL UNIQUE CHECK (
    receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  recorded_at TIMESTAMPTZ(6) NOT NULL,
  FOREIGN KEY (singleton_id) REFERENCES
    reader_promotion_v2_canary_control.jobs(singleton_id) ON DELETE RESTRICT
);

ALTER TABLE reader_promotion_v2_canary_control.jobs
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER TABLE reader_promotion_v2_canary_control.job_events
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER TABLE reader_promotion_v2_canary_control.artifacts
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER TABLE reader_promotion_v2_canary_control.receipts
  OWNER TO social_monitor_reader_promotion_canary_owner;
REVOKE ALL ON ALL TABLES IN SCHEMA reader_promotion_v2_canary_control
  FROM PUBLIC, social_monitor_reader_promotion_canary_invoker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA reader_promotion_v2_canary_control
  FROM PUBLIC, social_monitor_reader_promotion_canary_invoker;

CREATE FUNCTION reader_promotion_v2_canary_control.reject_immutable_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $body$
BEGIN
  RAISE EXCEPTION 'reader promotion V2 canary evidence is immutable';
END
$body$;

CREATE TRIGGER canary_events_immutable BEFORE UPDATE OR DELETE
ON reader_promotion_v2_canary_control.job_events FOR EACH ROW
EXECUTE FUNCTION reader_promotion_v2_canary_control.reject_immutable_mutation();
CREATE TRIGGER canary_events_no_truncate BEFORE TRUNCATE
ON reader_promotion_v2_canary_control.job_events FOR EACH STATEMENT
EXECUTE FUNCTION reader_promotion_v2_canary_control.reject_immutable_mutation();
CREATE TRIGGER canary_artifacts_immutable BEFORE UPDATE OR DELETE
ON reader_promotion_v2_canary_control.artifacts FOR EACH ROW
EXECUTE FUNCTION reader_promotion_v2_canary_control.reject_immutable_mutation();
CREATE TRIGGER canary_artifacts_no_truncate BEFORE TRUNCATE
ON reader_promotion_v2_canary_control.artifacts FOR EACH STATEMENT
EXECUTE FUNCTION reader_promotion_v2_canary_control.reject_immutable_mutation();
CREATE TRIGGER canary_receipts_immutable BEFORE UPDATE OR DELETE
ON reader_promotion_v2_canary_control.receipts FOR EACH ROW
EXECUTE FUNCTION reader_promotion_v2_canary_control.reject_immutable_mutation();
CREATE TRIGGER canary_receipts_no_truncate BEFORE TRUNCATE
ON reader_promotion_v2_canary_control.receipts FOR EACH STATEMENT
EXECUTE FUNCTION reader_promotion_v2_canary_control.reject_immutable_mutation();

CREATE FUNCTION reader_promotion_v2_canary_control.snapshot(job
  reader_promotion_v2_canary_control.jobs)
RETURNS JSONB LANGUAGE SQL STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $body$
  SELECT jsonb_build_object(
    'binding', job.binding,
    'state', job.state,
    'outcome', job.outcome,
    'artifact', artifact.artifact,
    'artifactSha256', btrim(job.artifact_sha256),
    'receipt', receipt.receipt,
    'rejectionCode', job.rejection_code
  )
  FROM (SELECT 1) one
  LEFT JOIN reader_promotion_v2_canary_control.receipts receipt
    ON receipt.singleton_id = job.singleton_id
  LEFT JOIN reader_promotion_v2_canary_control.artifacts artifact
    ON artifact.singleton_id = job.singleton_id
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.assert_binding(value JSONB)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $body$
DECLARE
  required_keys TEXT[] := ARRAY[
    'singletonId', 'ownerId', 'fence', 'manifestSha256', 'schemaName',
    'schemaVersion', 'schemaSha256', 'model', 'reasoningEffort',
    'canonicalRequestSha256',
    'reconciliationDeadline', 'protectedMainSha', 'deployedReleaseSha',
    'deployedBackendSha', 'deployedControlSha', 'deployedRuntimeSha',
    'runtimeImageId',
    'workflow', 'workflowRunId', 'workflowRunAttempt',
    'runtimePackageVersion', 'runtimePackageSha256', 'launcherSha256'
  ];
BEGIN
  IF COALESCE((jsonb_typeof(value) <> 'object'
    OR (SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(value) key)
      IS DISTINCT FROM
      (SELECT array_agg(key ORDER BY key) FROM unnest(required_keys) key)
    OR EXISTS (SELECT FROM unnest(ARRAY[
      'singletonId', 'ownerId', 'fence', 'manifestSha256', 'schemaName',
      'schemaVersion', 'schemaSha256', 'model', 'reasoningEffort',
      'canonicalRequestSha256', 'reconciliationDeadline', 'protectedMainSha',
      'deployedReleaseSha', 'deployedBackendSha', 'deployedControlSha',
      'deployedRuntimeSha', 'runtimeImageId', 'workflow', 'workflowRunId',
      'runtimePackageVersion', 'runtimePackageSha256', 'launcherSha256'
    ]) key WHERE jsonb_typeof(value->key) <> 'string')
    OR jsonb_typeof(value->'workflowRunAttempt') <> 'number'
    OR value->>'singletonId' <> 'reader-promotion-v2-production-canary-v1'
    OR btrim(value->>'ownerId') = ''
    OR btrim(value->>'fence') = ''
    OR value->>'protectedMainSha' !~ '^[0-9a-f]{40}$'
    OR value->>'protectedMainSha' IS DISTINCT FROM value->>'deployedReleaseSha'
    OR value->>'protectedMainSha' IS DISTINCT FROM value->>'deployedBackendSha'
    OR value->>'protectedMainSha' IS DISTINCT FROM value->>'deployedControlSha'
    OR value->>'protectedMainSha' IS DISTINCT FROM value->>'deployedRuntimeSha'
    OR value->>'runtimeImageId' !~ '^sha256:[0-9a-f]{64}$'
    OR value->>'manifestSha256' <>
      'e48eb0033492835cc54f74d14ecdb9b69a8e7d75d71c3206410e2b3ef29577b3'
    OR value->>'schemaSha256' <>
      'b7ca379b6d8088dbf49009fa0e7ae37ed8a7d71b48d34b70ffb4d67409a774a1'
    OR value->>'canonicalRequestSha256' !~ '^[0-9a-f]{64}$'
    OR value->>'runtimePackageSha256' !~ '^[0-9a-f]{64}$'
    OR value->>'launcherSha256' !~ '^[0-9a-f]{64}$'
    OR value->>'schemaName' <>
      'social_monitor_reader_summary_story_relations'
    OR value->>'schemaVersion' <> 'reader_summary.story_relation.v1'
    OR value->>'model' <> 'gpt-5.6-sol'
    OR value->>'reasoningEffort' <> 'high'
    OR value->>'workflow' <> 'reader-promotion-v2-production-canary'
    OR value->>'workflowRunId' !~ '^[0-9]+$'
    OR (value->>'workflowRunAttempt')::NUMERIC % 1 <> 0
    OR (value->>'workflowRunAttempt')::NUMERIC < 1
    OR value->>'runtimePackageVersion' <> '0.1.0-main.30'
    OR value->>'launcherSha256' <>
      'dd8a53daa1fe35b2f901bf2b2b000e0a02279bae45c963a631b85bbabbec891b'), TRUE) THEN
    RAISE EXCEPTION 'reader promotion V2 canary binding is invalid';
  END IF;
END
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.expire_locked(
  job reader_promotion_v2_canary_control.jobs, at_time TIMESTAMPTZ
) RETURNS reader_promotion_v2_canary_control.jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $body$
DECLARE
  result reader_promotion_v2_canary_control.jobs;
  expired_receipt JSONB;
BEGIN
  IF job.state <> 'MODEL_RUNNING' OR at_time < job.reconciliation_deadline THEN
    RETURN job;
  END IF;
  UPDATE reader_promotion_v2_canary_control.jobs SET
    state = 'MODEL_COMPLETED', outcome = 'UNCERTAIN',
    model_completed_at = at_time, rejection_code = 'model_uncertain'
  WHERE singleton_id = job.singleton_id RETURNING * INTO result;
  INSERT INTO reader_promotion_v2_canary_control.job_events
    (singleton_id, state, outcome, occurred_at)
  VALUES (job.singleton_id, 'MODEL_COMPLETED', 'UNCERTAIN', at_time);
  expired_receipt := jsonb_build_object(
    'format', 'reader-promotion-v2-production-canary-receipt.v1',
    'singletonId', job.binding->>'singletonId', 'state', 'REJECTED',
    'outcome', 'UNCERTAIN',
    'protectedMainSha', job.binding->>'protectedMainSha',
    'deployedReleaseSha', job.binding->>'deployedReleaseSha',
    'deployedBackendSha', job.binding->>'deployedBackendSha',
    'deployedControlSha', job.binding->>'deployedControlSha',
    'deployedRuntimeSha', job.binding->>'deployedRuntimeSha',
    'runtimeImageId', job.binding->>'runtimeImageId',
    'manifestSha256', job.binding->>'manifestSha256',
    'schemaName', job.binding->>'schemaName',
    'schemaVersion', job.binding->>'schemaVersion',
    'schemaSha256', job.binding->>'schemaSha256',
    'model', job.binding->>'model',
    'reasoningEffort', job.binding->>'reasoningEffort',
    'canonicalRequestSha256', job.binding->>'canonicalRequestSha256',
    'workflow', job.binding->>'workflow',
    'workflowRunId', job.binding->>'workflowRunId',
    'workflowRunAttempt', (job.binding->>'workflowRunAttempt')::INTEGER,
    'fence', job.binding->>'fence',
    'runtimePackageVersion', job.binding->>'runtimePackageVersion',
    'runtimePackageSha256', job.binding->>'runtimePackageSha256',
    'launcherSha256', job.binding->>'launcherSha256',
    'artifactSha256', NULL, 'usage', NULL,
    'rejectionCode', 'model_uncertain'
  );
  INSERT INTO reader_promotion_v2_canary_control.receipts
    (singleton_id, receipt, receipt_sha256, recorded_at)
  VALUES (job.singleton_id, expired_receipt,
    encode(sha256(convert_to(
      reader_promotion_v2_canary_control.canonical_json(expired_receipt),
      'UTF8')), 'hex'), at_time);
  UPDATE reader_promotion_v2_canary_control.jobs SET
    state = 'REJECTED', terminal_at = at_time,
    receipt_sha256 = encode(sha256(convert_to(
      reader_promotion_v2_canary_control.canonical_json(expired_receipt),
      'UTF8')), 'hex')
  WHERE singleton_id = job.singleton_id RETURNING * INTO result;
  INSERT INTO reader_promotion_v2_canary_control.job_events
    (singleton_id, state, outcome, occurred_at)
  VALUES (job.singleton_id, 'REJECTED', 'UNCERTAIN', at_time);
  RETURN result;
END
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.claim_at(
  requested_binding JSONB, at_time TIMESTAMPTZ
) RETURNS TABLE(action TEXT, snapshot JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $body$
DECLARE
  job reader_promotion_v2_canary_control.jobs;
BEGIN
  PERFORM reader_promotion_v2_canary_control.assert_binding(requested_binding);
  INSERT INTO reader_promotion_v2_canary_control.jobs (
    singleton_id, state, binding, owner_id, fence,
    reconciliation_deadline, claimed_at
  ) VALUES (
    'reader-promotion-v2-production-canary-v1', 'CLAIMED', requested_binding,
    requested_binding->>'ownerId', requested_binding->>'fence',
    (requested_binding->>'reconciliationDeadline')::TIMESTAMPTZ, at_time
  ) ON CONFLICT (singleton_id) DO NOTHING;
  IF FOUND THEN
    IF (requested_binding->>'reconciliationDeadline')::TIMESTAMPTZ
        IS DISTINCT FROM at_time + INTERVAL '180 seconds' THEN
      RAISE EXCEPTION 'reader promotion V2 canary deadline is invalid';
    END IF;
    INSERT INTO reader_promotion_v2_canary_control.job_events
      (singleton_id, state, occurred_at)
    VALUES ('reader-promotion-v2-production-canary-v1', 'CLAIMED', at_time);
  END IF;
  SELECT * INTO job FROM reader_promotion_v2_canary_control.jobs
    WHERE singleton_id = 'reader-promotion-v2-production-canary-v1'
    FOR UPDATE;
  job := reader_promotion_v2_canary_control.expire_locked(job, at_time);
  snapshot := reader_promotion_v2_canary_control.snapshot(job);
  IF job.state IN ('SUCCEEDED', 'REJECTED') THEN action := 'TERMINAL';
  ELSIF job.owner_id = requested_binding->>'ownerId' AND
      job.fence = requested_binding->>'fence' AND
      job.binding - ARRAY['reconciliationDeadline', 'workflowRunAttempt'] =
        requested_binding - ARRAY['reconciliationDeadline', 'workflowRunAttempt'] AND
      job.state IN ('CLAIMED', 'MODEL_COMPLETED') THEN action := 'OWNER';
  ELSE action := 'IN_PROGRESS';
  END IF;
  RETURN NEXT;
END
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.mark_model_running_at(
  requested_binding JSONB, at_time TIMESTAMPTZ
) RETURNS TABLE(action TEXT, snapshot JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $body$
DECLARE job reader_promotion_v2_canary_control.jobs;
BEGIN
  SELECT * INTO job FROM reader_promotion_v2_canary_control.jobs
    WHERE singleton_id = 'reader-promotion-v2-production-canary-v1' FOR UPDATE;
  IF job.binding IS DISTINCT FROM requested_binding THEN
    RAISE EXCEPTION 'reader promotion V2 canary owner or fence is stale';
  END IF;
  IF job.state = 'CLAIMED' THEN
    UPDATE reader_promotion_v2_canary_control.jobs SET
      state = 'MODEL_RUNNING', model_running_at = at_time
    WHERE singleton_id = job.singleton_id RETURNING * INTO job;
    INSERT INTO reader_promotion_v2_canary_control.job_events
      (singleton_id, state, occurred_at)
    VALUES (job.singleton_id, 'MODEL_RUNNING', at_time);
    action := 'ENTER';
  ELSIF job.state = 'MODEL_RUNNING' THEN
    action := 'IN_PROGRESS';
  ELSIF job.state <> 'MODEL_RUNNING' THEN
    RAISE EXCEPTION 'reader promotion V2 canary transition is invalid';
  END IF;
  snapshot := reader_promotion_v2_canary_control.snapshot(job); RETURN NEXT;
END
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.complete_model_at(
  requested_binding JSONB, requested_outcome TEXT, requested_artifact JSONB,
  requested_artifact_sha256 TEXT, at_time TIMESTAMPTZ
) RETURNS TABLE(snapshot JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $body$
DECLARE job reader_promotion_v2_canary_control.jobs;
BEGIN
  SELECT * INTO job FROM reader_promotion_v2_canary_control.jobs
    WHERE singleton_id = 'reader-promotion-v2-production-canary-v1' FOR UPDATE;
  IF job.binding IS DISTINCT FROM requested_binding THEN
    RAISE EXCEPTION 'reader promotion V2 canary owner or fence is stale';
  END IF;
  job := reader_promotion_v2_canary_control.expire_locked(job, at_time);
  IF job.state IN ('SUCCEEDED', 'REJECTED') THEN
    snapshot := reader_promotion_v2_canary_control.snapshot(job); RETURN NEXT; RETURN;
  END IF;
  IF COALESCE((job.state <> 'MODEL_RUNNING' OR requested_outcome NOT IN
      ('RESPONSE', 'EXPLICIT_FAILURE') OR
      ((requested_outcome = 'RESPONSE') IS DISTINCT FROM
        (requested_artifact IS NOT NULL AND
         requested_artifact_sha256 ~ '^[0-9a-f]{64}$'))), TRUE) THEN
    RAISE EXCEPTION 'reader promotion V2 canary completion is invalid';
  END IF;
  IF requested_artifact IS NOT NULL THEN
    IF COALESCE(((SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(requested_artifact) key) IS DISTINCT FROM
        ARRAY['canonicalRequestSha256', 'decisions', 'format',
          'manifestSha256', 'outputSha256', 'productAssertionsSha256',
          'schemaSha256', 'usage']::TEXT[]
      OR requested_artifact->>'format' <>
        'reader-promotion-v2-production-canary-artifact.v1'
      OR requested_artifact->>'manifestSha256' IS DISTINCT FROM
        job.binding->>'manifestSha256'
      OR requested_artifact->>'schemaSha256' IS DISTINCT FROM
        job.binding->>'schemaSha256'
      OR requested_artifact->>'canonicalRequestSha256' IS DISTINCT FROM
        job.binding->>'canonicalRequestSha256'
      OR requested_artifact->>'outputSha256' !~ '^[0-9a-f]{64}$'
      OR requested_artifact->>'productAssertionsSha256' !~
        '^[0-9a-f]{64}$'
      OR EXISTS (SELECT FROM unnest(ARRAY[
          'format', 'manifestSha256', 'schemaSha256',
          'canonicalRequestSha256', 'outputSha256', 'productAssertionsSha256'
        ]) key WHERE jsonb_typeof(requested_artifact->key) <> 'string')
      OR jsonb_typeof(requested_artifact->'decisions') <> 'array'
      OR jsonb_array_length(requested_artifact->'decisions') <> 3
      OR EXISTS (
        SELECT FROM jsonb_array_elements(requested_artifact->'decisions')
          WITH ORDINALITY decisions(item, ordinal)
        WHERE (SELECT array_agg(key ORDER BY key)
          FROM jsonb_object_keys(item) key) IS DISTINCT FROM
          ARRAY['confidenceScore', 'leftFeedItemId', 'rightFeedItemId',
            'sameStory']::TEXT[]
          OR jsonb_typeof(item) <> 'object'
          OR jsonb_typeof(item->'leftFeedItemId') <> 'string'
          OR jsonb_typeof(item->'rightFeedItemId') <> 'string'
          OR jsonb_typeof(item->'sameStory') <> 'boolean'
          OR jsonb_typeof(item->'confidenceScore') <> 'number'
          OR item->>'leftFeedItemId' IS DISTINCT FROM CASE ordinal
            WHEN 1 THEN 'cursor'
            WHEN 2 THEN 'anthropic-watermark-x'
            WHEN 3 THEN 'claude-code-watermark' END
          OR item->>'rightFeedItemId' IS DISTINCT FROM CASE ordinal
            WHEN 1 THEN 'spacex'
            WHEN 2 THEN 'anthropic-watermark-reddit'
            WHEN 3 THEN 'claude-code-security' END
          OR (item->>'sameStory')::BOOLEAN IS DISTINCT FROM (ordinal < 3)
          OR (item->>'confidenceScore')::NUMERIC < 0.92
          OR (item->>'confidenceScore')::NUMERIC > 1
      )
      OR jsonb_typeof(requested_artifact->'usage') <> 'object'
      OR (SELECT array_agg(key ORDER BY key)
          FROM jsonb_object_keys(requested_artifact->'usage') key)
        IS DISTINCT FROM ARRAY['inputTokens', 'outputTokens',
          'totalTokens']::TEXT[]
      OR EXISTS (SELECT FROM unnest(ARRAY[
          'inputTokens', 'outputTokens', 'totalTokens'
        ]) key WHERE jsonb_typeof(requested_artifact->'usage'->key) <> 'number')
      OR EXISTS (SELECT FROM unnest(ARRAY[
          'inputTokens', 'outputTokens', 'totalTokens'
        ]) key WHERE
          (requested_artifact->'usage'->>key)::NUMERIC % 1 <> 0)
      OR (requested_artifact->'usage'->>'inputTokens')::INTEGER <= 0
      OR (requested_artifact->'usage'->>'outputTokens')::INTEGER <= 0
      OR (requested_artifact->'usage'->>'totalTokens')::INTEGER <>
        (requested_artifact->'usage'->>'inputTokens')::INTEGER +
        (requested_artifact->'usage'->>'outputTokens')::INTEGER
      OR requested_artifact_sha256 IS DISTINCT FROM encode(sha256(convert_to(
        reader_promotion_v2_canary_control.canonical_json(requested_artifact),
        'UTF8')), 'hex')), TRUE) THEN
      RAISE EXCEPTION 'reader promotion V2 canary artifact is invalid';
    END IF;
    INSERT INTO reader_promotion_v2_canary_control.artifacts
      (singleton_id, artifact, artifact_sha256, recorded_at)
    VALUES (job.singleton_id, requested_artifact,
      requested_artifact_sha256, at_time);
  END IF;
  UPDATE reader_promotion_v2_canary_control.jobs SET
    state = 'MODEL_COMPLETED', outcome = requested_outcome,
    artifact_sha256 = requested_artifact_sha256,
    model_completed_at = at_time,
    rejection_code = CASE WHEN requested_outcome = 'EXPLICIT_FAILURE'
      THEN 'model_explicit_failure' END
  WHERE singleton_id = job.singleton_id RETURNING * INTO job;
  INSERT INTO reader_promotion_v2_canary_control.job_events
    (singleton_id, state, outcome, occurred_at)
  VALUES (job.singleton_id, 'MODEL_COMPLETED', requested_outcome, at_time);
  snapshot := reader_promotion_v2_canary_control.snapshot(job); RETURN NEXT;
END
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.assert_receipt(value JSONB)
RETURNS VOID LANGUAGE plpgsql IMMUTABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $body$
DECLARE required_keys TEXT[] := ARRAY[
  'format', 'singletonId', 'state', 'outcome', 'protectedMainSha',
  'deployedReleaseSha', 'deployedBackendSha', 'deployedControlSha',
  'deployedRuntimeSha', 'runtimeImageId', 'manifestSha256', 'schemaName',
  'schemaVersion',
  'schemaSha256', 'model', 'reasoningEffort', 'canonicalRequestSha256',
  'workflow', 'workflowRunId',
  'workflowRunAttempt', 'fence', 'runtimePackageVersion',
  'runtimePackageSha256', 'launcherSha256', 'artifactSha256', 'usage',
  'rejectionCode'
];
BEGIN
  IF COALESCE((jsonb_typeof(value) <> 'object'
    OR (SELECT array_agg(key ORDER BY key)
        FROM jsonb_object_keys(value) key)
      IS DISTINCT FROM
      (SELECT array_agg(key ORDER BY key) FROM unnest(required_keys) key)
    OR EXISTS (SELECT FROM unnest(ARRAY[
      'format', 'singletonId', 'state', 'outcome', 'protectedMainSha',
      'deployedReleaseSha', 'deployedBackendSha', 'deployedControlSha',
      'deployedRuntimeSha', 'runtimeImageId', 'manifestSha256', 'schemaName',
      'schemaVersion',
      'schemaSha256', 'model', 'reasoningEffort', 'canonicalRequestSha256',
      'workflow', 'workflowRunId', 'fence', 'runtimePackageVersion',
      'runtimePackageSha256', 'launcherSha256'
    ]) key WHERE jsonb_typeof(value->key) <> 'string')
    OR jsonb_typeof(value->'workflowRunAttempt') <> 'number'
    OR jsonb_typeof(value->'artifactSha256') NOT IN ('string', 'null')
    OR jsonb_typeof(value->'usage') NOT IN ('object', 'null')
    OR jsonb_typeof(value->'rejectionCode') NOT IN ('string', 'null')
    OR value->>'format' <>
      'reader-promotion-v2-production-canary-receipt.v1'
    OR value->>'singletonId' <>
      'reader-promotion-v2-production-canary-v1'), TRUE) THEN
    RAISE EXCEPTION 'reader promotion V2 canary receipt is invalid';
  END IF;
END
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.finalize_at(
  requested_binding JSONB, requested_receipt JSONB,
  requested_receipt_sha256 TEXT, at_time TIMESTAMPTZ
) RETURNS TABLE(snapshot JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $body$
DECLARE job reader_promotion_v2_canary_control.jobs;
DECLARE terminal_state TEXT;
BEGIN
  PERFORM reader_promotion_v2_canary_control.assert_receipt(requested_receipt);
  SELECT * INTO job FROM reader_promotion_v2_canary_control.jobs
    WHERE singleton_id = 'reader-promotion-v2-production-canary-v1' FOR UPDATE;
  IF job.binding IS DISTINCT FROM requested_binding THEN
    RAISE EXCEPTION 'reader promotion V2 canary owner or fence is stale';
  END IF;
  IF job.state IN ('SUCCEEDED', 'REJECTED') THEN
    snapshot := reader_promotion_v2_canary_control.snapshot(job); RETURN NEXT; RETURN;
  END IF;
  terminal_state := CASE WHEN job.outcome = 'RESPONSE'
    THEN 'SUCCEEDED' ELSE 'REJECTED' END;
  IF COALESCE((job.state <> 'MODEL_COMPLETED' OR requested_receipt->>'state' <>
      terminal_state OR requested_receipt->>'outcome' <> job.outcome OR
      requested_receipt->>'artifactSha256' IS DISTINCT FROM
        btrim(job.artifact_sha256) OR
      requested_receipt->>'protectedMainSha' IS DISTINCT FROM
        job.binding->>'protectedMainSha' OR
      requested_receipt->>'deployedReleaseSha' IS DISTINCT FROM
        job.binding->>'deployedReleaseSha' OR
      requested_receipt->>'deployedBackendSha' IS DISTINCT FROM
        job.binding->>'deployedBackendSha' OR
      requested_receipt->>'deployedControlSha' IS DISTINCT FROM
        job.binding->>'deployedControlSha' OR
      requested_receipt->>'deployedRuntimeSha' IS DISTINCT FROM
        job.binding->>'deployedRuntimeSha' OR
      requested_receipt->>'runtimeImageId' IS DISTINCT FROM
        job.binding->>'runtimeImageId' OR
      requested_receipt->>'manifestSha256' IS DISTINCT FROM
        job.binding->>'manifestSha256' OR
      requested_receipt->>'schemaName' IS DISTINCT FROM
        job.binding->>'schemaName' OR
      requested_receipt->>'schemaVersion' IS DISTINCT FROM
        job.binding->>'schemaVersion' OR
      requested_receipt->>'schemaSha256' IS DISTINCT FROM
        job.binding->>'schemaSha256' OR
      requested_receipt->>'model' IS DISTINCT FROM job.binding->>'model' OR
      requested_receipt->>'reasoningEffort' IS DISTINCT FROM
        job.binding->>'reasoningEffort' OR
      requested_receipt->>'canonicalRequestSha256' IS DISTINCT FROM
        job.binding->>'canonicalRequestSha256' OR
      requested_receipt->>'workflow' IS DISTINCT FROM
        job.binding->>'workflow' OR
      requested_receipt->>'workflowRunId' IS DISTINCT FROM
        job.binding->>'workflowRunId' OR
      requested_receipt->>'workflowRunAttempt' IS DISTINCT FROM
        job.binding->>'workflowRunAttempt' OR
      requested_receipt->>'fence' IS DISTINCT FROM job.binding->>'fence' OR
      requested_receipt->>'runtimePackageVersion' IS DISTINCT FROM
        job.binding->>'runtimePackageVersion' OR
      requested_receipt->>'runtimePackageSha256' IS DISTINCT FROM
        job.binding->>'runtimePackageSha256' OR
      requested_receipt->>'launcherSha256' IS DISTINCT FROM
        job.binding->>'launcherSha256' OR
      requested_receipt->>'rejectionCode' IS DISTINCT FROM CASE job.outcome
        WHEN 'RESPONSE' THEN NULL
        WHEN 'EXPLICIT_FAILURE' THEN 'model_explicit_failure'
        ELSE 'model_uncertain' END OR
      (job.outcome = 'RESPONSE' AND (
        jsonb_typeof(requested_receipt->'usage') <> 'object' OR
        (SELECT array_agg(key ORDER BY key)
          FROM jsonb_object_keys(requested_receipt->'usage') key)
          IS DISTINCT FROM ARRAY['inputTokens', 'outputTokens',
            'totalTokens']::TEXT[] OR
        EXISTS (SELECT FROM unnest(ARRAY[
            'inputTokens', 'outputTokens', 'totalTokens'
          ]) key WHERE jsonb_typeof(
            requested_receipt->'usage'->key) <> 'number') OR
        EXISTS (SELECT FROM unnest(ARRAY[
            'inputTokens', 'outputTokens', 'totalTokens'
          ]) key WHERE
            (requested_receipt->'usage'->>key)::NUMERIC % 1 <> 0) OR
        requested_receipt->'usage' IS DISTINCT FROM (
          SELECT artifact->'usage'
          FROM reader_promotion_v2_canary_control.artifacts
          WHERE singleton_id = job.singleton_id
        ) OR
        (requested_receipt->'usage'->>'inputTokens')::INTEGER <= 0 OR
        (requested_receipt->'usage'->>'outputTokens')::INTEGER <= 0 OR
        (requested_receipt->'usage'->>'totalTokens')::INTEGER <>
          (requested_receipt->'usage'->>'inputTokens')::INTEGER +
          (requested_receipt->'usage'->>'outputTokens')::INTEGER
      )) OR
      (job.outcome <> 'RESPONSE' AND requested_receipt->'usage' <> 'null') OR
      requested_receipt_sha256 !~ '^[0-9a-f]{64}$' OR
      requested_receipt_sha256 IS DISTINCT FROM encode(sha256(convert_to(
        reader_promotion_v2_canary_control.canonical_json(requested_receipt),
        'UTF8')), 'hex')), TRUE) THEN
    RAISE EXCEPTION 'reader promotion V2 canary finalization is invalid';
  END IF;
  INSERT INTO reader_promotion_v2_canary_control.receipts
    (singleton_id, receipt, receipt_sha256, recorded_at)
  VALUES (job.singleton_id, requested_receipt,
    requested_receipt_sha256, at_time);
  UPDATE reader_promotion_v2_canary_control.jobs SET
    state = terminal_state, receipt_sha256 = requested_receipt_sha256,
    terminal_at = at_time
  WHERE singleton_id = job.singleton_id RETURNING * INTO job;
  INSERT INTO reader_promotion_v2_canary_control.job_events
    (singleton_id, state, outcome, occurred_at)
  VALUES (job.singleton_id, terminal_state, job.outcome, at_time);
  snapshot := reader_promotion_v2_canary_control.snapshot(job); RETURN NEXT;
END
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.read_at(at_time TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $body$
DECLARE job reader_promotion_v2_canary_control.jobs;
BEGIN
  SELECT * INTO job FROM reader_promotion_v2_canary_control.jobs
    WHERE singleton_id = 'reader-promotion-v2-production-canary-v1' FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  job := reader_promotion_v2_canary_control.expire_locked(job, at_time);
  RETURN reader_promotion_v2_canary_control.snapshot(job);
END
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.reject_uncertain_at(
  requested_binding JSONB, at_time TIMESTAMPTZ
) RETURNS TABLE(snapshot JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $body$
DECLARE job reader_promotion_v2_canary_control.jobs;
BEGIN
  SELECT * INTO job FROM reader_promotion_v2_canary_control.jobs
    WHERE singleton_id = 'reader-promotion-v2-production-canary-v1' FOR UPDATE;
  IF job.binding IS DISTINCT FROM requested_binding OR
      job.state <> 'MODEL_RUNNING' THEN
    RAISE EXCEPTION 'reader promotion V2 canary uncertain transition is invalid';
  END IF;
  job.reconciliation_deadline := at_time;
  job := reader_promotion_v2_canary_control.expire_locked(job, at_time);
  snapshot := reader_promotion_v2_canary_control.snapshot(job);
  RETURN NEXT;
END
$body$;

-- Only these no-time wrappers are callable by the runtime role.  Their
-- authoritative claim/deadline/transition timestamps come from PostgreSQL.
CREATE FUNCTION reader_promotion_v2_canary_control.claim(
  requested_binding JSONB
) RETURNS TABLE(action TEXT, snapshot JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $body$
DECLARE at_time TIMESTAMPTZ := clock_timestamp();
BEGIN
  requested_binding := jsonb_set(requested_binding,
    '{reconciliationDeadline}', to_jsonb(at_time + INTERVAL '180 seconds'));
  RETURN QUERY SELECT * FROM reader_promotion_v2_canary_control.claim_at(
    requested_binding, at_time);
END
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.mark_model_running(
  requested_binding JSONB
) RETURNS TABLE(action TEXT, snapshot JSONB)
LANGUAGE SQL SECURITY DEFINER SET search_path = pg_catalog AS $body$
  SELECT * FROM reader_promotion_v2_canary_control.mark_model_running_at(
    requested_binding, clock_timestamp())
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.complete_model(
  requested_binding JSONB, requested_outcome TEXT, requested_artifact JSONB,
  requested_artifact_sha256 TEXT
) RETURNS TABLE(snapshot JSONB)
LANGUAGE SQL SECURITY DEFINER SET search_path = pg_catalog AS $body$
  SELECT * FROM reader_promotion_v2_canary_control.complete_model_at(
    requested_binding, requested_outcome, requested_artifact,
    requested_artifact_sha256, clock_timestamp())
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.finalize(
  requested_binding JSONB, requested_receipt JSONB,
  requested_receipt_sha256 TEXT
) RETURNS TABLE(snapshot JSONB)
LANGUAGE SQL SECURITY DEFINER SET search_path = pg_catalog AS $body$
  SELECT * FROM reader_promotion_v2_canary_control.finalize_at(
    requested_binding, requested_receipt, requested_receipt_sha256,
    clock_timestamp())
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.read()
RETURNS JSONB LANGUAGE SQL SECURITY DEFINER
SET search_path = pg_catalog AS $body$
  SELECT reader_promotion_v2_canary_control.read_at(clock_timestamp())
$body$;

CREATE FUNCTION reader_promotion_v2_canary_control.reject_uncertain(
  requested_binding JSONB
) RETURNS TABLE(snapshot JSONB)
LANGUAGE SQL SECURITY DEFINER SET search_path = pg_catalog AS $body$
  SELECT * FROM reader_promotion_v2_canary_control.reject_uncertain_at(
    requested_binding, clock_timestamp())
$body$;

ALTER FUNCTION reader_promotion_v2_canary_control.reject_immutable_mutation()
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.canonical_json(JSONB)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.snapshot(
  reader_promotion_v2_canary_control.jobs)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.assert_binding(JSONB)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.expire_locked(
  reader_promotion_v2_canary_control.jobs, TIMESTAMPTZ)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.claim_at(JSONB, TIMESTAMPTZ)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.mark_model_running_at(
  JSONB, TIMESTAMPTZ)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.complete_model_at(
  JSONB, TEXT, JSONB, TEXT, TIMESTAMPTZ)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.assert_receipt(JSONB)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.finalize_at(
  JSONB, JSONB, TEXT, TIMESTAMPTZ)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.read_at(TIMESTAMPTZ)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.reject_uncertain_at(
  JSONB, TIMESTAMPTZ)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.claim(JSONB)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.mark_model_running(JSONB)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.complete_model(
  JSONB, TEXT, JSONB, TEXT)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.finalize(JSONB, JSONB, TEXT)
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.read()
  OWNER TO social_monitor_reader_promotion_canary_owner;
ALTER FUNCTION reader_promotion_v2_canary_control.reject_uncertain(JSONB)
  OWNER TO social_monitor_reader_promotion_canary_owner;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA reader_promotion_v2_canary_control
  FROM PUBLIC, social_monitor_reader_promotion_canary_invoker;
GRANT EXECUTE ON FUNCTION
  reader_promotion_v2_canary_control.claim(JSONB),
  reader_promotion_v2_canary_control.mark_model_running(JSONB),
  reader_promotion_v2_canary_control.complete_model(
    JSONB, TEXT, JSONB, TEXT),
  reader_promotion_v2_canary_control.finalize(
    JSONB, JSONB, TEXT),
  reader_promotion_v2_canary_control.reject_uncertain(JSONB),
  reader_promotion_v2_canary_control.read()
TO social_monitor_reader_promotion_canary_invoker;

ALTER ROLE social_monitor_reader_promotion_canary_invoker
  SET search_path = pg_catalog, reader_promotion_v2_canary_control;
ALTER DEFAULT PRIVILEGES FOR ROLE social_monitor_reader_promotion_canary_owner
  IN SCHEMA reader_promotion_v2_canary_control REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE social_monitor_reader_promotion_canary_owner
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

DO $memberships$
DECLARE granted_role TEXT;
BEGIN
  FOR granted_role IN
    SELECT granted.rolname FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_catalog.pg_roles recipient ON recipient.oid = membership.member
    WHERE recipient.rolname = CURRENT_USER AND granted.rolname IN (
      'social_monitor_reader_promotion_canary_owner',
      'social_monitor_reader_promotion_canary_invoker'
    )
  LOOP
    EXECUTE format('REVOKE %I FROM %I', granted_role, CURRENT_USER);
  END LOOP;
  IF EXISTS (
    SELECT FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_catalog.pg_roles recipient ON recipient.oid = membership.member
    WHERE granted.rolname IN (
      'social_monitor_reader_promotion_canary_owner',
      'social_monitor_reader_promotion_canary_invoker'
    ) OR recipient.rolname IN (
      'social_monitor_reader_promotion_canary_owner',
      'social_monitor_reader_promotion_canary_invoker'
    )
  ) THEN
    RAISE EXCEPTION 'reader promotion V2 canary roles must have no memberships';
  END IF;
END
$memberships$;

COMMIT;
