-- @social-monitor-forward-migration
-- Database-owned prepare entrypoint for the reviewed 2026-07-23/24 recovery.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION "validate_reader_summary_production_recovery"(
  target_recovery_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actual_sha TEXT;
  v_day "reader_summary_production_recovery_days"%ROWTYPE;
  v_day_count INTEGER := 0;
  v_digest JSONB;
  v_digests JSONB := '[]'::JSONB;
  v_dry_count INTEGER;
  v_evidence JSONB;
  v_expected JSONB;
  v_expected_count INTEGER;
  v_github_scan_ids JSONB;
  v_identity_body JSONB;
  v_identity_sha TEXT;
  v_lease "reader_summary_production_recovery_leases"%ROWTYPE;
  v_plan_day JSONB;
  v_provider TEXT;
BEGIN
  SELECT *
  INTO STRICT v_lease
  FROM "reader_summary_production_recovery_leases"
  WHERE "id" = target_recovery_id
  FOR UPDATE;

  v_identity_body := jsonb_build_object(
    'schemaVersion', 'reader_summary.production_recovery_identity.v1',
    'tenantId', v_lease."tenant_id"::TEXT,
    'workspaceId', v_lease."workspace_id"::TEXT,
    'requestedUtcDates', jsonb_build_array('2026-07-23', '2026-07-24')
  );
  v_identity_sha := encode(sha256(convert_to(
    "reader_summary_weekly_canonical_json"(v_identity_body),
    'UTF8'
  )), 'hex');
  v_actual_sha := encode(sha256(v_lease."canonical_bytes"), 'hex');
  IF v_lease."state" <> 'CONSUMED'
    OR v_lease."consumed_at" IS NULL
    OR v_lease."consumed_at" < v_lease."issued_at"
    OR v_lease."identity" <>
      'reader_summary.production_recovery.v1:' || v_identity_sha
    OR v_lease."id" <>
      "reader_summary_production_recovery_uuid"(v_identity_sha)
    OR btrim(v_lease."canonical_sha256") <> v_actual_sha
    OR v_lease."canonical_bytes" <> convert_to(
      "reader_summary_weekly_canonical_json"(v_lease."canonical_record"),
      'UTF8'
    )
    OR v_lease."canonical_record"->>'recoveryId' IS DISTINCT FROM
      v_lease."id"::TEXT
    OR v_lease."canonical_record"->>'identity' IS DISTINCT FROM
      v_lease."identity"
    OR v_lease."canonical_record"->>'tenantId' IS DISTINCT FROM
      v_lease."tenant_id"::TEXT
    OR v_lease."canonical_record"->>'workspaceId' IS DISTINCT FROM
      v_lease."workspace_id"::TEXT
    OR jsonb_object_length(v_lease."canonical_record") <> 8
    OR v_lease."canonical_record"->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.production_recovery_authority.v1'
    OR v_lease."canonical_record"->'requestedUtcDates' IS DISTINCT FROM
      jsonb_build_array('2026-07-23', '2026-07-24')
    OR jsonb_array_length(v_lease."canonical_record"->'days') <> 2
    OR v_lease."canonical_record"->'boundaries' IS DISTINCT FROM jsonb_build_object(
      'stage', 'pre_model',
      'modelCallPerformed', FALSE,
      'publicationPerformed', FALSE,
      'recollectionPerformed', FALSE
    ) THEN
    RAISE EXCEPTION 'production recovery lease authority diverged';
  END IF;

  SELECT count(*)
  INTO v_dry_count
  FROM "reader_summary_production_recovery_dry_runs"
  WHERE "recovery_id" = target_recovery_id
    AND "tenant_id" = v_lease."tenant_id"
    AND "workspace_id" = v_lease."workspace_id"
    AND "ordinal" IN (1, 2)
    AND "canonical_record" = v_lease."canonical_record"
    AND "canonical_bytes" = v_lease."canonical_bytes"
    AND btrim("canonical_sha256") =
      btrim(v_lease."canonical_sha256");
  IF v_dry_count <> 2 THEN
    RAISE EXCEPTION
      'production recovery dry-run snapshots diverged';
  END IF;

  FOR v_day IN
    SELECT *
    FROM "reader_summary_production_recovery_days"
    WHERE "recovery_id" = target_recovery_id
    ORDER BY "requested_utc_date", "identity"
    FOR SHARE
  LOOP
    v_day_count := v_day_count + 1;
    v_expected :=
      "reader_summary_production_recovery_expected_counts"(
        v_day."requested_utc_date"
      );
    IF v_expected IS NULL
      OR v_day."tenant_id" <> v_lease."tenant_id"
      OR v_day."workspace_id" <> v_lease."workspace_id"
      OR v_day."provider_counts" <> v_expected
      OR v_day."canonical_record"->'providerCounts'
        IS DISTINCT FROM v_expected
      OR jsonb_object_length(v_day."canonical_record") <> 10
      OR v_day."canonical_record"->>'schemaVersion' IS DISTINCT FROM
        'reader_summary.production_recovery_day.v1'
      OR v_day."canonical_record"->>'recoveryId' IS DISTINCT FROM
        target_recovery_id::TEXT
      OR v_day."canonical_record"->>'tenantId' IS DISTINCT FROM
        v_lease."tenant_id"::TEXT
      OR v_day."canonical_record"->>'workspaceId' IS DISTINCT FROM
        v_lease."workspace_id"::TEXT
      OR v_day."canonical_record"->>'requestedUtcDate' IS DISTINCT FROM
        to_char(v_day."requested_utc_date", 'YYYY-MM-DD')
      OR v_day."canonical_record"->'period' IS DISTINCT FROM jsonb_build_object(
        'startedAt',
          to_char(v_day."requested_utc_date", 'YYYY-MM-DD') ||
            'T00:00:00.000Z',
        'endedAt',
          to_char(v_day."requested_utc_date" + 1, 'YYYY-MM-DD') ||
            'T00:00:00.000Z',
        'timezone', 'UTC'
      )
      OR v_day."canonical_record"->'githubEvidence' IS DISTINCT FROM
        v_day."github_evidence"
      OR v_day."canonical_bytes" <> convert_to(
        "reader_summary_weekly_canonical_json"(v_day."canonical_record"),
        'UTF8'
      )
      OR btrim(v_day."canonical_sha256") <>
        encode(sha256(v_day."canonical_bytes"), 'hex')
      OR v_day."identity" <>
        'reader_summary.production_recovery_day.v1:' ||
          btrim(v_day."canonical_sha256") THEN
      RAISE EXCEPTION 'production recovery daily authority diverged';
    END IF;

    v_digests := '[]'::JSONB;
    FOREACH v_provider IN ARRAY ARRAY[
      'github-trending-page',
      'hacker-news',
      'reddit',
      'rss',
      'x-twitter'
    ] LOOP
      v_evidence := v_day."provider_evidence"->v_provider;
      SELECT (entry->>'count')::INTEGER
      INTO STRICT v_expected_count
      FROM jsonb_array_elements(v_expected) AS expected(entry)
      WHERE entry->>'providerKey' = v_provider;
      IF jsonb_typeof(v_evidence) IS DISTINCT FROM 'array'
        OR jsonb_array_length(v_evidence) <> v_expected_count
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_evidence) AS evidence(entry)
          WHERE NOT "reader_summary_production_recovery_evidence_is_valid"(
            evidence.entry,
            v_provider
          )
        ) THEN
        RAISE EXCEPTION
          'production recovery persisted provider evidence diverged';
      END IF;
      v_actual_sha := encode(sha256(convert_to(
        "reader_summary_weekly_canonical_json"(v_evidence),
        'UTF8'
      )), 'hex');
      v_digests := v_digests || jsonb_build_array(jsonb_build_object(
        'providerKey', v_provider,
        'count', v_expected_count,
        'sha256', v_actual_sha
      ));
    END LOOP;
    IF (
      SELECT count(*) <> count(DISTINCT entry->>'feedItemId')
        OR count(*) <> count(DISTINCT entry->>'sourceItemId')
      FROM jsonb_each(v_day."provider_evidence") AS provider(key, value)
      CROSS JOIN LATERAL
        jsonb_array_elements(provider.value) AS evidence(entry)
    ) THEN
      RAISE EXCEPTION
        'production recovery persisted evidence is duplicated';
    END IF;
    v_actual_sha := encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_digests),
      'UTF8'
    )), 'hex');
    IF v_day."canonical_record"->'providerEvidenceDigests'
        IS DISTINCT FROM
        v_digests
      OR btrim(v_day."provider_evidence_sha256") <> v_actual_sha
      OR v_day."canonical_record"->>'providerEvidenceSha256'
        IS DISTINCT FROM
        v_actual_sha THEN
      RAISE EXCEPTION
        'production recovery provider evidence seal diverged';
    END IF;

    IF v_day."requested_utc_date" = DATE '2026-07-23' THEN
      IF v_day."github_evidence" <> jsonb_build_object(
        'schemaVersion',
          'reader_summary.production_recovery_github_evidence.v1',
        'mode', 'historical_unavailable',
        'providerKey', 'github-trending-page',
        'requestedUtcDate', '2026-07-23',
        'evidenceCount', 0,
        'authorization', jsonb_build_object(
          'authorizationId',
            'reader_summary.production_recovery.github.2026-07-23.v1',
          'authorizedAt', to_char(
            v_lease."issued_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'reason',
            'Historical GitHub trending evidence was not collected for this UTC day; this one reviewed recovery authorizes an explicit unavailable marker and no substitute data.'
        )
      ) THEN
        RAISE EXCEPTION
          'production recovery historical GitHub authorization diverged';
      END IF;
    ELSE
      SELECT COALESCE(
        jsonb_agg(scan_job_id ORDER BY scan_job_id),
        '[]'::JSONB
      )
      INTO v_github_scan_ids
      FROM (
        SELECT DISTINCT entry->'github'->>'scanJobId' AS scan_job_id
        FROM jsonb_array_elements(
          v_day."provider_evidence"->'github-trending-page'
        ) AS evidence(entry)
      ) AS scans;
      v_digest := v_digests->0;
      IF v_day."github_evidence" <> jsonb_build_object(
        'schemaVersion',
          'reader_summary.production_recovery_github_evidence.v1',
        'mode', 'verified_existing',
        'providerKey', 'github-trending-page',
        'requestedUtcDate', '2026-07-24',
        'evidenceCount', 10,
        'evidenceSha256', v_digest->>'sha256',
        'scanJobIds', v_github_scan_ids
      ) OR (
        SELECT count(DISTINCT (entry->'github'->>'rank')::INTEGER)
        FROM jsonb_array_elements(
          v_day."provider_evidence"->'github-trending-page'
        ) AS evidence(entry)
      ) <> 10 THEN
        RAISE EXCEPTION
          'production recovery existing GitHub evidence diverged';
      END IF;
    END IF;

    v_plan_day := (
      SELECT entry
      FROM jsonb_array_elements(
        v_lease."canonical_record"->'days'
      ) AS day(entry)
      WHERE entry->>'requestedUtcDate' =
        to_char(v_day."requested_utc_date", 'YYYY-MM-DD')
    );
    IF v_plan_day IS NULL
      OR v_plan_day <> jsonb_build_object(
        'identity', v_day."identity",
        'requestedUtcDate',
          to_char(v_day."requested_utc_date", 'YYYY-MM-DD'),
        'canonicalSha256', btrim(v_day."canonical_sha256"),
        'providerEvidenceSha256',
          btrim(v_day."provider_evidence_sha256")
      ) THEN
      RAISE EXCEPTION 'production recovery plan/day binding diverged';
    END IF;
  END LOOP;
  IF v_day_count <> 2 THEN
    RAISE EXCEPTION
      'production recovery must retain exactly two daily rows';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT entry->>'feedItemId')
      OR count(*) <> count(DISTINCT entry->>'sourceItemId')
    FROM "reader_summary_production_recovery_days" AS day
    CROSS JOIN LATERAL
      jsonb_each(day."provider_evidence") AS provider(key, value)
    CROSS JOIN LATERAL
      jsonb_array_elements(provider.value) AS evidence(entry)
    WHERE day."recovery_id" = target_recovery_id
  ) THEN
    RAISE EXCEPTION
      'production recovery cross-day evidence is duplicated';
  END IF;
END;
$$;

CREATE FUNCTION "prepare_reader_summary_production_recovery"()
RETURNS TABLE (
  outcome TEXT,
  recovery_id UUID,
  tenant_id UUID,
  workspace_id UUID,
  identity TEXT,
  canonical_record JSONB,
  canonical_bytes BYTEA,
  canonical_sha256 TEXT,
  lease_state TEXT,
  issued_at TIMESTAMPTZ(6),
  consumed_at TIMESTAMPTZ(6),
  dry_runs JSONB,
  days JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_candidate_count INTEGER;
  v_day_23 JSONB;
  v_day_23_second JSONB;
  v_day_24 JSONB;
  v_day_24_second JSONB;
  v_existing_id UUID;
  v_identity TEXT;
  v_identity_body JSONB;
  v_identity_sha TEXT;
  v_issued_at TIMESTAMPTZ(6);
  v_plan JSONB;
  v_plan_bytes BYTEA;
  v_plan_second JSONB;
  v_plan_second_bytes BYTEA;
  v_plan_second_sha TEXT;
  v_plan_sha TEXT;
  v_recovery_id UUID;
  v_session_tenant_id UUID;
  v_session_workspace_id UUID;
  v_tenant_id UUID;
  v_workspace_id UUID;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION
      'production recovery requires a writable SERIALIZABLE transaction';
  END IF;
  v_session_tenant_id :=
    NULLIF(current_setting('social_monitor.tenant_id', TRUE), '')::UUID;
  v_session_workspace_id :=
    NULLIF(current_setting('social_monitor.workspace_id', TRUE), '')::UUID;
  IF v_session_tenant_id IS NULL
    OR v_session_workspace_id IS NULL
    OR current_setting(
      'social_monitor.system_access',
      TRUE
    ) IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION
      'production recovery requires an exact tenant/workspace session';
  END IF;

  SELECT lease."id"
  INTO v_existing_id
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = v_session_tenant_id
    AND lease."workspace_id" = v_session_workspace_id
  ORDER BY lease."tenant_id", lease."workspace_id", lease."id"
  LIMIT 1
  FOR UPDATE;
  IF v_existing_id IS NOT NULL THEN
    IF (
      SELECT count(*)
      FROM "reader_summary_production_recovery_leases"
      WHERE "tenant_id" = v_session_tenant_id
        AND "workspace_id" = v_session_workspace_id
    ) <> 1 THEN
      RAISE EXCEPTION 'production recovery replay is ambiguous';
    END IF;
    PERFORM "validate_reader_summary_production_recovery"(v_existing_id);
    RETURN QUERY
      SELECT *
      FROM "read_reader_summary_production_recovery"(
        v_existing_id,
        'replayed'
      );
    RETURN;
  END IF;

  SELECT
    count(*)::INTEGER,
    min(candidate."tenant_id"::TEXT)::UUID,
    min(candidate."workspace_id"::TEXT)::UUID
  INTO v_candidate_count, v_tenant_id, v_workspace_id
  FROM (
    SELECT feed."tenant_id", feed."workspace_id"
    FROM "feed_items" AS feed
    JOIN "source_items" AS source
      ON source."id" = feed."source_item_id"
      AND source."tenant_id" = feed."tenant_id"
      AND source."workspace_id" = feed."workspace_id"
      AND source."source_binding_id" = feed."source_binding_id"
      AND source."provider_key" = feed."provider_key"
      AND source."canonical_url" = feed."canonical_url"
    WHERE feed."tenant_id" = v_session_tenant_id
      AND feed."workspace_id" = v_session_workspace_id
      AND feed."status" = 'VISIBLE'
      AND feed."provider_key" = ANY(ARRAY[
        'github-trending-page',
        'hacker-news',
        'reddit',
        'rss',
        'x-twitter'
      ])
      AND feed."published_at" >=
        (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
      AND feed."published_at" <
        (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
    GROUP BY feed."tenant_id", feed."workspace_id"
    HAVING
      count(*) = count(DISTINCT source."id")
      AND
      count(*) FILTER (
        WHERE feed."published_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'github-trending-page'
      ) = 0
      AND count(*) FILTER (
        WHERE feed."published_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'hacker-news'
      ) = 100
      AND count(*) FILTER (
        WHERE feed."published_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'reddit'
      ) = 100
      AND count(*) FILTER (
        WHERE feed."published_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'rss'
      ) = 75
      AND count(*) FILTER (
        WHERE feed."published_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'x-twitter'
      ) = 67
      AND count(*) FILTER (
        WHERE feed."published_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'github-trending-page'
      ) = 10
      AND count(*) FILTER (
        WHERE feed."published_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'hacker-news'
      ) = 100
      AND count(*) FILTER (
        WHERE feed."published_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'reddit'
      ) = 100
      AND count(*) FILTER (
        WHERE feed."published_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'rss'
      ) = 67
      AND count(*) FILTER (
        WHERE feed."published_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'x-twitter'
      ) = 73
  ) AS candidate;
  IF v_candidate_count <> 1
    OR v_tenant_id IS NULL
    OR v_workspace_id IS NULL
    OR v_tenant_id <> v_session_tenant_id
    OR v_workspace_id <> v_session_workspace_id THEN
    RAISE EXCEPTION
      'production recovery database scope is absent or ambiguous';
  END IF;

  PERFORM tenant."id"
  FROM "tenants" AS tenant
  WHERE tenant."id" = v_tenant_id
    AND tenant."deleted_at" IS NULL
  ORDER BY tenant."id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production recovery tenant authority is absent';
  END IF;
  PERFORM workspace."id"
  FROM "workspaces" AS workspace
  WHERE workspace."id" = v_workspace_id
    AND workspace."tenant_id" = v_tenant_id
    AND workspace."deleted_at" IS NULL
  ORDER BY workspace."id"
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'production recovery workspace authority is absent';
  END IF;

  PERFORM binding."id"
  FROM "source_bindings" AS binding
  WHERE binding."tenant_id" = v_tenant_id
    AND binding."workspace_id" = v_workspace_id
  ORDER BY binding."id"
  FOR SHARE;
  PERFORM source."id"
  FROM "feed_items" AS feed
  JOIN "source_items" AS source
    ON source."id" = feed."source_item_id"
    AND source."tenant_id" = feed."tenant_id"
    AND source."workspace_id" = feed."workspace_id"
  WHERE feed."tenant_id" = v_tenant_id
    AND feed."workspace_id" = v_workspace_id
    AND feed."published_at" >=
      (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
    AND feed."published_at" <
      (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
  ORDER BY source."id"
  FOR SHARE OF source;
  PERFORM feed."id"
  FROM "feed_items" AS feed
  WHERE feed."tenant_id" = v_tenant_id
    AND feed."workspace_id" = v_workspace_id
    AND feed."published_at" >=
      (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
    AND feed."published_at" <
      (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
  ORDER BY feed."id"
  FOR SHARE;
  PERFORM result."id"
  FROM "github_repository_trend_results" AS result
  WHERE result."tenant_id" = v_tenant_id
    AND result."workspace_id" = v_workspace_id
    AND result."checked_at" >=
      (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
    AND result."checked_at" <
      (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
  ORDER BY result."id"
  FOR SHARE;
  PERFORM scan."id"
  FROM "scan_jobs" AS scan
  WHERE scan."tenant_id" = v_tenant_id
    AND scan."workspace_id" = v_workspace_id
    AND EXISTS (
      SELECT 1
      FROM "github_repository_trend_results" AS result
      WHERE result."scan_job_id" = scan."id"
        AND result."tenant_id" = scan."tenant_id"
        AND result."workspace_id" = scan."workspace_id"
        AND result."checked_at" >=
          (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
        AND result."checked_at" <
          (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
    )
  ORDER BY scan."id"
  FOR SHARE;
  PERFORM attempt."scan_job_id"
  FROM "scan_attempts" AS attempt
  WHERE attempt."tenant_id" = v_tenant_id
    AND attempt."workspace_id" = v_workspace_id
    AND EXISTS (
      SELECT 1
      FROM "github_repository_trend_results" AS result
      WHERE result."scan_job_id" = attempt."scan_job_id"
        AND result."tenant_id" = attempt."tenant_id"
        AND result."workspace_id" = attempt."workspace_id"
        AND result."checked_at" >=
          (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
        AND result."checked_at" <
          (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
    )
  ORDER BY attempt."scan_job_id"
  FOR SHARE;

  v_issued_at := transaction_timestamp();
  v_identity_body := jsonb_build_object(
    'schemaVersion', 'reader_summary.production_recovery_identity.v1',
    'tenantId', v_tenant_id::TEXT,
    'workspaceId', v_workspace_id::TEXT,
    'requestedUtcDates', jsonb_build_array('2026-07-23', '2026-07-24')
  );
  v_identity_sha := encode(sha256(convert_to(
    "reader_summary_weekly_canonical_json"(v_identity_body),
    'UTF8'
  )), 'hex');
  v_recovery_id :=
    "reader_summary_production_recovery_uuid"(v_identity_sha);
  v_identity :=
    'reader_summary.production_recovery.v1:' || v_identity_sha;

  v_day_23 := "derive_reader_summary_production_recovery_day"(
    v_recovery_id,
    v_tenant_id,
    v_workspace_id,
    DATE '2026-07-23',
    v_issued_at
  );
  v_day_24 := "derive_reader_summary_production_recovery_day"(
    v_recovery_id,
    v_tenant_id,
    v_workspace_id,
    DATE '2026-07-24',
    v_issued_at
  );
  v_plan := jsonb_build_object(
    'schemaVersion', 'reader_summary.production_recovery_authority.v1',
    'recoveryId', v_recovery_id::TEXT,
    'identity', v_identity,
    'tenantId', v_tenant_id::TEXT,
    'workspaceId', v_workspace_id::TEXT,
    'requestedUtcDates', jsonb_build_array(
      '2026-07-23',
      '2026-07-24'
    ),
    'boundaries', jsonb_build_object(
      'stage', 'pre_model',
      'modelCallPerformed', FALSE,
      'publicationPerformed', FALSE,
      'recollectionPerformed', FALSE
    ),
    'days', jsonb_build_array(
      jsonb_build_object(
        'identity', v_day_23->>'identity',
        'requestedUtcDate', '2026-07-23',
        'canonicalSha256', v_day_23->>'canonicalSha256',
        'providerEvidenceSha256',
          v_day_23->>'providerEvidenceSha256'
      ),
      jsonb_build_object(
        'identity', v_day_24->>'identity',
        'requestedUtcDate', '2026-07-24',
        'canonicalSha256', v_day_24->>'canonicalSha256',
        'providerEvidenceSha256',
          v_day_24->>'providerEvidenceSha256'
      )
    )
  );
  v_plan_bytes := convert_to(
    "reader_summary_weekly_canonical_json"(v_plan),
    'UTF8'
  );
  v_plan_sha := encode(sha256(v_plan_bytes), 'hex');

  PERFORM set_config(
    'social_monitor.production_recovery_write',
    'on',
    TRUE
  );
  BEGIN
    INSERT INTO "reader_summary_production_recovery_leases" (
      "id",
      "tenant_id",
      "workspace_id",
      "identity",
      "state",
      "canonical_record",
      "canonical_bytes",
      "canonical_sha256",
      "issued_at",
      "consumed_at"
    ) VALUES (
      v_recovery_id,
      v_tenant_id,
      v_workspace_id,
      v_identity,
      'ISSUED',
      v_plan,
      v_plan_bytes,
      v_plan_sha,
      v_issued_at,
      NULL
    );
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION
        'production recovery concurrent authority requires replay'
        USING ERRCODE = '40001';
  END;

  INSERT INTO "reader_summary_production_recovery_dry_runs" (
    "recovery_id",
    "tenant_id",
    "workspace_id",
    "ordinal",
    "canonical_record",
    "canonical_bytes",
    "canonical_sha256",
    "captured_at"
  ) VALUES (
    v_recovery_id,
    v_tenant_id,
    v_workspace_id,
    1,
    v_plan,
    v_plan_bytes,
    v_plan_sha,
    transaction_timestamp()
  );

  v_day_23_second := "derive_reader_summary_production_recovery_day"(
    v_recovery_id,
    v_tenant_id,
    v_workspace_id,
    DATE '2026-07-23',
    v_issued_at
  );
  v_day_24_second := "derive_reader_summary_production_recovery_day"(
    v_recovery_id,
    v_tenant_id,
    v_workspace_id,
    DATE '2026-07-24',
    v_issued_at
  );
  v_plan_second := jsonb_build_object(
    'schemaVersion', 'reader_summary.production_recovery_authority.v1',
    'recoveryId', v_recovery_id::TEXT,
    'identity', v_identity,
    'tenantId', v_tenant_id::TEXT,
    'workspaceId', v_workspace_id::TEXT,
    'requestedUtcDates', jsonb_build_array(
      '2026-07-23',
      '2026-07-24'
    ),
    'boundaries', jsonb_build_object(
      'stage', 'pre_model',
      'modelCallPerformed', FALSE,
      'publicationPerformed', FALSE,
      'recollectionPerformed', FALSE
    ),
    'days', jsonb_build_array(
      jsonb_build_object(
        'identity', v_day_23_second->>'identity',
        'requestedUtcDate', '2026-07-23',
        'canonicalSha256',
          v_day_23_second->>'canonicalSha256',
        'providerEvidenceSha256',
          v_day_23_second->>'providerEvidenceSha256'
      ),
      jsonb_build_object(
        'identity', v_day_24_second->>'identity',
        'requestedUtcDate', '2026-07-24',
        'canonicalSha256',
          v_day_24_second->>'canonicalSha256',
        'providerEvidenceSha256',
          v_day_24_second->>'providerEvidenceSha256'
      )
    )
  );
  v_plan_second_bytes := convert_to(
    "reader_summary_weekly_canonical_json"(v_plan_second),
    'UTF8'
  );
  v_plan_second_sha := encode(sha256(v_plan_second_bytes), 'hex');

  INSERT INTO "reader_summary_production_recovery_dry_runs" (
    "recovery_id",
    "tenant_id",
    "workspace_id",
    "ordinal",
    "canonical_record",
    "canonical_bytes",
    "canonical_sha256",
    "captured_at"
  ) VALUES (
    v_recovery_id,
    v_tenant_id,
    v_workspace_id,
    2,
    v_plan_second,
    v_plan_second_bytes,
    v_plan_second_sha,
    transaction_timestamp()
  );

  IF v_plan_second IS DISTINCT FROM v_plan
    OR v_plan_second_bytes IS DISTINCT FROM v_plan_bytes
    OR v_plan_second_sha IS DISTINCT FROM v_plan_sha THEN
    RAISE EXCEPTION
      'production recovery dry-run canonical bytes diverged';
  END IF;

  INSERT INTO "reader_summary_production_recovery_days" (
    "recovery_id",
    "tenant_id",
    "workspace_id",
    "requested_utc_date",
    "identity",
    "provider_counts",
    "provider_evidence",
    "provider_evidence_sha256",
    "github_evidence",
    "canonical_record",
    "canonical_bytes",
    "canonical_sha256",
    "recorded_at"
  ) VALUES
  (
    v_recovery_id,
    v_tenant_id,
    v_workspace_id,
    DATE '2026-07-23',
    v_day_23_second->>'identity',
    v_day_23_second->'providerCounts',
    v_day_23_second->'providerEvidence',
    v_day_23_second->>'providerEvidenceSha256',
    v_day_23_second->'githubEvidence',
    v_day_23_second->'canonicalRecord',
    convert_to(v_day_23_second->>'canonicalJson', 'UTF8'),
    v_day_23_second->>'canonicalSha256',
    transaction_timestamp()
  ),
  (
    v_recovery_id,
    v_tenant_id,
    v_workspace_id,
    DATE '2026-07-24',
    v_day_24_second->>'identity',
    v_day_24_second->'providerCounts',
    v_day_24_second->'providerEvidence',
    v_day_24_second->>'providerEvidenceSha256',
    v_day_24_second->'githubEvidence',
    v_day_24_second->'canonicalRecord',
    convert_to(v_day_24_second->>'canonicalJson', 'UTF8'),
    v_day_24_second->>'canonicalSha256',
    transaction_timestamp()
  );

  UPDATE "reader_summary_production_recovery_leases"
  SET
    "state" = 'CONSUMED',
    "consumed_at" = transaction_timestamp()
  WHERE "id" = v_recovery_id
    AND "state" = 'ISSUED'
    AND "consumed_at" IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'production recovery pre-model lease consumption lost authority';
  END IF;

  PERFORM "validate_reader_summary_production_recovery"(v_recovery_id);
  RETURN QUERY
    SELECT *
    FROM "read_reader_summary_production_recovery"(
      v_recovery_id,
      'prepared'
    );
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  "validate_reader_summary_production_recovery"(UUID),
  "prepare_reader_summary_production_recovery"()
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT EXECUTE ON FUNCTION
  "prepare_reader_summary_production_recovery"()
TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
