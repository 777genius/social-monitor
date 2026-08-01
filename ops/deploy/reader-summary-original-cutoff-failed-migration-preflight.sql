-- Read-only-by-rollback gate for the single reviewed Prisma P3009 incident.
-- The application_name is fixed by the root-owned deploy wrapper.
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public, pg_temp;

DO $original_cutoff_probe$
DECLARE
  v_expected JSONB;
  v_guard OID;
  v_guard_name TEXT;
  v_phase TEXT := current_setting('application_name');
  v_recovery RECORD;
  v_corrected_matches INTEGER;
  v_corrected_rows INTEGER;
  v_failed_rows INTEGER;
  v_jul23_rss_count INTEGER;
  v_jul24_rss_count INTEGER;
  v_target_matches INTEGER;
  v_target_rows INTEGER;
  v_unfinished INTEGER;
BEGIN
  IF v_phase NOT IN (
    'social-monitor/original-cutoff-pre',
    'social-monitor/original-cutoff-resolved',
    'social-monitor/original-cutoff-post'
  ) THEN
    RAISE EXCEPTION 'original-cutoff probe application name is invalid';
  END IF;
  IF to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'original-cutoff probe requires Prisma migration history';
  END IF;

  SELECT count(*) INTO v_unfinished
  FROM public."_prisma_migrations"
  WHERE finished_at IS NULL AND rolled_back_at IS NULL;

  SELECT
    count(*),
    count(*) FILTER (WHERE checksum =
      '7383663a3a29d709f5bdfc27ebf7c237fb07c1c32b28af09bad1bf92f369e5af')
  INTO v_target_rows, v_failed_rows
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260731153000_reader_summary_production_recovery_original_cutoff_authority';
  SELECT count(*) INTO v_target_matches
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
    AND checksum =
      '7383663a3a29d709f5bdfc27ebf7c237fb07c1c32b28af09bad1bf92f369e5af'
    AND started_at = TIMESTAMPTZ '2026-07-31 21:16:04.938573+00'
    AND finished_at IS NULL
    AND applied_steps_count = 0
    AND id <> ''
    AND logs IS NOT NULL
    AND logs LIKE '%Database error code: 42601%'
    AND logs LIKE '%ERROR: syntax error at end of input%'
    AND logs LIKE '%code: SqlState(E42601)%'
    AND logs LIKE '%message: "syntax error at end of input"%'
    AND logs LIKE '%routine: Some("scanner_yyerror")%'
    AND (
      (v_phase = 'social-monitor/original-cutoff-pre'
        AND rolled_back_at IS NULL)
      OR (v_phase <> 'social-monitor/original-cutoff-pre'
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at)
    );

  IF v_phase = 'social-monitor/original-cutoff-pre' AND v_unfinished = 0 THEN
    RETURN;
  ELSIF v_phase = 'social-monitor/original-cutoff-pre' AND (
    v_unfinished <> 1 OR v_target_rows <> 1
    OR v_failed_rows <> 1 OR v_target_matches <> 1
  ) THEN
    RAISE EXCEPTION 'original-cutoff unfinished migration is not reviewed';
  ELSIF v_phase = 'social-monitor/original-cutoff-resolved' THEN
    IF v_unfinished <> 0 OR v_target_rows <> 1
      OR v_failed_rows <> 1 OR v_target_matches <> 1 THEN
      RAISE EXCEPTION 'original-cutoff resolved failed row diverged';
    END IF;
    RETURN;
  ELSIF v_phase = 'social-monitor/original-cutoff-post' THEN
    SELECT
      count(*),
      count(*) FILTER (
        WHERE started_at IS NOT NULL
          AND finished_at IS NOT NULL
          AND finished_at >= started_at
          AND rolled_back_at IS NULL
          AND applied_steps_count = 1
          AND id <> ''
          AND logs IS NULL
      )
    INTO v_corrected_rows, v_corrected_matches
    FROM public."_prisma_migrations"
    WHERE migration_name =
        '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
      AND checksum =
        '4100dd4ae236a300e002d2599a880b27df50972aed2f4a9f33578a3da2fe5c35';
    IF v_unfinished <> 0
      OR v_target_rows <> v_failed_rows + v_corrected_rows
      OR v_failed_rows <> v_target_matches
      OR v_failed_rows > 1
      OR v_corrected_rows <> 1
      OR v_corrected_matches <> 1 THEN
      RAISE EXCEPTION 'original-cutoff corrected migration row diverged';
    END IF;
  END IF;

  IF NOT pg_has_role(
    current_user,
    'social_monitor_reader_summary_publication_owner',
    'SET'
  ) THEN
    RAISE EXCEPTION 'original-cutoff probe cannot assume authority ownership';
  END IF;
  SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

  IF to_regprocedure(
      'public.repair_reader_summary_production_recovery_original_cutoff_v2()'
    ) IS NOT NULL THEN
    RAISE EXCEPTION 'original-cutoff repair helper survived failed transaction';
  END IF;
  IF to_regprocedure(
      'public.reader_summary_production_recovery_expected_counts_v2(date)'
    ) IS NULL OR to_regprocedure(
      'public.validate_reader_summary_production_recovery(uuid)'
    ) IS NULL THEN
    RAISE EXCEPTION 'original-cutoff predecessor authority is incomplete';
  END IF;

  -- The unresolved P3009 predecessor is intentionally 78/68. The corrected
  -- immutable authority is intentionally 75/67 and is accepted only post-run.
  IF v_phase = 'social-monitor/original-cutoff-pre' THEN
    v_jul23_rss_count := 78;
    v_jul24_rss_count := 68;
  ELSE
    v_jul23_rss_count := 75;
    v_jul24_rss_count := 67;
  END IF;
  v_expected := jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 0,
      'evidenceState', 'historical_unavailable'),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'reddit', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'rss', 'count', v_jul23_rss_count,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 67,
      'evidenceState', 'verified_existing')
  );
  IF public."reader_summary_production_recovery_expected_counts_v2"(
      DATE '2026-07-23') IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'original-cutoff Jul23 phase counts diverged';
  END IF;
  v_expected := jsonb_build_array(
    jsonb_build_object('providerKey', 'github-trending-page', 'count', 10,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'hacker-news', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'reddit', 'count', 100,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'rss', 'count', v_jul24_rss_count,
      'evidenceState', 'verified_existing'),
    jsonb_build_object('providerKey', 'x-twitter', 'count', 73,
      'evidenceState', 'verified_existing')
  );
  IF public."reader_summary_production_recovery_expected_counts_v2"(
      DATE '2026-07-24') IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'original-cutoff Jul24 phase counts diverged';
  END IF;

  FOREACH v_guard_name IN ARRAY ARRAY[
    'guard_reader_summary_production_recovery_evidence',
    'guard_reader_summary_production_recovery_lease'
  ] LOOP
    v_guard := to_regprocedure(format('public.%I()', v_guard_name));
    IF v_guard IS NULL OR EXISTS (
      SELECT 1
      FROM pg_proc AS function
      WHERE function.oid = v_guard
        AND (
          pg_get_userbyid(function.proowner) <>
            'social_monitor_reader_summary_publication_owner'
          OR function.prosecdef
          OR function.proconfig IS DISTINCT FROM
            ARRAY['search_path=pg_catalog, public, pg_temp']::TEXT[]
          OR strpos(pg_get_functiondef(function.oid),
            'social_monitor.production_recovery_write') = 0
          OR strpos(pg_get_functiondef(function.oid),
            'social_monitor.authorized_retention_purge') = 0
          OR strpos(pg_get_functiondef(function.oid),
            'production_recovery_original_cutoff_write') <> 0
        )
    ) OR EXISTS (
      SELECT 1
      FROM pg_proc AS function
      CROSS JOIN LATERAL aclexplode(COALESCE(
        function.proacl, acldefault('f', function.proowner)
      )) AS privilege
      LEFT JOIN pg_roles AS grantee ON grantee.oid = privilege.grantee
      WHERE function.oid = v_guard
        AND privilege.privilege_type = 'EXECUTE'
        AND (privilege.grantee = 0 OR grantee.rolname =
          'social_monitor_reader_summary_publication_runtime')
    ) THEN
      RAISE EXCEPTION 'original-cutoff predecessor guard or ACL diverged: %',
        v_guard_name;
    END IF;
  END LOOP;

  IF to_regclass('public.reader_summary_production_recovery_days') IS NULL
    OR to_regclass('public.reader_summary_production_recovery_leases') IS NULL
    OR to_regclass('public.reader_summary_production_recovery_dry_runs') IS NULL
  THEN
    RAISE EXCEPTION 'original-cutoff predecessor authority tables are absent';
  END IF;
  -- Absent predecessor recovery rows are valid. If either reviewed day exists,
  -- both must remain the exact phase authority and pass the full validator.
  FOR v_recovery IN
    SELECT day.recovery_id, count(*) AS day_count
    FROM public.reader_summary_production_recovery_days AS day
    WHERE day.requested_utc_date IN (
      DATE '2026-07-23', DATE '2026-07-24'
    )
    GROUP BY day.recovery_id
  LOOP
    IF v_recovery.day_count <> 2 OR EXISTS (
      SELECT 1
      FROM public.reader_summary_production_recovery_days AS day
      WHERE day.recovery_id = v_recovery.recovery_id
        AND day.requested_utc_date IN (
          DATE '2026-07-23', DATE '2026-07-24'
        )
        AND day.provider_counts IS DISTINCT FROM
          public."reader_summary_production_recovery_expected_counts_v2"(
            day.requested_utc_date)
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.reader_summary_production_recovery_leases AS lease
      WHERE lease.id = v_recovery.recovery_id
        AND lease.state = 'CONSUMED'
        AND lease.consumed_at = lease.issued_at
    ) THEN
      RAISE EXCEPTION 'original-cutoff authority is mixed or partially repaired';
    END IF;
    PERFORM public."validate_reader_summary_production_recovery"(
      v_recovery.recovery_id);
  END LOOP;
END;
$original_cutoff_probe$;

ROLLBACK;

SELECT CASE current_setting('application_name')
  WHEN 'social-monitor/original-cutoff-resolved' THEN 'resolved'
  WHEN 'social-monitor/original-cutoff-post' THEN 'corrected'
  ELSE CASE WHEN EXISTS (
    SELECT 1 FROM public."_prisma_migrations"
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
  ) THEN 'resolve' ELSE 'clean' END
END;
