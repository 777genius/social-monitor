-- Exact post-mutation proof, bound to the same backend identity and nonce used
-- by authorization and continuously monitored by the server-side watchdog.
DO $reader_summary_telemetry_recovery_postflight$
DECLARE
  v_expected_logs CONSTANT TEXT :=
$reviewed_failure$A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve

Migration name: 20260824120000_reader_summary_daily_model_job_telemetry

Database error code: 42501

Database error:
ERROR: permission denied for schema public

DbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42501), message: "permission denied for schema public", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("aclchk.c"), line: Some(<server-line>), routine: Some("aclcheck_error") }
$reviewed_failure$;
  v_guard_count BIGINT;
  v_guard_pid_text TEXT := pg_catalog.current_setting(
    'social_monitor.telemetry_guard_pid', TRUE
  );
  v_guard_backend_start_text TEXT := pg_catalog.current_setting(
    'social_monitor.telemetry_guard_backend_start', TRUE
  );
  v_guard_application TEXT := pg_catalog.current_setting(
    'social_monitor.telemetry_guard_application', TRUE
  );
  v_guard_nonce TEXT := pg_catalog.current_setting(
    'social_monitor.telemetry_guard_nonce', TRUE
  );
BEGIN
  IF v_guard_pid_text !~ '^[1-9][0-9]*$'
    OR v_guard_backend_start_text IS NULL
    OR v_guard_nonce !~ '^[0-9a-f]{24}$'
    OR v_guard_application IS DISTINCT FROM
      'social-monitor/telemetry-recovery-guard/' || v_guard_nonce THEN
    RAISE EXCEPTION 'telemetry recovery postflight guard binding is invalid';
  END IF;
  SELECT count(*) INTO STRICT v_guard_count
  FROM pg_catalog.pg_locks AS lock
  JOIN pg_catalog.pg_stat_activity AS activity ON activity.pid = lock.pid
  WHERE lock.locktype = 'advisory' AND lock.classid = 1936879981::OID
    AND lock.objid = 1502026082::OID AND lock.objsubid = 2
    AND lock.granted AND lock.pid = v_guard_pid_text::INTEGER
    AND activity.backend_start = v_guard_backend_start_text::TIMESTAMPTZ
    AND activity.datname = pg_catalog.current_database()
    AND activity.application_name = v_guard_application;
  IF v_guard_count <> 1 OR (SELECT count(*) FROM pg_catalog.pg_locks AS lock
      WHERE lock.locktype = 'advisory'
        AND lock.classid = 1936879981::OID
        AND lock.objid = 1502026082::OID AND lock.objsubid = 2
        AND lock.granted) <> 1 THEN
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
        AND started_at <= rolled_back_at
        AND applied_steps_count = 0 AND logs IS NOT NULL
        AND pg_catalog.regexp_replace(pg_catalog.regexp_replace(
          pg_catalog.replace(logs, E'\r\n', E'\n'),
          'line: Some\([0-9]+\)', 'line: Some(<server-line>)', 'g'
        ), E'\n+\\Z', E'\n') = v_expected_logs) <> 1
    OR (SELECT count(*) FROM public."_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL) <> 0 THEN
    RAISE EXCEPTION 'telemetry recovery postflight is not the exact resolved row';
  END IF;
END
$reader_summary_telemetry_recovery_postflight$;

SELECT 'resolved' AS case;
