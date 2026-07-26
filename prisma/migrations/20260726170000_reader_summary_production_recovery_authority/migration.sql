-- @social-monitor-forward-migration
-- Database-owned, pre-model authority for the reviewed 2026-07-23/24 recovery.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE TABLE "reader_summary_production_recovery_leases" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "identity" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "canonical_record" JSONB NOT NULL,
  "canonical_bytes" BYTEA NOT NULL,
  "canonical_sha256" CHAR(64) NOT NULL,
  "issued_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  CONSTRAINT "reader_summary_production_recovery_leases_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "reader_summary_production_recovery_leases_state_check"
    CHECK (
      ("state" = 'ISSUED' AND "consumed_at" IS NULL)
      OR ("state" = 'CONSUMED' AND "consumed_at" IS NOT NULL)
    ),
  CONSTRAINT "reader_summary_production_recovery_leases_hash_check"
    CHECK ("canonical_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reader_summary_production_recovery_leases_record_check"
    CHECK (COALESCE(jsonb_typeof("canonical_record") = 'object', FALSE))
);

CREATE UNIQUE INDEX "reader_summary_production_recovery_leases_identity_key"
  ON "reader_summary_production_recovery_leases" ("identity");
CREATE UNIQUE INDEX "reader_summary_production_recovery_leases_scope_key"
  ON "reader_summary_production_recovery_leases"
    ("id", "tenant_id", "workspace_id");
CREATE INDEX "reader_summary_production_recovery_leases_scope_idx"
  ON "reader_summary_production_recovery_leases"
    ("tenant_id", "workspace_id", "issued_at");

CREATE TABLE "reader_summary_production_recovery_days" (
  "recovery_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "requested_utc_date" DATE NOT NULL,
  "identity" TEXT NOT NULL,
  "provider_counts" JSONB NOT NULL,
  "provider_evidence" JSONB NOT NULL,
  "provider_evidence_sha256" CHAR(64) NOT NULL,
  "github_evidence" JSONB NOT NULL,
  "canonical_record" JSONB NOT NULL,
  "canonical_bytes" BYTEA NOT NULL,
  "canonical_sha256" CHAR(64) NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reader_summary_production_recovery_days_pkey"
    PRIMARY KEY ("recovery_id", "requested_utc_date"),
  CONSTRAINT "reader_summary_production_recovery_days_lease_fkey"
    FOREIGN KEY ("recovery_id", "tenant_id", "workspace_id")
    REFERENCES "reader_summary_production_recovery_leases" ("id", "tenant_id", "workspace_id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT "reader_summary_production_recovery_days_date_check"
    CHECK ("requested_utc_date" IN (DATE '2026-07-23', DATE '2026-07-24')),
  CONSTRAINT "reader_summary_production_recovery_days_hashes_check"
    CHECK (
      "provider_evidence_sha256" ~ '^[0-9a-f]{64}$'
      AND "canonical_sha256" ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT "reader_summary_production_recovery_days_records_check"
    CHECK (
      COALESCE(jsonb_typeof("provider_counts") = 'array', FALSE)
      AND COALESCE(jsonb_typeof("provider_evidence") = 'object', FALSE)
      AND COALESCE(jsonb_typeof("github_evidence") = 'object', FALSE)
      AND COALESCE(jsonb_typeof("canonical_record") = 'object', FALSE)
    )
);

CREATE UNIQUE INDEX "reader_summary_production_recovery_days_identity_key"
  ON "reader_summary_production_recovery_days" ("identity");
CREATE UNIQUE INDEX "reader_summary_production_recovery_days_scope_day_key"
  ON "reader_summary_production_recovery_days"
    ("tenant_id", "workspace_id", "requested_utc_date");
CREATE INDEX "reader_summary_production_recovery_days_scope_idx"
  ON "reader_summary_production_recovery_days"
    ("tenant_id", "workspace_id", "requested_utc_date");

CREATE TABLE "reader_summary_production_recovery_dry_runs" (
  "recovery_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "ordinal" SMALLINT NOT NULL,
  "canonical_record" JSONB NOT NULL,
  "canonical_bytes" BYTEA NOT NULL,
  "canonical_sha256" CHAR(64) NOT NULL,
  "captured_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reader_summary_production_recovery_dry_runs_pkey"
    PRIMARY KEY ("recovery_id", "ordinal"),
  CONSTRAINT "reader_summary_production_recovery_dry_runs_lease_fkey"
    FOREIGN KEY ("recovery_id", "tenant_id", "workspace_id")
    REFERENCES "reader_summary_production_recovery_leases" ("id", "tenant_id", "workspace_id")
    ON DELETE RESTRICT
    ON UPDATE RESTRICT,
  CONSTRAINT "reader_summary_production_recovery_dry_runs_ordinal_check"
    CHECK ("ordinal" IN (1, 2)),
  CONSTRAINT "reader_summary_production_recovery_dry_runs_hash_check"
    CHECK ("canonical_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reader_summary_production_recovery_dry_runs_record_check"
    CHECK (COALESCE(jsonb_typeof("canonical_record") = 'object', FALSE))
);

CREATE INDEX "reader_summary_production_recovery_dry_runs_scope_idx"
  ON "reader_summary_production_recovery_dry_runs"
    ("tenant_id", "workspace_id", "recovery_id");

CREATE FUNCTION "reader_summary_production_recovery_expected_counts"(
  target_date DATE
) RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
RETURN CASE target_date
  WHEN DATE '2026-07-23' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 0),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 100),
    jsonb_build_object('providerKey', 'reddit', 'count', 100),
    jsonb_build_object('providerKey', 'rss', 'count', 75),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 67)
  )
  WHEN DATE '2026-07-24' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 10),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 100),
    jsonb_build_object('providerKey', 'reddit', 'count', 100),
    jsonb_build_object('providerKey', 'rss', 'count', 67),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 73)
  )
  ELSE NULL
END;

CREATE FUNCTION "reader_summary_production_recovery_uuid"(
  identity_sha256 TEXT
) RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF identity_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'production recovery identity hash is invalid';
  END IF;
  RETURN (
    substr(identity_sha256, 1, 8) || '-' ||
    substr(identity_sha256, 9, 4) || '-5' ||
    substr(identity_sha256, 14, 3) || '-8' ||
    substr(identity_sha256, 18, 3) || '-' ||
    substr(identity_sha256, 21, 12)
  )::UUID;
END;
$$;

CREATE FUNCTION "reader_summary_production_recovery_evidence_is_valid"(
  evidence JSONB,
  expected_provider TEXT
) RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
RETURN COALESCE(
  jsonb_typeof(evidence) = 'object'
  AND expected_provider = ANY(ARRAY[
    'github-trending-page',
    'hacker-news',
    'reddit',
    'rss',
    'x-twitter'
  ])
  AND evidence->>'providerKey' = expected_provider
  AND evidence ?& ARRAY[
    'providerKey',
    'feedItemId',
    'sourceItemId',
    'sourceBindingId',
    'providerItemId',
    'canonicalUrl',
    'sourceContentHash',
    'sourceProviderContentHash',
    'publishedAt',
    'observedAt'
  ]
  AND jsonb_object_length(evidence) = CASE
    WHEN expected_provider = 'github-trending-page' THEN 11
    ELSE 10
  END
  AND evidence->>'feedItemId' ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND evidence->>'sourceItemId' ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND evidence->>'sourceBindingId' ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  AND btrim(COALESCE(evidence->>'providerItemId', '')) <> ''
  AND btrim(COALESCE(evidence->>'canonicalUrl', '')) <> ''
  AND evidence->>'sourceContentHash' ~ '^[0-9a-f]{64}$'
  AND (
    evidence->'sourceProviderContentHash' = 'null'::JSONB
    OR evidence->>'sourceProviderContentHash' ~ '^[0-9a-f]{64}$'
  )
  AND evidence->>'publishedAt' ~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  AND evidence->>'observedAt' ~
    '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
  AND (
    (
      expected_provider <> 'github-trending-page'
      AND NOT evidence ? 'github'
    )
    OR (
      expected_provider = 'github-trending-page'
      AND jsonb_typeof(evidence->'github') = 'object'
      AND jsonb_object_length(evidence->'github') = 6
      AND evidence->'github' ?& ARRAY[
        'resultId',
        'scanJobId',
        'scanAttemptNumber',
        'repositoryIdentity',
        'rank',
        'checkedAt'
      ]
      AND evidence->'github'->>'resultId' ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND evidence->'github'->>'scanJobId' ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND evidence->'github'->>'scanAttemptNumber' ~
        '^[1-9][0-9]*$'
      AND btrim(COALESCE(
        evidence->'github'->>'repositoryIdentity',
        ''
      )) <> ''
      AND evidence->'github'->>'rank' ~ '^[1-9][0-9]*$'
      AND evidence->'github'->>'checkedAt' ~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    )
  ),
  FALSE
);

CREATE FUNCTION "derive_reader_summary_production_recovery_day"(
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
        AND feed."published_at" >=
          (target_date::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."published_at" <
          (v_period_end::TIMESTAMP AT TIME ZONE 'UTC')
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
        AND feed."published_at" >=
          (target_date::TIMESTAMP AT TIME ZONE 'UTC')
        AND feed."published_at" <
          (v_period_end::TIMESTAMP AT TIME ZONE 'UTC');
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

CREATE FUNCTION "guard_reader_summary_production_recovery_evidence"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting(
      'social_monitor.production_recovery_write',
      TRUE
    ) = 'on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting(
      'social_monitor.authorized_retention_purge',
      TRUE
    ) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'reader summary production recovery evidence is immutable';
END;
$$;

CREATE FUNCTION "guard_reader_summary_production_recovery_lease"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting(
      'social_monitor.production_recovery_write',
      TRUE
    ) = 'on'
    AND NEW."state" = 'ISSUED'
    AND NEW."consumed_at" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting(
      'social_monitor.production_recovery_write',
      TRUE
    ) = 'on'
    AND OLD."state" = 'ISSUED'
    AND OLD."consumed_at" IS NULL
    AND NEW."state" = 'CONSUMED'
    AND NEW."consumed_at" IS NOT NULL
    AND NEW."id" = OLD."id"
    AND NEW."tenant_id" = OLD."tenant_id"
    AND NEW."workspace_id" = OLD."workspace_id"
    AND NEW."identity" = OLD."identity"
    AND NEW."canonical_record" = OLD."canonical_record"
    AND NEW."canonical_bytes" = OLD."canonical_bytes"
    AND NEW."canonical_sha256" = OLD."canonical_sha256"
    AND NEW."issued_at" = OLD."issued_at" THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting(
      'social_monitor.authorized_retention_purge',
      TRUE
    ) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'reader summary production recovery lease is immutable';
END;
$$;

CREATE TRIGGER "reader_summary_production_recovery_days_immutable"
BEFORE INSERT OR UPDATE OR DELETE
ON "reader_summary_production_recovery_days"
FOR EACH ROW
EXECUTE FUNCTION "guard_reader_summary_production_recovery_evidence"();

CREATE TRIGGER "reader_summary_production_recovery_dry_runs_immutable"
BEFORE INSERT OR UPDATE OR DELETE
ON "reader_summary_production_recovery_dry_runs"
FOR EACH ROW
EXECUTE FUNCTION "guard_reader_summary_production_recovery_evidence"();

CREATE TRIGGER "reader_summary_production_recovery_leases_guarded"
BEFORE INSERT OR UPDATE OR DELETE
ON "reader_summary_production_recovery_leases"
FOR EACH ROW
EXECUTE FUNCTION "guard_reader_summary_production_recovery_lease"();

CREATE FUNCTION "read_reader_summary_production_recovery"(
  target_recovery_id UUID,
  target_outcome TEXT
) RETURNS TABLE (
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
LANGUAGE SQL
STABLE
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT
    target_outcome,
    lease."id",
    lease."tenant_id",
    lease."workspace_id",
    lease."identity",
    lease."canonical_record",
    lease."canonical_bytes",
    btrim(lease."canonical_sha256"),
    lease."state",
    lease."issued_at",
    lease."consumed_at",
    (
      SELECT jsonb_agg(jsonb_build_object(
        'ordinal', dry."ordinal",
        'canonicalSha256', btrim(dry."canonical_sha256")
      ) ORDER BY dry."ordinal")
      FROM "reader_summary_production_recovery_dry_runs" AS dry
      WHERE dry."recovery_id" = lease."id"
        AND dry."tenant_id" = lease."tenant_id"
        AND dry."workspace_id" = lease."workspace_id"
    ),
    (
      SELECT jsonb_agg(jsonb_build_object(
        'schemaVersion',
          day."canonical_record"->>'schemaVersion',
        'identity', day."identity",
        'requestedUtcDate',
          to_char(day."requested_utc_date", 'YYYY-MM-DD'),
        'period', day."canonical_record"->'period',
        'providerCounts', day."provider_counts",
        'providerEvidence', day."provider_evidence",
        'providerEvidenceSha256',
          btrim(day."provider_evidence_sha256"),
        'githubEvidence', day."github_evidence",
        'canonicalSha256', btrim(day."canonical_sha256")
      ) ORDER BY day."requested_utc_date")
      FROM "reader_summary_production_recovery_days" AS day
      WHERE day."recovery_id" = lease."id"
        AND day."tenant_id" = lease."tenant_id"
        AND day."workspace_id" = lease."workspace_id"
    )
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."id" = target_recovery_id
$$;

ALTER TABLE "reader_summary_production_recovery_leases"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_production_recovery_leases"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation"
  ON "reader_summary_production_recovery_leases"
  USING (
    public.social_monitor_rls_workspace_match(
      "tenant_id",
      "workspace_id"
    )
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match(
      "tenant_id",
      "workspace_id"
    )
  );

ALTER TABLE "reader_summary_production_recovery_days"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_production_recovery_days"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation"
  ON "reader_summary_production_recovery_days"
  USING (
    public.social_monitor_rls_workspace_match(
      "tenant_id",
      "workspace_id"
    )
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match(
      "tenant_id",
      "workspace_id"
    )
  );

ALTER TABLE "reader_summary_production_recovery_dry_runs"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_production_recovery_dry_runs"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation"
  ON "reader_summary_production_recovery_dry_runs"
  USING (
    public.social_monitor_rls_workspace_match(
      "tenant_id",
      "workspace_id"
    )
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match(
      "tenant_id",
      "workspace_id"
    )
  );

REVOKE ALL PRIVILEGES ON TABLE
  "reader_summary_production_recovery_leases",
  "reader_summary_production_recovery_days",
  "reader_summary_production_recovery_dry_runs"
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT SELECT ON TABLE
  "reader_summary_production_recovery_leases",
  "reader_summary_production_recovery_days",
  "reader_summary_production_recovery_dry_runs"
TO "social_monitor_reader_summary_publication_runtime";

REVOKE ALL PRIVILEGES ON FUNCTION
  "reader_summary_production_recovery_expected_counts"(DATE),
  "reader_summary_production_recovery_uuid"(TEXT),
  "reader_summary_production_recovery_evidence_is_valid"(JSONB, TEXT),
  "derive_reader_summary_production_recovery_day"(
    UUID,
    UUID,
    UUID,
    DATE,
    TIMESTAMPTZ
  ),
  "guard_reader_summary_production_recovery_evidence"(),
  "guard_reader_summary_production_recovery_lease"(),
  "read_reader_summary_production_recovery"(UUID, TEXT)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
