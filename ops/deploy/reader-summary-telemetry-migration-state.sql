-- Read-only ordinary deployment classifier. It cannot authorize mutation.
SELECT CASE
  WHEN count(*) = 0 THEN 'clean'
  WHEN count(*) = 1
    AND (array_agg(checksum ORDER BY started_at, id))[1] =
      'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
    AND NOT (array_agg(finished_at IS NOT NULL ORDER BY started_at, id))[1]
    AND NOT (array_agg(rolled_back_at IS NOT NULL ORDER BY started_at, id))[1]
    THEN 'recovery-required'
  WHEN count(*) = 1
    AND (array_agg(checksum ORDER BY started_at, id))[1] =
      'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
    AND NOT (array_agg(finished_at IS NOT NULL ORDER BY started_at, id))[1]
    AND (array_agg(rolled_back_at IS NOT NULL ORDER BY started_at, id))[1]
    THEN 'resolved'
  WHEN count(*) = 1
    AND (array_agg(checksum ORDER BY started_at, id))[1] =
      '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250'
    AND (array_agg(finished_at IS NOT NULL ORDER BY started_at, id))[1]
    AND NOT (array_agg(rolled_back_at IS NOT NULL ORDER BY started_at, id))[1]
    THEN 'corrected'
  WHEN count(*) = 2
    AND (array_agg(checksum ORDER BY started_at, id))[1] =
      'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
    AND NOT (array_agg(finished_at IS NOT NULL ORDER BY started_at, id))[1]
    AND (array_agg(rolled_back_at IS NOT NULL ORDER BY started_at, id))[1]
    AND (array_agg(checksum ORDER BY started_at, id))[2] =
      '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250'
    AND (array_agg(finished_at IS NOT NULL ORDER BY started_at, id))[2]
    AND NOT (array_agg(rolled_back_at IS NOT NULL ORDER BY started_at, id))[2]
    AND (array_agg(started_at ORDER BY started_at, id))[1] <
      (array_agg(started_at ORDER BY started_at, id))[2]
    THEN 'recovered'
  ELSE 'invalid'
END
FROM public."_prisma_migrations"
WHERE migration_name =
  '20260824120000_reader_summary_daily_model_job_telemetry';
