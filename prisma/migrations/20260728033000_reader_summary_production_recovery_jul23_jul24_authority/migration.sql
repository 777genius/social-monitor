-- @social-monitor-forward-migration
-- Replace production recovery authority functions with Jul23/Jul24 observed_at collection windows.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION "derive_reader_summary_production_recovery_day"(
  target_recovery_id UUID,
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  historical_authorized_at TIMESTAMPTZ(6)
) RETURNS JSONB
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_canonical TEXT;
  v_canonical_sha TEXT;
  v_collection_end DATE;
  v_collection_start DATE;
  v_count INTEGER;
  v_digest JSONB;
  v_digests JSONB := '[]'::JSONB;
  v_evidence JSONB;
  v_evidence_by_provider JSONB := '{}'::JSONB;
  v_evidence_sha TEXT;
  v_expected JSONB;
  v_expected_count INTEGER;
  v_github JSONB;
  v_github_scan_ids JSONB;
  v_identity TEXT;
  v_period_end DATE;
  v_provider TEXT;
  v_record JSONB;
BEGIN
  v_expected :=
    "reader_summary_production_recovery_expected_counts"(target_date);
  IF v_expected IS NULL
    OR historical_authorized_at <
      ((target_date + 1)::TIMESTAMP AT TIME ZONE 'UTC') THEN
    RAISE EXCEPTION 'production recovery day is not authorized';
  END IF;
  v_period_end := target_date + 1;
  v_collection_start := target_date;
  v_collection_end := target_date + 1;

  FOREACH v_provider IN ARRAY ARRAY[
    'github-trending-page',
    'hacker-news',
    'reddit',
    'rss',
    'x-twitter'
  ] LOOP
    SELECT (entry->>'count')::INTEGER
    INTO STRICT v_expected_count
    FROM jsonb_array_elements(v_expected) AS expected(entry)
    WHERE entry->>'providerKey' = v_provider;

    IF v_provider = 'github-trending-page' THEN
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'providerKey', feed."provider_key",
          'feedItemId', feed."id"::TEXT,
          'sourceItemId', source."id"::TEXT,
          'sourceBindingId', source."source_binding_id"::TEXT,
          'providerItemId', source."provider_item_id",
          'canonicalUrl', source."canonical_url",
          'sourceContentHash', source."content_hash",
          'sourceProviderContentHash', source."provider_content_hash",
          'publishedAt', to_char(
            feed."published_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'observedAt', to_char(
            feed."observed_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'github', jsonb_build_object(
            'resultId', result."id"::TEXT,
            'scanJobId', scan."id"::TEXT,
            'scanAttemptNumber', attempt."attempt_number",
            'repositoryIdentity', result."repository_full_name",
            'rank', result."rank",
            'checkedAt', to_char(
              result."checked_at" AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          )
        )
        ORDER BY result."rank", feed."id"
      ), '[]'::JSONB)
      INTO v_evidence
      FROM "feed_items" AS feed
      JOIN "source_items" AS source
        ON source."id" = feed."source_item_id"
        AND source."tenant_id" = feed."tenant_id"
        AND source."workspace_id" = feed."workspace_id"
        AND source."source_binding_id" = feed."source_binding_id"
        AND source."provider_key" = feed."provider_key"
        AND source."canonical_url" = feed."canonical_url"
      JOIN "github_repository_trend_results" AS result
        ON result."source_item_id" = source."id"
        AND result."tenant_id" = source."tenant_id"
        AND result."workspace_id" = source."workspace_id"
        AND result."source_binding_id" = source."source_binding_id"
        AND result."scan_job_id" =
          (source."metadata"->'trending'->>'scanJobId')::UUID
        AND result."repository_full_name" =
          source."metadata"->'repository'->>'fullName'
        AND result."repository_url" = source."canonical_url"
        AND result."rank" =
          (source."metadata"->'trending'->>'rank')::INTEGER
        AND result."primary_window" IN ('daily', 'today')
        AND to_char(
          result."checked_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ) = source."metadata"->'trending'->>'checkedAt'
        AND result."observed_at" = source."observed_at"
      JOIN "scan_jobs" AS scan
        ON scan."id" = result."scan_job_id"
        AND scan."tenant_id" = result."tenant_id"
        AND scan."workspace_id" = result."workspace_id"
        AND scan."source_binding_id" = result."source_binding_id"
        AND scan."status" = 'SUCCEEDED'
      JOIN "scan_attempts" AS attempt
        ON attempt."scan_job_id" = scan."id"
        AND attempt."tenant_id" = scan."tenant_id"
        AND attempt."workspace_id" = scan."workspace_id"
        AND attempt."source_binding_id" = scan."source_binding_id"
        AND attempt."status" = 'SUCCEEDED'
        AND attempt."finished_at" IS NOT NULL
      JOIN "source_bindings" AS binding
        ON binding."id" = source."source_binding_id"
        AND binding."tenant_id" = source."tenant_id"
        AND binding."workspace_id" = source."workspace_id"
        AND binding."interest_id" = feed."interest_id"
        AND binding."status" = 'ENABLED'
        AND binding."deleted_at" IS NULL
      JOIN "source_catalog_entries" AS catalog
        ON catalog."id" = binding."source_catalog_entry_id"
        AND catalog."provider_key" = 'github-trending-page'
      JOIN "interests" AS interest
        ON interest."id" = binding."interest_id"
        AND interest."tenant_id" = binding."tenant_id"
        AND interest."workspace_id" = binding."workspace_id"
        AND interest."status" = 'ENABLED'
        AND interest."deleted_at" IS NULL
      WHERE feed."tenant_id" = target_tenant_id
        AND feed."workspace_id" = target_workspace_id
        AND feed."provider_key" = v_provider
        AND feed."status" = 'VISIBLE'
        AND feed."observed_at" >=
          (v_collection_start::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."observed_at" <
          (v_collection_end::TIMESTAMP AT TIME ZONE 'UTC')
        AND source."metadata"->>'kind' =
          'github_trending_page_repository'
        AND source."content_hash" ~ '^[0-9a-f]{64}$'
        AND source."provider_content_hash" ~ '^[0-9a-f]{64}$'
        AND btrim(source."provider_item_id") <> ''
        AND btrim(source."canonical_url") <> ''
        AND lower(COALESCE(
          NULLIF(binding."config"->>'window', ''),
          NULLIF(binding."config"->>'since', ''),
          NULLIF(binding."config"->>'query', ''),
          NULLIF(binding."config"->'sourceQuery'->>'query', '')
        )) IN ('daily', 'today');
    ELSE
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'providerKey', feed."provider_key",
          'feedItemId', feed."id"::TEXT,
          'sourceItemId', source."id"::TEXT,
          'sourceBindingId', source."source_binding_id"::TEXT,
          'providerItemId', source."provider_item_id",
          'canonicalUrl', source."canonical_url",
          'sourceContentHash', source."content_hash",
          'sourceProviderContentHash', source."provider_content_hash",
          'publishedAt', to_char(
            feed."published_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          ),
          'observedAt', to_char(
            feed."observed_at" AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
          )
        )
        ORDER BY feed."id"
      ), '[]'::JSONB)
      INTO v_evidence
      FROM "feed_items" AS feed
      JOIN "source_items" AS source
        ON source."id" = feed."source_item_id"
        AND source."tenant_id" = feed."tenant_id"
        AND source."workspace_id" = feed."workspace_id"
        AND source."source_binding_id" = feed."source_binding_id"
        AND source."provider_key" = feed."provider_key"
        AND source."canonical_url" = feed."canonical_url"
      JOIN "source_bindings" AS binding
        ON binding."id" = source."source_binding_id"
        AND binding."tenant_id" = source."tenant_id"
        AND binding."workspace_id" = source."workspace_id"
        AND binding."interest_id" = feed."interest_id"
        AND binding."status" = 'ENABLED'
        AND binding."deleted_at" IS NULL
      JOIN "source_catalog_entries" AS catalog
        ON catalog."id" = binding."source_catalog_entry_id"
        AND catalog."provider_key" = v_provider
      JOIN "interests" AS interest
        ON interest."id" = binding."interest_id"
        AND interest."tenant_id" = binding."tenant_id"
        AND interest."workspace_id" = binding."workspace_id"
        AND interest."status" = 'ENABLED'
        AND interest."deleted_at" IS NULL
      WHERE feed."tenant_id" = target_tenant_id
        AND feed."workspace_id" = target_workspace_id
        AND feed."provider_key" = v_provider
        AND feed."status" = 'VISIBLE'
        AND source."content_hash" ~ '^[0-9a-f]{64}$'
        AND (
          source."provider_content_hash" IS NULL
          OR source."provider_content_hash" ~ '^[0-9a-f]{64}$'
        )
        AND btrim(source."provider_item_id") <> ''
        AND btrim(source."canonical_url") <> ''
        AND feed."observed_at" >=
          (v_collection_start::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."observed_at" <
          (v_collection_end::TIMESTAMP AT TIME ZONE 'UTC');
    END IF;

    v_count := jsonb_array_length(v_evidence);
    IF v_count <> v_expected_count THEN
      RAISE EXCEPTION
        'production recovery provider count diverged for % on %',
        v_provider,
        target_date;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_evidence) AS evidence(entry)
      WHERE NOT "reader_summary_production_recovery_evidence_is_valid"(
        evidence.entry,
        v_provider
      )
    ) THEN
      RAISE EXCEPTION
        'production recovery evidence fields diverged for % on %',
        v_provider,
        target_date;
    END IF;
    IF (
      SELECT count(*) <> count(DISTINCT entry->>'feedItemId')
        OR count(*) <> count(DISTINCT entry->>'sourceItemId')
      FROM jsonb_array_elements(v_evidence) AS evidence(entry)
    ) THEN
      RAISE EXCEPTION
        'production recovery evidence identity diverged for % on %',
        v_provider,
        target_date;
    END IF;

    v_evidence_sha := encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_evidence),
      'UTF8'
    )), 'hex');
    v_evidence_by_provider :=
      v_evidence_by_provider || jsonb_build_object(v_provider, v_evidence);
    v_digests := v_digests || jsonb_build_array(jsonb_build_object(
      'providerKey', v_provider,
      'count', v_count,
      'sha256', v_evidence_sha
    ));
  END LOOP;

  v_evidence_sha := encode(sha256(convert_to(
    "reader_summary_weekly_canonical_json"(v_digests),
    'UTF8'
  )), 'hex');

  IF target_date = DATE '2026-07-23' THEN
    v_github := jsonb_build_object(
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
          historical_authorized_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'reason',
        'Historical GitHub trending evidence was not collected for this UTC day; this one reviewed recovery authorizes an explicit unavailable marker and no substitute data.'
      )
    );
  ELSE
    SELECT COALESCE(jsonb_agg(scan_job_id ORDER BY scan_job_id), '[]'::JSONB)
    INTO v_github_scan_ids
    FROM (
      SELECT DISTINCT entry->'github'->>'scanJobId' AS scan_job_id
      FROM jsonb_array_elements(
        v_evidence_by_provider->'github-trending-page'
      ) AS github(entry)
    ) AS scans;
    v_digest := (
      SELECT entry
      FROM jsonb_array_elements(v_digests) AS digest(entry)
      WHERE entry->>'providerKey' = 'github-trending-page'
    );
    IF jsonb_array_length(
      v_evidence_by_provider->'github-trending-page'
    ) <> 10 OR (
      SELECT count(DISTINCT (entry->'github'->>'rank')::INTEGER)
      FROM jsonb_array_elements(
        v_evidence_by_provider->'github-trending-page'
      ) AS github(entry)
    ) <> 10 THEN
      RAISE EXCEPTION
        'production recovery existing GitHub evidence is not verifiable';
    END IF;
    v_github := jsonb_build_object(
      'schemaVersion',
      'reader_summary.production_recovery_github_evidence.v1',
      'mode', 'verified_existing',
      'providerKey', 'github-trending-page',
      'requestedUtcDate', '2026-07-24',
      'evidenceCount', 10,
      'evidenceSha256', v_digest->>'sha256',
      'scanJobIds', v_github_scan_ids
    );
  END IF;

  v_record := jsonb_build_object(
    'schemaVersion', 'reader_summary.production_recovery_day.v1',
    'recoveryId', target_recovery_id::TEXT,
    'tenantId', target_tenant_id::TEXT,
    'workspaceId', target_workspace_id::TEXT,
    'requestedUtcDate', to_char(target_date, 'YYYY-MM-DD'),
    'period', jsonb_build_object(
      'startedAt',
        to_char(target_date, 'YYYY-MM-DD') || 'T00:00:00.000Z',
      'endedAt',
        to_char(v_period_end, 'YYYY-MM-DD') || 'T00:00:00.000Z',
      'timezone', 'UTC'
    ),
    'providerCounts', v_expected,
    'providerEvidenceDigests', v_digests,
    'providerEvidenceSha256', v_evidence_sha,
    'githubEvidence', v_github
  );
  v_canonical := "reader_summary_weekly_canonical_json"(v_record);
  v_canonical_sha := encode(
    sha256(convert_to(v_canonical, 'UTF8')),
    'hex'
  );
  v_identity :=
    'reader_summary.production_recovery_day.v1:' || v_canonical_sha;

  RETURN jsonb_build_object(
    'identity', v_identity,
    'canonicalRecord', v_record,
    'canonicalJson', v_canonical,
    'canonicalSha256', v_canonical_sha,
    'providerCounts', v_expected,
    'providerEvidence', v_evidence_by_provider,
    'providerEvidenceSha256', v_evidence_sha,
    'githubEvidence', v_github
  );
END;
$$;

CREATE OR REPLACE FUNCTION "prepare_reader_summary_production_recovery"()
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
      AND feed."observed_at" >=
        (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
      AND feed."observed_at" <
        (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
    GROUP BY feed."tenant_id", feed."workspace_id"
    HAVING
      count(*) = count(DISTINCT feed."id")
      AND
      count(*) FILTER (
        WHERE feed."observed_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'github-trending-page'
      ) = 0
      AND count(*) FILTER (
        WHERE feed."observed_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'hacker-news'
      ) = 100
      AND count(*) FILTER (
        WHERE feed."observed_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'reddit'
      ) = 100
      AND count(*) FILTER (
        WHERE feed."observed_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'rss'
      ) = 75
      AND count(*) FILTER (
        WHERE feed."observed_at" <
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'x-twitter'
      ) = 67
      AND count(*) FILTER (
        WHERE feed."observed_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'github-trending-page'
      ) = 10
      AND count(*) FILTER (
        WHERE feed."observed_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'hacker-news'
      ) = 100
      AND count(*) FILTER (
        WHERE feed."observed_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'reddit'
      ) = 100
      AND count(*) FILTER (
        WHERE feed."observed_at" >=
            (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
          AND feed."provider_key" = 'rss'
      ) = 67
      AND count(*) FILTER (
        WHERE feed."observed_at" >=
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
    AND source."source_binding_id" = feed."source_binding_id"
    AND source."provider_key" = feed."provider_key"
    AND source."canonical_url" = feed."canonical_url"
  WHERE feed."tenant_id" = v_tenant_id
    AND feed."workspace_id" = v_workspace_id
    AND feed."observed_at" >=
      (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
    AND feed."observed_at" <
      (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
  ORDER BY source."id"
  FOR SHARE OF source;
  PERFORM feed."id"
  FROM "feed_items" AS feed
  WHERE feed."tenant_id" = v_tenant_id
    AND feed."workspace_id" = v_workspace_id
    AND feed."observed_at" >=
      (DATE '2026-07-23'::TIMESTAMP AT TIME ZONE 'UTC')
    AND feed."observed_at" <
      (DATE '2026-07-25'::TIMESTAMP AT TIME ZONE 'UTC')
  ORDER BY feed."id"
  FOR SHARE;
  PERFORM result."id"
  FROM "github_repository_trend_results" AS result
  WHERE result."tenant_id" = v_tenant_id
    AND result."workspace_id" = v_workspace_id
    AND result."observed_at" >=
      (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
    AND result."observed_at" <
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
        AND result."observed_at" >=
          (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
        AND result."observed_at" <
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
        AND result."observed_at" >=
          (DATE '2026-07-24'::TIMESTAMP AT TIME ZONE 'UTC')
        AND result."observed_at" <
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
  "derive_reader_summary_production_recovery_day"(
    UUID,
    UUID,
    UUID,
    DATE,
    TIMESTAMPTZ
  ),
  "prepare_reader_summary_production_recovery"()
FROM PUBLIC;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
