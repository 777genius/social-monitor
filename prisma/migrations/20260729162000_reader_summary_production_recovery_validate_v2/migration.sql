-- @social-monitor-forward-migration
-- Replace only recovery validation with the Jul23-Jul28 v2 authority contract.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION
"validate_reader_summary_production_recovery"(
  target_recovery_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actual_sha TEXT;
  v_day "reader_summary_production_recovery_days"%ROWTYPE;
  v_day_count INTEGER := 0;
  v_day_dates JSONB := '[]'::JSONB;
  v_digests JSONB;
  v_dry_count INTEGER;
  v_evidence JSONB;
  v_evidence_sha TEXT;
  v_expected JSONB;
  v_expected_count INTEGER;
  v_github JSONB;
  v_github_scan_ids JSONB;
  v_identity_body JSONB;
  v_identity_sha TEXT;
  v_lease "reader_summary_production_recovery_leases"%ROWTYPE;
  v_plan_days JSONB := '[]'::JSONB;
  v_provider TEXT;
  v_requested_dates JSONB := jsonb_build_array(
    '2026-07-23',
    '2026-07-24',
    '2026-07-25',
    '2026-07-26',
    '2026-07-27',
    '2026-07-28'
  );
BEGIN
  SELECT recovery_lease.*
  INTO STRICT v_lease
  FROM "reader_summary_production_recovery_leases" AS recovery_lease
  WHERE recovery_lease."id" = target_recovery_id
  FOR SHARE OF recovery_lease;

  v_identity_body := jsonb_build_object(
    'schemaVersion', 'reader_summary.production_recovery_identity.v2',
    'tenantId', v_lease."tenant_id"::TEXT,
    'workspaceId', v_lease."workspace_id"::TEXT,
    'requestedUtcDates', v_requested_dates
  );
  v_identity_sha := encode(sha256(convert_to(
    "reader_summary_weekly_canonical_json"(v_identity_body),
    'UTF8'
  )), 'hex');
  v_actual_sha := encode(sha256(v_lease."canonical_bytes"), 'hex');
  IF v_lease."state" <> 'CONSUMED'
    OR v_lease."consumed_at" IS NULL
    OR v_lease."consumed_at" <> v_lease."issued_at"
    OR v_lease."identity" <>
      'reader_summary.production_recovery.v2:' || v_identity_sha
    OR v_lease."id" <>
      "reader_summary_production_recovery_uuid"(v_identity_sha)
    OR btrim(v_lease."canonical_sha256") <> v_actual_sha
    OR v_lease."canonical_bytes" <> convert_to(
      "reader_summary_weekly_canonical_json"(
        v_lease."canonical_record"
      ),
      'UTF8'
    )
    OR jsonb_typeof(v_lease."canonical_record")
      IS DISTINCT FROM 'object'
    OR jsonb_object_length(v_lease."canonical_record") <> 8
    OR v_lease."canonical_record"->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.production_recovery_authority.v2'
    OR v_lease."canonical_record"->>'recoveryId' IS DISTINCT FROM
      v_lease."id"::TEXT
    OR v_lease."canonical_record"->>'identity' IS DISTINCT FROM
      v_lease."identity"
    OR v_lease."canonical_record"->>'tenantId' IS DISTINCT FROM
      v_lease."tenant_id"::TEXT
    OR v_lease."canonical_record"->>'workspaceId' IS DISTINCT FROM
      v_lease."workspace_id"::TEXT
    OR v_lease."canonical_record"->'requestedUtcDates'
      IS DISTINCT FROM v_requested_dates
    OR jsonb_typeof(v_lease."canonical_record"->'days')
      IS DISTINCT FROM 'array'
    OR CASE
      WHEN jsonb_typeof(v_lease."canonical_record"->'days') = 'array'
      THEN jsonb_array_length(v_lease."canonical_record"->'days') <> 6
      ELSE TRUE
    END
    OR v_lease."canonical_record"->'boundaries'
      IS DISTINCT FROM jsonb_build_object(
        'stage', 'pre_model',
        'modelCallPerformed', FALSE,
        'publicationPerformed', FALSE,
        'recollectionPerformed', FALSE
      ) THEN
    RAISE EXCEPTION
      'production recovery v2 lease authority diverged';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_dry_count
  FROM "reader_summary_production_recovery_dry_runs" AS recovery_dry
  WHERE recovery_dry."recovery_id" = target_recovery_id;
  IF v_dry_count <> 2 OR EXISTS (
    SELECT 1
    FROM "reader_summary_production_recovery_dry_runs" AS recovery_dry
    WHERE recovery_dry."recovery_id" = target_recovery_id
      AND (
        recovery_dry."tenant_id" <> v_lease."tenant_id"
        OR recovery_dry."workspace_id" <> v_lease."workspace_id"
        OR recovery_dry."ordinal" NOT IN (1, 2)
        OR recovery_dry."canonical_record" <>
          v_lease."canonical_record"
        OR recovery_dry."canonical_bytes" <>
          v_lease."canonical_bytes"
        OR btrim(recovery_dry."canonical_sha256") <>
          btrim(v_lease."canonical_sha256")
        OR recovery_dry."canonical_bytes" <> convert_to(
          "reader_summary_weekly_canonical_json"(
            recovery_dry."canonical_record"
          ),
          'UTF8'
        )
        OR btrim(recovery_dry."canonical_sha256") <>
          encode(sha256(recovery_dry."canonical_bytes"), 'hex')
        OR recovery_dry."captured_at" <> v_lease."issued_at"
      )
  ) THEN
    RAISE EXCEPTION
      'production recovery v2 dry-run snapshots diverged';
  END IF;

  FOR v_day IN
    SELECT recovery_day.*
    FROM "reader_summary_production_recovery_days" AS recovery_day
    WHERE recovery_day."recovery_id" = target_recovery_id
    ORDER BY
      recovery_day."requested_utc_date",
      recovery_day."identity"
    FOR SHARE OF recovery_day
  LOOP
    v_day_count := v_day_count + 1;
    v_day_dates := v_day_dates || jsonb_build_array(
      to_char(v_day."requested_utc_date", 'YYYY-MM-DD')
    );
    v_expected :=
      "reader_summary_production_recovery_expected_counts_v2"(
        v_day."requested_utc_date"
      );
    IF v_expected IS NULL
      OR v_day."tenant_id" <> v_lease."tenant_id"
      OR v_day."workspace_id" <> v_lease."workspace_id"
      OR v_day."provider_counts" <> v_expected
      OR jsonb_typeof(v_day."provider_evidence")
        IS DISTINCT FROM 'object'
      OR jsonb_object_length(v_day."provider_evidence") <> 5
      OR NOT v_day."provider_evidence" ?& ARRAY[
        'github-trending-page',
        'hacker-news',
        'reddit',
        'rss',
        'x-twitter'
      ]
      OR v_day."canonical_record"->'providerCounts'
        IS DISTINCT FROM v_expected
      OR jsonb_typeof(v_day."canonical_record")
        IS DISTINCT FROM 'object'
      OR jsonb_object_length(v_day."canonical_record") <> 10
      OR v_day."canonical_record"->>'schemaVersion' IS DISTINCT FROM
        'reader_summary.production_recovery_day.v2'
      OR v_day."canonical_record"->>'recoveryId' IS DISTINCT FROM
        target_recovery_id::TEXT
      OR v_day."canonical_record"->>'tenantId' IS DISTINCT FROM
        v_lease."tenant_id"::TEXT
      OR v_day."canonical_record"->>'workspaceId' IS DISTINCT FROM
        v_lease."workspace_id"::TEXT
      OR v_day."canonical_record"->>'requestedUtcDate'
        IS DISTINCT FROM
          to_char(v_day."requested_utc_date", 'YYYY-MM-DD')
      OR v_day."canonical_record"->'period' IS DISTINCT FROM
        jsonb_build_object(
          'startedAt',
            to_char(v_day."requested_utc_date", 'YYYY-MM-DD') ||
              'T00:00:00.000Z',
          'endedAt',
            to_char(v_day."requested_utc_date" + 1, 'YYYY-MM-DD') ||
              'T00:00:00.000Z',
          'timezone', 'UTC'
        )
      OR v_day."canonical_record"->'githubEvidence'
        IS DISTINCT FROM v_day."github_evidence"
      OR v_day."canonical_bytes" <> convert_to(
        "reader_summary_weekly_canonical_json"(
          v_day."canonical_record"
        ),
        'UTF8'
      )
      OR btrim(v_day."canonical_sha256") <>
        encode(sha256(v_day."canonical_bytes"), 'hex')
      OR v_day."identity" <>
        'reader_summary.production_recovery_day.v2:' ||
          btrim(v_day."canonical_sha256") THEN
      RAISE EXCEPTION
        'production recovery v2 daily authority diverged';
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
      SELECT (expected.entry->>'count')::INTEGER
      INTO STRICT v_expected_count
      FROM jsonb_array_elements(v_expected) AS expected(entry)
      WHERE expected.entry->>'providerKey' = v_provider;
      IF jsonb_typeof(v_evidence) IS DISTINCT FROM 'array'
        OR CASE
          WHEN jsonb_typeof(v_evidence) = 'array'
          THEN jsonb_array_length(v_evidence) <> v_expected_count
          ELSE TRUE
        END
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_evidence) AS evidence(entry)
          WHERE evidence.entry->>'providerKey' IS DISTINCT FROM
              v_provider
            OR (
              evidence.entry->>'feedItemId' ~ '^[0-9a-f-]{36}$'
            ) IS DISTINCT FROM TRUE
            OR (
              evidence.entry->>'sourceItemId' ~ '^[0-9a-f-]{36}$'
            ) IS DISTINCT FROM TRUE
            OR (
              evidence.entry->>'sourceBindingId' ~ '^[0-9a-f-]{36}$'
            ) IS DISTINCT FROM TRUE
            OR (
              evidence.entry->>'interestId' ~ '^[0-9a-f-]{36}$'
            ) IS DISTINCT FROM TRUE
            OR (
              evidence.entry->>'sourceContentHash' ~ '^[0-9a-f]{64}$'
            ) IS DISTINCT FROM TRUE
        ) THEN
        RAISE EXCEPTION
          'production recovery v2 provider evidence diverged';
      END IF;
      v_evidence_sha := encode(sha256(convert_to(
        "reader_summary_weekly_canonical_json"(v_evidence),
        'UTF8'
      )), 'hex');
      v_digests := v_digests || jsonb_build_array(
        jsonb_build_object(
          'providerKey', v_provider,
          'count', v_expected_count,
          'sha256', v_evidence_sha
        )
      );
    END LOOP;

    v_actual_sha := encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_digests),
      'UTF8'
    )), 'hex');
    IF v_day."canonical_record"->'providerEvidenceDigests'
        IS DISTINCT FROM v_digests
      OR btrim(v_day."provider_evidence_sha256") <> v_actual_sha
      OR v_day."canonical_record"->>'providerEvidenceSha256'
        IS DISTINCT FROM v_actual_sha THEN
      RAISE EXCEPTION
        'production recovery v2 provider evidence seal diverged';
    END IF;

    v_github := v_day."github_evidence";
    IF v_day."requested_utc_date" IN (
      DATE '2026-07-23',
      DATE '2026-07-28'
    ) THEN
      IF v_github <> jsonb_build_object(
        'schemaVersion',
          'reader_summary.production_recovery_github_evidence.v2',
        'mode', 'historical_unavailable',
        'providerKey', 'github-trending-page',
        'requestedUtcDate',
          to_char(v_day."requested_utc_date", 'YYYY-MM-DD'),
        'evidenceCount', 0,
        'authorization', jsonb_build_object(
          'authorizationId',
            'reader_summary.production_recovery.github.' ||
              to_char(v_day."requested_utc_date", 'YYYY-MM-DD') ||
              '.v2',
          'authorizedAt', to_char(
            v_lease."issued_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'reason',
            'Historical GitHub trending evidence was not collected for this UTC day; this reviewed recovery records an explicit unavailable marker and uses no substitute data.'
        )
      ) THEN
        RAISE EXCEPTION
          'production recovery v2 historical GitHub proof diverged';
      END IF;
    ELSE
      SELECT COALESCE(
        jsonb_agg(
          github_scan."scan_job_id"
          ORDER BY github_scan."scan_job_id"
        ),
        '[]'::JSONB
      )
      INTO v_github_scan_ids
      FROM (
        SELECT DISTINCT
          evidence.entry->'github'->>'scanJobId' AS "scan_job_id"
        FROM jsonb_array_elements(
          v_day."provider_evidence"->'github-trending-page'
        ) AS evidence(entry)
      ) AS github_scan;
      IF v_github <> jsonb_build_object(
        'schemaVersion',
          'reader_summary.production_recovery_github_evidence.v2',
        'mode', 'verified_existing',
        'providerKey', 'github-trending-page',
        'requestedUtcDate',
          to_char(v_day."requested_utc_date", 'YYYY-MM-DD'),
        'evidenceCount', (v_digests->0->>'count')::INTEGER,
        'evidenceSha256', v_digests->0->>'sha256',
        'scanJobIds', v_github_scan_ids
      ) THEN
        RAISE EXCEPTION
          'production recovery v2 existing GitHub proof diverged';
      END IF;
    END IF;

    v_plan_days := v_plan_days || jsonb_build_array(
      jsonb_build_object(
        'identity', v_day."identity",
        'requestedUtcDate',
          to_char(v_day."requested_utc_date", 'YYYY-MM-DD'),
        'canonicalSha256', btrim(v_day."canonical_sha256"),
        'providerEvidenceSha256',
          btrim(v_day."provider_evidence_sha256"),
        'planSha256s', jsonb_build_array(
          btrim(v_day."canonical_sha256"),
          btrim(v_day."canonical_sha256")
        )
      )
    );
  END LOOP;

  IF v_day_count <> 6
    OR v_day_dates IS DISTINCT FROM v_requested_dates
    OR v_lease."canonical_record"->'days'
      IS DISTINCT FROM v_plan_days THEN
    RAISE EXCEPTION
      'production recovery v2 must retain the exact six daily rows';
  END IF;

  IF (
    SELECT count(*) <>
        count(DISTINCT evidence.entry->>'feedItemId')
      OR count(*) <>
        count(DISTINCT evidence.entry->>'sourceItemId')
    FROM "reader_summary_production_recovery_days" AS recovery_day
    CROSS JOIN LATERAL jsonb_each(
      recovery_day."provider_evidence"
    ) AS provider(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(
      provider.value
    ) AS evidence(entry)
    WHERE recovery_day."recovery_id" = target_recovery_id
  ) THEN
    RAISE EXCEPTION
      'production recovery v2 cross-day evidence is duplicated';
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  "validate_reader_summary_production_recovery"(UUID)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
