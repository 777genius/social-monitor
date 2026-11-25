-- @social-monitor-forward-migration
-- Restore the exact six-day recovery constraint after Jul28 was added in place.
BEGIN;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

ALTER TABLE "reader_summary_production_recovery_days"
  DROP CONSTRAINT "reader_summary_production_recovery_days_date_check";
ALTER TABLE "reader_summary_production_recovery_days"
  ADD CONSTRAINT "reader_summary_production_recovery_days_date_check"
  CHECK ("requested_utc_date" IN (
    DATE '2026-07-23',
    DATE '2026-07-24',
    DATE '2026-07-25',
    DATE '2026-07-26',
    DATE '2026-07-27',
    DATE '2026-07-28'
  ));

RESET ROLE;

COMMIT;
