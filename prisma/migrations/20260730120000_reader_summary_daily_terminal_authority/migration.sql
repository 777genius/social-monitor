-- @social-monitor-forward-migration
-- Generic database authority for durable daily terminal decisions.
BEGIN;
SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
DO $revoke_daily_terminal_runtime_job_acl$
DECLARE
  v_runtime_role NAME;
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
  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON TABLE reader_summary_jobs FROM %I',
    v_runtime_role
  );
  REVOKE ALL PRIVILEGES ON TABLE "reader_summary_jobs"
  FROM "social_monitor_reader_summary_publication_runtime";
END
$revoke_daily_terminal_runtime_job_acl$;
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
ALTER TABLE "reader_summary_production_recovery_days"
  DROP CONSTRAINT IF EXISTS
    "reader_summary_production_recovery_days_date_check";
CREATE FUNCTION "reader_summary_daily_terminal_authority"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE
)
RETURNS TABLE (
  authority_record JSONB,
  authority_bytes BYTEA,
  authority_sha256 TEXT,
  evidence_sha256 TEXT
)
LANGUAGE plpgsql
STABLE
STRICT
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_authority JSONB;
  v_bytes BYTEA;
  v_day "reader_summary_production_recovery_days"%ROWTYPE;
  v_source_valid BOOLEAN;
BEGIN
  SELECT day.*
  INTO STRICT v_day
  FROM "reader_summary_production_recovery_days" AS day
  WHERE day."tenant_id" = target_tenant_id
    AND day."workspace_id" = target_workspace_id
    AND day."requested_utc_date" = target_date
  ORDER BY day."recovery_id", day."requested_utc_date"
  LIMIT 1;
  v_source_valid :=
    v_day."canonical_bytes" = convert_to(
      "reader_summary_production_recovery_canonical_json"(
        v_day."canonical_record"
      ),
      'UTF8'
    )
    AND btrim(v_day."canonical_sha256") = encode(
      sha256(v_day."canonical_bytes"),
      'hex'
    )
    AND v_day."canonical_record"->>'tenantId'
      = target_tenant_id::TEXT
    AND v_day."canonical_record"->>'workspaceId'
      = target_workspace_id::TEXT
    AND v_day."canonical_record"->>'requestedUtcDate'
      = to_char(target_date, 'YYYY-MM-DD')
    AND v_day."canonical_record"->>'schemaVersion'
      = 'reader_summary.production_recovery_day.v2'
    AND v_day."canonical_record"->>'recoveryId'
      = v_day."recovery_id"::TEXT
    AND v_day."canonical_record"->'providerCounts'
      = v_day."provider_counts"
    AND v_day."canonical_record"->>'providerEvidenceSha256'
      = btrim(v_day."provider_evidence_sha256")
    AND btrim(v_day."provider_evidence_sha256") = encode(sha256(convert_to(
      "reader_summary_production_recovery_canonical_json"(
        v_day."canonical_record"->'providerEvidenceDigests'
      ),
      'UTF8'
    )), 'hex')
    AND jsonb_typeof(v_day."provider_counts") = 'array'
    AND jsonb_typeof(v_day."provider_evidence") = 'object'
    AND jsonb_typeof(
      v_day."canonical_record"->'providerEvidenceDigests'
    ) = 'array'
    AND jsonb_array_length(v_day."provider_counts")
      = jsonb_object_length(v_day."provider_evidence")
    AND jsonb_array_length(v_day."provider_counts")
      = jsonb_array_length(
        v_day."canonical_record"->'providerEvidenceDigests'
      )
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_day."provider_counts") AS count_entry(value)
      WHERE jsonb_typeof(count_entry.value) <> 'object'
        OR jsonb_object_length(count_entry.value) <> 2
        OR NOT count_entry.value ?& ARRAY['providerKey', 'count']
        OR btrim(COALESCE(count_entry.value->>'providerKey', '')) = ''
        OR count_entry.value->>'count' !~ '^(0|[1-9][0-9]*)$'
        OR jsonb_typeof(
          v_day."provider_evidence"->(count_entry.value->>'providerKey')
        ) <> 'array'
        OR jsonb_array_length(
          v_day."provider_evidence"->(count_entry.value->>'providerKey')
        ) <> (count_entry.value->>'count')::INTEGER
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            v_day."provider_evidence"
              ->(count_entry.value->>'providerKey')
          ) AS source(value)
          WHERE source.value->>'providerKey'
              <> count_entry.value->>'providerKey'
            OR source.value->>'sourceItemId' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            OR source.value->>'sourceBindingId' !~
              '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            v_day."canonical_record"->'providerEvidenceDigests'
          ) AS digest(value)
          WHERE digest.value->>'providerKey'
              = count_entry.value->>'providerKey'
            AND digest.value->>'count' = count_entry.value->>'count'
            AND digest.value->>'sha256' = encode(sha256(convert_to(
              "reader_summary_production_recovery_canonical_json"(
                v_day."provider_evidence"
                  ->(count_entry.value->>'providerKey')
              ),
              'UTF8'
            )), 'hex')
        )
    )
    AND (
      SELECT count(*) = count(DISTINCT count_entry.value->>'providerKey')
      FROM jsonb_array_elements(v_day."provider_counts") AS count_entry(value)
    );
  v_authority := jsonb_build_object(
    'schemaVersion', 'reader_summary.daily_terminal_authority.v2',
    'tenantId', target_tenant_id::TEXT,
    'workspaceId', target_workspace_id::TEXT,
    'requestedUtcDate', to_char(target_date, 'YYYY-MM-DD'),
    'sourceRecoveryId', v_day."recovery_id"::TEXT,
    'sourceCanonicalSha256', btrim(v_day."canonical_sha256"),
    'providerEvidenceSha256', btrim(v_day."provider_evidence_sha256"),
    'providerCounts', v_day."provider_counts",
    'sourceAuthorityAvailable', v_source_valid,
    'deficits', CASE
      WHEN v_source_valid THEN '[]'::JSONB
      ELSE jsonb_build_array(jsonb_build_object(
        'code', 'SOURCE_AUTHORITY_INVALID',
        'detail', 'stored source bytes, digest, scope, counts, or evidence diverged'
      ))
    END,
    'terminalAuthorityModelCallPerformed', FALSE
  );
  v_bytes := convert_to(
    "reader_summary_production_recovery_canonical_json"(v_authority),
    'UTF8'
  );
  RETURN QUERY SELECT
    v_authority,
    v_bytes,
    encode(sha256(v_bytes), 'hex'),
    btrim(v_day."canonical_sha256");
END;
$$;
CREATE FUNCTION "claim_reader_summary_daily_terminal"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_attempt_id UUID,
  resume_token TEXT DEFAULT NULL
)
RETURNS TABLE (
  outcome TEXT,
  requested_utc_date DATE,
  authority_sha256 TEXT,
  evidence_sha256 TEXT,
  claim_token TEXT,
  fencing BIGINT,
  expires_at TIMESTAMPTZ(6),
  terminal_seal_sha256 TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attempt TEXT := target_attempt_id::TEXT;
  v_authority RECORD;
  v_claim "reader_summary_production_recovery_leases"%ROWTYPE;
  v_claim_bytes BYTEA;
  v_claim_record JSONB;
  v_date DATE;
  v_expires TIMESTAMPTZ(6);
  v_fencing BIGINT;
  v_now TIMESTAMPTZ(6) := clock_timestamp();
  v_terminal "reader_summary_production_recovery_leases"%ROWTYPE;
  v_token TEXT;
  v_token_digest TEXT;
BEGIN
  IF target_tenant_id IS NULL
    OR target_workspace_id IS NULL
    OR target_attempt_id IS NULL
    OR current_setting('social_monitor.tenant_id', TRUE)
      IS DISTINCT FROM target_tenant_id::TEXT
    OR current_setting('social_monitor.workspace_id', TRUE)
      IS DISTINCT FROM target_workspace_id::TEXT
    OR current_setting('social_monitor.system_access', TRUE)
      IS DISTINCT FROM 'false'
    OR NOT pg_has_role(
      session_user,
      'social_monitor_reader_summary_publication_runtime',
      'USAGE'
    ) THEN
    RAISE EXCEPTION 'daily terminal session scope is invalid';
  END IF;
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'daily terminal claim transaction is invalid';
  END IF;
  SELECT lease.*
  INTO v_terminal
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."state" = 'CONSUMED'
    AND lease."canonical_record"->>'schemaVersion'
      = 'reader_summary.daily_terminal_seal.v2'
    AND lease."canonical_record"->>'attemptId' = v_attempt
  ORDER BY lease."consumed_at", lease."id"
  LIMIT 1;
  IF FOUND THEN
    IF v_terminal."canonical_bytes" <> convert_to(
        "reader_summary_production_recovery_canonical_json"(
          v_terminal."canonical_record"
        ),
        'UTF8'
      )
      OR btrim(v_terminal."canonical_sha256") <> encode(
        sha256(v_terminal."canonical_bytes"),
        'hex'
      )
      OR v_terminal."canonical_record"->>'tenantId'
        <> target_tenant_id::TEXT
      OR v_terminal."canonical_record"->>'workspaceId'
        <> target_workspace_id::TEXT THEN
      RAISE EXCEPTION 'daily terminal replay bytes or hash diverged';
    END IF;
    RETURN QUERY SELECT
      'replayed'::TEXT,
      (v_terminal."canonical_record"->>'requestedUtcDate')::DATE,
      v_terminal."canonical_record"->>'authoritySha256',
      v_terminal."canonical_record"->>'evidenceSha256',
      NULL::TEXT,
      (v_terminal."canonical_record"->>'fencing')::BIGINT,
      NULL::TIMESTAMPTZ,
      btrim(v_terminal."canonical_sha256");
    RETURN;
  END IF;
  PERFORM workspace."id"
  FROM "workspaces" AS workspace
  WHERE workspace."tenant_id" = target_tenant_id
    AND workspace."id" = target_workspace_id
    AND workspace."deleted_at" IS NULL
  ORDER BY workspace."tenant_id", workspace."id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily terminal workspace binding is invalid';
  END IF;
  SELECT day."requested_utc_date"
  INTO v_date
  FROM "reader_summary_production_recovery_days" AS day
  WHERE day."tenant_id" = target_tenant_id
    AND day."workspace_id" = target_workspace_id
    AND NOT EXISTS (
      SELECT 1
      FROM "reader_summary_production_recovery_leases" AS terminal
      WHERE terminal."tenant_id" = target_tenant_id
        AND terminal."workspace_id" = target_workspace_id
        AND terminal."state" = 'CONSUMED'
        AND terminal."canonical_record"->>'schemaVersion'
          = 'reader_summary.daily_terminal_seal.v2'
        AND terminal."canonical_record"->>'requestedUtcDate'
          = to_char(day."requested_utc_date", 'YYYY-MM-DD')
    )
  ORDER BY day."requested_utc_date", day."recovery_id"
  LIMIT 1;
  IF v_date IS NULL THEN
    RAISE EXCEPTION 'daily terminal source authority is fully resolved';
  END IF;
  SELECT lease.*
  INTO v_claim
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."state" = 'ISSUED'
    AND lease."canonical_record"->>'schemaVersion'
      = 'reader_summary.daily_terminal_claim.v2'
    AND lease."canonical_record"->>'requestedUtcDate'
      = to_char(v_date, 'YYYY-MM-DD')
  ORDER BY lease."issued_at", lease."id"
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF v_claim."canonical_bytes" <> convert_to(
        "reader_summary_production_recovery_canonical_json"(
          v_claim."canonical_record"
        ),
        'UTF8'
      )
      OR btrim(v_claim."canonical_sha256") <> encode(
        sha256(v_claim."canonical_bytes"),
        'hex'
      )
      OR v_claim."canonical_record"->>'tenantId'
        <> target_tenant_id::TEXT
      OR v_claim."canonical_record"->>'workspaceId'
        <> target_workspace_id::TEXT THEN
      RAISE EXCEPTION 'daily terminal claim bytes or hash diverged';
    END IF;
    IF (v_claim."canonical_record"->>'expiresAt')::TIMESTAMPTZ > v_now THEN
      IF v_claim."canonical_record"->>'attemptId' = v_attempt
        AND resume_token IS NOT NULL
        AND encode(sha256(convert_to(resume_token, 'UTF8')), 'hex')
          = v_claim."canonical_record"->>'tokenDigest' THEN
        RETURN QUERY SELECT
          'resume_same_attempt'::TEXT,
          v_date,
          v_claim."canonical_record"->>'authoritySha256',
          v_claim."canonical_record"->>'evidenceSha256',
          resume_token,
          (v_claim."canonical_record"->>'fencing')::BIGINT,
          (v_claim."canonical_record"->>'expiresAt')::TIMESTAMPTZ,
          NULL::TEXT;
      ELSE
        RETURN QUERY SELECT
          'busy'::TEXT,
          v_date,
          v_claim."canonical_record"->>'authoritySha256',
          v_claim."canonical_record"->>'evidenceSha256',
          NULL::TEXT,
          (v_claim."canonical_record"->>'fencing')::BIGINT,
          (v_claim."canonical_record"->>'expiresAt')::TIMESTAMPTZ,
          NULL::TEXT;
      END IF;
      RETURN;
    END IF;
    PERFORM set_config('social_monitor.production_recovery_write', 'on', TRUE);
    UPDATE "reader_summary_production_recovery_leases"
    SET "state" = 'CONSUMED', "consumed_at" = v_now
    WHERE "id" = v_claim."id"
      AND "state" = 'ISSUED';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'daily terminal expired claim fence was lost';
    END IF;
  END IF;
  SELECT *
  INTO STRICT v_authority
  FROM "reader_summary_daily_terminal_authority"(
    target_tenant_id,
    target_workspace_id,
    v_date
  );
  SELECT COALESCE(max(
    (prior."canonical_record"->>'fencing')::BIGINT
  ), 0) + 1
  INTO v_fencing
  FROM "reader_summary_production_recovery_leases" AS prior
  WHERE prior."tenant_id" = target_tenant_id
    AND prior."workspace_id" = target_workspace_id
    AND prior."canonical_record"->>'schemaVersion'
      = 'reader_summary.daily_terminal_claim.v2'
    AND prior."canonical_record"->>'requestedUtcDate'
      = to_char(v_date, 'YYYY-MM-DD');
  v_token := encode(sha256(convert_to(
    gen_random_uuid()::TEXT || gen_random_uuid()::TEXT ||
      gen_random_uuid()::TEXT,
    'UTF8'
  )), 'hex');
  v_token_digest := encode(sha256(convert_to(v_token, 'UTF8')), 'hex');
  v_expires := v_now + INTERVAL '15 minutes';
  v_claim_record := jsonb_build_object(
    'schemaVersion', 'reader_summary.daily_terminal_claim.v2',
    'tenantId', target_tenant_id::TEXT,
    'workspaceId', target_workspace_id::TEXT,
    'requestedUtcDate', to_char(v_date, 'YYYY-MM-DD'),
    'attemptId', v_attempt,
    'authoritySha256', v_authority.authority_sha256,
    'evidenceSha256', v_authority.evidence_sha256,
    'tokenDigest', v_token_digest,
    'fencing', v_fencing,
    'expiresAt', to_char(
      v_expires AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );
  v_claim_bytes := convert_to(
    "reader_summary_production_recovery_canonical_json"(v_claim_record),
    'UTF8'
  );
  PERFORM set_config('social_monitor.production_recovery_write', 'on', TRUE);
  BEGIN
    INSERT INTO "reader_summary_production_recovery_leases" (
      "id", "tenant_id", "workspace_id", "identity", "state",
      "canonical_record", "canonical_bytes", "canonical_sha256",
      "issued_at", "consumed_at"
    ) VALUES (
      gen_random_uuid(),
      target_tenant_id,
      target_workspace_id,
      'daily-terminal-claim:v2:' || target_tenant_id || ':' ||
        target_workspace_id || ':' || to_char(v_date, 'YYYY-MM-DD') ||
        ':' || v_fencing,
      'ISSUED',
      v_claim_record,
      v_claim_bytes,
      encode(sha256(v_claim_bytes), 'hex'),
      v_now,
      NULL
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'daily terminal concurrent claim requires retry'
        USING ERRCODE = '40001';
  END;
  RETURN QUERY SELECT
    'acquired'::TEXT,
    v_date,
    v_authority.authority_sha256,
    v_authority.evidence_sha256,
    v_token,
    v_fencing,
    v_expires,
    NULL::TEXT;
END;
$$;
CREATE FUNCTION "finalize_reader_summary_daily_terminal"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_authority_sha256 TEXT,
  target_claim_token TEXT,
  target_evidence_sha256 TEXT,
  target_fencing BIGINT
)
RETURNS TABLE (
  outcome TEXT,
  requested_utc_date DATE,
  terminal_status TEXT,
  generation_disposition TEXT,
  authority_sha256 TEXT,
  evidence_sha256 TEXT,
  terminal_seal_sha256 TEXT,
  terminal_bytes BYTEA,
  terminal_record JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_artifact "reader_summary_artifacts"%ROWTYPE;
  v_authority RECORD;
  v_claim "reader_summary_production_recovery_leases"%ROWTYPE;
  v_date DATE;
  v_day "reader_summary_production_recovery_days"%ROWTYPE;
  v_deficits JSONB := '[]'::JSONB;
  v_durable BOOLEAN := FALSE;
  v_evidence "reader_summary_weekly_publication_evidence"%ROWTYPE;
  v_exact BOOLEAN := FALSE;
  v_job "reader_summary_jobs"%ROWTYPE;
  v_now TIMESTAMPTZ(6) := clock_timestamp();
  v_publication "reader_summary_publications"%ROWTYPE;
  v_publication_binding RECORD;
  v_quality BOOLEAN := FALSE;
  v_record JSONB;
  v_source_bound BOOLEAN := FALSE;
  v_source_valid BOOLEAN;
  v_status TEXT;
  v_terminal "reader_summary_production_recovery_leases"%ROWTYPE;
  v_terminal_bytes BYTEA;
  v_terminal_id UUID;
  v_terminal_sha TEXT;
  v_token_digest TEXT;
BEGIN
  IF target_tenant_id IS NULL
    OR target_workspace_id IS NULL
    OR target_date IS NULL
    OR current_setting('social_monitor.tenant_id', TRUE)
      IS DISTINCT FROM target_tenant_id::TEXT
    OR current_setting('social_monitor.workspace_id', TRUE)
      IS DISTINCT FROM target_workspace_id::TEXT
    OR current_setting('social_monitor.system_access', TRUE)
      IS DISTINCT FROM 'false'
    OR NOT pg_has_role(
      session_user,
      'social_monitor_reader_summary_publication_runtime',
      'USAGE'
    ) THEN
    RAISE EXCEPTION 'daily terminal session scope is invalid';
  END IF;
  IF current_setting('transaction_isolation') <> 'serializable'
    OR target_authority_sha256 !~ '^[0-9a-f]{64}$'
    OR target_evidence_sha256 !~ '^[0-9a-f]{64}$'
    OR length(COALESCE(target_claim_token, '')) <> 64
    OR target_fencing IS NULL
    OR target_fencing < 1 THEN
    RAISE EXCEPTION 'daily terminal finalization binding is invalid';
  END IF;
  v_token_digest := encode(
    sha256(convert_to(target_claim_token, 'UTF8')),
    'hex'
  );
  SELECT lease.*
  INTO v_terminal
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."state" = 'CONSUMED'
    AND lease."canonical_record"->>'schemaVersion'
      = 'reader_summary.daily_terminal_seal.v2'
    AND lease."canonical_record"->>'requestedUtcDate'
      = to_char(target_date, 'YYYY-MM-DD')
  ORDER BY lease."consumed_at", lease."id"
  LIMIT 1;
  IF FOUND THEN
    IF v_terminal."canonical_bytes" <> convert_to(
        "reader_summary_production_recovery_canonical_json"(
          v_terminal."canonical_record"
        ),
        'UTF8'
      )
      OR btrim(v_terminal."canonical_sha256") <> encode(
        sha256(v_terminal."canonical_bytes"),
        'hex'
      )
      OR v_terminal."canonical_record"->>'tenantId'
        <> target_tenant_id::TEXT
      OR v_terminal."canonical_record"->>'workspaceId'
        <> target_workspace_id::TEXT
      OR v_terminal."canonical_record"->>'authoritySha256'
        <> target_authority_sha256
      OR v_terminal."canonical_record"->>'evidenceSha256'
        <> target_evidence_sha256
      OR v_terminal."canonical_record"->>'tokenDigest' <> v_token_digest
      OR (v_terminal."canonical_record"->>'fencing')::BIGINT
        <> target_fencing THEN
      RAISE EXCEPTION 'daily terminal replay bytes, hash, or binding diverged';
    END IF;
    RETURN QUERY SELECT
      'replayed'::TEXT,
      target_date,
      v_terminal."canonical_record"->>'terminalStatus',
      v_terminal."canonical_record"->>'generationDisposition',
      target_authority_sha256,
      target_evidence_sha256,
      btrim(v_terminal."canonical_sha256"),
      v_terminal."canonical_bytes",
      v_terminal."canonical_record";
    RETURN;
  END IF;
  IF current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'daily terminal non-replay requires a writable transaction';
  END IF;
  PERFORM workspace."id"
  FROM "workspaces" AS workspace
  WHERE workspace."tenant_id" = target_tenant_id
    AND workspace."id" = target_workspace_id
    AND workspace."deleted_at" IS NULL
  ORDER BY workspace."tenant_id", workspace."id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily terminal workspace binding is invalid';
  END IF;
  SELECT day."requested_utc_date"
  INTO v_date
  FROM "reader_summary_production_recovery_days" AS day
  WHERE day."tenant_id" = target_tenant_id
    AND day."workspace_id" = target_workspace_id
    AND NOT EXISTS (
      SELECT 1
      FROM "reader_summary_production_recovery_leases" AS terminal
      WHERE terminal."tenant_id" = target_tenant_id
        AND terminal."workspace_id" = target_workspace_id
        AND terminal."state" = 'CONSUMED'
        AND terminal."canonical_record"->>'schemaVersion'
          = 'reader_summary.daily_terminal_seal.v2'
        AND terminal."canonical_record"->>'requestedUtcDate'
          = to_char(day."requested_utc_date", 'YYYY-MM-DD')
    )
  ORDER BY day."requested_utc_date", day."recovery_id"
  LIMIT 1;
  IF v_date IS DISTINCT FROM target_date THEN
    RAISE EXCEPTION 'daily terminal date skipping is forbidden';
  END IF;
  SELECT lease.*
  INTO v_claim
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."state" = 'ISSUED'
    AND lease."canonical_record"->>'schemaVersion'
      = 'reader_summary.daily_terminal_claim.v2'
    AND lease."canonical_record"->>'requestedUtcDate'
      = to_char(target_date, 'YYYY-MM-DD')
    AND (lease."canonical_record"->>'fencing')::BIGINT = target_fencing
  ORDER BY lease."issued_at", lease."id"
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND
    OR v_claim."canonical_bytes" <> convert_to(
      "reader_summary_production_recovery_canonical_json"(
        v_claim."canonical_record"
      ),
      'UTF8'
    )
    OR btrim(v_claim."canonical_sha256") <> encode(
      sha256(v_claim."canonical_bytes"),
      'hex'
    )
    OR v_claim."canonical_record"->>'tokenDigest' <> v_token_digest
    OR v_claim."canonical_record"->>'authoritySha256'
      <> target_authority_sha256
    OR v_claim."canonical_record"->>'evidenceSha256'
      <> target_evidence_sha256
    OR (v_claim."canonical_record"->>'expiresAt')::TIMESTAMPTZ <= v_now THEN
    RAISE EXCEPTION 'daily terminal claim token or fence is stale';
  END IF;
  SELECT *
  INTO STRICT v_authority
  FROM "reader_summary_daily_terminal_authority"(
    target_tenant_id,
    target_workspace_id,
    target_date
  );
  IF v_authority.authority_sha256 <> target_authority_sha256
    OR v_authority.evidence_sha256 <> target_evidence_sha256
    OR encode(sha256(v_authority.authority_bytes), 'hex')
      <> v_authority.authority_sha256
    OR v_authority.authority_bytes <> convert_to(
      "reader_summary_production_recovery_canonical_json"(
        v_authority.authority_record
      ),
      'UTF8'
    ) THEN
    RAISE EXCEPTION 'daily terminal authority bytes or binding diverged';
  END IF;
  v_source_valid := COALESCE(
    (v_authority.authority_record->>'sourceAuthorityAvailable')::BOOLEAN,
    FALSE
  );
  SELECT day.*
  INTO STRICT v_day
  FROM "reader_summary_production_recovery_days" AS day
  WHERE day."tenant_id" = target_tenant_id
    AND day."workspace_id" = target_workspace_id
    AND day."requested_utc_date" = target_date
  ORDER BY day."recovery_id", day."requested_utc_date"
  LIMIT 1
  FOR SHARE;
  SELECT
    evidence AS evidence,
    publication AS publication,
    artifact AS artifact,
    job AS job
  INTO v_publication_binding
  FROM "reader_summary_weekly_publication_evidence" AS evidence
  JOIN "reader_summary_publications" AS publication
    ON publication."id" = evidence."publication_id"
  JOIN "reader_summary_artifacts" AS artifact
    ON artifact."id" = evidence."reader_summary_artifact_id"
  JOIN "reader_summary_jobs" AS job
    ON job."id" = evidence."reader_summary_job_id"
  JOIN "reader_summary_publication_slots" AS slot
    ON slot."tenant_id" = evidence."tenant_id"
    AND slot."workspace_id" = evidence."workspace_id"
    AND slot."scope_type" = evidence."scope_type"
    AND slot."scope_key" = evidence."scope_key"
    AND slot."cadence" = evidence."cadence"
    AND slot."period_started_at" = evidence."period_started_at"
    AND slot."period_ended_at" = evidence."period_ended_at"
    AND slot."period_timezone" = evidence."period_timezone"
    AND slot."current_publication_id" = evidence."publication_id"
  WHERE evidence."tenant_id" = target_tenant_id
    AND evidence."workspace_id" = target_workspace_id
    AND evidence."scope_type" = 'workspace'
    AND evidence."scope_key" = 'workspace'
    AND evidence."cadence" = 'daily'
    AND evidence."requested_utc_date" = target_date
  ORDER BY evidence."publication_id"
  LIMIT 1
  FOR SHARE OF evidence, publication, artifact, job, slot;
  v_evidence := v_publication_binding.evidence;
  v_publication := v_publication_binding.publication;
  v_artifact := v_publication_binding.artifact;
  v_job := v_publication_binding.job;
  IF v_evidence."publication_id" IS NOT NULL THEN
    v_durable :=
      v_job."tenant_id" = target_tenant_id
      AND v_job."workspace_id" = target_workspace_id
      AND v_job."scope_type" = 'workspace' AND v_job."scope_key" = 'workspace'
      AND v_job."cadence" = 'daily' AND v_job."period_timezone" = 'UTC'
      AND v_job."period_started_at" =
        target_date::TIMESTAMP AT TIME ZONE 'UTC'
      AND v_job."period_ended_at" =
        (target_date + 1)::TIMESTAMP AT TIME ZONE 'UTC'
      AND v_job."status" = v_publication."semantic_status"
      AND v_job."status" IN ('COMPLETED', 'NO_SIGNAL')
      AND v_job."started_at" IS NOT NULL
      AND v_job."completed_at" IS NOT NULL
      AND v_job."completed_at" >= v_job."started_at"
      AND v_job."failed_at" IS NULL
      AND v_job."reader_summary_artifact_id" = v_artifact."id"
      AND v_evidence."reader_summary_job_id" = v_job."id"
      AND v_evidence."reader_summary_artifact_id" = v_artifact."id";
    v_quality :=
      v_artifact."tenant_id" = target_tenant_id
      AND v_artifact."workspace_id" = target_workspace_id
      AND v_artifact."scope_type" = 'workspace'
      AND v_artifact."scope_key" = 'workspace'
      AND v_artifact."cadence" = 'daily'
      AND v_artifact."period_timezone" = 'UTC'
      AND v_artifact."period_started_at" =
        target_date::TIMESTAMP AT TIME ZONE 'UTC'
      AND v_artifact."period_ended_at" =
        (target_date + 1)::TIMESTAMP AT TIME ZONE 'UTC'
      AND v_artifact."status" = v_publication."semantic_status"
      AND v_artifact."quality_signals"->'publicationDecision'
          ->>'qualityPassed' = 'true'
      AND jsonb_typeof(v_artifact."quality_signals"->'qualityFlags')
        = 'array'
      AND v_artifact."artifact_payload"->'qualityFlags'
        = v_artifact."quality_signals"->'qualityFlags'
      AND btrim(v_evidence."artifact_payload_sha256") = encode(sha256(
        convert_to("reader_summary_production_recovery_canonical_json"(
          v_artifact."artifact_payload"
        ), 'UTF8')
      ), 'hex');
    v_exact :=
      v_publication."tenant_id" = target_tenant_id
      AND v_publication."workspace_id" = target_workspace_id
      AND v_publication."scope_type" = 'workspace'
      AND v_publication."scope_key" = 'workspace'
      AND v_publication."cadence" = 'daily'
      AND v_publication."requested_utc_date" = target_date
      AND v_publication."period_timezone" = 'UTC'
      AND v_publication."period_started_at" =
        target_date::TIMESTAMP AT TIME ZONE 'UTC'
      AND v_publication."period_ended_at" =
        (target_date + 1)::TIMESTAMP AT TIME ZONE 'UTC'
      AND v_publication."publication_kind" = 'EXACT'
      AND v_publication."exact_proof" = v_evidence."exact_proof"
      AND btrim(v_publication."proof_sha256")
        = btrim(v_evidence."proof_sha256")
      AND btrim(v_evidence."proof_sha256") = encode(sha256(convert_to(
        "reader_summary_production_recovery_canonical_json"(
          v_evidence."exact_proof"
        ),
        'UTF8'
      )), 'hex')
      AND btrim(v_publication."report_sha256")
        = btrim(v_evidence."report_sha256")
      AND btrim(v_evidence."report_sha256") = encode(sha256(convert_to(
        "reader_summary_production_recovery_canonical_json"(
          v_evidence."report"
        ),
        'UTF8'
      )), 'hex')
      AND v_evidence."exact_proof"->>'schemaVersion'
        = 'reader_summary.publication_proof.v1'
      AND v_evidence."exact_proof"->>'tenantId'
        = target_tenant_id::TEXT
      AND v_evidence."exact_proof"->>'workspaceId'
        = target_workspace_id::TEXT
      AND v_evidence."exact_proof"->>'requestedUtcDate'
        = to_char(target_date, 'YYYY-MM-DD')
      AND v_evidence."exact_proof"->>'readerSummaryJobId'
        = v_job."id"::TEXT
      AND v_evidence."exact_proof"->>'readerSummaryArtifactId'
        = v_artifact."id"::TEXT
      AND v_evidence."exact_proof"->>'semanticStatus'
        = v_publication."semantic_status"::TEXT
      AND v_evidence."exact_proof"->>'reportSha256'
        = btrim(v_publication."report_sha256");
    v_source_bound :=
      v_evidence."canonical_bytes" = convert_to(
        "reader_summary_production_recovery_canonical_json"(
          v_evidence."canonical_record"
        ),
        'UTF8'
      )
      AND btrim(v_evidence."canonical_sha256") = encode(
        sha256(v_evidence."canonical_bytes"),
        'hex'
      )
      AND v_evidence."canonical_record"->>'schemaVersion'
        = 'reader_summary.weekly_publication_evidence.v1'
      AND v_evidence."canonical_record"->'providerCounts'
        = v_day."provider_counts"
      AND v_evidence."canonical_record"->>'publicationId'
        = v_publication."id"::TEXT
      AND v_evidence."canonical_record"->>'artifactId'
        = v_artifact."id"::TEXT
      AND v_evidence."canonical_record"->>'jobId' = v_job."id"::TEXT
      AND v_evidence."canonical_record"->>'tenantId'
        = target_tenant_id::TEXT
      AND v_evidence."canonical_record"->>'workspaceId'
        = target_workspace_id::TEXT
      AND v_evidence."canonical_record"->>'requestedUtcDate'
        = to_char(target_date, 'YYYY-MM-DD')
      AND v_evidence."period_timezone" = 'UTC'
      AND v_evidence."period_started_at" =
        target_date::TIMESTAMP AT TIME ZONE 'UTC'
      AND v_evidence."period_ended_at" =
        (target_date + 1)::TIMESTAMP AT TIME ZONE 'UTC'
      AND v_evidence."canonical_record"->>'providerEvidenceSha256'
        = btrim(v_evidence."provider_evidence_sha256")
      AND btrim(v_evidence."provider_evidence_sha256") = encode(sha256(
        convert_to("reader_summary_production_recovery_canonical_json"(
          v_evidence."provider_evidence"
        ), 'UTF8')
      ), 'hex')
      AND NOT EXISTS (
        SELECT 1
        FROM (
          SELECT provider.key AS provider_key,
            source.value->>'sourceItemId' AS source_item_id,
            source.value->>'sourceBindingId' AS source_binding_id,
            count(*) AS multiplicity
          FROM jsonb_each(v_day."provider_evidence") AS provider(key, value)
          CROSS JOIN LATERAL jsonb_array_elements(provider.value) AS source(value)
          GROUP BY 1, 2, 3
        ) AS day_source
        FULL JOIN (
          SELECT source.value->>'providerKey' AS provider_key,
            source.value->>'sourceItemId' AS source_item_id,
            source.value->>'sourceBindingId' AS source_binding_id,
            count(*) AS multiplicity
          FROM jsonb_array_elements(
            v_evidence."provider_evidence"
          ) AS source(value)
          GROUP BY 1, 2, 3
        ) AS publication_source
          USING (provider_key, source_item_id, source_binding_id)
        WHERE day_source.multiplicity
          IS DISTINCT FROM publication_source.multiplicity
      );
  END IF;
  IF NOT v_source_valid THEN
    v_deficits := v_authority.authority_record->'deficits';
  END IF;
  IF NOT v_durable THEN
    v_deficits := v_deficits || jsonb_build_array(jsonb_build_object(
      'code', 'DURABLE_EXECUTION_ATTESTATION_UNAVAILABLE',
      'detail', 'no terminal durable job is bound to the publication'
    ));
  END IF;
  IF NOT v_quality THEN
    v_deficits := v_deficits || jsonb_build_array(jsonb_build_object(
      'code', 'QUALITY_AUTHORIZATION_UNAVAILABLE',
      'detail', 'no quality-authorized artifact is bound to the publication'
    ));
  END IF;
  IF NOT v_exact THEN
    v_deficits := v_deficits || jsonb_build_array(jsonb_build_object(
      'code', 'EXACT_PROOF_UNAVAILABLE',
      'detail', 'the exact publication proof or digest is unavailable'
    ));
  END IF;
  IF NOT v_source_bound THEN
    v_deficits := v_deficits || jsonb_build_array(jsonb_build_object(
      'code', 'SOURCE_MULTISET_BINDING_UNAVAILABLE',
      'detail', 'publication source tuple multiplicities do not match authority'
    ));
  END IF;
  IF NOT v_source_valid THEN
    v_status := 'UNAVAILABLE';
  ELSIF v_durable AND v_quality AND v_exact AND v_source_bound THEN
    v_status := 'COMPLETE';
  ELSE
    v_status := 'PARTIAL';
  END IF;
  v_record := jsonb_build_object(
    'schemaVersion', 'reader_summary.daily_terminal_seal.v2',
    'tenantId', target_tenant_id::TEXT,
    'workspaceId', target_workspace_id::TEXT,
    'requestedUtcDate', to_char(target_date, 'YYYY-MM-DD'),
    'attemptId', v_claim."canonical_record"->>'attemptId',
    'fencing', target_fencing,
    'tokenDigest', v_token_digest,
    'authoritySha256', target_authority_sha256,
    'evidenceSha256', target_evidence_sha256,
    'sourceCanonicalSha256',
      v_authority.authority_record->>'sourceCanonicalSha256',
    'providerEvidenceSha256',
      v_authority.authority_record->>'providerEvidenceSha256',
    'providerCounts', v_authority.authority_record->'providerCounts',
    'terminalStatus', v_status,
    'generationDisposition', CASE
      WHEN v_durable
        THEN 'DURABLE_EXECUTION_ATTESTED'
      ELSE 'NO_DURABLE_EXECUTION_ATTESTATION'
    END,
    'durableExecutionAttestation', CASE
      WHEN v_durable THEN jsonb_build_object(
        'jobId', v_job."id"::TEXT,
        'status', v_job."status"::TEXT,
        'startedAt', to_char(
          v_job."started_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ),
        'completedAt', to_char(
          v_job."completed_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      )
      ELSE NULL
    END,
    'qualityAuthorizedArtifact', CASE
      WHEN v_quality THEN jsonb_build_object(
        'artifactId', v_artifact."id"::TEXT,
        'publicationId', v_publication."id"::TEXT,
        'publicationEvidenceSha256', btrim(v_evidence."canonical_sha256"),
        'reportSha256', btrim(v_evidence."report_sha256"),
        'proofSha256', btrim(v_evidence."proof_sha256")
      )
      ELSE NULL
    END,
    'deficits', v_deficits,
    'terminalAuthorityModelCallPerformed', FALSE
  );
  v_terminal_bytes := convert_to(
    "reader_summary_production_recovery_canonical_json"(v_record),
    'UTF8'
  );
  v_terminal_sha := encode(sha256(v_terminal_bytes), 'hex');
  v_terminal_id := gen_random_uuid();
  PERFORM set_config('social_monitor.production_recovery_write', 'on', TRUE);
  UPDATE "reader_summary_production_recovery_leases"
  SET "state" = 'CONSUMED', "consumed_at" = v_now
  WHERE "id" = v_claim."id"
    AND "state" = 'ISSUED'
    AND (v_claim."canonical_record"->>'fencing')::BIGINT = target_fencing;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily terminal claim fence was lost';
  END IF;
  INSERT INTO "reader_summary_production_recovery_leases" (
    "id", "tenant_id", "workspace_id", "identity", "state",
    "canonical_record", "canonical_bytes", "canonical_sha256",
    "issued_at", "consumed_at"
  ) VALUES (
    v_terminal_id,
    target_tenant_id,
    target_workspace_id,
    'daily-terminal-seal:v2:' || target_tenant_id || ':' ||
      target_workspace_id || ':' || to_char(target_date, 'YYYY-MM-DD'),
    'ISSUED',
    v_record,
    v_terminal_bytes,
    v_terminal_sha,
    v_now,
    NULL
  );
  UPDATE "reader_summary_production_recovery_leases"
  SET "state" = 'CONSUMED', "consumed_at" = v_now
  WHERE "id" = v_terminal_id
    AND "state" = 'ISSUED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'daily terminal seal consumption was lost';
  END IF;
  RETURN QUERY SELECT
    'finalized'::TEXT,
    target_date,
    v_status,
    CASE
      WHEN v_durable
        THEN 'DURABLE_EXECUTION_ATTESTED'
      ELSE 'NO_DURABLE_EXECUTION_ATTESTATION'
    END,
    target_authority_sha256,
    target_evidence_sha256,
    v_terminal_sha,
    v_terminal_bytes,
    v_record;
END;
$$;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  "reader_summary_publications",
  "reader_summary_publication_slots",
  "reader_summary_weekly_publication_evidence"
FROM "social_monitor_reader_summary_publication_runtime";
REVOKE ALL PRIVILEGES ON TABLE
  "reader_summary_artifacts",
  "reader_summary_production_recovery_leases",
  "reader_summary_production_recovery_days",
  "reader_summary_production_recovery_dry_runs"
FROM "social_monitor_reader_summary_publication_runtime";
REVOKE ALL PRIVILEGES ON FUNCTION
  "reader_summary_daily_terminal_authority"(UUID, UUID, DATE),
  "claim_reader_summary_daily_terminal"(UUID, UUID, UUID, TEXT),
  "finalize_reader_summary_daily_terminal"(
    UUID, UUID, DATE, TEXT, TEXT, TEXT, BIGINT
  )
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT EXECUTE ON FUNCTION
  "claim_reader_summary_daily_terminal"(UUID, UUID, UUID, TEXT),
  "finalize_reader_summary_daily_terminal"(
    UUID, UUID, DATE, TEXT, TEXT, TEXT, BIGINT
  )
TO "social_monitor_reader_summary_publication_runtime";
RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
