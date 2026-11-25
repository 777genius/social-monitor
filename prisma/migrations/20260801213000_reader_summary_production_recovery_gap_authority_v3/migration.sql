-- @social-monitor-forward-migration
-- Append-only Jul29-Jul31 recovery authority from immutable database evidence.
BEGIN; SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT("title", "body_preview", "author_handle") ON "feed_items" TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT("body") ON "source_items" TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT("id", "tenant_id", "deleted_at") ON "workspaces" TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT(
  "id", "tenant_id", "workspace_id", "interest_id",
  "source_catalog_entry_id", "status", "deleted_at"
) ON "source_bindings" TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT("id", "provider_key") ON "source_catalog_entries" TO "social_monitor_reader_summary_publication_owner";
GRANT UPDATE("id") ON "source_catalog_entries" TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT("id", "tenant_id", "workspace_id", "status", "deleted_at")
ON "interests" TO "social_monitor_reader_summary_publication_owner";
GRANT UPDATE("id") ON "interests" TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT(
  "id", "tenant_id", "workspace_id", "source_binding_id", "scan_job_id",
  "source_item_id", "repository_full_name", "repository_url", "primary_window", "rank", "checked_at"
) ON "github_repository_trend_results" TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT("id", "tenant_id", "workspace_id", "source_binding_id", "status")
ON "scan_jobs" TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT("scan_job_id", "tenant_id", "workspace_id", "source_binding_id", "attempt_number", "status", "finished_at")
ON "scan_attempts" TO "social_monitor_reader_summary_publication_owner";
RESET ROLE; SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
CREATE FUNCTION "read_reader_summary_production_recovery_gap_v3"(target_tenant_id UUID, target_workspace_id UUID)
RETURNS TABLE ("canonicalSha256" TEXT, "binding" JSONB)
LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog, public AS $read_gap$
DECLARE
  v_day_count INTEGER; v_dry_count INTEGER;
  v_lease "reader_summary_production_recovery_leases"%ROWTYPE;
BEGIN
  IF current_setting('social_monitor.tenant_id', TRUE) IS DISTINCT FROM target_tenant_id::TEXT
    OR current_setting('social_monitor.workspace_id', TRUE) IS DISTINCT FROM target_workspace_id::TEXT
    OR current_setting('social_monitor.system_access', TRUE) IS DISTINCT FROM 'false'
    OR NOT pg_has_role(
      session_user,
      'social_monitor_reader_summary_publication_runtime',
      'USAGE'
    ) THEN
    RAISE EXCEPTION 'recovery gap read session scope is invalid';
  END IF;
  SELECT lease.* INTO v_lease
  FROM "reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = target_tenant_id
    AND lease."workspace_id" = target_workspace_id
    AND lease."canonical_record"->>'schemaVersion' =
      'reader_summary.production_recovery_gap_authority.v3'
    AND lease."canonical_record"->'requestedUtcDates' =
      '["2026-07-29", "2026-07-30", "2026-07-31"]'::JSONB
  ORDER BY lease."id"
  LIMIT 2;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "reader_summary_production_recovery_leases" AS lease
    WHERE lease."tenant_id" = target_tenant_id
      AND lease."workspace_id" = target_workspace_id
      AND lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_gap_authority.v3'
      AND lease."id" <> v_lease."id"
  ) THEN
    RAISE EXCEPTION 'recovery gap authority is ambiguous';
  END IF;
  IF v_lease."state" <> 'CONSUMED'
    OR v_lease."consumed_at" IS DISTINCT FROM v_lease."issued_at"
    OR v_lease."canonical_bytes" IS DISTINCT FROM convert_to(
      "reader_summary_production_recovery_canonical_json"(
        v_lease."canonical_record"
      ),
      'UTF8'
    )
    OR btrim(v_lease."canonical_sha256") <> encode(
      sha256(v_lease."canonical_bytes"),
      'hex'
    ) THEN
    RAISE EXCEPTION 'recovery gap authority bytes or lease diverged';
  END IF;
  SELECT count(*)::INTEGER INTO v_dry_count
  FROM "reader_summary_production_recovery_dry_runs" AS dry
  WHERE dry."recovery_id" = v_lease."id"
    AND dry."tenant_id" = target_tenant_id
    AND dry."workspace_id" = target_workspace_id
    AND dry."canonical_record" = v_lease."canonical_record"
    AND dry."canonical_bytes" = v_lease."canonical_bytes"
    AND btrim(dry."canonical_sha256") =
      btrim(v_lease."canonical_sha256")
    AND dry."captured_at" = v_lease."issued_at"
    AND dry."ordinal" IN (1, 2);
  IF v_dry_count <> 2 THEN
    RAISE EXCEPTION 'recovery gap two-plan evidence diverged';
  END IF;
  SELECT count(*)::INTEGER INTO v_day_count
  FROM "reader_summary_production_recovery_days" AS day
  WHERE day."recovery_id" = v_lease."id"
    AND day."tenant_id" = target_tenant_id
    AND day."workspace_id" = target_workspace_id
    AND day."canonical_bytes" = convert_to(
      "reader_summary_production_recovery_canonical_json"(
        day."canonical_record"
      ),
      'UTF8'
    )
    AND btrim(day."canonical_sha256") =
      encode(sha256(day."canonical_bytes"), 'hex')
    AND btrim(day."provider_evidence_sha256") =
      day."canonical_record"->>'providerEvidenceSha256'
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_lease."canonical_record"->'days') AS planned(value)
      WHERE planned.value->>'requestedUtcDate' =
          to_char(day."requested_utc_date", 'YYYY-MM-DD')
        AND planned.value->>'canonicalSha256' =
          btrim(day."canonical_sha256")
        AND planned.value->>'identity' = day."identity"
        AND planned.value->>'providerEvidenceSha256' =
          btrim(day."provider_evidence_sha256")
        AND planned.value->'planSha256s' = jsonb_build_array(
          btrim(day."canonical_sha256"), btrim(day."canonical_sha256")
        )
    );
  IF v_day_count <> 3 THEN
    RAISE EXCEPTION 'recovery gap persisted day evidence diverged';
  END IF;
  RETURN QUERY SELECT btrim(v_lease."canonical_sha256"),
    (v_lease."canonical_record" - 'issuedAt' - 'days') || jsonb_build_object(
      'canonicalSha256', btrim(v_lease."canonical_sha256"),
      'dryRunCanonicalSha256s', jsonb_build_array(
        btrim(v_lease."canonical_sha256"),
        btrim(v_lease."canonical_sha256")
      ),
      'lease', jsonb_build_object(
        'state', v_lease."state",
        'issuedAt', to_char(
          v_lease."issued_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'consumedAt', to_char(
          v_lease."consumed_at" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      ),
      'days', (
        SELECT jsonb_agg(
          day."canonical_record" || jsonb_build_object(
            'identity', day."identity",
            'providerCounts', day."provider_counts",
            'providerEvidence', day."provider_evidence",
            'canonicalSha256', btrim(day."canonical_sha256"),
            'planSha256s', planned.value->'planSha256s'
          ) ORDER BY day."requested_utc_date"
        )
        FROM "reader_summary_production_recovery_days" AS day
        JOIN LATERAL (
          SELECT value
          FROM jsonb_array_elements(v_lease."canonical_record"->'days')
            AS entry(value)
          WHERE value->>'requestedUtcDate' =
            to_char(day."requested_utc_date", 'YYYY-MM-DD')
        ) AS planned ON TRUE
        WHERE day."recovery_id" = v_lease."id"
          AND day."tenant_id" = target_tenant_id
          AND day."workspace_id" = target_workspace_id
      )
    );
END;
$read_gap$;
CREATE FUNCTION "persist_reader_summary_production_recovery_gap_v3"(first_plan JSONB, second_plan JSONB)
RETURNS TABLE ("canonicalSha256" TEXT, "binding" JSONB)
LANGUAGE plpgsql STRICT SECURITY DEFINER
SET search_path = pg_catalog, public AS $persist_gap$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_authority_cutoff CONSTANT TIMESTAMPTZ := TIMESTAMPTZ '2026-08-01T21:30:00.000Z';
  v_authority_record JSONB;
  v_bytes BYTEA;
  v_date DATE; v_day JSONB;
  v_day_bytes BYTEA; v_day_record JSONB; v_day_sha TEXT;
  v_evidence JSONB;
  v_existing RECORD;
  v_hash TEXT; v_issued_at TIMESTAMPTZ(6);
  v_plan_days JSONB := '[]'::JSONB;
  v_provider JSONB; v_provider_count INTEGER;
  v_recovery_bytes BYTEA; v_recovery_id UUID;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off'
    OR current_setting('social_monitor.tenant_id', TRUE)
      IS DISTINCT FROM c_tenant_id::TEXT
    OR current_setting('social_monitor.workspace_id', TRUE)
      IS DISTINCT FROM c_workspace_id::TEXT
    OR current_setting('social_monitor.system_access', TRUE)
      IS DISTINCT FROM 'false'
    OR NOT pg_has_role(
      session_user,
      'social_monitor_reader_summary_publication_runtime',
      'USAGE'
    ) THEN
    RAISE EXCEPTION 'recovery gap persistence session scope is invalid';
  END IF;
  SELECT * INTO v_existing
  FROM "read_reader_summary_production_recovery_gap_v3"(
    c_tenant_id,
    c_workspace_id
  );
  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing."canonicalSha256",
      v_existing."binding";
    RETURN;
  END IF;
  IF first_plan IS DISTINCT FROM second_plan
    OR jsonb_typeof(first_plan) <> 'object'
    OR jsonb_object_length(first_plan) <> 10
    OR NOT (first_plan ?& ARRAY[
      'schemaVersion', 'recoveryId', 'identity', 'tenantId', 'workspaceId',
      'requestedUtcDates', 'issuedAt', 'boundaries', 'modelContract', 'days'
    ])
    OR first_plan->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.production_recovery_gap_authority.v3'
    OR first_plan->>'tenantId' IS DISTINCT FROM c_tenant_id::TEXT
    OR first_plan->>'workspaceId' IS DISTINCT FROM c_workspace_id::TEXT
    OR first_plan->'requestedUtcDates' IS DISTINCT FROM
      '["2026-07-29", "2026-07-30", "2026-07-31"]'::JSONB
    OR first_plan->'boundaries' IS DISTINCT FROM jsonb_build_object(
      'stage', 'pre_model',
      'modelCallPerformed', FALSE,
      'publicationPerformed', FALSE,
      'recollectionPerformed', FALSE,
      'providerWritePerformed', FALSE,
      'authorityCutoffAt', '2026-08-01T21:30:00.000Z'
    )
    OR first_plan->'modelContract' IS DISTINCT FROM jsonb_build_object(
      'schemaVersion', 'reader_summary.production_recovery_model_contract.v1',
      'runtimeEngine', 'subscription-runtime-cli',
      'provider', 'codex',
      'model', 'gpt-5.6-sol',
      'reasoningEffort', 'xhigh',
      'purpose', 'social_monitor.reader_summary.generate',
      'attestationRequired', TRUE
    )
    OR jsonb_typeof(first_plan->'days') <> 'array'
    OR jsonb_array_length(first_plan->'days') <> 3
    OR COALESCE(first_plan->>'recoveryId', '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR first_plan->>'identity' IS DISTINCT FROM
      'reader_summary.production_recovery_gap_authority.v3:' || encode(
        sha256(convert_to(
          c_tenant_id::TEXT || ':' || c_workspace_id::TEXT ||
          ':2026-07-29,2026-07-30,2026-07-31',
          'UTF8'
        )),
        'hex'
      ) THEN
    RAISE EXCEPTION 'recovery gap canonical plan is not exact';
  END IF;
  v_recovery_bytes := sha256(convert_to(first_plan->>'identity', 'UTF8'));
  v_recovery_bytes := set_byte(
    v_recovery_bytes,
    6,
    (get_byte(v_recovery_bytes, 6) & 15) | 80
  );
  v_recovery_bytes := set_byte(
    v_recovery_bytes,
    8,
    (get_byte(v_recovery_bytes, 8) & 63) | 128
  );
  v_recovery_id := (
    substr(encode(v_recovery_bytes, 'hex'), 1, 8) || '-' ||
    substr(encode(v_recovery_bytes, 'hex'), 9, 4) || '-' ||
    substr(encode(v_recovery_bytes, 'hex'), 13, 4) || '-' ||
    substr(encode(v_recovery_bytes, 'hex'), 17, 4) || '-' ||
    substr(encode(v_recovery_bytes, 'hex'), 21, 12)
  )::UUID;
  IF (first_plan->>'recoveryId')::UUID IS DISTINCT FROM v_recovery_id THEN
    RAISE EXCEPTION 'recovery gap authority id is not deterministic';
  END IF;
  v_issued_at := date_trunc('milliseconds', transaction_timestamp());
  IF (first_plan->>'issuedAt')::TIMESTAMPTZ IS DISTINCT FROM v_issued_at THEN
    RAISE EXCEPTION 'recovery gap authority timestamp diverged';
  END IF;
  PERFORM workspace."id"
  FROM "workspaces" AS workspace
  WHERE workspace."tenant_id" = c_tenant_id
    AND workspace."id" = c_workspace_id
    AND workspace."deleted_at" IS NULL
  ORDER BY workspace."tenant_id", workspace."id"
  FOR UPDATE OF workspace;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recovery gap workspace is unavailable';
  END IF;
  PERFORM feed."id"
  FROM "feed_items" AS feed
  JOIN "source_items" AS source
    ON source."id" = feed."source_item_id"
    AND source."tenant_id" = feed."tenant_id"
    AND source."workspace_id" = feed."workspace_id"
  JOIN "source_bindings" AS binding
    ON binding."id" = source."source_binding_id"
    AND binding."tenant_id" = source."tenant_id"
    AND binding."workspace_id" = source."workspace_id"
  JOIN "source_catalog_entries" AS catalog
    ON catalog."id" = binding."source_catalog_entry_id"
  JOIN "interests" AS interest
    ON interest."id" = binding."interest_id"
    AND interest."tenant_id" = binding."tenant_id"
    AND interest."workspace_id" = binding."workspace_id"
  WHERE feed."tenant_id" = c_tenant_id
    AND feed."workspace_id" = c_workspace_id
    AND feed."published_at" >= TIMESTAMPTZ '2026-07-29T00:00:00Z'
    AND feed."published_at" < TIMESTAMPTZ '2026-08-01T00:00:00Z'
    AND feed."observed_at" <= c_authority_cutoff
    AND feed."created_at" <= c_authority_cutoff
    AND source."observed_at" <= c_authority_cutoff
    AND source."created_at" <= c_authority_cutoff
    AND feed."provider_key" IN (
      'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
    )
  ORDER BY feed."published_at", feed."provider_key", feed."id"
  FOR SHARE OF feed, source, binding, catalog, interest;
  IF (
    SELECT jsonb_agg(entry.value->>'requestedUtcDate' ORDER BY entry.ordinal)
    FROM jsonb_array_elements(first_plan->'days')
      WITH ORDINALITY AS entry(value, ordinal)
  ) IS DISTINCT FROM '["2026-07-29", "2026-07-30", "2026-07-31"]'::JSONB THEN
    RAISE EXCEPTION 'recovery gap day ordering is not exact';
  END IF;
  FOR v_day IN
    SELECT entry.value
    FROM jsonb_array_elements(first_plan->'days')
      WITH ORDINALITY AS entry(value, ordinal)
    ORDER BY entry.ordinal
  LOOP
    IF jsonb_typeof(v_day) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'recovery gap day authority is not an object';
    END IF;
    v_date := (v_day->>'requestedUtcDate')::DATE;
    IF v_date NOT IN (
      DATE '2026-07-29', DATE '2026-07-30', DATE '2026-07-31'
    )
      OR jsonb_object_length(v_day) <> 18
      OR NOT (v_day ?& ARRAY[
        'schemaVersion', 'recoveryId', 'tenantId', 'workspaceId', 'identity',
        'requestedUtcDate', 'period', 'providerCoverage', 'providerCounts',
        'providerEvidence', 'providerEvidenceSha256', 'dominance',
        'modelEligibility', 'terminalOutcome', 'modelContract', 'githubEvidence',
        'canonicalSha256', 'planSha256s'
      ])
      OR v_day->>'schemaVersion' IS DISTINCT FROM
        'reader_summary.production_recovery_gap_day.v3'
      OR v_day->>'recoveryId' IS DISTINCT FROM v_recovery_id::TEXT
      OR v_day->>'tenantId' IS DISTINCT FROM c_tenant_id::TEXT
      OR v_day->>'workspaceId' IS DISTINCT FROM c_workspace_id::TEXT
      OR v_day->'period' IS DISTINCT FROM jsonb_build_object(
        'startedAt', to_char(
          v_date::TIMESTAMP AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'endedAt', to_char(
          (v_date + 1)::TIMESTAMP AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'timezone', 'UTC'
      )
      OR jsonb_typeof(v_day->'providerCoverage') <> 'array'
      OR jsonb_array_length(v_day->'providerCoverage') <> 5
      OR jsonb_typeof(v_day->'providerEvidence') <> 'object'
      OR jsonb_object_length(v_day->'providerEvidence') <> 5
      OR jsonb_typeof(v_day->'dominance') <> 'object'
      OR jsonb_object_length(v_day->'dominance') <> 6
      OR NOT (v_day->'dominance' ?& ARRAY[
        'providerKey', 'evidenceCount', 'totalEvidenceCount',
        'ratioBasisPoints', 'maximumRatioBasisPoints', 'permitted'
      ])
      OR jsonb_typeof(v_day->'modelEligibility') <> 'object'
      OR jsonb_object_length(v_day->'modelEligibility') <> 3
      OR NOT (v_day->'modelEligibility' ?& ARRAY[
        'eligible', 'reasons', 'evaluatedAgainst'
      ])
      OR jsonb_typeof(v_day->'modelEligibility'->'reasons') <> 'array'
      OR v_day->'modelEligibility'->>'evaluatedAgainst' IS DISTINCT FROM
        'immutable_db_evidence'
      OR v_day->'providerCounts' IS DISTINCT FROM
        v_day->'providerCoverage'
      OR v_day->'modelContract' IS DISTINCT FROM
        first_plan->'modelContract'
      OR jsonb_typeof(v_day->'githubEvidence') <> 'object'
      OR jsonb_object_length(v_day->'githubEvidence') <> 7
      OR NOT (v_day->'githubEvidence' ?& ARRAY[
        'schemaVersion', 'mode', 'providerKey', 'requestedUtcDate',
        'evidenceCount', 'evidenceSha256', 'scanJobIds'
      ])
      OR v_day->'githubEvidence'->>'schemaVersion' IS DISTINCT FROM
        'reader_summary.production_recovery_github_evidence.v3'
      OR v_day->'githubEvidence'->>'providerKey' IS DISTINCT FROM
        'github-trending-page'
      OR v_day->'githubEvidence'->>'requestedUtcDate' IS DISTINCT FROM
        to_char(v_date, 'YYYY-MM-DD')
      OR v_day->'githubEvidence'->>'mode' IS DISTINCT FROM
        v_day->'providerCoverage'->0->>'evidenceState'
      OR (v_day->'githubEvidence'->>'evidenceCount')::INTEGER IS DISTINCT FROM
        (v_day->'providerCoverage'->0->>'count')::INTEGER
      OR v_day->'githubEvidence'->>'evidenceSha256' IS DISTINCT FROM
        v_day->'providerCoverage'->0->>'evidenceSha256'
      OR v_day->'githubEvidence'->'scanJobIds' IS DISTINCT FROM (
        SELECT COALESCE(
          jsonb_agg(
            DISTINCT (evidence.value->'github'->>'scanJobId')
            ORDER BY (evidence.value->'github'->>'scanJobId')
          ),
          '[]'::JSONB
        )
        FROM jsonb_array_elements(
          v_day->'providerEvidence'->'github-trending-page'
        ) AS evidence(value)
      )
      OR (
        SELECT jsonb_agg(coverage.value->>'providerKey' ORDER BY coverage.ordinal)
        FROM jsonb_array_elements(v_day->'providerCoverage')
          WITH ORDINALITY AS coverage(value, ordinal)
      ) IS DISTINCT FROM '["github-trending-page", "hacker-news", "reddit", "rss", "x-twitter"]'::JSONB
      OR (
        SELECT count(*) <> count(DISTINCT (evidence.value->>'feedItemId'))
          OR count(*) <> count(DISTINCT (evidence.value->>'sourceItemId'))
        FROM jsonb_each(v_day->'providerEvidence') AS provider(key, value)
        CROSS JOIN LATERAL jsonb_array_elements(provider.value) AS evidence(value)
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_day->'providerCoverage') AS coverage(value)
        WHERE (
          (coverage.value->>'count')::INTEGER > 0
          AND coverage.value->>'evidenceState' <> 'verified_existing'
        ) OR (
          (coverage.value->>'count')::INTEGER = 0
          AND coverage.value->>'evidenceState' NOT IN ('missing', 'unavailable')
        )
      )
      OR v_day->'planSha256s' IS DISTINCT FROM
        jsonb_build_array(
          v_day->>'canonicalSha256',
          v_day->>'canonicalSha256'
        )
      OR COALESCE((v_day->'modelEligibility'->>'eligible')::BOOLEAN, FALSE)
        IS DISTINCT FROM (
          NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(v_day->'providerCoverage') AS coverage(value)
            WHERE coverage.value->>'evidenceState' <> 'verified_existing'
              OR (coverage.value->>'count')::INTEGER < 1
          )
          AND COALESCE(
            (v_day->'dominance'->>'permitted')::BOOLEAN,
            FALSE
          )
          AND jsonb_array_length(v_day->'modelEligibility'->'reasons') = 0
        )
      OR v_day->'modelEligibility'->'reasons' IS DISTINCT FROM (
        SELECT COALESCE(jsonb_agg(reason ORDER BY reason), '[]'::JSONB)
        FROM (
          SELECT 'provider_' || (coverage.value->>'providerKey') || '_' ||
            (coverage.value->>'evidenceState') AS reason
          FROM jsonb_array_elements(v_day->'providerCoverage') AS coverage(value)
          WHERE coverage.value->>'evidenceState' <> 'verified_existing'
          UNION ALL
          SELECT 'provider_dominance_unresolved'
          WHERE NOT COALESCE((v_day->'dominance'->>'permitted')::BOOLEAN, FALSE)
        ) AS expected_reasons
      )
      OR v_day->'terminalOutcome' IS DISTINCT FROM (CASE
        WHEN (v_day->'modelEligibility'->>'eligible')::BOOLEAN THEN 'null'::JSONB
        ELSE jsonb_build_object(
          'status', CASE
            WHEN (v_day->'dominance'->>'permitted')::BOOLEAN
              THEN 'PARTIAL'
            ELSE 'UNAVAILABLE'
          END,
          'reasons', v_day->'modelEligibility'->'reasons'
        )
      END)
      OR (v_day->'dominance'->>'maximumRatioBasisPoints')::INTEGER <> 7000
      OR (v_day->'dominance'->>'totalEvidenceCount')::INTEGER <>
        (SELECT sum((coverage.value->>'count')::INTEGER)
         FROM jsonb_array_elements(v_day->'providerCoverage') AS coverage(value))
      OR (v_day->'dominance'->>'evidenceCount')::INTEGER <>
        (SELECT max((coverage.value->>'count')::INTEGER)
         FROM jsonb_array_elements(v_day->'providerCoverage') AS coverage(value))
      OR (v_day->'dominance'->>'providerKey') IS DISTINCT FROM
        (SELECT coverage.value->>'providerKey'
         FROM jsonb_array_elements(v_day->'providerCoverage')
           WITH ORDINALITY AS coverage(value, ordinal)
         ORDER BY (coverage.value->>'count')::INTEGER DESC, coverage.ordinal
         LIMIT 1)
      OR (v_day->'dominance'->>'ratioBasisPoints')::INTEGER <> (CASE
          WHEN (v_day->'dominance'->>'totalEvidenceCount')::INTEGER = 0 THEN 0
          ELSE floor(
            (v_day->'dominance'->>'evidenceCount')::NUMERIC * 10000 /
            (v_day->'dominance'->>'totalEvidenceCount')::NUMERIC
          )::INTEGER
        END)
      OR (v_day->'dominance'->>'permitted')::BOOLEAN IS DISTINCT FROM (
        (v_day->'dominance'->>'totalEvidenceCount')::INTEGER > 0
        AND (v_day->'dominance'->>'ratioBasisPoints')::INTEGER <= 7000
      ) THEN
      RAISE EXCEPTION 'recovery gap % day authority is not exact', v_date;
    END IF;
    FOR v_provider IN
      SELECT entry.value
      FROM jsonb_array_elements(v_day->'providerCoverage')
        WITH ORDINALITY AS entry(value, ordinal)
      ORDER BY entry.ordinal
    LOOP
      IF jsonb_typeof(v_provider) <> 'object'
        OR jsonb_object_length(v_provider) <> 4
        OR COALESCE(v_provider->>'providerKey', '') NOT IN (
        'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
      )
        OR COALESCE(v_provider->>'evidenceState', '') NOT IN (
          'verified_existing', 'missing', 'unavailable'
        )
        OR COALESCE(v_provider->>'count', '') !~ '^(0|[1-9][0-9]{0,8})$'
        OR COALESCE(v_provider->>'evidenceSha256', '') !~ '^[0-9a-f]{64}$'
        OR jsonb_typeof(
          v_day->'providerEvidence'->(v_provider->>'providerKey')
        ) <> 'array'
        OR jsonb_array_length(
          v_day->'providerEvidence'->(v_provider->>'providerKey')
        ) <> (v_provider->>'count')::INTEGER
        OR v_provider->>'evidenceSha256' <> encode(sha256(convert_to(
          "reader_summary_production_recovery_canonical_json"(
            v_day->'providerEvidence'->(v_provider->>'providerKey')
          ),
          'UTF8'
        )), 'hex') THEN
        RAISE EXCEPTION 'recovery gap % provider coverage diverged', v_date;
      END IF;
      SELECT count(*)::INTEGER INTO v_provider_count
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
        AND catalog."provider_key" = feed."provider_key"
      JOIN "interests" AS interest
        ON interest."id" = binding."interest_id"
        AND interest."tenant_id" = binding."tenant_id"
        AND interest."workspace_id" = binding."workspace_id"
        AND interest."status" = 'ENABLED'
        AND interest."deleted_at" IS NULL
      WHERE feed."tenant_id" = c_tenant_id
        AND feed."workspace_id" = c_workspace_id
        AND feed."status" = 'VISIBLE'
        AND feed."provider_key" = v_provider->>'providerKey'
        AND feed."published_at" >= v_date::TIMESTAMP AT TIME ZONE 'UTC'
        AND feed."published_at" <
          (v_date + 1)::TIMESTAMP AT TIME ZONE 'UTC'
        AND feed."observed_at" <= c_authority_cutoff
        AND feed."created_at" <= c_authority_cutoff
        AND source."observed_at" <= c_authority_cutoff
        AND source."created_at" <= c_authority_cutoff
        AND source."content_hash" ~ '^[0-9a-f]{64}$'
        AND (
          source."provider_content_hash" IS NULL
          OR source."provider_content_hash" ~ '^[0-9a-f]{64}$'
        );
      IF (
          v_provider->>'evidenceState' = 'verified_existing'
          AND v_provider_count <> (v_provider->>'count')::INTEGER
        ) OR (
          v_provider->>'evidenceState' = 'missing'
          AND (v_provider_count <> 0 OR (v_provider->>'count')::INTEGER <> 0)
        ) OR (
          v_provider->>'evidenceState' = 'unavailable'
          AND (
            v_provider->>'providerKey' <> 'github-trending-page'
            OR v_provider_count < 1
            OR (v_provider->>'count')::INTEGER <> 0
            OR NOT EXISTS (
              SELECT 1
              FROM "feed_items" AS unavailable_feed
              JOIN "source_items" AS unavailable_source
                ON unavailable_source."id" = unavailable_feed."source_item_id"
                AND unavailable_source."tenant_id" = unavailable_feed."tenant_id"
                AND unavailable_source."workspace_id" = unavailable_feed."workspace_id"
                AND unavailable_source."source_binding_id" =
                  unavailable_feed."source_binding_id"
                AND unavailable_source."provider_key" =
                  unavailable_feed."provider_key"
                AND unavailable_source."canonical_url" =
                  unavailable_feed."canonical_url"
              JOIN "source_bindings" AS unavailable_binding
                ON unavailable_binding."id" =
                  unavailable_source."source_binding_id"
                AND unavailable_binding."tenant_id" =
                  unavailable_source."tenant_id"
                AND unavailable_binding."workspace_id" =
                  unavailable_source."workspace_id"
                AND unavailable_binding."interest_id" =
                  unavailable_feed."interest_id"
                AND unavailable_binding."status" = 'ENABLED'
                AND unavailable_binding."deleted_at" IS NULL
              JOIN "source_catalog_entries" AS unavailable_catalog
                ON unavailable_catalog."id" =
                  unavailable_binding."source_catalog_entry_id"
                AND unavailable_catalog."provider_key" =
                  unavailable_feed."provider_key"
              JOIN "interests" AS unavailable_interest
                ON unavailable_interest."id" = unavailable_binding."interest_id"
                AND unavailable_interest."tenant_id" =
                  unavailable_binding."tenant_id"
                AND unavailable_interest."workspace_id" =
                  unavailable_binding."workspace_id"
                AND unavailable_interest."status" = 'ENABLED'
                AND unavailable_interest."deleted_at" IS NULL
              WHERE unavailable_feed."tenant_id" = c_tenant_id
                AND unavailable_feed."workspace_id" = c_workspace_id
                AND unavailable_feed."provider_key" = 'github-trending-page'
                AND unavailable_feed."status" = 'VISIBLE'
                AND unavailable_feed."published_at" >=
                  v_date::TIMESTAMP AT TIME ZONE 'UTC'
                AND unavailable_feed."published_at" <
                  (v_date + 1)::TIMESTAMP AT TIME ZONE 'UTC'
                AND unavailable_feed."observed_at" <= c_authority_cutoff
                AND unavailable_feed."created_at" <= c_authority_cutoff
                AND unavailable_source."observed_at" <= c_authority_cutoff
                AND unavailable_source."created_at" <= c_authority_cutoff
                AND unavailable_source."content_hash" ~ '^[0-9a-f]{64}$'
                AND (
                  unavailable_source."provider_content_hash" IS NULL
                  OR unavailable_source."provider_content_hash" ~
                    '^[0-9a-f]{64}$'
                )
                AND NOT EXISTS (
                  SELECT 1
                  FROM "github_repository_trend_results" AS proof
                  JOIN "scan_jobs" AS proof_scan
                    ON proof_scan."id" = proof."scan_job_id"
                    AND proof_scan."tenant_id" = proof."tenant_id"
                    AND proof_scan."workspace_id" = proof."workspace_id"
                    AND proof_scan."source_binding_id" =
                      proof."source_binding_id"
                    AND proof_scan."status" = 'SUCCEEDED'
                  JOIN "scan_attempts" AS proof_attempt
                    ON proof_attempt."scan_job_id" = proof_scan."id"
                    AND proof_attempt."tenant_id" = proof_scan."tenant_id"
                    AND proof_attempt."workspace_id" = proof_scan."workspace_id"
                    AND proof_attempt."source_binding_id" =
                      proof_scan."source_binding_id"
                    AND proof_attempt."status" = 'SUCCEEDED'
                    AND proof_attempt."finished_at" IS NOT NULL
                    AND proof_attempt."finished_at" <= c_authority_cutoff
                  WHERE proof."source_item_id" = unavailable_source."id"
                    AND proof."tenant_id" = unavailable_source."tenant_id"
                    AND proof."workspace_id" = unavailable_source."workspace_id"
                    AND proof."source_binding_id" =
                      unavailable_source."source_binding_id"
                    AND proof."repository_url" =
                      unavailable_source."canonical_url"
                    AND proof."primary_window" IN ('daily', 'today')
                )
            )
          )
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            v_day->'providerEvidence'->(v_provider->>'providerKey')
          ) AS evidence(value)
          WHERE jsonb_typeof(evidence.value) <> 'object'
            OR NOT (evidence.value ?& ARRAY[
              'providerKey', 'feedItemId', 'sourceItemId', 'sourceBindingId',
              'interestId', 'providerItemId', 'canonicalUrl', 'title',
              'bodyPreview', 'sourceText', 'sourceContentHash',
              'sourceProviderContentHash', 'publishedAt', 'observedAt',
              'createdAt', 'sourceObservedAt', 'canonicalIngestedAt'
            ])
            OR evidence.value - ARRAY[
              'providerKey', 'feedItemId', 'sourceItemId', 'sourceBindingId',
              'interestId', 'providerItemId', 'canonicalUrl', 'title',
              'bodyPreview', 'sourceText', 'authorHandle',
              'sourceContentHash', 'sourceProviderContentHash', 'publishedAt',
              'observedAt', 'createdAt', 'sourceObservedAt',
              'canonicalIngestedAt', 'github'
            ]::TEXT[] <> '{}'::JSONB
            OR evidence.value->>'providerKey' IS DISTINCT FROM
              v_provider->>'providerKey'
            OR (
              evidence.value ? 'authorHandle'
              AND jsonb_typeof(evidence.value->'authorHandle') <> 'string'
            )
            OR (
              v_provider->>'providerKey' = 'github-trending-page'
              AND (
                jsonb_typeof(evidence.value->'github') <> 'object'
                OR jsonb_object_length(evidence.value->'github') <> 6
                OR NOT (evidence.value->'github' ?& ARRAY[
                  'resultId', 'scanJobId', 'scanAttemptNumber',
                  'repositoryIdentity', 'rank', 'checkedAt'
                ])
              )
            )
            OR (
              v_provider->>'providerKey' <> 'github-trending-page'
              AND evidence.value ? 'github'
            )
            OR NOT EXISTS (
            SELECT 1
            FROM "feed_items" AS feed
            JOIN "source_items" AS source
              ON source."id" = feed."source_item_id"
              AND source."tenant_id" = feed."tenant_id"
              AND source."workspace_id" = feed."workspace_id"
            WHERE feed."tenant_id" = c_tenant_id
              AND feed."workspace_id" = c_workspace_id
              AND feed."id" = (evidence.value->>'feedItemId')::UUID
              AND source."id" = (evidence.value->>'sourceItemId')::UUID
              AND source."source_binding_id" = feed."source_binding_id"
              AND source."provider_key" = feed."provider_key"
              AND source."canonical_url" = feed."canonical_url"
              AND feed."status" = 'VISIBLE'
              AND feed."published_at" >=
                v_date::TIMESTAMP AT TIME ZONE 'UTC'
              AND feed."published_at" <
                (v_date + 1)::TIMESTAMP AT TIME ZONE 'UTC'
              AND feed."observed_at" <= c_authority_cutoff
              AND feed."created_at" <= c_authority_cutoff
              AND source."observed_at" <= c_authority_cutoff
              AND source."created_at" <= c_authority_cutoff
              AND source."source_binding_id" =
                (evidence.value->>'sourceBindingId')::UUID
              AND feed."interest_id" =
                (evidence.value->>'interestId')::UUID
              AND feed."provider_key" = v_provider->>'providerKey'
              AND source."provider_item_id" =
                evidence.value->>'providerItemId'
              AND source."canonical_url" = evidence.value->>'canonicalUrl'
              AND feed."title" = evidence.value->>'title'
              AND feed."body_preview" = evidence.value->>'bodyPreview'
              AND LEFT(
                COALESCE(NULLIF(feed."body_preview", ''), source."body"),
                4096
              ) = evidence.value->>'sourceText'
              AND feed."author_handle" IS NOT DISTINCT FROM
                evidence.value->>'authorHandle'
              AND source."content_hash" =
                evidence.value->>'sourceContentHash'
              AND source."content_hash" ~ '^[0-9a-f]{64}$'
              AND source."provider_content_hash" IS NOT DISTINCT FROM
                NULLIF(evidence.value->>'sourceProviderContentHash', '')
              AND (source."provider_content_hash" IS NULL
                OR source."provider_content_hash" ~ '^[0-9a-f]{64}$')
              AND feed."published_at" =
                (evidence.value->>'publishedAt')::TIMESTAMPTZ
              AND feed."observed_at" =
                (evidence.value->>'observedAt')::TIMESTAMPTZ
              AND feed."created_at" =
                (evidence.value->>'createdAt')::TIMESTAMPTZ
              AND source."observed_at" =
                (evidence.value->>'sourceObservedAt')::TIMESTAMPTZ
              AND source."created_at" =
                (evidence.value->>'canonicalIngestedAt')::TIMESTAMPTZ
              AND EXISTS (
                SELECT 1
                FROM "source_bindings" AS selected_binding
                JOIN "source_catalog_entries" AS selected_catalog
                  ON selected_catalog."id" =
                    selected_binding."source_catalog_entry_id"
                  AND selected_catalog."provider_key" = feed."provider_key"
                JOIN "interests" AS selected_interest
                  ON selected_interest."id" = selected_binding."interest_id"
                  AND selected_interest."tenant_id" =
                    selected_binding."tenant_id"
                  AND selected_interest."workspace_id" =
                    selected_binding."workspace_id"
                  AND selected_interest."status" = 'ENABLED'
                  AND selected_interest."deleted_at" IS NULL
                WHERE selected_binding."id" = source."source_binding_id"
                  AND selected_binding."tenant_id" = source."tenant_id"
                  AND selected_binding."workspace_id" = source."workspace_id"
                  AND selected_binding."interest_id" = feed."interest_id"
                  AND selected_binding."status" = 'ENABLED'
                  AND selected_binding."deleted_at" IS NULL
              )
              AND (
                v_provider->>'providerKey' <> 'github-trending-page'
                OR EXISTS (
                  SELECT 1
                  FROM "github_repository_trend_results" AS github
                  JOIN "scan_jobs" AS scan
                    ON scan."id" = github."scan_job_id"
                    AND scan."tenant_id" = github."tenant_id"
                    AND scan."workspace_id" = github."workspace_id"
                    AND scan."source_binding_id" = github."source_binding_id"
                    AND scan."status" = 'SUCCEEDED'
                  JOIN "scan_attempts" AS attempt
                    ON attempt."scan_job_id" = scan."id"
                    AND attempt."tenant_id" = scan."tenant_id"
                    AND attempt."workspace_id" = scan."workspace_id"
                    AND attempt."source_binding_id" = scan."source_binding_id"
                    AND attempt."status" = 'SUCCEEDED'
                    AND attempt."finished_at" IS NOT NULL
                    AND attempt."finished_at" <= c_authority_cutoff
                  WHERE github."id" =
                      (evidence.value->'github'->>'resultId')::UUID
                    AND github."source_item_id" = source."id"
                    AND github."repository_url" = source."canonical_url"
                    AND github."repository_full_name" =
                      evidence.value->'github'->>'repositoryIdentity'
                    AND github."rank" =
                      (evidence.value->'github'->>'rank')::INTEGER
                    AND github."checked_at" =
                      (evidence.value->'github'->>'checkedAt')::TIMESTAMPTZ
                    AND github."checked_at" <= c_authority_cutoff
                    AND github."scan_job_id" =
                      (evidence.value->'github'->>'scanJobId')::UUID
                    AND attempt."attempt_number" =
                      (evidence.value->'github'->>'scanAttemptNumber')::INTEGER
                    AND attempt."attempt_number" = (
                      SELECT completed."attempt_number"
                      FROM "scan_attempts" AS completed
                      WHERE completed."scan_job_id" = scan."id"
                        AND completed."tenant_id" = scan."tenant_id"
                        AND completed."workspace_id" = scan."workspace_id"
                        AND completed."source_binding_id" =
                          scan."source_binding_id"
                        AND completed."status" = 'SUCCEEDED'
                        AND completed."finished_at" IS NOT NULL
                        AND completed."finished_at" <= c_authority_cutoff
                      ORDER BY completed."attempt_number" DESC
                      LIMIT 1
                    )
                    AND github."id" = (
                      SELECT latest."id"
                      FROM "github_repository_trend_results" AS latest
                      JOIN "scan_jobs" AS latest_scan
                        ON latest_scan."id" = latest."scan_job_id"
                        AND latest_scan."tenant_id" = latest."tenant_id"
                        AND latest_scan."workspace_id" = latest."workspace_id"
                        AND latest_scan."source_binding_id" =
                          latest."source_binding_id"
                        AND latest_scan."status" = 'SUCCEEDED'
                      WHERE latest."source_item_id" = source."id"
                        AND latest."tenant_id" = source."tenant_id"
                        AND latest."workspace_id" = source."workspace_id"
                        AND latest."source_binding_id" =
                          source."source_binding_id"
                        AND latest."repository_url" = source."canonical_url"
                        AND latest."primary_window" IN ('daily', 'today')
                        AND latest."checked_at" <= c_authority_cutoff
                        AND EXISTS (
                          SELECT 1
                          FROM "scan_attempts" AS latest_attempt
                          WHERE latest_attempt."scan_job_id" =
                              latest_scan."id"
                            AND latest_attempt."tenant_id" =
                              latest_scan."tenant_id"
                            AND latest_attempt."workspace_id" =
                              latest_scan."workspace_id"
                            AND latest_attempt."source_binding_id" =
                              latest_scan."source_binding_id"
                            AND latest_attempt."status" = 'SUCCEEDED'
                            AND latest_attempt."finished_at" IS NOT NULL
                            AND latest_attempt."finished_at" <=
                              c_authority_cutoff
                        )
                      ORDER BY latest."checked_at" DESC, latest."id"
                      LIMIT 1
                    )
                )
              )
          )
        ) THEN
        RAISE EXCEPTION 'recovery gap % immutable DB multiset diverged', v_date;
      END IF;
    END LOOP;
    SELECT jsonb_agg(jsonb_build_object(
        'providerKey', coverage.value->>'providerKey',
        'count', (coverage.value->>'count')::INTEGER,
        'sha256', coverage.value->>'evidenceSha256'
      ) ORDER BY coverage.ordinal)
    INTO v_evidence
    FROM jsonb_array_elements(v_day->'providerCoverage')
      WITH ORDINALITY AS coverage(value, ordinal);
    IF v_day->>'providerEvidenceSha256' <> encode(sha256(convert_to(
      "reader_summary_production_recovery_canonical_json"(v_evidence),
      'UTF8'
    )), 'hex') THEN
      RAISE EXCEPTION 'recovery gap % provider evidence digest diverged', v_date;
    END IF;
    v_day_record := v_day
      - 'identity' - 'providerCounts' - 'providerEvidence'
      - 'canonicalSha256' - 'planSha256s';
    v_day_bytes := convert_to(
      "reader_summary_production_recovery_canonical_json"(v_day_record),
      'UTF8'
    );
    v_day_sha := encode(sha256(v_day_bytes), 'hex');
    IF v_day->>'canonicalSha256' <> v_day_sha
      OR v_day->>'identity' <>
        'reader_summary.production_recovery_gap_day.v3:' || v_day_sha THEN
      RAISE EXCEPTION 'recovery gap % day seal diverged', v_date;
    END IF;
    v_plan_days := v_plan_days || jsonb_build_array(jsonb_build_object(
      'identity', v_day->>'identity',
      'requestedUtcDate', v_day->>'requestedUtcDate',
      'canonicalSha256', v_day_sha,
      'providerEvidenceSha256', v_day->>'providerEvidenceSha256',
      'planSha256s', v_day->'planSha256s'
    ));
  END LOOP;
  v_authority_record := (first_plan - 'days') ||
    jsonb_build_object('days', v_plan_days);
  v_bytes := convert_to(
    "reader_summary_production_recovery_canonical_json"(v_authority_record),
    'UTF8'
  );
  v_hash := encode(sha256(v_bytes), 'hex');
  PERFORM set_config('social_monitor.production_recovery_write', 'on', TRUE);
  INSERT INTO "reader_summary_production_recovery_leases" (
    "id", "tenant_id", "workspace_id", "identity", "state",
    "canonical_record", "canonical_bytes", "canonical_sha256",
    "issued_at", "consumed_at"
  ) VALUES (
    v_recovery_id, c_tenant_id, c_workspace_id,
    first_plan->>'identity', 'ISSUED', v_authority_record, v_bytes, v_hash,
    v_issued_at, NULL
  );
  INSERT INTO "reader_summary_production_recovery_dry_runs" (
    "recovery_id", "tenant_id", "workspace_id", "ordinal",
    "canonical_record", "canonical_bytes", "canonical_sha256", "captured_at"
  ) VALUES
    (v_recovery_id, c_tenant_id, c_workspace_id, 1,
      v_authority_record, v_bytes, v_hash, v_issued_at),
    (v_recovery_id, c_tenant_id, c_workspace_id, 2,
      v_authority_record, v_bytes, v_hash, v_issued_at);
  FOR v_day IN
    SELECT entry.value
    FROM jsonb_array_elements(first_plan->'days')
      WITH ORDINALITY AS entry(value, ordinal)
    ORDER BY entry.ordinal
  LOOP
    v_date := (v_day->>'requestedUtcDate')::DATE;
    v_day_record := v_day
      - 'identity' - 'providerCounts' - 'providerEvidence'
      - 'canonicalSha256' - 'planSha256s';
    v_day_bytes := convert_to(
      "reader_summary_production_recovery_canonical_json"(v_day_record),
      'UTF8'
    );
    INSERT INTO "reader_summary_production_recovery_days" (
      "recovery_id", "tenant_id", "workspace_id", "requested_utc_date",
      "identity", "provider_counts", "provider_evidence",
      "provider_evidence_sha256", "github_evidence", "canonical_record",
      "canonical_bytes", "canonical_sha256", "recorded_at"
    ) VALUES (
      v_recovery_id, c_tenant_id, c_workspace_id, v_date,
      v_day->>'identity', v_day->'providerCoverage',
      v_day->'providerEvidence', v_day->>'providerEvidenceSha256',
      v_day->'githubEvidence', v_day_record, v_day_bytes,
      v_day->>'canonicalSha256', v_issued_at
    );
  END LOOP;
  UPDATE "reader_summary_production_recovery_leases"
  SET "state" = 'CONSUMED', "consumed_at" = v_issued_at
  WHERE "id" = v_recovery_id AND "state" = 'ISSUED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recovery gap lease consumption was lost';
  END IF;
  RETURN QUERY SELECT * FROM "read_reader_summary_production_recovery_gap_v3"(
    c_tenant_id, c_workspace_id
  );
END;
$persist_gap$;
REVOKE ALL PRIVILEGES ON FUNCTION
  "read_reader_summary_production_recovery_gap_v3"(UUID, UUID),
  "persist_reader_summary_production_recovery_gap_v3"(JSONB, JSONB)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT EXECUTE ON FUNCTION "read_reader_summary_production_recovery_gap_v3"(UUID, UUID),
  "persist_reader_summary_production_recovery_gap_v3"(JSONB, JSONB)
TO "social_monitor_reader_summary_publication_runtime";
RESET ROLE; SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
