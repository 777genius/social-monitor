-- Exact post-mutation proof. This is valid only while the same advisory guard
-- session used by the authorization probe remains continuously connected.
DO $reader_summary_telemetry_recovery_postflight$
DECLARE
  v_guard_count BIGINT;
BEGIN
  SELECT count(*) INTO STRICT v_guard_count
  FROM pg_catalog.pg_locks AS lock
  JOIN pg_catalog.pg_stat_activity AS activity ON activity.pid = lock.pid
  WHERE lock.locktype = 'advisory' AND lock.classid = 1936879981::OID
    AND lock.objid = 1502026082::OID AND lock.objsubid = 2
    AND lock.granted AND lock.pid <> pg_catalog.pg_backend_pid()
    AND activity.datname = pg_catalog.current_database()
    AND activity.application_name =
      'social-monitor/telemetry-migration-recovery-guard';
  IF v_guard_count <> 1 THEN
    RAISE EXCEPTION 'telemetry recovery database guard was not held continuously';
  END IF;
  IF (SELECT count(*) FROM public."_prisma_migrations"
      WHERE migration_name =
        '20260824120000_reader_summary_daily_model_job_telemetry') <> 1
    OR (SELECT count(*) FROM public."_prisma_migrations"
      WHERE migration_name =
        '20260824120000_reader_summary_daily_model_job_telemetry'
        AND checksum =
          'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
        AND finished_at IS NULL AND rolled_back_at IS NOT NULL
        AND applied_steps_count = 0) <> 1
    OR (SELECT count(*) FROM public."_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL) <> 0 THEN
    RAISE EXCEPTION 'telemetry recovery postflight is not the exact resolved row';
  END IF;
END
$reader_summary_telemetry_recovery_postflight$;

SELECT 'resolved' AS case;
