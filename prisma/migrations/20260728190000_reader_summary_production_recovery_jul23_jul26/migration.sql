-- @social-monitor-forward-migration
-- Exact Jul23-Jul26 DB-derived production recovery authority persistence.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

ALTER TABLE "reader_summary_production_recovery_days"
  DROP CONSTRAINT "reader_summary_production_recovery_days_date_check";
ALTER TABLE "reader_summary_production_recovery_days"
  ADD CONSTRAINT "reader_summary_production_recovery_days_date_check"
  CHECK ("requested_utc_date" IN (
    DATE '2026-07-23',
    DATE '2026-07-24',
    DATE '2026-07-25',
    DATE '2026-07-26'
  ));

CREATE FUNCTION "reader_summary_production_recovery_expected_counts_v2"(
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
  WHEN DATE '2026-07-25' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 10),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 100),
    jsonb_build_object('providerKey', 'reddit', 'count', 100),
    jsonb_build_object('providerKey', 'rss', 'count', 62),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 96)
  )
  WHEN DATE '2026-07-26' THEN jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 10),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 78),
    jsonb_build_object('providerKey', 'reddit', 'count', 100),
    jsonb_build_object('providerKey', 'rss', 'count', 59),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 94)
  )
  ELSE NULL
END;

CREATE FUNCTION "persist_reader_summary_production_recovery_v2"(
  binding JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actual_sha TEXT;
  v_authority_record JSONB;
  v_authority_bytes BYTEA;
  v_authority_sha TEXT;
  v_date DATE;
  v_day JSONB;
  v_day_count INTEGER := 0;
  v_day_record JSONB;
  v_day_sha TEXT;
  v_digests JSONB;
  v_dry_hashes JSONB;
  v_evidence JSONB;
  v_evidence_sha TEXT;
  v_expected JSONB;
  v_expected_count INTEGER;
  v_github JSONB;
  v_identity TEXT;
  v_identity_body JSONB;
  v_identity_sha TEXT;
  v_issued_at TIMESTAMPTZ(6);
  v_plan_days JSONB := '[]'::JSONB;
  v_provider TEXT;
  v_recovery_id UUID;
  v_tenant_id UUID;
  v_workspace_id UUID;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR current_setting(
      'social_monitor.system_access',
      TRUE
    ) IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION
      'production recovery v2 requires a writable SERIALIZABLE tenant session';
  END IF;
  IF jsonb_typeof(binding) IS DISTINCT FROM 'object'
    OR jsonb_object_length(binding) <> 11
    OR binding->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.production_recovery_authority.v2'
    OR binding->'requestedUtcDates' IS DISTINCT FROM jsonb_build_array(
      '2026-07-23',
      '2026-07-24',
      '2026-07-25',
      '2026-07-26'
    )
    OR jsonb_array_length(binding->'days') <> 4
    OR binding->'boundaries' IS DISTINCT FROM jsonb_build_object(
      'stage', 'pre_model',
      'modelCallPerformed', FALSE,
      'publicationPerformed', FALSE,
      'recollectionPerformed', FALSE
    )
    OR binding->'lease'->>'state' IS DISTINCT FROM 'CONSUMED'
    OR binding->'lease'->>'issuedAt' IS DISTINCT FROM
      binding->'lease'->>'consumedAt'
    OR binding->'lease'->>'issuedAt' !~
      '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    OR binding->>'canonicalSha256' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'production recovery v2 binding diverged';
  END IF;

  v_recovery_id := (binding->>'recoveryId')::UUID;
  v_tenant_id := (binding->>'tenantId')::UUID;
  v_workspace_id := (binding->>'workspaceId')::UUID;
  v_identity := binding->>'identity';
  v_issued_at := (binding->'lease'->>'issuedAt')::TIMESTAMPTZ;

  -- JavaScript Date and canonical JSON are millisecond precise. Persist the
  -- same truncated transaction instant in both lease columns.
  IF v_tenant_id IS DISTINCT FROM
      NULLIF(current_setting('social_monitor.tenant_id', TRUE), '')::UUID
    OR v_workspace_id IS DISTINCT FROM
      NULLIF(current_setting('social_monitor.workspace_id', TRUE), '')::UUID
    OR v_issued_at IS DISTINCT FROM
      date_trunc('milliseconds', transaction_timestamp()) THEN
    RAISE EXCEPTION
      'production recovery lease timestamp diverged';
  END IF;

  v_identity_body := jsonb_build_object(
    'schemaVersion', 'reader_summary.production_recovery_identity.v2',
    'tenantId', v_tenant_id::TEXT,
    'workspaceId', v_workspace_id::TEXT,
    'requestedUtcDates', binding->'requestedUtcDates'
  );
  v_identity_sha := encode(sha256(convert_to(
    "reader_summary_weekly_canonical_json"(v_identity_body),
    'UTF8'
  )), 'hex');
  IF v_recovery_id <>
      "reader_summary_production_recovery_uuid"(v_identity_sha)
    OR v_identity <>
      'reader_summary.production_recovery.v2:' || v_identity_sha THEN
    RAISE EXCEPTION 'production recovery v2 identity diverged';
  END IF;

  IF (
    SELECT count(*) <> count(DISTINCT evidence.entry->>'feedItemId')
      OR count(*) <> count(DISTINCT evidence.entry->>'sourceItemId')
    FROM jsonb_array_elements(binding->'days') AS day(entry)
    CROSS JOIN LATERAL
      jsonb_each(day.entry->'providerEvidence') AS provider(key, value)
    CROSS JOIN LATERAL
      jsonb_array_elements(provider.value) AS evidence(entry)
  ) THEN
    RAISE EXCEPTION 'production recovery v2 evidence is duplicated';
  END IF;

  FOR v_day IN
    SELECT entry
    FROM jsonb_array_elements(binding->'days') AS day(entry)
    ORDER BY entry->>'requestedUtcDate'
  LOOP
    v_day_count := v_day_count + 1;
    v_date := (v_day->>'requestedUtcDate')::DATE;
    v_expected :=
      "reader_summary_production_recovery_expected_counts_v2"(v_date);
    IF v_expected IS NULL
      OR v_day->>'schemaVersion' IS DISTINCT FROM
        'reader_summary.production_recovery_day.v2'
      OR v_day->'period' IS DISTINCT FROM jsonb_build_object(
        'startedAt', to_char(v_date, 'YYYY-MM-DD') ||
          'T00:00:00.000Z',
        'endedAt', to_char(v_date + 1, 'YYYY-MM-DD') ||
          'T00:00:00.000Z',
        'timezone', 'UTC'
      )
      OR v_day->'providerCounts' IS DISTINCT FROM v_expected
      OR v_day->>'providerEvidenceSha256' !~ '^[0-9a-f]{64}$'
      OR v_day->>'canonicalSha256' !~ '^[0-9a-f]{64}$'
      OR v_day->'planSha256s' IS DISTINCT FROM jsonb_build_array(
        v_day->>'canonicalSha256',
        v_day->>'canonicalSha256'
      ) THEN
      RAISE EXCEPTION
        'production recovery v2 day authority diverged for %',
        v_date;
    END IF;

    v_digests := '[]'::JSONB;
    FOREACH v_provider IN ARRAY ARRAY[
      'github-trending-page',
      'hacker-news',
      'reddit',
      'rss',
      'x-twitter'
    ] LOOP
      v_evidence := v_day->'providerEvidence'->v_provider;
      SELECT (entry->>'count')::INTEGER
      INTO STRICT v_expected_count
      FROM jsonb_array_elements(v_expected) AS expected(entry)
      WHERE entry->>'providerKey' = v_provider;
      IF jsonb_typeof(v_evidence) IS DISTINCT FROM 'array'
        OR jsonb_array_length(v_evidence) <> v_expected_count
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(v_evidence) AS evidence(entry)
          WHERE evidence.entry->>'providerKey' IS DISTINCT FROM
            v_provider
            OR evidence.entry->>'feedItemId' !~
              '^[0-9a-f-]{36}$'
            OR evidence.entry->>'sourceItemId' !~
              '^[0-9a-f-]{36}$'
            OR evidence.entry->>'sourceBindingId' !~
              '^[0-9a-f-]{36}$'
            OR evidence.entry->>'interestId' !~
              '^[0-9a-f-]{36}$'
            OR evidence.entry->>'sourceContentHash' !~
              '^[0-9a-f]{64}$'
        ) THEN
        RAISE EXCEPTION
          'production recovery v2 provider evidence diverged for % on %',
          v_provider,
          v_date;
      END IF;
      v_evidence_sha := encode(sha256(convert_to(
        "reader_summary_weekly_canonical_json"(v_evidence),
        'UTF8'
      )), 'hex');
      v_digests := v_digests || jsonb_build_array(jsonb_build_object(
        'providerKey', v_provider,
        'count', v_expected_count,
        'sha256', v_evidence_sha
      ));
    END LOOP;

    v_actual_sha := encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_digests),
      'UTF8'
    )), 'hex');
    IF v_actual_sha <> v_day->>'providerEvidenceSha256' THEN
      RAISE EXCEPTION
        'production recovery v2 evidence hash diverged for %',
        v_date;
    END IF;

    v_github := v_day->'githubEvidence';
    IF v_date = DATE '2026-07-23' THEN
      IF v_github->>'mode' IS DISTINCT FROM 'historical_unavailable'
        OR (v_github->>'evidenceCount')::INTEGER <> 0
        OR v_github->'authorization'->>'authorizedAt' IS DISTINCT FROM
          binding->'lease'->>'issuedAt' THEN
        RAISE EXCEPTION
          'production recovery v2 historical GitHub proof diverged';
      END IF;
    ELSIF v_github->>'mode' IS DISTINCT FROM 'verified_existing'
      OR (v_github->>'evidenceCount')::INTEGER <> 10
      OR v_github->>'evidenceSha256' IS DISTINCT FROM
        v_digests->0->>'sha256' THEN
      RAISE EXCEPTION
        'production recovery v2 GitHub proof diverged for %',
        v_date;
    END IF;

    v_day_record := jsonb_build_object(
      'schemaVersion', 'reader_summary.production_recovery_day.v2',
      'recoveryId', v_recovery_id::TEXT,
      'tenantId', v_tenant_id::TEXT,
      'workspaceId', v_workspace_id::TEXT,
      'requestedUtcDate', to_char(v_date, 'YYYY-MM-DD'),
      'period', v_day->'period',
      'providerCounts', v_expected,
      'providerEvidenceDigests', v_digests,
      'providerEvidenceSha256', v_actual_sha,
      'githubEvidence', v_github
    );
    v_day_sha := encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_day_record),
      'UTF8'
    )), 'hex');
    IF v_day_sha <> v_day->>'canonicalSha256'
      OR v_day->>'identity' <>
        'reader_summary.production_recovery_day.v2:' || v_day_sha THEN
      RAISE EXCEPTION
        'production recovery v2 day seal diverged for %',
        v_date;
    END IF;
    v_plan_days := v_plan_days || jsonb_build_array(jsonb_build_object(
      'identity', v_day->>'identity',
      'requestedUtcDate', to_char(v_date, 'YYYY-MM-DD'),
      'canonicalSha256', v_day_sha,
      'providerEvidenceSha256', v_actual_sha,
      'planSha256s', v_day->'planSha256s'
    ));
  END LOOP;
  IF v_day_count <> 4 THEN
    RAISE EXCEPTION
      'production recovery v2 requires exactly four days';
  END IF;

  v_authority_record := jsonb_build_object(
    'schemaVersion', 'reader_summary.production_recovery_authority.v2',
    'recoveryId', v_recovery_id::TEXT,
    'identity', v_identity,
    'tenantId', v_tenant_id::TEXT,
    'workspaceId', v_workspace_id::TEXT,
    'requestedUtcDates', binding->'requestedUtcDates',
    'boundaries', binding->'boundaries',
    'days', v_plan_days
  );
  v_authority_bytes := convert_to(
    "reader_summary_weekly_canonical_json"(v_authority_record),
    'UTF8'
  );
  v_authority_sha := encode(sha256(v_authority_bytes), 'hex');
  v_dry_hashes := binding->'dryRunCanonicalSha256s';
  IF v_authority_sha <> binding->>'canonicalSha256'
    OR v_dry_hashes IS DISTINCT FROM jsonb_build_array(
      v_authority_sha,
      v_authority_sha
    ) THEN
    RAISE EXCEPTION
      'production recovery v2 two-pass authority hashes diverged';
  END IF;

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
      v_authority_record,
      v_authority_bytes,
      v_authority_sha,
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
  ) VALUES
    (
      v_recovery_id,
      v_tenant_id,
      v_workspace_id,
      1,
      v_authority_record,
      v_authority_bytes,
      v_authority_sha,
      v_issued_at
    ),
    (
      v_recovery_id,
      v_tenant_id,
      v_workspace_id,
      2,
      v_authority_record,
      v_authority_bytes,
      v_authority_sha,
      v_issued_at
    );

  FOR v_day IN
    SELECT entry
    FROM jsonb_array_elements(binding->'days') AS day(entry)
    ORDER BY entry->>'requestedUtcDate'
  LOOP
    v_date := (v_day->>'requestedUtcDate')::DATE;
    v_expected :=
      "reader_summary_production_recovery_expected_counts_v2"(v_date);
    v_digests := '[]'::JSONB;
    FOREACH v_provider IN ARRAY ARRAY[
      'github-trending-page',
      'hacker-news',
      'reddit',
      'rss',
      'x-twitter'
    ] LOOP
      v_evidence := v_day->'providerEvidence'->v_provider;
      SELECT (entry->>'count')::INTEGER
      INTO STRICT v_expected_count
      FROM jsonb_array_elements(v_expected) AS expected(entry)
      WHERE entry->>'providerKey' = v_provider;
      v_digests := v_digests || jsonb_build_array(jsonb_build_object(
        'providerKey', v_provider,
        'count', v_expected_count,
        'sha256', encode(sha256(convert_to(
          "reader_summary_weekly_canonical_json"(v_evidence),
          'UTF8'
        )), 'hex')
      ));
    END LOOP;
    v_actual_sha := encode(sha256(convert_to(
      "reader_summary_weekly_canonical_json"(v_digests),
      'UTF8'
    )), 'hex');
    v_day_record := jsonb_build_object(
      'schemaVersion', 'reader_summary.production_recovery_day.v2',
      'recoveryId', v_recovery_id::TEXT,
      'tenantId', v_tenant_id::TEXT,
      'workspaceId', v_workspace_id::TEXT,
      'requestedUtcDate', to_char(v_date, 'YYYY-MM-DD'),
      'period', v_day->'period',
      'providerCounts', v_expected,
      'providerEvidenceDigests', v_digests,
      'providerEvidenceSha256', v_actual_sha,
      'githubEvidence', v_day->'githubEvidence'
    );
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
    ) VALUES (
      v_recovery_id,
      v_tenant_id,
      v_workspace_id,
      v_date,
      v_day->>'identity',
      v_expected,
      v_day->'providerEvidence',
      v_actual_sha,
      v_day->'githubEvidence',
      v_day_record,
      convert_to(
        "reader_summary_weekly_canonical_json"(v_day_record),
        'UTF8'
      ),
      v_day->>'canonicalSha256',
      v_issued_at
    );
  END LOOP;

  UPDATE "reader_summary_production_recovery_leases" AS lease
  SET
    "state" = 'CONSUMED',
    "consumed_at" = v_issued_at
  WHERE lease."id" = v_recovery_id
    AND lease."tenant_id" = v_tenant_id
    AND lease."workspace_id" = v_workspace_id
    AND lease."state" = 'ISSUED'
    AND lease."consumed_at" IS NULL
    AND lease."issued_at" = v_issued_at;
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'production recovery v2 pre-model lease consumption diverged';
  END IF;
  RETURN TRUE;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  "reader_summary_production_recovery_expected_counts_v2"(DATE),
  "persist_reader_summary_production_recovery_v2"(JSONB)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT EXECUTE ON FUNCTION
  "persist_reader_summary_production_recovery_v2"(JSONB)
TO "social_monitor_reader_summary_publication_runtime";

REVOKE ALL PRIVILEGES ON TABLE
  "reader_summary_production_recovery_leases",
  "reader_summary_production_recovery_days",
  "reader_summary_production_recovery_dry_runs"
FROM "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "id",
  "tenant_id",
  "workspace_id",
  "identity",
  "state",
  "canonical_record",
  "canonical_sha256",
  "issued_at",
  "consumed_at"
) ON "reader_summary_production_recovery_leases"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
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
  "canonical_sha256"
) ON "reader_summary_production_recovery_days"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "recovery_id",
  "tenant_id",
  "workspace_id",
  "ordinal",
  "canonical_sha256"
) ON "reader_summary_production_recovery_dry_runs"
TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

GRANT SELECT (
  "id",
  "tenant_id",
  "workspace_id",
  "interest_id",
  "source_item_id",
  "source_binding_id",
  "provider_key",
  "canonical_url",
  "title",
  "body_preview",
  "author_handle",
  "status",
  "published_at",
  "observed_at"
) ON "feed_items"
TO
  "social_monitor_reader_summary_publication_owner",
  "social_monitor_reader_summary_publication_runtime";
GRANT UPDATE ("id") ON "feed_items"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "id",
  "tenant_id",
  "workspace_id",
  "source_binding_id",
  "provider_key",
  "provider_item_id",
  "canonical_url",
  "body",
  "content_hash",
  "provider_content_hash",
  "observed_at",
  "metadata"
) ON "source_items"
TO
  "social_monitor_reader_summary_publication_owner",
  "social_monitor_reader_summary_publication_runtime";
GRANT UPDATE ("id") ON "source_items"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "id",
  "tenant_id",
  "workspace_id",
  "interest_id",
  "source_catalog_entry_id",
  "status",
  "deleted_at"
) ON "source_bindings"
TO "social_monitor_reader_summary_publication_runtime";
GRANT UPDATE ("id") ON "source_bindings"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT ("id", "deleted_at") ON "tenants"
TO "social_monitor_reader_summary_publication_runtime";
GRANT UPDATE ("id") ON "tenants"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT ("id", "tenant_id", "deleted_at") ON "workspaces"
TO "social_monitor_reader_summary_publication_runtime";
GRANT UPDATE ("id") ON "workspaces"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "id",
  "tenant_id",
  "workspace_id",
  "status",
  "deleted_at"
) ON "interests"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT ("id", "provider_key") ON "source_catalog_entries"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "id",
  "tenant_id",
  "workspace_id",
  "source_binding_id",
  "scan_job_id",
  "source_item_id",
  "repository_full_name",
  "repository_url",
  "primary_window",
  "rank",
  "checked_at",
  "observed_at"
) ON "github_repository_trend_results"
TO "social_monitor_reader_summary_publication_runtime";
GRANT UPDATE ("id") ON "github_repository_trend_results"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "id",
  "tenant_id",
  "workspace_id",
  "source_binding_id",
  "status"
) ON "scan_jobs"
TO "social_monitor_reader_summary_publication_runtime";
GRANT UPDATE ("id") ON "scan_jobs"
TO "social_monitor_reader_summary_publication_runtime";
GRANT SELECT (
  "scan_job_id",
  "tenant_id",
  "workspace_id",
  "source_binding_id",
  "attempt_number",
  "status",
  "finished_at"
) ON "scan_attempts"
TO "social_monitor_reader_summary_publication_runtime";
GRANT UPDATE ("scan_job_id") ON "scan_attempts"
TO "social_monitor_reader_summary_publication_runtime";

REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
