-- Read-only exact deployment classifier. Mutation authorization additionally
-- proves the catalog and continuously bound guard in the preflight SQL.
WITH expected AS (
  SELECT
$reviewed_failure$A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve

Migration name: 20260824120000_reader_summary_daily_model_job_telemetry

Database error code: 42501

Database error:
ERROR: permission denied for schema public

DbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42501), message: "permission denied for schema public", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("aclchk.c"), line: Some(<server-line>), routine: Some("aclcheck_error") }
$reviewed_failure$::TEXT AS failure_logs
), telemetry_history AS (
  SELECT migration.id, migration.checksum, migration.started_at,
    migration.finished_at, migration.rolled_back_at,
    migration.applied_steps_count, migration.logs,
    pg_catalog.regexp_replace(pg_catalog.regexp_replace(
      pg_catalog.replace(migration.logs, E'\r\n', E'\n'),
      'line: Some\([0-9]+\)', 'line: Some(<server-line>)', 'g'
    ), E'\n+\\Z', E'\n') AS normalized_logs
  FROM public."_prisma_migrations" AS migration
  WHERE migration.migration_name =
    '20260824120000_reader_summary_daily_model_job_telemetry'
), classified AS (
  SELECT count(*) AS row_count,
    count(*) FILTER (WHERE
      checksum =
        'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
      AND applied_steps_count = 0 AND logs IS NOT NULL
      AND normalized_logs = (SELECT failure_logs FROM expected)
      AND finished_at IS NULL AND rolled_back_at IS NULL
    ) AS unfinished_failure_count,
    count(*) FILTER (WHERE
      checksum =
        'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
      AND applied_steps_count = 0 AND logs IS NOT NULL
      AND normalized_logs = (SELECT failure_logs FROM expected)
      AND finished_at IS NULL AND rolled_back_at IS NOT NULL
      AND started_at <= rolled_back_at
    ) AS resolved_failure_count,
    count(*) FILTER (WHERE
      checksum =
        '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250'
      AND applied_steps_count = 1 AND logs IS NULL
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      AND started_at <= finished_at
    ) AS corrected_count,
    max(rolled_back_at) FILTER (WHERE checksum =
      'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
    ) AS failure_rolled_back_at,
    max(started_at) FILTER (WHERE checksum =
      '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250'
    ) AS corrected_started_at
  FROM telemetry_history
)
SELECT CASE
  WHEN row_count = 0 THEN 'clean'
  WHEN row_count = 1 AND unfinished_failure_count = 1
    THEN 'recovery-required'
  WHEN row_count = 1 AND resolved_failure_count = 1 THEN 'resolved'
  WHEN row_count = 1 AND corrected_count = 1 THEN 'corrected'
  WHEN row_count = 2 AND resolved_failure_count = 1 AND corrected_count = 1
    AND failure_rolled_back_at <= corrected_started_at THEN 'recovered'
  ELSE 'invalid'
END AS telemetry_history
FROM classified;
