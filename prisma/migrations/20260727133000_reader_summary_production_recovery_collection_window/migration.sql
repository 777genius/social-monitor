-- @social-monitor-forward-migration
-- Repair Jul23/Jul24 production recovery authority to use collection windows.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $repair_recovery_day_observed_window$
DECLARE
  v_definition TEXT;
  v_end_old CONSTANT TEXT := 'AND feed."published_at" <
          (v_period_end::TIMESTAMP AT TIME ZONE ''UTC'')';
  v_end_new CONSTANT TEXT := 'AND feed."observed_at" <
          (v_period_end::TIMESTAMP AT TIME ZONE ''UTC'')';
  v_start_old CONSTANT TEXT := 'AND feed."published_at" >=
          (target_date::TIMESTAMP AT TIME ZONE ''UTC'')';
  v_start_new CONSTANT TEXT := 'AND feed."observed_at" >=
          (target_date::TIMESTAMP AT TIME ZONE ''UTC'')';
BEGIN
  SELECT pg_get_functiondef(
    'public.derive_reader_summary_production_recovery_day(uuid,uuid,uuid,date,timestamp with time zone)'::regprocedure
  )
  INTO STRICT v_definition;

  IF (length(v_definition) - length(replace(v_definition, v_start_old, ''))) /
      length(v_start_old) <> 2
    OR (length(v_definition) - length(replace(v_definition, v_end_old, ''))) /
      length(v_end_old) <> 2 THEN
    RAISE EXCEPTION
      'production recovery day derivation is not the expected published_at definition';
  END IF;

  v_definition := replace(v_definition, v_start_old, v_start_new);
  v_definition := replace(v_definition, v_end_old, v_end_new);
  EXECUTE v_definition;
END;
$repair_recovery_day_observed_window$;

DO $repair_recovery_prepare_observed_window$
DECLARE
  v_definition TEXT;
  v_distinct_feed CONSTANT TEXT := 'count(*) = count(DISTINCT feed."id")';
  v_distinct_source CONSTANT TEXT := 'count(*) = count(DISTINCT source."id")';
  v_published CONSTANT TEXT := 'feed."published_at"';
  v_source_lock_old CONSTANT TEXT := 'JOIN "source_items" AS source
    ON source."id" = feed."source_item_id"
    AND source."tenant_id" = feed."tenant_id"
    AND source."workspace_id" = feed."workspace_id"
  WHERE feed."tenant_id" = v_tenant_id';
  v_source_lock_new CONSTANT TEXT := 'JOIN "source_items" AS source
    ON source."id" = feed."source_item_id"
    AND source."tenant_id" = feed."tenant_id"
    AND source."workspace_id" = feed."workspace_id"
    AND source."source_binding_id" = feed."source_binding_id"
    AND source."provider_key" = feed."provider_key"
    AND source."canonical_url" = feed."canonical_url"
  WHERE feed."tenant_id" = v_tenant_id';
BEGIN
  SELECT pg_get_functiondef(
    'public.prepare_reader_summary_production_recovery()'::regprocedure
  )
  INTO STRICT v_definition;

  IF (length(v_definition) - length(replace(v_definition, v_published, ''))) /
      length(v_published) <> 16
    OR (length(v_definition) - length(replace(v_definition, v_distinct_source, ''))) /
      length(v_distinct_source) <> 1
    OR (length(v_definition) - length(replace(v_definition, v_source_lock_old, ''))) /
      length(v_source_lock_old) <> 1 THEN
    RAISE EXCEPTION
      'production recovery prepare is not the expected published_at definition';
  END IF;

  v_definition := replace(v_definition, v_published, 'feed."observed_at"');
  v_definition := replace(v_definition, v_distinct_source, v_distinct_feed);
  v_definition := replace(v_definition, v_source_lock_old, v_source_lock_new);
  EXECUTE v_definition;
END;
$repair_recovery_prepare_observed_window$;

ALTER FUNCTION "derive_reader_summary_production_recovery_day"(
  UUID,
  UUID,
  UUID,
  DATE,
  TIMESTAMPTZ
) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION "prepare_reader_summary_production_recovery"()
  SECURITY DEFINER;
ALTER FUNCTION "prepare_reader_summary_production_recovery"()
  SET search_path = pg_catalog, public, pg_temp;

REVOKE ALL PRIVILEGES ON FUNCTION
  "validate_reader_summary_production_recovery"(UUID),
  "derive_reader_summary_production_recovery_day"(
    UUID,
    UUID,
    UUID,
    DATE,
    TIMESTAMPTZ
  ),
  "prepare_reader_summary_production_recovery"()
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT EXECUTE ON FUNCTION
  "prepare_reader_summary_production_recovery"()
TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
