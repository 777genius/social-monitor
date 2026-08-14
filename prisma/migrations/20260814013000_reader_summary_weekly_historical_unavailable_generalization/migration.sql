-- @social-monitor-forward-migration
-- Weekly synthesis may consume any immutable daily publication whose GitHub
-- projection was explicitly and honestly recorded as historically unavailable.
-- The authority stays fail-closed: zero GitHub rows, a bounded reason, a
-- post-period authorization timestamp, and non-GitHub provider evidence remain
-- mandatory. This removes the obsolete single-date exception without
-- fabricating GitHub evidence.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $generalize_weekly_historical_unavailable$
DECLARE
  v_definition TEXT;
  v_old TEXT;
  v_new TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'backfill_reader_summary_weekly_daily_certifications(uuid,uuid,text,text,date)'::regprocedure
  ) INTO STRICT v_definition;
  v_old := $old_backfill$
    ELSIF v_evidence."semantic_status" = 'COMPLETED'
      AND v_day = DATE '2026-07-23'
      AND v_evidence."github_evidence"->>'mode'
        = 'historical_unavailable'
    THEN$old_backfill$;
  v_new := $new_backfill$
    ELSIF v_evidence."semantic_status" = 'COMPLETED'
      AND v_evidence."github_evidence"->>'mode'
        = 'historical_unavailable'
    THEN$new_backfill$;
  IF strpos(v_definition, v_old) = 0
    OR strpos(v_definition, v_new) <> 0
  THEN
    RAISE EXCEPTION
      'weekly daily certification historical-unavailable preimage diverged';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  IF strpos(v_definition, v_old) <> 0
    OR strpos(v_definition, v_new) = 0
  THEN
    RAISE EXCEPTION
      'weekly daily certification historical-unavailable replacement failed';
  END IF;
  EXECUTE v_definition;

  SELECT pg_get_functiondef(
    'persist_reader_summary_weekly_review_manifest(jsonb)'::regprocedure
  ) INTO STRICT v_definition;
  v_old := $old_manifest$
    WHERE evidence_row."github_evidence"->>'mode' = 'historical_unavailable'
      AND (
        evidence_row."requested_utc_date" <> DATE '2026-07-23'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(evidence_row."provider_evidence") AS provider_item(value)
          WHERE provider_item.value->>'providerKey' = 'github-trending-page'
        )
      )$old_manifest$;
  v_new := $new_manifest$
    WHERE evidence_row."github_evidence"->>'mode' = 'historical_unavailable'
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(evidence_row."provider_evidence") AS provider_item(value)
        WHERE provider_item.value->>'providerKey' = 'github-trending-page'
      )$new_manifest$;
  IF strpos(v_definition, v_old) = 0
    OR strpos(v_definition, v_new) <> 0
  THEN
    RAISE EXCEPTION
      'weekly review manifest historical-unavailable preimage diverged';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  IF strpos(v_definition, v_old) <> 0
    OR strpos(v_definition, v_new) = 0
  THEN
    RAISE EXCEPTION
      'weekly review manifest historical-unavailable replacement failed';
  END IF;
  EXECUTE v_definition;
END
$generalize_weekly_historical_unavailable$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
