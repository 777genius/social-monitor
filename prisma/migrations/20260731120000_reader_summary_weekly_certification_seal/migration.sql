-- @social-monitor-forward-migration
-- Persist the exact seven-day publication boundary consumed by the weekly
-- runner. The table is schema-owned so publication capability membership
-- cannot inherit table ownership.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";

GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";

CREATE TABLE "reader_summary_weekly_certification_seals" (
  "seal_id" TEXT NOT NULL,
  "seal_sha256" CHAR(64) NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "scope_type" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "week_started_on" DATE NOT NULL,
  "week_ended_on" DATE NOT NULL,
  "days" JSONB NOT NULL,
  "canonical_record" JSONB NOT NULL,
  "canonical_bytes" BYTEA NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reader_summary_weekly_certification_seals_pkey"
    PRIMARY KEY ("seal_id"),
  CONSTRAINT "reader_summary_weekly_certification_seals_sha_key"
    UNIQUE ("seal_sha256"),
  CONSTRAINT "reader_summary_weekly_certification_seals_scope_week_key"
    UNIQUE (
      "tenant_id",
      "workspace_id",
      "scope_type",
      "scope_key",
      "week_started_on"
    ),
  CONSTRAINT "reader_summary_weekly_certification_seals_scope_check"
    CHECK (
      (
        "scope_type" = 'workspace'
        AND "scope_key" = 'workspace'
      )
      OR (
        "scope_type" = 'interest'
        AND "scope_key" ~
          '^interest:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
    ),
  CONSTRAINT "reader_summary_weekly_certification_seals_window_check"
    CHECK (
      extract(isodow FROM "week_started_on") = 1
      AND "week_ended_on" = "week_started_on" + 6
    ),
  CONSTRAINT "reader_summary_weekly_certification_seals_days_check"
    CHECK (
      jsonb_typeof("days") = 'array'
      AND jsonb_array_length("days") = 7
    ),
  CONSTRAINT "reader_summary_weekly_certification_seals_digest_check"
    CHECK (
      btrim("seal_sha256") ~ '^[0-9a-f]{64}$'
      AND "seal_id" =
        'reader_summary.weekly_certification_seal.v1:'
        || btrim("seal_sha256")
      AND btrim("seal_sha256") = encode(
        sha256("canonical_bytes"),
        'hex'
      )
      AND "canonical_record"->>'schemaVersion'
        = 'reader_summary.weekly_certification_seal.v1'
      AND "canonical_record"->>'sealId' = "seal_id"
      AND "canonical_record"->>'sealSha' = btrim("seal_sha256")
      AND "canonical_record"->>'tenantId' = "tenant_id"::TEXT
      AND "canonical_record"->>'workspaceId' = "workspace_id"::TEXT
      AND "canonical_record"->>'scopeType' = "scope_type"
      AND "canonical_record"->>'scopeKey' = "scope_key"
      AND "canonical_record"->>'weekStartedOn'
        = to_char("week_started_on", 'YYYY-MM-DD')
      AND "canonical_record"->>'weekEndedOn'
        = to_char("week_ended_on", 'YYYY-MM-DD')
      AND "canonical_record"->'days' = "days"
    )
);

CREATE INDEX "reader_summary_weekly_certification_seals_tenant_week_idx"
  ON "reader_summary_weekly_certification_seals" (
    "tenant_id",
    "workspace_id",
    "week_started_on"
  );

ALTER TABLE "reader_summary_weekly_certification_seals"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_weekly_certification_seals"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON "reader_summary_weekly_certification_seals"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );

REVOKE ALL PRIVILEGES ON TABLE
  "reader_summary_weekly_certification_seals"
FROM PUBLIC,
  "pg_database_owner",
  "social_monitor_reader_summary_publication_owner",
  "social_monitor_reader_summary_publication_runtime";

GRANT SELECT, INSERT, UPDATE ON TABLE
  "reader_summary_weekly_certification_seals"
TO "social_monitor_reader_summary_publication_owner";

-- The production pre-migration bootstrap creates exactly one inheriting,
-- non-admin login membership in the publication capability. Grant read
-- authority to that concrete login, never to the capability role.
DO $grant_weekly_certification_runtime_select$
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
    RAISE EXCEPTION
      'weekly certification concrete runtime login is unsafe';
  END IF;

  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON TABLE public.reader_summary_weekly_certification_seals FROM %I',
    v_runtime_role
  );
  EXECUTE format(
    'GRANT SELECT ON TABLE public.reader_summary_weekly_certification_seals TO %I',
    v_runtime_role
  );
END
$grant_weekly_certification_runtime_select$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION "reject_reader_summary_weekly_certification_seal_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION
    'reader summary weekly certification seals are append-only'
    USING ERRCODE = '55000';
END;
$$;

CREATE FUNCTION "seal_reader_summary_weekly_certification"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_scope_type TEXT,
  target_scope_key TEXT,
  target_week_started_on DATE
)
RETURNS TABLE (
  outcome TEXT,
  seal_id TEXT,
  seal_sha256 TEXT,
  canonical_record JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_canonical_bytes BYTEA;
  v_canonical_record JSONB;
  v_days JSONB;
  v_existing "reader_summary_weekly_certification_seals"%ROWTYPE;
  v_locked_count INTEGER;
  v_seal_id TEXT;
  v_seal_sha256 TEXT;
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
      'weekly certification seal requires a writable SERIALIZABLE tenant session';
  END IF;

  IF target_tenant_id IS NULL
    OR target_workspace_id IS NULL
    OR current_setting('social_monitor.tenant_id', TRUE)
      IS DISTINCT FROM target_tenant_id::TEXT
    OR current_setting('social_monitor.workspace_id', TRUE)
      IS DISTINCT FROM target_workspace_id::TEXT
  THEN
    RAISE EXCEPTION 'weekly certification seal session scope diverged';
  END IF;

  IF target_scope_type NOT IN ('workspace', 'interest')
    OR btrim(COALESCE(target_scope_key, '')) <> target_scope_key
    OR target_scope_key = ''
    OR (
      target_scope_type = 'workspace'
      AND target_scope_key <> 'workspace'
    )
    OR (
      target_scope_type = 'interest'
      AND target_scope_key !~
        '^interest:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  THEN
    RAISE EXCEPTION 'weekly certification seal scope is invalid';
  END IF;

  IF target_week_started_on IS NULL
    OR extract(isodow FROM target_week_started_on) <> 1
    OR target_week_started_on + 6
      >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE
  THEN
    RAISE EXCEPTION
      'weekly certification seal requires a completed Monday-Sunday UTC week';
  END IF;

  -- Row locks bind the seal to the seven active publications without taking
  -- an explicit table lock. Publication-slot replacement must wait or cause a
  -- SERIALIZABLE retry.
  PERFORM publication."id"
  FROM generate_series(0, 6) AS required_day(day_offset)
  JOIN "reader_summary_publication_slots" AS slot
    ON slot."tenant_id" = target_tenant_id
    AND slot."workspace_id" = target_workspace_id
    AND slot."scope_type" = target_scope_type
    AND slot."scope_key" = target_scope_key
    AND slot."cadence" = 'daily'
    AND slot."period_timezone" = 'UTC'
    AND slot."period_started_at" = (
      (target_week_started_on + required_day.day_offset)::TIMESTAMP
      AT TIME ZONE 'UTC'
    )
    AND slot."period_ended_at" = (
      (target_week_started_on + required_day.day_offset + 1)::TIMESTAMP
      AT TIME ZONE 'UTC'
    )
  JOIN "reader_summary_publications" AS publication
    ON publication."id" = slot."current_publication_id"
    AND publication."tenant_id" = slot."tenant_id"
    AND publication."workspace_id" = slot."workspace_id"
    AND publication."scope_type" = slot."scope_type"
    AND publication."scope_key" = slot."scope_key"
    AND publication."cadence" = slot."cadence"
    AND publication."period_started_at" = slot."period_started_at"
    AND publication."period_ended_at" = slot."period_ended_at"
    AND publication."period_timezone" = slot."period_timezone"
    AND publication."requested_utc_date"
      = target_week_started_on + required_day.day_offset
    AND publication."publication_kind" = 'EXACT'
    AND publication."semantic_status" IN ('COMPLETED', 'NO_SIGNAL')
  JOIN "reader_summary_weekly_publication_evidence" AS evidence
    ON evidence."publication_id" = publication."id"
    AND evidence."tenant_id" = publication."tenant_id"
    AND evidence."workspace_id" = publication."workspace_id"
    AND evidence."scope_type" = publication."scope_type"
    AND evidence."scope_key" = publication."scope_key"
    AND evidence."cadence" = publication."cadence"
    AND evidence."period_started_at" = publication."period_started_at"
    AND evidence."period_ended_at" = publication."period_ended_at"
    AND evidence."period_timezone" = publication."period_timezone"
    AND evidence."requested_utc_date" = publication."requested_utc_date"
    AND evidence."semantic_status" = publication."semantic_status"
    AND evidence."canonical_bytes" = convert_to(
      "reader_summary_weekly_canonical_json"(
        evidence."canonical_record"
      ),
      'UTF8'
    )
    AND btrim(evidence."canonical_sha256") = encode(
      sha256(evidence."canonical_bytes"),
      'hex'
    )
    AND evidence."identity" =
      'reader_summary.weekly_publication_evidence.v1:'
      || btrim(evidence."canonical_sha256")
  ORDER BY required_day.day_offset, publication."id"
  FOR SHARE OF slot, publication, evidence;

  GET DIAGNOSTICS v_locked_count = ROW_COUNT;
  IF v_locked_count <> 7 THEN
    RAISE EXCEPTION
      'weekly certification seal requires exactly 7/7 published COMPLETED or NO_SIGNAL days; found %',
      v_locked_count;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'requestedUtcDate',
        to_char(publication."requested_utc_date", 'YYYY-MM-DD'),
      'publicationId', publication."id"::TEXT,
      'artifactId', publication."reader_summary_artifact_id"::TEXT,
      'jobId', publication."reader_summary_job_id"::TEXT,
      'semanticStatus', publication."semantic_status"::TEXT,
      'publicationEvidenceIdentity', evidence."identity",
      'publicationEvidenceSha256', btrim(evidence."canonical_sha256")
    )
    ORDER BY required_day.day_offset
  )
  INTO STRICT v_days
  FROM generate_series(0, 6) AS required_day(day_offset)
  JOIN "reader_summary_publication_slots" AS slot
    ON slot."tenant_id" = target_tenant_id
    AND slot."workspace_id" = target_workspace_id
    AND slot."scope_type" = target_scope_type
    AND slot."scope_key" = target_scope_key
    AND slot."cadence" = 'daily'
    AND slot."period_timezone" = 'UTC'
    AND slot."period_started_at" = (
      (target_week_started_on + required_day.day_offset)::TIMESTAMP
      AT TIME ZONE 'UTC'
    )
    AND slot."period_ended_at" = (
      (target_week_started_on + required_day.day_offset + 1)::TIMESTAMP
      AT TIME ZONE 'UTC'
    )
  JOIN "reader_summary_publications" AS publication
    ON publication."id" = slot."current_publication_id"
  JOIN "reader_summary_weekly_publication_evidence" AS evidence
    ON evidence."publication_id" = publication."id";

  v_canonical_record := jsonb_build_object(
    'schemaVersion', 'reader_summary.weekly_certification_seal.v1',
    'tenantId', target_tenant_id::TEXT,
    'workspaceId', target_workspace_id::TEXT,
    'scopeType', target_scope_type,
    'scopeKey', target_scope_key,
    'weekStartedOn', to_char(target_week_started_on, 'YYYY-MM-DD'),
    'weekEndedOn', to_char(target_week_started_on + 6, 'YYYY-MM-DD'),
    'days', v_days
  );
  v_canonical_bytes := convert_to(
    "reader_summary_weekly_canonical_json"(v_canonical_record),
    'UTF8'
  );
  v_seal_sha256 := encode(sha256(v_canonical_bytes), 'hex');
  v_seal_id :=
    'reader_summary.weekly_certification_seal.v1:' || v_seal_sha256;
  v_canonical_record := v_canonical_record || jsonb_build_object(
    'sealId', v_seal_id,
    'sealSha', v_seal_sha256
  );

  -- sealId and sealSha describe the canonical body excluding those two
  -- self-referential fields; the record carries both immutable bindings.
  IF encode(sha256(
      convert_to(
        "reader_summary_weekly_canonical_json"(
          v_canonical_record - 'sealId' - 'sealSha'
        ),
        'UTF8'
      )
    ), 'hex') <> v_seal_sha256
  THEN
    RAISE EXCEPTION 'weekly certification seal digest construction diverged';
  END IF;

  SELECT seal.*
  INTO v_existing
  FROM "reader_summary_weekly_certification_seals" AS seal
  WHERE seal."tenant_id" = target_tenant_id
    AND seal."workspace_id" = target_workspace_id
    AND seal."scope_type" = target_scope_type
    AND seal."scope_key" = target_scope_key
    AND seal."week_started_on" = target_week_started_on
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing."seal_id" <> v_seal_id
      OR btrim(v_existing."seal_sha256") <> v_seal_sha256
      OR v_existing."days" <> v_days
      OR v_existing."canonical_record" <> v_canonical_record
      OR v_existing."canonical_bytes" <> v_canonical_bytes
    THEN
      RAISE EXCEPTION
        'weekly certification seal replay diverged from immutable sealId or sealSha';
    END IF;
    RETURN QUERY SELECT
      'replayed'::TEXT,
      v_existing."seal_id",
      btrim(v_existing."seal_sha256"),
      v_existing."canonical_record";
    RETURN;
  END IF;

  BEGIN
    INSERT INTO "reader_summary_weekly_certification_seals" (
      "seal_id",
      "seal_sha256",
      "tenant_id",
      "workspace_id",
      "scope_type",
      "scope_key",
      "week_started_on",
      "week_ended_on",
      "days",
      "canonical_record",
      "canonical_bytes"
    ) VALUES (
      v_seal_id,
      v_seal_sha256,
      target_tenant_id,
      target_workspace_id,
      target_scope_type,
      target_scope_key,
      target_week_started_on,
      target_week_started_on + 6,
      v_days,
      v_canonical_record,
      v_canonical_bytes
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION
        'weekly certification concurrent seal requires SERIALIZABLE retry'
        USING ERRCODE = '40001';
  END;

  RETURN QUERY SELECT
    'sealed'::TEXT,
    v_seal_id,
    v_seal_sha256,
    v_canonical_record;
END;
$$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

CREATE TRIGGER "reader_summary_weekly_certification_seals_append_only"
BEFORE UPDATE OR DELETE
ON "reader_summary_weekly_certification_seals"
FOR EACH ROW
EXECUTE FUNCTION
  "reject_reader_summary_weekly_certification_seal_mutation"();

RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

REVOKE ALL PRIVILEGES ON FUNCTION
  "reject_reader_summary_weekly_certification_seal_mutation"(),
  "seal_reader_summary_weekly_certification"(
    UUID, UUID, TEXT, TEXT, DATE
  )
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

GRANT EXECUTE ON FUNCTION
  "seal_reader_summary_weekly_certification"(
    UUID, UUID, TEXT, TEXT, DATE
  )
TO "social_monitor_reader_summary_publication_owner";

-- Execution is granted directly to the one validated production login. The
-- NOLOGIN capability remains an authorization marker used by the definer.
DO $grant_weekly_certification_runtime_execute$
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
    RAISE EXCEPTION
      'weekly certification concrete runtime login is unsafe';
  END IF;

  EXECUTE format(
    'REVOKE ALL PRIVILEGES ON FUNCTION public.seal_reader_summary_weekly_certification(UUID, UUID, TEXT, TEXT, DATE) FROM %I',
    v_runtime_role
  );
  EXECUTE format(
    'GRANT EXECUTE ON FUNCTION public.seal_reader_summary_weekly_certification(UUID, UUID, TEXT, TEXT, DATE) TO %I',
    v_runtime_role
  );
END
$grant_weekly_certification_runtime_execute$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  "reader_summary_weekly_certification_seals"
FROM "social_monitor_reader_summary_publication_owner";

REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";

RESET ROLE;
COMMIT;
