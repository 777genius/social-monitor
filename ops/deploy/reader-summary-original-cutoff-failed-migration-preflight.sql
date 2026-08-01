-- Read-only-by-rollback gate for the single reviewed Prisma P3009 incident.
-- The root-owned wrapper authenticates the skipped migration before this probe.
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog, public, pg_temp;
SET LOCAL social_monitor.system_access = 'false';
SET LOCAL social_monitor.tenant_id =
  '00000000-0000-7000-8000-000000000901';
SET LOCAL social_monitor.workspace_id =
  '00000000-0000-7000-8000-000000000902';

DO $original_cutoff_probe$
DECLARE
  v_alias_rows INTEGER;
  v_applied_matches INTEGER;
  v_applied_rows INTEGER;
  v_expected JSONB;
  v_guard OID;
  v_guard_name TEXT;
  v_phase TEXT := current_setting('application_name');
  v_recovery RECORD;
  v_failed_rows INTEGER;
  v_jul23_rss_count INTEGER;
  v_jul24_rss_count INTEGER;
  v_new_matches INTEGER;
  v_new_rows INTEGER;
  v_reviewed_rolled_back INTEGER;
  v_reviewed_unfinished INTEGER;
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
      '8748c4e266d8c1838f29b1a6f59f4be056514de64fe95fe44f5c7bb3680b477d')
  INTO v_target_rows, v_failed_rows
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260731153000_reader_summary_production_recovery_original_cutoff_authority';
  SELECT
    count(*),
    count(*) FILTER (WHERE rolled_back_at IS NULL),
    count(*) FILTER (
      WHERE TRUE
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at
    )
  INTO v_target_matches, v_reviewed_unfinished, v_reviewed_rolled_back
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
    AND checksum =
      '8748c4e266d8c1838f29b1a6f59f4be056514de64fe95fe44f5c7bb3680b477d'
    AND started_at = TIMESTAMPTZ '2026-07-31 21:16:04.938573+00'
    AND finished_at IS NULL
    AND applied_steps_count = 0
    AND id <> ''
    AND logs IS NULL
    AND (
      rolled_back_at IS NULL
      OR (rolled_back_at IS NOT NULL AND rolled_back_at >= started_at)
    );
  SELECT
    count(*),
    count(*) FILTER (
      WHERE started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND finished_at >= started_at
        AND rolled_back_at IS NULL
        AND applied_steps_count = 0
        AND id <> ''
        AND logs IS NULL
    )
  INTO v_applied_rows, v_applied_matches
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
    AND checksum =
      '4100dd4ae236a300e002d2599a880b27df50972aed2f4a9f33578a3da2fe5c35';

  IF v_unfinished <> v_reviewed_unfinished
    OR v_reviewed_unfinished > 1
    OR v_reviewed_rolled_back > 1
    OR v_failed_rows <> v_target_matches
    OR v_failed_rows <> v_reviewed_unfinished + v_reviewed_rolled_back
    OR v_failed_rows > 1
    OR v_applied_rows <> v_applied_matches
    OR v_applied_rows > 1
    OR v_target_rows <> v_failed_rows + v_applied_rows THEN
    RAISE EXCEPTION 'original-cutoff migration history is not reviewed';
  END IF;

  IF v_phase = 'social-monitor/original-cutoff-pre' THEN
    IF v_reviewed_unfinished = 1 AND (
      v_unfinished <> 1 OR v_target_rows <> 1
      OR v_failed_rows <> 1 OR v_target_matches <> 1
      OR v_reviewed_rolled_back <> 0 OR v_applied_rows <> 0
    ) THEN
      RAISE EXCEPTION 'original-cutoff unfinished migration is not reviewed';
    ELSIF v_reviewed_unfinished = 0 AND v_applied_rows = 0
      AND v_target_rows <> v_reviewed_rolled_back THEN
      RAISE EXCEPTION 'original-cutoff unapplied history diverged';
    END IF;
  ELSE
    IF v_unfinished <> 0 OR v_target_rows <> 1 THEN
      IF v_unfinished <> 0 OR v_target_rows <>
        v_reviewed_rolled_back + v_applied_rows THEN
        RAISE EXCEPTION 'original-cutoff resolved history diverged';
      END IF;
    END IF;
    IF v_reviewed_unfinished <> 0 OR v_applied_rows <> 1 THEN
      RAISE EXCEPTION 'original-cutoff resolved history diverged';
    END IF;
  END IF;

  IF v_phase = 'social-monitor/original-cutoff-post' THEN
    SELECT
      count(*),
      count(*) FILTER (
        WHERE checksum =
            'da638eae2183abefb22addbfbb9228cad' ||
            '67050d2817809289a53e13eb5447fc5'
          AND started_at IS NOT NULL
          AND finished_at IS NOT NULL
          AND finished_at >= started_at
          AND rolled_back_at IS NULL
          AND applied_steps_count = 1
          AND id <> ''
          AND (logs IS NULL) IS TRUE
      )
    INTO v_new_rows, v_new_matches
    FROM public."_prisma_migrations"
    WHERE migration_name =
      '20260801130000_reader_summary_original_cutoff_consumed_state_correction';
    IF v_new_rows <> 1 OR v_new_matches <> 1 THEN
      RAISE EXCEPTION 'original-cutoff correction migration row diverged';
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

  -- The skipped predecessor remains byte-for-byte at 78/68 in every phase.
  v_jul23_rss_count := 78;
  v_jul24_rss_count := 68;
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

  IF v_phase = 'social-monitor/original-cutoff-post' THEN
    v_jul23_rss_count := 75;
    v_jul24_rss_count := 67;
    IF to_regclass(
      'public.reader_summary_production_recovery_authority_corrections'
    ) IS NULL THEN
      RAISE EXCEPTION 'original-cutoff correction table is absent';
    END IF;
    SELECT count(*) INTO v_alias_rows
    FROM public.reader_summary_production_recovery_authority_corrections
      AS alias;
    IF EXISTS (
      SELECT 1
      FROM public.reader_summary_production_recovery_leases AS lease
      WHERE lease.id = '0b5e172f-743e-52b5-807c-f54631295def'::UUID
    ) THEN
      IF v_alias_rows <> 1 OR NOT EXISTS (
        SELECT 1
        FROM public.reader_summary_production_recovery_authority_corrections
          AS alias
        WHERE alias.recovery_id =
            '0b5e172f-743e-52b5-807c-f54631295def'::UUID
          AND alias.tenant_id =
            '00000000-0000-7000-8000-000000000901'::UUID
          AND alias.workspace_id =
            '00000000-0000-7000-8000-000000000902'::UUID
          AND btrim(alias.legacy_canonical_sha256) =
            '7fa94c8538f55592349e820685dc4d34d' ||
            '84c4f3a4afe9165e18df6271d7816f3'
          AND btrim(alias.corrected_canonical_sha256) =
            'c51223e11e4631f3c613aa7708fe92d9' ||
            'c308ce31fd8ee5e626e5cee2972ad3e5'
          AND octet_length(alias.corrected_canonical_bytes) = 3454
          AND encode(sha256(alias.corrected_canonical_bytes), 'hex') =
            btrim(alias.corrected_canonical_sha256)
          AND encode(sha256(alias.correction_manifest_bytes), 'hex') =
            btrim(alias.correction_manifest_sha256)
          AND (alias.correction_manifest->'days'->0->>
            'correctedRssCount')::INTEGER = v_jul23_rss_count
          AND (alias.correction_manifest->'days'->1->>
            'correctedRssCount')::INTEGER = v_jul24_rss_count
      ) THEN
        RAISE EXCEPTION 'original-cutoff correction alias diverged';
      END IF;
    ELSIF v_alias_rows <> 0 THEN
      RAISE EXCEPTION 'original-cutoff clean database has a correction alias';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_class AS relation
      JOIN pg_roles AS owner ON owner.oid = relation.relowner
      WHERE relation.oid =
          'public.reader_summary_production_recovery_authority_corrections'
            ::regclass
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
        AND owner.rolname =
          'social_monitor_reader_summary_publication_owner'
    ) OR has_table_privilege(
      'social_monitor_reader_summary_publication_runtime',
      'public.reader_summary_production_recovery_authority_corrections',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
    ) OR NOT has_any_column_privilege(
      'social_monitor_reader_summary_publication_runtime',
      'public.reader_summary_production_recovery_authority_corrections',
      'SELECT'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_trigger AS trigger
      WHERE trigger.tgrelid =
          'public.reader_summary_production_recovery_authority_corrections'
            ::regclass
        AND trigger.tgname =
          'reader_summary_production_recovery_authority_corrections_immutable'
        AND NOT trigger.tgisinternal
    ) THEN
      RAISE EXCEPTION 'original-cutoff correction boundary diverged';
    END IF;
  END IF;
END;
$original_cutoff_probe$;

ROLLBACK;

SELECT CASE current_setting('application_name')
  WHEN 'social-monitor/original-cutoff-resolved' THEN 'resolved'
  WHEN 'social-monitor/original-cutoff-post' THEN 'corrected'
  ELSE CASE
    WHEN EXISTS (
      SELECT 1 FROM public."_prisma_migrations"
      WHERE migration_name =
          '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
        AND finished_at IS NULL AND rolled_back_at IS NULL
    ) THEN 'rollback'
    WHEN EXISTS (
      SELECT 1 FROM public."_prisma_migrations"
      WHERE migration_name =
          '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ) THEN 'clean'
    ELSE 'apply'
  END
END;
