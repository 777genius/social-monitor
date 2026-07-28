-- @social-monitor-forward-migration
-- Backfill the exact 2026-07-20..2026-07-26 weekly input from immutable
-- daily publication authority. The existing evidence recorder remains the
-- only writer and verifies report, proof, artifact, source, and publication
-- seals before appending a certification.
BEGIN;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION "backfill_reader_summary_weekly_daily_certifications"(
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
  v_existing_publication_id UUID;
  v_identity TEXT;
  v_publication_id UUID;
  v_sha TEXT;
BEGIN
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
      AND target_scope_key !~ '^interest:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
  THEN
    RAISE EXCEPTION 'weekly daily certification backfill scope is invalid';
  END IF;

  IF target_week_started_on IS DISTINCT FROM DATE '2026-07-20'
    OR extract(isodow FROM target_week_started_on) <> 1
    OR target_week_started_on + 6 <> DATE '2026-07-26'
  THEN
    RAISE EXCEPTION
      'weekly daily certification backfill requires 2026-07-20..2026-07-26';
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
  ORDER BY slot."period_started_at"
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
    AND publication."semantic_status" = 'COMPLETED'
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
    AND publication."exact_proof"->>'semanticStatus' = 'COMPLETED'
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
    FROM "reader_summary_publication_slots" AS slot
    JOIN "reader_summary_publications" AS publication
      ON publication."id" = slot."current_publication_id"
    WHERE slot."tenant_id" = target_tenant_id
      AND slot."workspace_id" = target_workspace_id
      AND slot."scope_type" = target_scope_type
      AND slot."scope_key" = target_scope_key
      AND slot."cadence" = 'daily'
      AND slot."period_timezone" = 'UTC'
      AND publication."requested_utc_date" BETWEEN target_week_started_on
        AND target_week_started_on + 6
    ORDER BY publication."requested_utc_date"
  LOOP
    SELECT evidence."publication_id"
    INTO v_existing_publication_id
    FROM "reader_summary_weekly_publication_evidence" AS evidence
    WHERE evidence."publication_id" = v_publication_id;

    PERFORM "record_reader_summary_weekly_publication_evidence"(
      v_publication_id
    );

    SELECT evidence."identity", btrim(evidence."canonical_sha256")
    INTO STRICT v_identity, v_sha
    FROM "reader_summary_weekly_publication_evidence" AS evidence
    WHERE evidence."publication_id" = v_publication_id;

    requested_utc_date := v_day;
    publication_id := v_publication_id;
    outcome := CASE
      WHEN v_existing_publication_id IS NULL THEN 'inserted'
      ELSE 'replayed'
    END;
    identity := v_identity;
    canonical_sha256 := v_sha;
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
COMMIT;
