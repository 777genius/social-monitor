-- @social-monitor-forward-migration
BEGIN;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

GRANT EXECUTE ON FUNCTION
  "prepare_reader_summary_production_recovery"()
TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;

COMMIT;
