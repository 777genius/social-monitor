-- @social-monitor-forward-migration
-- Alias recovery lease references that can collide with RETURNS TABLE names.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

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
      FROM "reader_summary_production_recovery_leases" AS replay_lease
      WHERE replay_lease."tenant_id" = v_session_tenant_id
        AND replay_lease."workspace_id" = v_session_workspace_id
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
      count(*) = count(DISTINCT feed."id")
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
      ) = 78
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
      ) = 68
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
    AND source."source_binding_id" = feed."source_binding_id"
    AND source."provider_key" = feed."provider_key"
    AND source."canonical_url" = feed."canonical_url"
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

  UPDATE "reader_summary_production_recovery_leases" AS lease
  SET
    "state" = 'CONSUMED',
    "consumed_at" = transaction_timestamp()
  WHERE lease."id" = v_recovery_id
    AND lease."state" = 'ISSUED'
    AND lease."consumed_at" IS NULL;
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

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
