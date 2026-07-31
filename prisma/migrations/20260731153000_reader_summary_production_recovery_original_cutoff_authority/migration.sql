-- @social-monitor-forward-migration
-- Restore Jul23/Jul24 to the evidence visible at the original authority cutoff.
-- Lock risk: bounded row locks only; no table lock or source-data write.
-- Forward fix: restore this exact authority from its retained evidence rows.
-- Backfill: at most one unclaimed six-day production recovery authority.
-- Runtime: constant/bounded. Roll out after application migrations, before recovery.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT ("id", "tenant_id", "workspace_id", "scope"), UPDATE ("id")
ON "idempotency_keys"
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
SET LOCAL search_path = pg_catalog, public, pg_temp;
SET LOCAL social_monitor.system_access = 'false';
SET LOCAL social_monitor.tenant_id =
  '00000000-0000-7000-8000-000000000901';
SET LOCAL social_monitor.workspace_id =
  '00000000-0000-7000-8000-000000000902';

CREATE OR REPLACE FUNCTION
public."reader_summary_production_recovery_expected_counts_v2"(
  target_date DATE
)
RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
RETURN CASE target_date
  WHEN DATE '2026-07-23' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 0,
      'evidenceState', 'historical_unavailable'),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'reddit', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'rss', 'count', 75,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 67,
      'evidenceState', 'verified_existing')
  )
  WHEN DATE '2026-07-24' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 10,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'reddit', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'rss', 'count', 67,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 73,
      'evidenceState', 'verified_existing')
  )
  WHEN DATE '2026-07-25' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 10,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'reddit', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'rss', 'count', 63,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 96,
      'evidenceState', 'verified_existing')
  )
  WHEN DATE '2026-07-26' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 10,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 78,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'reddit', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'rss', 'count', 62,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 94,
      'evidenceState', 'verified_existing')
  )
  WHEN DATE '2026-07-27' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 10,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 87,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'reddit', 'count', 99,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'rss', 'count', 47,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 58,
      'evidenceState', 'verified_existing')
  )
  WHEN DATE '2026-07-28' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 0,
      'evidenceState', 'historical_unavailable'),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 0,
      'evidenceState', 'historical_unavailable'),
    jsonb_build_object('providerKey', 'reddit', 'count', 0,
      'evidenceState', 'historical_unavailable'),
    jsonb_build_object('providerKey', 'rss', 'count', 31,
      'evidenceState', 'partial_existing'),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 107,
      'evidenceState', 'partial_existing')
  )
  ELSE NULL
END;

CREATE OR REPLACE FUNCTION
public."guard_reader_summary_production_recovery_evidence"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting('social_monitor.production_recovery_write', TRUE) = 'on'
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting(
      'social_monitor.production_recovery_original_cutoff_write', TRUE
    ) = 'on' THEN
    IF TG_TABLE_NAME = 'reader_summary_production_recovery_days'
      AND NEW."recovery_id" = OLD."recovery_id"
      AND NEW."tenant_id" = OLD."tenant_id"
      AND NEW."workspace_id" = OLD."workspace_id"
      AND NEW."requested_utc_date" = OLD."requested_utc_date"
      AND NEW."recorded_at" = OLD."recorded_at"
      AND OLD."requested_utc_date" IN (
        DATE '2026-07-23', DATE '2026-07-24'
      ) THEN
      RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'reader_summary_production_recovery_dry_runs'
      AND NEW."recovery_id" = OLD."recovery_id"
      AND NEW."tenant_id" = OLD."tenant_id"
      AND NEW."workspace_id" = OLD."workspace_id"
      AND NEW."ordinal" = OLD."ordinal"
      AND NEW."captured_at" = OLD."captured_at" THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP = 'DELETE'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting('social_monitor.authorized_retention_purge', TRUE) = 'on'
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'reader summary production recovery evidence is immutable';
END;
$$;

CREATE OR REPLACE FUNCTION
public."guard_reader_summary_production_recovery_lease"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting('social_monitor.production_recovery_write', TRUE) = 'on'
    AND NEW."state" = 'ISSUED' AND NEW."consumed_at" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND NEW."id" = OLD."id"
    AND NEW."tenant_id" = OLD."tenant_id"
    AND NEW."workspace_id" = OLD."workspace_id"
    AND NEW."identity" = OLD."identity"
    AND NEW."issued_at" = OLD."issued_at" THEN
    IF current_setting('social_monitor.production_recovery_write', TRUE) = 'on'
      AND OLD."state" = 'ISSUED' AND OLD."consumed_at" IS NULL
      AND NEW."state" = 'CONSUMED' AND NEW."consumed_at" IS NOT NULL
      AND NEW."canonical_record" = OLD."canonical_record"
      AND NEW."canonical_bytes" = OLD."canonical_bytes"
      AND NEW."canonical_sha256" = OLD."canonical_sha256" THEN
      RETURN NEW;
    END IF;
    IF current_setting(
        'social_monitor.production_recovery_original_cutoff_write', TRUE
      ) = 'on'
      AND NEW."state" = OLD."state"
      AND NEW."consumed_at" IS NOT DISTINCT FROM OLD."consumed_at" THEN
      RETURN NEW;
    END IF;
  END IF;
  IF TG_OP = 'DELETE'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting('social_monitor.authorized_retention_purge', TRUE) = 'on'
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'reader summary production recovery lease is immutable';
END;
$$;

CREATE OR REPLACE FUNCTION
public."repair_reader_summary_production_recovery_original_cutoff_v2"()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_authority JSONB;
  v_authority_bytes BYTEA;
  v_authority_sha TEXT;
  v_changed BOOLEAN;
  v_claim_count INTEGER;
  v_corrected INTEGER := 0;
  v_count INTEGER;
  v_exact_count INTEGER;
  v_date DATE;
  v_day "reader_summary_production_recovery_days"%ROWTYPE;
  v_day_bytes BYTEA;
  v_day_record JSONB;
  v_day_sha TEXT;
  v_digests JSONB;
  v_evidence JSONB;
  v_evidence_sha TEXT;
  v_expected JSONB;
  v_expected_count INTEGER;
  v_lease "reader_summary_production_recovery_leases"%ROWTYPE;
  v_legacy_count INTEGER;
  v_job_count INTEGER;
  v_legacy_expected JSONB;
  v_plan_days JSONB;
  v_provider TEXT;
  v_publication_count INTEGER;
  v_receipt_count INTEGER;
  v_rss JSONB;
BEGIN
  SELECT
    count(*)::INTEGER,
    count(*) FILTER (
      WHERE lease."canonical_record"->>'schemaVersion' =
          'reader_summary.production_recovery_authority.v2'
        AND lease."canonical_record"->'requestedUtcDates' =
          jsonb_build_array(
            '2026-07-23', '2026-07-24', '2026-07-25',
            '2026-07-26', '2026-07-27', '2026-07-28'
          )
    )::INTEGER
  INTO v_legacy_count, v_exact_count
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" =
      '00000000-0000-7000-8000-000000000901'::UUID
    AND lease."workspace_id" =
      '00000000-0000-7000-8000-000000000902'::UUID
    AND lease."identity" LIKE 'reader_summary.production_recovery.v2:%';
  IF v_legacy_count > 1 OR v_exact_count <> v_legacy_count THEN
    RAISE EXCEPTION
      'original-cutoff repair refuses non-exact legacy authority state';
  END IF;

  FOR v_lease IN
    SELECT lease.*
    FROM "reader_summary_production_recovery_leases" AS lease
    WHERE lease."tenant_id" =
        '00000000-0000-7000-8000-000000000901'::UUID
      AND lease."workspace_id" =
        '00000000-0000-7000-8000-000000000902'::UUID
      AND lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_authority.v2'
      AND lease."canonical_record"->'requestedUtcDates' = jsonb_build_array(
        '2026-07-23', '2026-07-24', '2026-07-25',
        '2026-07-26', '2026-07-27', '2026-07-28'
      )
    ORDER BY lease."id"
    FOR UPDATE OF lease
  LOOP
    IF v_lease."state" <> 'CONSUMED'
      OR v_lease."consumed_at" IS DISTINCT FROM v_lease."issued_at"
      OR jsonb_typeof(v_lease."canonical_record") IS DISTINCT FROM 'object'
      OR jsonb_object_length(v_lease."canonical_record") <> 8
      OR v_lease."canonical_record"->>'recoveryId' IS DISTINCT FROM
        v_lease."id"::TEXT
      OR v_lease."canonical_record"->>'identity' IS DISTINCT FROM
        v_lease."identity"
      OR v_lease."canonical_record"->>'tenantId' IS DISTINCT FROM
        v_lease."tenant_id"::TEXT
      OR v_lease."canonical_record"->>'workspaceId' IS DISTINCT FROM
        v_lease."workspace_id"::TEXT
      OR v_lease."canonical_bytes" IS DISTINCT FROM convert_to(
        "reader_summary_weekly_canonical_json"(v_lease."canonical_record"),
        'UTF8'
      )
      OR btrim(v_lease."canonical_sha256") IS DISTINCT FROM
        encode(sha256(v_lease."canonical_bytes"), 'hex')
      OR v_lease."canonical_record"->'boundaries' IS DISTINCT FROM
        jsonb_build_object(
          'stage', 'pre_model',
          'modelCallPerformed', FALSE,
          'publicationPerformed', FALSE,
          'recollectionPerformed', FALSE
        ) THEN
      RAISE EXCEPTION
        'original-cutoff repair requires exact unclaimed pre-model authority';
    END IF;

    PERFORM day."recovery_id"
    FROM "reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = v_lease."id"
      AND day."tenant_id" = v_lease."tenant_id"
      AND day."workspace_id" = v_lease."workspace_id"
    ORDER BY day."requested_utc_date"
    FOR UPDATE OF day;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 6 OR (
      SELECT jsonb_agg(to_char(day."requested_utc_date", 'YYYY-MM-DD')
        ORDER BY day."requested_utc_date")
      FROM "reader_summary_production_recovery_days" AS day
      WHERE day."recovery_id" = v_lease."id"
    ) IS DISTINCT FROM v_lease."canonical_record"->'requestedUtcDates' THEN
      RAISE EXCEPTION 'original-cutoff repair requires exact six-day rows';
    END IF;

    PERFORM dry."ordinal"
    FROM "reader_summary_production_recovery_dry_runs" AS dry
    WHERE dry."recovery_id" = v_lease."id"
      AND dry."tenant_id" = v_lease."tenant_id"
      AND dry."workspace_id" = v_lease."workspace_id"
    ORDER BY dry."ordinal"
    FOR UPDATE OF dry;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count <> 2 OR EXISTS (
      SELECT 1
      FROM "reader_summary_production_recovery_dry_runs" AS dry
      WHERE dry."recovery_id" = v_lease."id"
        AND (
          dry."tenant_id" IS DISTINCT FROM v_lease."tenant_id"
          OR dry."workspace_id" IS DISTINCT FROM v_lease."workspace_id"
          OR dry."ordinal" NOT IN (1, 2)
          OR dry."canonical_record" IS DISTINCT FROM
            v_lease."canonical_record"
          OR dry."canonical_bytes" IS DISTINCT FROM
            v_lease."canonical_bytes"
          OR btrim(dry."canonical_sha256") IS DISTINCT FROM
            btrim(v_lease."canonical_sha256")
          OR dry."captured_at" IS DISTINCT FROM v_lease."issued_at"
        )
    ) THEN
      RAISE EXCEPTION
        'original-cutoff repair requires two identical persisted dry runs';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "reader_summary_production_recovery_days" AS day
      CROSS JOIN LATERAL jsonb_each(day."provider_evidence") AS provider(key, value)
      CROSS JOIN LATERAL jsonb_array_elements(provider.value) AS evidence(entry)
      WHERE day."recovery_id" = v_lease."id"
        AND (
          evidence.entry->>'feedItemId' IS NULL
          OR evidence.entry->>'sourceItemId' IS NULL
        )
    ) OR (
      SELECT count(*) <> count(DISTINCT evidence.entry->>'feedItemId')
        OR count(*) <> count(DISTINCT evidence.entry->>'sourceItemId')
      FROM "reader_summary_production_recovery_days" AS day
      CROSS JOIN LATERAL jsonb_each(day."provider_evidence") AS provider(key, value)
      CROSS JOIN LATERAL jsonb_array_elements(provider.value) AS evidence(entry)
      WHERE day."recovery_id" = v_lease."id"
    ) THEN
      RAISE EXCEPTION
        'original-cutoff repair refuses duplicated legacy evidence';
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
      'identity', day."identity",
      'requestedUtcDate', to_char(day."requested_utc_date", 'YYYY-MM-DD'),
      'canonicalSha256', btrim(day."canonical_sha256"),
      'providerEvidenceSha256', btrim(day."provider_evidence_sha256"),
      'planSha256s', jsonb_build_array(
        btrim(day."canonical_sha256"), btrim(day."canonical_sha256")
      )
    ) ORDER BY day."requested_utc_date")
    INTO v_plan_days
    FROM "reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = v_lease."id"
      AND day."tenant_id" = v_lease."tenant_id"
      AND day."workspace_id" = v_lease."workspace_id";
    IF v_lease."canonical_record"->'days' IS DISTINCT FROM v_plan_days THEN
      RAISE EXCEPTION
        'original-cutoff legacy authority plan diverged';
    END IF;

    PERFORM claim."id"
    FROM "idempotency_keys" AS claim
    WHERE claim."tenant_id" = v_lease."tenant_id"
      AND claim."workspace_id" = v_lease."workspace_id"
      AND claim."scope" IN (
        'reader-summary-production-recovery-model-v2',
        'reader-summary-production-recovery-model-retry-v1',
        'reader-summary-production-recovery-model-resume-v1',
        'reader-summary-production-recovery-model-quality-remediation-v1',
        'reader-summary-production-recovery-model-quality-remediation-resume-v1'
      )
    ORDER BY claim."id"
    FOR UPDATE OF claim;
    GET DIAGNOSTICS v_claim_count = ROW_COUNT;

    PERFORM job."id"
    FROM "reader_summary_jobs" AS job
    WHERE job."tenant_id" = v_lease."tenant_id"
      AND job."workspace_id" = v_lease."workspace_id"
      AND job."period_started_at" >= TIMESTAMPTZ '2026-07-23T00:00:00Z'
      AND job."period_started_at" < TIMESTAMPTZ '2026-07-29T00:00:00Z'
      AND (
        job."idempotency_key" LIKE 'reader-summary-production-recovery%'
        OR job."idempotency_key" LIKE
          'reader_summary.production_recovery.%'
      )
    ORDER BY job."id"
    FOR UPDATE OF job;
    GET DIAGNOSTICS v_job_count = ROW_COUNT;

    PERFORM publication."id"
    FROM "reader_summary_publications" AS publication
    JOIN "reader_summary_jobs" AS job
      ON job."id" = publication."reader_summary_job_id"
      AND job."tenant_id" = publication."tenant_id"
      AND job."workspace_id" = publication."workspace_id"
    WHERE job."tenant_id" = v_lease."tenant_id"
      AND job."workspace_id" = v_lease."workspace_id"
      AND job."period_started_at" >= TIMESTAMPTZ '2026-07-23T00:00:00Z'
      AND job."period_started_at" < TIMESTAMPTZ '2026-07-29T00:00:00Z'
      AND (job."idempotency_key" LIKE 'reader-summary-production-recovery%'
        OR job."idempotency_key" LIKE 'reader_summary.production_recovery.%')
    ORDER BY publication."id"
    FOR UPDATE OF publication;
    GET DIAGNOSTICS v_publication_count = ROW_COUNT;

    PERFORM receipt."publication_id"
    FROM "reader_summary_recovery_receipts" AS receipt
    JOIN "reader_summary_jobs" AS job
      ON job."id" = receipt."reader_summary_job_id"
      AND job."tenant_id" = receipt."tenant_id"
      AND job."workspace_id" = receipt."workspace_id"
    WHERE job."tenant_id" = v_lease."tenant_id"
      AND job."workspace_id" = v_lease."workspace_id"
      AND job."period_started_at" >= TIMESTAMPTZ '2026-07-23T00:00:00Z'
      AND job."period_started_at" < TIMESTAMPTZ '2026-07-29T00:00:00Z'
      AND (job."idempotency_key" LIKE 'reader-summary-production-recovery%'
        OR job."idempotency_key" LIKE 'reader_summary.production_recovery.%')
    ORDER BY receipt."publication_id"
    FOR UPDATE OF receipt;
    GET DIAGNOSTICS v_receipt_count = ROW_COUNT;
    IF v_receipt_count <> 0 THEN
      RAISE EXCEPTION 'original-cutoff repair refuses model receipt state';
    ELSIF v_publication_count <> 0 THEN
      RAISE EXCEPTION 'original-cutoff repair refuses published state';
    ELSIF v_job_count <> 0 OR v_claim_count <> 0 THEN
      RAISE EXCEPTION
        'original-cutoff repair refuses consumed model/job state';
    END IF;

    v_changed := FALSE;
    FOREACH v_date IN ARRAY ARRAY[DATE '2026-07-23', DATE '2026-07-24']
    LOOP
      SELECT day.* INTO STRICT v_day
      FROM "reader_summary_production_recovery_days" AS day
      WHERE day."recovery_id" = v_lease."id"
        AND day."tenant_id" = v_lease."tenant_id"
        AND day."workspace_id" = v_lease."workspace_id"
        AND day."requested_utc_date" = v_date;
      v_expected :=
        "reader_summary_production_recovery_expected_counts_v2"(v_date);
      v_evidence := v_day."provider_evidence";
      v_legacy_expected := jsonb_set(
        v_expected,
        '{3,count}',
        to_jsonb(CASE WHEN v_date = DATE '2026-07-23' THEN 78 ELSE 68 END),
        FALSE
      );
      IF jsonb_typeof(v_evidence) IS DISTINCT FROM 'object'
        OR jsonb_object_length(v_evidence) <> 5
        OR NOT v_evidence ?& ARRAY[
          'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
        ]
        OR (
          v_day."provider_counts" IS DISTINCT FROM v_expected
          AND v_day."provider_counts" IS DISTINCT FROM v_legacy_expected
        ) THEN
        RAISE EXCEPTION
          'original-cutoff provider evidence shape or counts diverged';
      END IF;
      v_digests := '[]'::JSONB;
      FOREACH v_provider IN ARRAY ARRAY[
        'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
      ] LOOP
        SELECT (entry->>'count')::INTEGER
        INTO STRICT v_expected_count
        FROM jsonb_array_elements(v_day."provider_counts") AS count(entry)
        WHERE entry->>'providerKey' = v_provider;
        IF jsonb_typeof(v_evidence->v_provider) IS DISTINCT FROM 'array'
          OR jsonb_array_length(v_evidence->v_provider) <> v_expected_count
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_evidence->v_provider) AS item(entry)
            WHERE item.entry->>'providerKey' IS DISTINCT FROM v_provider
              OR (item.entry->>'feedItemId' ~ '^[0-9a-f-]{36}$')
                IS DISTINCT FROM TRUE
              OR (item.entry->>'sourceItemId' ~ '^[0-9a-f-]{36}$')
                IS DISTINCT FROM TRUE
              OR (item.entry->>'sourceBindingId' ~ '^[0-9a-f-]{36}$')
                IS DISTINCT FROM TRUE
              OR (item.entry->>'interestId' ~ '^[0-9a-f-]{36}$')
                IS DISTINCT FROM TRUE
              OR (item.entry->>'sourceContentHash' ~ '^[0-9a-f]{64}$')
                IS DISTINCT FROM TRUE
          ) THEN
          RAISE EXCEPTION
            'original-cutoff legacy % evidence diverged for %',
            v_provider, v_date;
        END IF;
        v_evidence_sha := encode(sha256(convert_to(
          "reader_summary_production_recovery_canonical_json"(
            v_evidence->v_provider
          ), 'UTF8'
        )), 'hex');
        v_digests := v_digests || jsonb_build_array(jsonb_build_object(
          'providerKey', v_provider,
          'count', v_expected_count,
          'sha256', v_evidence_sha
        ));
      END LOOP;
      v_evidence_sha := encode(sha256(convert_to(
        "reader_summary_production_recovery_canonical_json"(v_digests),
        'UTF8'
      )), 'hex');
      v_day_record := jsonb_build_object(
        'schemaVersion', 'reader_summary.production_recovery_day.v2',
        'recoveryId', v_lease."id"::TEXT,
        'tenantId', v_lease."tenant_id"::TEXT,
        'workspaceId', v_lease."workspace_id"::TEXT,
        'requestedUtcDate', to_char(v_date, 'YYYY-MM-DD'),
        'period', jsonb_build_object(
          'startedAt', to_char(v_date, 'YYYY-MM-DD') || 'T00:00:00.000Z',
          'endedAt', to_char(v_date + 1, 'YYYY-MM-DD') || 'T00:00:00.000Z',
          'timezone', 'UTC'
        ),
        'providerCounts', v_day."provider_counts",
        'providerEvidenceDigests', v_digests,
        'providerEvidenceSha256', v_evidence_sha,
        'githubEvidence', v_day."github_evidence"
      );
      v_day_bytes := convert_to(
        "reader_summary_weekly_canonical_json"(v_day_record), 'UTF8'
      );
      v_day_sha := encode(sha256(v_day_bytes), 'hex');
      IF v_day."canonical_record" IS DISTINCT FROM v_day_record
        OR v_day."canonical_bytes" IS DISTINCT FROM v_day_bytes
        OR btrim(v_day."provider_evidence_sha256") IS DISTINCT FROM
          v_evidence_sha
        OR btrim(v_day."canonical_sha256") IS DISTINCT FROM v_day_sha
        OR v_day."identity" IS DISTINCT FROM
          'reader_summary.production_recovery_day.v2:' || v_day_sha THEN
        RAISE EXCEPTION
          'original-cutoff legacy daily seal diverged for %', v_date;
      END IF;
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_evidence->'rss') AS item(entry)
        WHERE (item.entry->>'observedAt' ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        ) IS DISTINCT FROM TRUE
      ) THEN
        RAISE EXCEPTION
          'original-cutoff RSS observation timestamp diverged';
      END IF;
      SELECT COALESCE(jsonb_agg(item.entry ORDER BY item.ordinal), '[]'::JSONB)
      INTO v_rss
      FROM jsonb_array_elements(v_evidence->'rss')
        WITH ORDINALITY AS item(entry, ordinal)
      WHERE item.entry->>'observedAt' ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
        AND (item.entry->>'observedAt')::TIMESTAMPTZ <= v_lease."issued_at";
      IF jsonb_array_length(v_evidence->'rss') NOT IN (
          (CASE WHEN v_date = DATE '2026-07-23' THEN 75 ELSE 67 END),
          (CASE WHEN v_date = DATE '2026-07-23' THEN 78 ELSE 68 END)
        )
        OR jsonb_array_length(v_rss) <>
          (CASE WHEN v_date = DATE '2026-07-23' THEN 75 ELSE 67 END) THEN
        RAISE EXCEPTION
          'original-cutoff RSS evidence is not the reviewed exact set';
      END IF;
      v_evidence := jsonb_set(v_evidence, '{rss}', v_rss, FALSE);
      v_digests := '[]'::JSONB;
      FOREACH v_provider IN ARRAY ARRAY[
        'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
      ] LOOP
        SELECT (expected.entry->>'count')::INTEGER
        INTO STRICT v_expected_count
        FROM jsonb_array_elements(v_expected) AS expected(entry)
        WHERE expected.entry->>'providerKey' = v_provider;
        IF jsonb_typeof(v_evidence->v_provider) IS DISTINCT FROM 'array'
          OR jsonb_array_length(v_evidence->v_provider) <> v_expected_count THEN
          RAISE EXCEPTION
            'original-cutoff % evidence count diverged for %',
            v_provider, v_date;
        END IF;
        v_evidence_sha := encode(sha256(convert_to(
          "reader_summary_production_recovery_canonical_json"(
            v_evidence->v_provider
          ), 'UTF8'
        )), 'hex');
        v_digests := v_digests || jsonb_build_array(jsonb_build_object(
          'providerKey', v_provider,
          'count', v_expected_count,
          'sha256', v_evidence_sha
        ));
      END LOOP;
      v_evidence_sha := encode(sha256(convert_to(
        "reader_summary_production_recovery_canonical_json"(v_digests),
        'UTF8'
      )), 'hex');
      v_day_record := jsonb_build_object(
        'schemaVersion', 'reader_summary.production_recovery_day.v2',
        'recoveryId', v_lease."id"::TEXT,
        'tenantId', v_lease."tenant_id"::TEXT,
        'workspaceId', v_lease."workspace_id"::TEXT,
        'requestedUtcDate', to_char(v_date, 'YYYY-MM-DD'),
        'period', v_day."canonical_record"->'period',
        'providerCounts', v_expected,
        'providerEvidenceDigests', v_digests,
        'providerEvidenceSha256', v_evidence_sha,
        'githubEvidence', v_day."github_evidence"
      );
      v_day_bytes := convert_to(
        "reader_summary_weekly_canonical_json"(v_day_record), 'UTF8'
      );
      v_day_sha := encode(sha256(v_day_bytes), 'hex');
      IF v_day."provider_evidence" IS DISTINCT FROM v_evidence
        OR v_day."provider_counts" IS DISTINCT FROM v_expected
        OR btrim(v_day."canonical_sha256") <> v_day_sha THEN
        v_changed := TRUE;
        PERFORM set_config(
          'social_monitor.production_recovery_original_cutoff_write',
          'on', TRUE
        );
        UPDATE "reader_summary_production_recovery_days" AS day
        SET
          "identity" =
            'reader_summary.production_recovery_day.v2:' || v_day_sha,
          "provider_counts" = v_expected,
          "provider_evidence" = v_evidence,
          "provider_evidence_sha256" = v_evidence_sha,
          "canonical_record" = v_day_record,
          "canonical_bytes" = v_day_bytes,
          "canonical_sha256" = v_day_sha
        WHERE day."recovery_id" = v_lease."id"
          AND day."tenant_id" = v_lease."tenant_id"
          AND day."workspace_id" = v_lease."workspace_id"
          AND day."requested_utc_date" = v_date;
      END IF;
    END LOOP;

    SELECT jsonb_agg(jsonb_build_object(
      'identity', day."identity",
      'requestedUtcDate', to_char(day."requested_utc_date", 'YYYY-MM-DD'),
      'canonicalSha256', btrim(day."canonical_sha256"),
      'providerEvidenceSha256', btrim(day."provider_evidence_sha256"),
      'planSha256s', jsonb_build_array(
        btrim(day."canonical_sha256"), btrim(day."canonical_sha256")
      )
    ) ORDER BY day."requested_utc_date")
    INTO v_plan_days
    FROM "reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = v_lease."id"
      AND day."tenant_id" = v_lease."tenant_id"
      AND day."workspace_id" = v_lease."workspace_id";
    v_authority := jsonb_set(
      v_lease."canonical_record", '{days}', v_plan_days, FALSE
    );
    v_authority_bytes := convert_to(
      "reader_summary_weekly_canonical_json"(v_authority), 'UTF8'
    );
    v_authority_sha := encode(sha256(v_authority_bytes), 'hex');
    IF v_lease."canonical_record" IS DISTINCT FROM v_authority
      OR btrim(v_lease."canonical_sha256") <> v_authority_sha THEN
      v_changed := TRUE;
      PERFORM set_config(
        'social_monitor.production_recovery_original_cutoff_write', 'on', TRUE
      );
      UPDATE "reader_summary_production_recovery_dry_runs" AS dry
      SET
        "canonical_record" = v_authority,
        "canonical_bytes" = v_authority_bytes,
        "canonical_sha256" = v_authority_sha
      WHERE dry."recovery_id" = v_lease."id"
        AND dry."tenant_id" = v_lease."tenant_id"
        AND dry."workspace_id" = v_lease."workspace_id";
      UPDATE "reader_summary_production_recovery_leases" AS lease
      SET
        "canonical_record" = v_authority,
        "canonical_bytes" = v_authority_bytes,
        "canonical_sha256" = v_authority_sha
      WHERE lease."id" = v_lease."id"
        AND lease."tenant_id" = v_lease."tenant_id"
        AND lease."workspace_id" = v_lease."workspace_id"
        AND lease."state" = v_lease."state"
        AND lease."consumed_at" IS NOT DISTINCT FROM v_lease."consumed_at";
    END IF;
    PERFORM set_config(
      'social_monitor.production_recovery_original_cutoff_write', 'off', TRUE
    );
    PERFORM "validate_reader_summary_production_recovery"(v_lease."id");
    IF v_changed THEN v_corrected := v_corrected + 1; END IF;
  END LOOP;
  RETURN v_corrected;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public."reader_summary_production_recovery_expected_counts_v2"(DATE),
  public."guard_reader_summary_production_recovery_evidence"(),
  public."guard_reader_summary_production_recovery_lease"(),
  public."repair_reader_summary_production_recovery_original_cutoff_v2"()
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

SELECT public."repair_reader_summary_production_recovery_original_cutoff_v2"();
DROP FUNCTION public."repair_reader_summary_production_recovery_original_cutoff_v2"();

-- Restore the immutable trigger guards in the same transaction. The narrow
-- repair GUC is never committed as a durable mutation capability.
CREATE OR REPLACE FUNCTION
public."guard_reader_summary_production_recovery_evidence"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting('social_monitor.production_recovery_write', TRUE) = 'on'
  THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting('social_monitor.authorized_retention_purge', TRUE) = 'on'
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'reader summary production recovery evidence is immutable';
END;
$$;

CREATE OR REPLACE FUNCTION
public."guard_reader_summary_production_recovery_lease"()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting('social_monitor.production_recovery_write', TRUE) = 'on'
    AND NEW."state" = 'ISSUED'
    AND NEW."consumed_at" IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND current_user = 'social_monitor_reader_summary_publication_owner'
    AND current_setting('social_monitor.production_recovery_write', TRUE) = 'on'
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
    AND current_setting('social_monitor.authorized_retention_purge', TRUE) = 'on'
  THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'reader summary production recovery lease is immutable';
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public."guard_reader_summary_production_recovery_evidence"(),
  public."guard_reader_summary_production_recovery_lease"()
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

-- The daily-terminal migration revoked these reads after recovery first
-- narrowed them. Restore only the columns required by the runtime authority.
GRANT SELECT (
  "id", "tenant_id", "workspace_id", "identity", "state",
  "canonical_record", "canonical_sha256", "issued_at", "consumed_at"
) ON "reader_summary_production_recovery_leases"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "recovery_id", "tenant_id", "workspace_id", "requested_utc_date",
  "identity", "provider_counts", "provider_evidence",
  "provider_evidence_sha256", "github_evidence", "canonical_record",
  "canonical_sha256"
) ON "reader_summary_production_recovery_days"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "recovery_id", "tenant_id", "workspace_id", "ordinal",
  "canonical_sha256"
) ON "reader_summary_production_recovery_dry_runs"
TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE SELECT ("id", "tenant_id", "workspace_id", "scope"), UPDATE ("id")
ON "idempotency_keys"
FROM "social_monitor_reader_summary_publication_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
