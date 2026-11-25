-- @social-monitor-forward-migration
-- Generalize the DB-owned weekly certification loader to every completed
-- Monday-Sunday UTC week while retaining the exact daily publication,
-- evidence, scope, ordering, and replay authorities.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION
  "backfill_reader_summary_weekly_daily_certifications"(
    target_tenant_id UUID,
    target_workspace_id UUID,
    target_scope_type TEXT,
    target_scope_key TEXT,
    target_week_started_on DATE
  )
RETURNS TABLE (
  requested_utc_date DATE,
  publication_id UUID,
  outcome TEXT,
  identity TEXT,
  canonical_sha256 TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_candidate_count INTEGER;
  v_day DATE;
  v_evidence "reader_summary_weekly_publication_evidence"%ROWTYPE;
  v_existing_publication_id UUID;
  v_github_provider_count INTEGER;
  v_publication_id UUID;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR current_setting(
      'social_monitor.system_access',
      TRUE
    ) IS DISTINCT FROM 'false'
    OR NOT pg_has_role(
      session_user,
      'social_monitor_reader_summary_publication_runtime',
      'USAGE'
    )
  THEN
    RAISE EXCEPTION
      'weekly daily certification backfill requires a writable SERIALIZABLE tenant session';
  END IF;

  IF current_setting(
      'social_monitor.tenant_id',
      TRUE
    ) IS DISTINCT FROM target_tenant_id::TEXT
    OR current_setting(
      'social_monitor.workspace_id',
      TRUE
    ) IS DISTINCT FROM target_workspace_id::TEXT
  THEN
    RAISE EXCEPTION
      'weekly daily certification backfill session scope diverged';
  END IF;

  IF target_tenant_id IS NULL
    OR target_workspace_id IS NULL
    OR target_scope_type NOT IN ('workspace', 'interest')
    OR btrim(COALESCE(target_scope_key, '')) <> target_scope_key
    OR target_scope_key = ''
    OR (
      target_scope_type = 'workspace'
      AND target_scope_key <> 'workspace'
    )
    OR (
      target_scope_type = 'interest'
      AND target_scope_key
        !~ '^interest:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  THEN
    RAISE EXCEPTION 'weekly daily certification backfill scope is invalid';
  END IF;

  IF target_week_started_on IS NULL
    OR extract(isodow FROM target_week_started_on) <> 1
    OR target_week_started_on + 6
      >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::DATE
  THEN
    RAISE EXCEPTION
      'weekly daily certification backfill requires a completed Monday-Sunday UTC week';
  END IF;

  PERFORM slot."current_publication_id"
  FROM "reader_summary_publication_slots" AS slot
  WHERE slot."tenant_id" = target_tenant_id
    AND slot."workspace_id" = target_workspace_id
    AND slot."scope_type" = target_scope_type
    AND slot."scope_key" = target_scope_key
    AND slot."cadence" = 'daily'
    AND slot."period_timezone" = 'UTC'
    AND slot."period_started_at" >= (
      target_week_started_on::TIMESTAMP AT TIME ZONE 'UTC'
    )
    AND slot."period_started_at" < (
      (target_week_started_on + 7)::TIMESTAMP AT TIME ZONE 'UTC'
    )
  ORDER BY slot."period_started_at", slot."current_publication_id"
  FOR UPDATE;

  SELECT count(*)
  INTO v_candidate_count
  FROM generate_series(0, 6) AS required_day(day_offset)
  JOIN "reader_summary_publication_slots" AS slot
    ON slot."tenant_id" = target_tenant_id
    AND slot."workspace_id" = target_workspace_id
    AND slot."scope_type" = target_scope_type
    AND slot."scope_key" = target_scope_key
    AND slot."cadence" = 'daily'
    AND slot."period_started_at" = (
      (target_week_started_on + required_day.day_offset)::TIMESTAMP
      AT TIME ZONE 'UTC'
    )
    AND slot."period_ended_at" = (
      (target_week_started_on + required_day.day_offset + 1)::TIMESTAMP
      AT TIME ZONE 'UTC'
    )
    AND slot."period_timezone" = 'UTC'
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
    AND publication."reader_summary_job_id" IS NOT NULL
    AND publication."published_at" >= publication."requested_at"
    AND btrim(publication."report_sha256") ~ '^[0-9a-f]{64}$'
    AND btrim(publication."proof_sha256") ~ '^[0-9a-f]{64}$'
    AND publication."exact_proof"->>'schemaVersion'
      = 'reader_summary.publication_proof.v1'
    AND publication."exact_proof"->>'tenantId'
      = publication."tenant_id"::TEXT
    AND publication."exact_proof"->>'workspaceId'
      = publication."workspace_id"::TEXT
    AND publication."exact_proof"->>'requestedUtcDate'
      = to_char(
        target_week_started_on + required_day.day_offset,
        'YYYY-MM-DD'
      )
    AND publication."exact_proof"->>'readerSummaryJobId'
      = publication."reader_summary_job_id"::TEXT
    AND publication."exact_proof"->>'readerSummaryArtifactId'
      = publication."reader_summary_artifact_id"::TEXT
    AND publication."exact_proof"->>'semanticStatus'
      = publication."semantic_status"::TEXT
    AND publication."exact_proof"->>'reportSha256'
      = btrim(publication."report_sha256");

  IF v_candidate_count <> 7 THEN
    RAISE EXCEPTION
      'weekly daily certification backfill requires seven immutable daily publications; found %',
      v_candidate_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "reader_summary_weekly_publication_evidence" AS evidence
    JOIN "reader_summary_publications" AS publication
      ON publication."id" = evidence."publication_id"
    LEFT JOIN "reader_summary_publication_slots" AS slot
      ON slot."tenant_id" = evidence."tenant_id"
      AND slot."workspace_id" = evidence."workspace_id"
      AND slot."scope_type" = evidence."scope_type"
      AND slot."scope_key" = evidence."scope_key"
      AND slot."cadence" = evidence."cadence"
      AND slot."period_started_at" = evidence."period_started_at"
      AND slot."period_ended_at" = evidence."period_ended_at"
      AND slot."period_timezone" = evidence."period_timezone"
    WHERE evidence."tenant_id" = target_tenant_id
      AND evidence."workspace_id" = target_workspace_id
      AND evidence."scope_type" = target_scope_type
      AND evidence."scope_key" = target_scope_key
      AND evidence."requested_utc_date" BETWEEN target_week_started_on
        AND target_week_started_on + 6
      AND (
        slot."current_publication_id" IS NULL
        OR evidence."publication_id" <> slot."current_publication_id"
        OR publication."requested_utc_date" <> evidence."requested_utc_date"
      )
  ) THEN
    RAISE EXCEPTION
      'weekly daily certification backfill found divergent existing evidence';
  END IF;

  FOR v_day, v_publication_id IN
    SELECT
      publication."requested_utc_date",
      publication."id"
    FROM generate_series(0, 6) AS required_day(day_offset)
    JOIN "reader_summary_publication_slots" AS slot
      ON slot."tenant_id" = target_tenant_id
      AND slot."workspace_id" = target_workspace_id
      AND slot."scope_type" = target_scope_type
      AND slot."scope_key" = target_scope_key
      AND slot."cadence" = 'daily'
      AND slot."period_started_at" = (
        (target_week_started_on + required_day.day_offset)::TIMESTAMP
        AT TIME ZONE 'UTC'
      )
      AND slot."period_ended_at" = (
        (target_week_started_on + required_day.day_offset + 1)::TIMESTAMP
        AT TIME ZONE 'UTC'
      )
      AND slot."period_timezone" = 'UTC'
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
    ORDER BY publication."requested_utc_date", publication."id"
  LOOP
    SELECT evidence."publication_id"
    INTO v_existing_publication_id
    FROM "reader_summary_weekly_publication_evidence" AS evidence
    WHERE evidence."publication_id" = v_publication_id;

    PERFORM "record_reader_summary_weekly_publication_evidence"(
      v_publication_id
    );

    SELECT *
    INTO STRICT v_evidence
    FROM "reader_summary_weekly_publication_evidence" AS evidence
    WHERE evidence."publication_id" = v_publication_id;

    SELECT (provider_count.value->>'count')::INTEGER
    INTO STRICT v_github_provider_count
    FROM jsonb_array_elements(
      v_evidence."canonical_record"->'providerCounts'
    ) AS provider_count(value)
    WHERE provider_count.value->>'providerKey' = 'github-trending-page';

    IF v_evidence."tenant_id" <> target_tenant_id
      OR v_evidence."workspace_id" <> target_workspace_id
      OR v_evidence."scope_type" <> target_scope_type
      OR v_evidence."scope_key" <> target_scope_key
      OR v_evidence."requested_utc_date" <> v_day
      OR v_evidence."canonical_record"->>'requestedUtcDate'
        IS DISTINCT FROM to_char(v_day, 'YYYY-MM-DD')
      OR v_evidence."canonical_record"->>'semanticStatus'
        IS DISTINCT FROM v_evidence."semantic_status"::TEXT
      OR v_evidence."canonical_record"->'githubEvidence'
        IS DISTINCT FROM v_evidence."github_evidence"
      OR v_evidence."canonical_record"->'providerEvidence'
        IS DISTINCT FROM v_evidence."provider_evidence"
      OR v_evidence."canonical_bytes" <> convert_to(
        "reader_summary_weekly_canonical_json"(
          v_evidence."canonical_record"
        ),
        'UTF8'
      )
      OR btrim(v_evidence."canonical_sha256") <> encode(
        sha256(v_evidence."canonical_bytes"),
        'hex'
      )
      OR v_evidence."identity" <>
        'reader_summary.weekly_publication_evidence.v1:'
        || btrim(v_evidence."canonical_sha256")
      OR jsonb_typeof(v_evidence."github_evidence")
        IS DISTINCT FROM 'object'
      OR jsonb_object_length(v_evidence."github_evidence") <> 12
      OR NOT (
        v_evidence."github_evidence" ?& ARRAY[
          'schemaVersion',
          'mode',
          'requestedUtcDay',
          'providerKey',
          'scanJobId',
          'sourceBindingId',
          'evidenceCount',
          'historicalUnavailableReason',
          'authorizedAt',
          'sourceProviderContentHash',
          'repositories',
          'sha256'
        ]
      )
      OR v_evidence."github_evidence"->>'schemaVersion'
        IS DISTINCT FROM
          'reader_summary.weekly_publication_github_evidence.v1'
      OR btrim(COALESCE(v_evidence."github_evidence"->>'sha256', ''))
        <> encode(
          sha256(
            convert_to(
              "reader_summary_weekly_canonical_json"(
                v_evidence."github_evidence" - 'sha256'
              ),
              'UTF8'
            )
          ),
          'hex'
        )
      OR v_evidence."github_evidence"->>'requestedUtcDay'
        IS DISTINCT FROM to_char(v_day, 'YYYY-MM-DD')
      OR v_evidence."github_evidence"->>'providerKey'
        IS DISTINCT FROM 'github-trending-page'
      OR jsonb_typeof(v_evidence."github_evidence"->'repositories')
        IS DISTINCT FROM 'array'
      OR jsonb_typeof(v_evidence."provider_evidence")
        IS DISTINCT FROM 'array'
      OR jsonb_array_length(v_evidence."provider_evidence") > 256
      OR jsonb_typeof(
        v_evidence."canonical_record"->'providerCounts'
      ) IS DISTINCT FROM 'array'
      OR jsonb_array_length(
        v_evidence."canonical_record"->'providerCounts'
      ) <> 5
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          v_evidence."provider_evidence"
        ) AS provider(value)
        WHERE jsonb_typeof(provider.value) IS DISTINCT FROM 'object'
          OR jsonb_object_length(provider.value) <> 13
          OR NOT (
            provider.value ?& ARRAY[
              'citationId',
              'citationField',
              'feedItemId',
              'sourceItemId',
              'sourceBindingId',
              'providerKey',
              'providerItemId',
              'canonicalUrl',
              'title',
              'sourceText',
              'publishedAt',
              'observedAt',
              'sourceContentHash'
            ]
          )
          OR COALESCE(provider.value->>'providerKey', '') NOT IN (
            'github-trending-page',
            'hacker-news',
            'reddit',
            'rss',
            'x-twitter'
          )
          OR COALESCE(provider.value->>'citationField', '') NOT IN (
            'title',
            'bodyPreview',
            'canonicalUrl'
          )
          OR jsonb_typeof(provider.value->'title')
            IS DISTINCT FROM 'string'
          OR length(provider.value->>'title') > 16384
          OR jsonb_typeof(provider.value->'sourceText')
            IS DISTINCT FROM 'string'
          OR length(provider.value->>'sourceText') > 16384
          OR btrim(COALESCE(
            provider.value->>'citationId',
            ''
          )) = ''
          OR btrim(COALESCE(
            provider.value->>'feedItemId',
            ''
          )) = ''
          OR btrim(COALESCE(
            provider.value->>'sourceItemId',
            ''
          )) = ''
          OR btrim(COALESCE(
            provider.value->>'sourceBindingId',
            ''
          )) = ''
          OR btrim(COALESCE(
            provider.value->>'providerItemId',
            ''
          )) = ''
          OR btrim(COALESCE(
            provider.value->>'canonicalUrl',
            ''
          )) = ''
          OR COALESCE(
            provider.value->>'sourceContentHash',
            ''
          )
            !~ '^[0-9a-f]{64}$'
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          v_evidence."canonical_record"->'providerCounts'
        ) WITH ORDINALITY AS provider_count(value, ordinality)
        JOIN (VALUES
          (1, 'github-trending-page'),
          (2, 'hacker-news'),
          (3, 'reddit'),
          (4, 'rss'),
          (5, 'x-twitter')
        ) AS expected(ordinality, provider_key)
          ON expected.ordinality = provider_count.ordinality
        WHERE jsonb_typeof(provider_count.value)
            IS DISTINCT FROM 'object'
          OR jsonb_object_length(provider_count.value) <> 2
          OR NOT (
            provider_count.value ?& ARRAY['providerKey', 'count']
          )
          OR provider_count.value->>'providerKey'
            IS DISTINCT FROM expected.provider_key
          OR jsonb_typeof(provider_count.value->'count')
            IS DISTINCT FROM 'number'
          OR COALESCE(
            provider_count.value->>'count',
            ''
          ) !~ '^(0|[1-9][0-9]*)$'
          OR (provider_count.value->>'count')::INTEGER <> (
            SELECT count(*)
            FROM jsonb_array_elements(
              v_evidence."provider_evidence"
            ) AS provider(value)
            WHERE provider.value->>'providerKey'
              = expected.provider_key
          )
      )
    THEN
      RAISE EXCEPTION
        'weekly daily certification backfill evidence authority diverged for %',
        v_day;
    END IF;

    IF v_evidence."semantic_status" = 'NO_SIGNAL' THEN
      IF v_evidence."github_evidence"->>'mode'
          IS DISTINCT FROM 'ordinary_not_required'
        OR v_github_provider_count <> 0
        OR v_evidence."github_evidence"->>'evidenceCount' <> '0'
        OR v_evidence."github_evidence"->'repositories' <> '[]'::JSONB
        OR v_evidence."github_evidence"->'scanJobId' <> 'null'::JSONB
        OR v_evidence."github_evidence"->'sourceBindingId' <> 'null'::JSONB
        OR v_evidence."github_evidence"->'sourceProviderContentHash'
          <> 'null'::JSONB
        OR v_evidence."github_evidence"->'historicalUnavailableReason'
          <> 'null'::JSONB
        OR v_evidence."github_evidence"->'authorizedAt' <> 'null'::JSONB
        OR v_evidence."provider_evidence" <> '[]'::JSONB
      THEN
        RAISE EXCEPTION
          'weekly daily certification backfill NO_SIGNAL authority diverged for %',
          v_day;
      END IF;
    ELSIF v_evidence."semantic_status" = 'COMPLETED'
      AND v_day = DATE '2026-07-23'
      AND v_evidence."github_evidence"->>'mode'
        = 'historical_unavailable'
    THEN
      IF v_github_provider_count <> 0
        OR v_evidence."github_evidence"->>'evidenceCount' <> '0'
        OR v_evidence."github_evidence"->'repositories' <> '[]'::JSONB
        OR v_evidence."github_evidence"->'scanJobId' <> 'null'::JSONB
        OR v_evidence."github_evidence"->'sourceBindingId' <> 'null'::JSONB
        OR v_evidence."github_evidence"->'sourceProviderContentHash'
          <> 'null'::JSONB
        OR jsonb_typeof(
          v_evidence."github_evidence"
            ->'historicalUnavailableReason'
        ) IS DISTINCT FROM 'string'
        OR btrim(COALESCE(
          v_evidence."github_evidence"->>'historicalUnavailableReason',
          ''
        )) IS DISTINCT FROM v_evidence."github_evidence"
          ->>'historicalUnavailableReason'
        OR length(
          COALESCE(
            v_evidence."github_evidence"
              ->>'historicalUnavailableReason',
            ''
          )
        ) NOT BETWEEN 1 AND 4096
        OR jsonb_typeof(
          v_evidence."github_evidence"->'authorizedAt'
        ) IS DISTINCT FROM 'string'
        OR COALESCE(
          v_evidence."github_evidence"->>'authorizedAt',
          ''
        )
          !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
        OR (
          v_evidence."github_evidence"->>'authorizedAt'
        )::TIMESTAMPTZ < v_evidence."period_ended_at"
        OR jsonb_array_length(v_evidence."provider_evidence") = 0
      THEN
        RAISE EXCEPTION
          'weekly daily certification backfill historical authority diverged for %',
          v_day;
      END IF;
    ELSIF v_evidence."semantic_status" <> 'COMPLETED'
      OR v_evidence."github_evidence"->>'mode'
        IS DISTINCT FROM 'verified'
      OR v_github_provider_count <> 10
      OR v_evidence."github_evidence"->>'evidenceCount' <> '10'
      OR jsonb_array_length(
        v_evidence."github_evidence"->'repositories'
      ) <> 10
      OR v_evidence."github_evidence"->'scanJobId' = 'null'::JSONB
      OR v_evidence."github_evidence"->'sourceBindingId' = 'null'::JSONB
      OR v_evidence."github_evidence"->'sourceProviderContentHash'
        = 'null'::JSONB
      OR v_evidence."github_evidence"->'historicalUnavailableReason'
        <> 'null'::JSONB
      OR v_evidence."github_evidence"->'authorizedAt' <> 'null'::JSONB
    THEN
      RAISE EXCEPTION
        'weekly daily certification backfill completed authority diverged for %',
        v_day;
    END IF;

    requested_utc_date := v_day;
    publication_id := v_publication_id;
    outcome := CASE
      WHEN v_existing_publication_id IS NULL THEN 'inserted'
      ELSE 'replayed'
    END;
    identity := v_evidence."identity";
    canonical_sha256 := btrim(v_evidence."canonical_sha256");
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  "backfill_reader_summary_weekly_daily_certifications"(
    UUID, UUID, TEXT, TEXT, DATE
  )
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

GRANT EXECUTE ON FUNCTION
  "backfill_reader_summary_weekly_daily_certifications"(
    UUID, UUID, TEXT, TEXT, DATE
  )
TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
