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
  v_activation_applied INTEGER;
  v_activation_matches INTEGER;
  v_activation_rolled_back INTEGER;
  v_activation_rows INTEGER;
  v_activation_unfinished INTEGER;
  v_alias_rows INTEGER;
  v_correction_applied INTEGER;
  v_correction_matches INTEGER;
  v_correction_rolled_back INTEGER;
  v_correction_rows INTEGER;
  v_correction_unfinished INTEGER;
  v_current_applied INTEGER;
  v_current_matches INTEGER;
  v_current_rolled_back INTEGER;
  v_current_rows INTEGER;
  v_current_unfinished INTEGER;
  v_daily_v4_applied INTEGER;
  v_daily_v4_matches INTEGER;
  v_daily_v4_rolled_back INTEGER;
  v_daily_v4_rows INTEGER;
  v_daily_v4_unfinished INTEGER;
  v_daily_rls_applied INTEGER;
  v_daily_rls_matches INTEGER;
  v_daily_rls_rolled_back INTEGER;
  v_daily_rls_rows INTEGER;
  v_daily_rls_unfinished INTEGER;
  v_expected JSONB;
  v_guard OID;
  v_guard_name TEXT;
  v_history_action TEXT;
  v_phase TEXT := current_setting('application_name');
  v_recovery RECORD;
  v_jul23_rss_count INTEGER;
  v_jul24_rss_count INTEGER;
  v_legacy_matches INTEGER;
  v_legacy_rows INTEGER;
  v_target_rows INTEGER;
  v_unfinished INTEGER;
  v_weekly_applied INTEGER;
  v_weekly_matches INTEGER;
  v_weekly_rolled_back INTEGER;
  v_weekly_rows INTEGER;
  v_weekly_unfinished INTEGER;
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

  SELECT count(*) INTO v_target_rows
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260731153000_reader_summary_production_recovery_original_cutoff_authority';
  SELECT
    count(*),
    count(*) FILTER (
      WHERE started_at = TIMESTAMPTZ '2026-07-31 21:16:04.938573+00'
        AND finished_at IS NULL
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at
        AND applied_steps_count = 0
        AND id <> ''
        AND logs IS NULL
    )
  INTO v_legacy_rows, v_legacy_matches
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
    AND checksum =
      '8748c4e266d8c1838f29b1a6f59f4be056514de64fe95fe44f5c7bb3680b477d';
  SELECT
    count(*),
    count(*) FILTER (
      WHERE started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND finished_at >= started_at
        AND rolled_back_at IS NULL
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) = '')
    )
  INTO v_current_rows, v_current_unfinished, v_current_rolled_back,
    v_current_applied
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
    AND checksum =
      '4100dd4ae236a300e002d2599a880b27df50972aed2f4a9f33578a3da2fe5c35';

  v_current_matches := v_current_unfinished + v_current_rolled_back
    + v_current_applied;
  IF v_legacy_rows <> v_legacy_matches
    OR v_legacy_rows > 1
    OR v_current_rows <> v_current_matches
    OR v_current_unfinished > 1
    OR v_current_rolled_back > 1
    OR v_current_applied > 1
    OR v_target_rows <> v_legacy_rows + v_current_rows
    OR EXISTS (
      SELECT 1
      FROM public."_prisma_migrations" AS current_row
      CROSS JOIN public."_prisma_migrations" AS legacy_row
      WHERE current_row.migration_name =
          '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
        AND current_row.checksum =
          '4100dd4ae236a300e002d2599a880b27d' ||
          'f50972aed2f4a9f33578a3da2fe5c35'
        AND legacy_row.migration_name = current_row.migration_name
        AND legacy_row.checksum =
          '8748c4e266d8c1838f29b1a6f59f4be' ||
          '056514de64fe95fe44f5c7bb3680b477d'
        AND current_row.started_at < legacy_row.rolled_back_at
    ) OR (v_current_rolled_back = 1 AND v_current_applied = 1
      AND (
        SELECT applied.started_at < failed.rolled_back_at
        FROM public."_prisma_migrations" AS applied
        CROSS JOIN public."_prisma_migrations" AS failed
        WHERE applied.migration_name =
            '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
          AND applied.checksum =
            '4100dd4ae236a300e002d2599a880b27d' ||
            'f50972aed2f4a9f33578a3da2fe5c35'
          AND applied.finished_at IS NOT NULL
          AND applied.rolled_back_at IS NULL
          AND failed.migration_name = applied.migration_name
          AND failed.checksum = applied.checksum
          AND failed.finished_at IS NULL
          AND failed.rolled_back_at IS NOT NULL
      )) THEN
    RAISE EXCEPTION 'original-cutoff migration history is not reviewed';
  END IF;

  IF v_legacy_rows = 0 AND v_current_rows = 0 THEN
    v_history_action := 'clean';
  ELSIF v_legacy_rows = 0 AND v_current_rows = 1
    AND v_current_applied = 1 THEN
    v_history_action := 'clean';
  ELSIF v_legacy_rows = 1 AND v_current_rows = 1
    AND v_current_unfinished = 1 THEN
    v_history_action := 'rollback';
  ELSIF v_legacy_rows = 1 AND v_current_rows = 1
    AND v_current_rolled_back = 1 THEN
    v_history_action := 'apply';
  ELSIF v_legacy_rows = 1 AND v_current_rows = 1
    AND v_current_applied = 1 THEN
    v_history_action := 'clean';
  ELSIF v_legacy_rows = 1 AND v_current_rows = 2
    AND v_current_rolled_back = 1 AND v_current_applied = 1 THEN
    v_history_action := 'clean';
  ELSE
    RAISE EXCEPTION 'original-cutoff migration history is not reviewed';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE checksum IN (
          'a378d07c649aa6de2e741be727d835ff' ||
            '591f3a08b308ab452eea48430f669ff1',
          'd26709b51ab37d368add42732b4c9fc8' ||
            'c70a56894ec9afdaec417408d4822dbc'
        )
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum IN (
          'a378d07c649aa6de2e741be727d835ff' ||
            '591f3a08b308ab452eea48430f669ff1',
          'd26709b51ab37d368add42732b4c9fc8' ||
            'c70a56894ec9afdaec417408d4822dbc'
        )
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum =
          'd26709b51ab37d368add42732b4c9fc8' ||
          'c70a56894ec9afdaec417408d4822dbc'
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND finished_at >= started_at
        AND rolled_back_at IS NULL
        AND applied_steps_count = 1
        AND id <> ''
        AND logs IS NULL
    )
  INTO v_correction_rows, v_correction_unfinished,
    v_correction_rolled_back, v_correction_applied
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260801130000_reader_summary_original_cutoff_consumed_state_correction';

  v_correction_matches := v_correction_unfinished
    + v_correction_rolled_back + v_correction_applied;
  IF v_correction_rows <> v_correction_matches
    OR v_correction_unfinished > 1
    OR v_correction_rolled_back > 3
    OR v_correction_applied > 1
    OR (v_correction_rows > 0 AND v_history_action <> 'clean')
    OR v_correction_rows > 4
    OR v_correction_unfinished + v_correction_applied > 1
    OR (v_correction_rolled_back > 0 AND v_correction_applied = 1
      AND EXISTS (
        SELECT 1
        FROM public."_prisma_migrations" AS applied
        CROSS JOIN public."_prisma_migrations" AS failed
        WHERE applied.migration_name =
            '20260801130000_reader_summary_original_cutoff_consumed_state_correction'
          AND applied.checksum =
            'd26709b51ab37d368add42732b4c9fc8' ||
            'c70a56894ec9afdaec417408d4822dbc'
          AND applied.finished_at IS NOT NULL
          AND applied.rolled_back_at IS NULL
          AND failed.migration_name = applied.migration_name
          AND failed.checksum = applied.checksum
          AND failed.finished_at IS NULL
          AND failed.rolled_back_at IS NOT NULL
          AND applied.started_at < failed.rolled_back_at
      )) THEN
    RAISE EXCEPTION 'original-cutoff correction migration row diverged';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE checksum =
          '2e83d1d4c599336b9196015c76f337b2' ||
          '2d0162b5fb8cf0c08d62993f30962452'
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum =
          '2e83d1d4c599336b9196015c76f337b2' ||
          '2d0162b5fb8cf0c08d62993f30962452'
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum =
          '2e83d1d4c599336b9196015c76f337b2' ||
          '2d0162b5fb8cf0c08d62993f30962452'
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND finished_at >= started_at
        AND rolled_back_at IS NULL
        AND applied_steps_count = 1
        AND id <> ''
        AND logs IS NULL
    )
  INTO v_activation_rows, v_activation_unfinished,
    v_activation_rolled_back, v_activation_applied
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260802143100_reader_summary_daily_execution_publication_activation_acl';

  v_activation_matches := v_activation_unfinished
    + v_activation_rolled_back + v_activation_applied;
  IF v_activation_rows <> v_activation_matches
    OR v_activation_unfinished > 1
    OR v_activation_rolled_back > 1
    OR v_activation_applied > 1
    OR v_activation_rows > 2
    OR v_activation_unfinished + v_activation_applied > 1
    OR (v_activation_rows > 0 AND (
      v_history_action <> 'clean' OR v_correction_applied <> 1
    ))
    OR (v_activation_rolled_back = 1 AND v_activation_applied = 1
      AND EXISTS (
        SELECT 1
        FROM public."_prisma_migrations" AS applied
        CROSS JOIN public."_prisma_migrations" AS failed
        WHERE applied.migration_name =
            '20260802143100_reader_summary_daily_execution_publication_activation_acl'
          AND applied.checksum =
            '2e83d1d4c599336b9196015c76f337b2' ||
            '2d0162b5fb8cf0c08d62993f30962452'
          AND applied.finished_at IS NOT NULL
          AND applied.rolled_back_at IS NULL
          AND failed.migration_name = applied.migration_name
          AND failed.checksum = applied.checksum
          AND failed.finished_at IS NULL
          AND failed.rolled_back_at IS NOT NULL
          AND applied.started_at < failed.rolled_back_at
      )) THEN
    RAISE EXCEPTION 'daily activation ACL migration row diverged';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE checksum IN (
          '14d2453ee27ce39fcdca890394fe919a4' ||
            '107832700d3084af1964f3380caffe4',
          '930c7de104be51d2ced8b45d1c33a5d1' ||
            'ccfe9c6e279af8b58aa8e2d4726eef8f'
        )
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum IN (
          '14d2453ee27ce39fcdca890394fe919a4' ||
            '107832700d3084af1964f3380caffe4',
          '930c7de104be51d2ced8b45d1c33a5d1' ||
            'ccfe9c6e279af8b58aa8e2d4726eef8f'
        )
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum =
          '930c7de104be51d2ced8b45d1c33a5d1' ||
          'ccfe9c6e279af8b58aa8e2d4726eef8f'
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND finished_at >= started_at
        AND rolled_back_at IS NULL
        AND applied_steps_count = 1
        AND id <> ''
        AND logs IS NULL
    )
  INTO v_weekly_rows, v_weekly_unfinished,
    v_weekly_rolled_back, v_weekly_applied
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260802170000_reader_summary_weekly_review_manifest';

  v_weekly_matches := v_weekly_unfinished
    + v_weekly_rolled_back + v_weekly_applied;
  IF v_weekly_rows <> v_weekly_matches
    OR v_weekly_unfinished > 1
    OR v_weekly_rolled_back > 2
    OR v_weekly_applied > 1
    OR v_weekly_rows > 3
    OR v_weekly_unfinished + v_weekly_applied > 1
    OR (v_weekly_rows > 0 AND (
      v_history_action <> 'clean' OR v_correction_applied <> 1
      OR v_activation_applied <> 1
    ))
    OR (v_weekly_rolled_back > 0 AND v_weekly_applied = 1
      AND EXISTS (
        SELECT 1
        FROM public."_prisma_migrations" AS applied
        CROSS JOIN public."_prisma_migrations" AS failed
        WHERE applied.migration_name =
            '20260802170000_reader_summary_weekly_review_manifest'
          AND applied.checksum =
            '930c7de104be51d2ced8b45d1c33a5d1' ||
            'ccfe9c6e279af8b58aa8e2d4726eef8f'
          AND applied.finished_at IS NOT NULL
          AND applied.rolled_back_at IS NULL
          AND failed.migration_name = applied.migration_name
          AND failed.checksum IN (
            '14d2453ee27ce39fcdca890394fe919a4' ||
              '107832700d3084af1964f3380caffe4',
            applied.checksum
          )
          AND failed.finished_at IS NULL
          AND failed.rolled_back_at IS NOT NULL
          AND applied.started_at < failed.rolled_back_at
      )) THEN
    RAISE EXCEPTION 'weekly review manifest migration row diverged';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE checksum IN (
          'f0798192abd0a9e9615465bfa84810b4' ||
            '8090fc41cf8922247710bcb34bf40907',
          '135e3b402722145c1b8cc0a584924dbb' ||
            '11c8b14c5352a19d618ea158a5b24bad'
        )
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum IN (
          'f0798192abd0a9e9615465bfa84810b4' ||
            '8090fc41cf8922247710bcb34bf40907',
          '135e3b402722145c1b8cc0a584924dbb' ||
            '11c8b14c5352a19d618ea158a5b24bad'
        )
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum =
          '135e3b402722145c1b8cc0a584924dbb' ||
          '11c8b14c5352a19d618ea158a5b24bad'
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND finished_at >= started_at
        AND rolled_back_at IS NULL
        AND applied_steps_count = 1
        AND id <> ''
        AND logs IS NULL
    )
  INTO v_daily_v4_rows, v_daily_v4_unfinished,
    v_daily_v4_rolled_back, v_daily_v4_applied
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260802233000_reader_summary_daily_canonical_recovery_v4';

  v_daily_v4_matches := v_daily_v4_unfinished
    + v_daily_v4_rolled_back + v_daily_v4_applied;
  IF v_daily_v4_rows <> v_daily_v4_matches
    OR v_daily_v4_unfinished > 1
    OR v_daily_v4_rolled_back > 1
    OR v_daily_v4_applied > 1
    OR v_daily_v4_rows > 2
    OR v_daily_v4_unfinished + v_daily_v4_applied > 1
    OR (v_daily_v4_rows > 0 AND (
      v_history_action <> 'clean' OR v_correction_applied <> 1
      OR v_activation_applied <> 1 OR v_weekly_applied <> 1
    ))
    OR (v_daily_v4_rolled_back = 1 AND v_daily_v4_applied = 1
      AND EXISTS (
        SELECT 1
        FROM public."_prisma_migrations" AS applied
        CROSS JOIN public."_prisma_migrations" AS failed
        WHERE applied.migration_name =
            '20260802233000_reader_summary_daily_canonical_recovery_v4'
          AND applied.checksum =
            '135e3b402722145c1b8cc0a584924dbb' ||
            '11c8b14c5352a19d618ea158a5b24bad'
          AND applied.finished_at IS NOT NULL
          AND applied.rolled_back_at IS NULL
          AND failed.migration_name = applied.migration_name
          AND failed.checksum IN (
            'f0798192abd0a9e9615465bfa84810b4' ||
              '8090fc41cf8922247710bcb34bf40907',
            applied.checksum
          )
          AND failed.finished_at IS NULL
          AND failed.rolled_back_at IS NOT NULL
          AND applied.started_at < failed.rolled_back_at
      )) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 migration row diverged';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (
      WHERE checksum IN (
          'fc353830f5600e03a12f3f04ca145d00' ||
            '412b7df7367738fc95bca8c07da3910f',
          '6d08c73e03b7af2cc3825893c1605708' ||
            '2cc38a23eb4d7845afbc8de1393e5231'
        )
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum IN (
          'fc353830f5600e03a12f3f04ca145d00' ||
            '412b7df7367738fc95bca8c07da3910f',
          '6d08c73e03b7af2cc3825893c1605708' ||
            '2cc38a23eb4d7845afbc8de1393e5231'
        )
        AND started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NOT NULL
        AND rolled_back_at >= started_at
        AND applied_steps_count = 0
        AND id <> ''
        AND (logs IS NULL OR btrim(logs) <> '')
    ),
    count(*) FILTER (
      WHERE checksum =
          '6d08c73e03b7af2cc3825893c1605708' ||
          '2cc38a23eb4d7845afbc8de1393e5231'
        AND started_at IS NOT NULL
        AND finished_at IS NOT NULL
        AND finished_at >= started_at
        AND rolled_back_at IS NULL
        AND applied_steps_count = 1
        AND id <> ''
        AND logs IS NULL
    )
  INTO v_daily_rls_rows, v_daily_rls_unfinished,
    v_daily_rls_rolled_back, v_daily_rls_applied
  FROM public."_prisma_migrations"
  WHERE migration_name =
      '20260803174000_reader_summary_daily_execution_tenant_rls';

  v_daily_rls_matches := v_daily_rls_unfinished
    + v_daily_rls_rolled_back + v_daily_rls_applied;
  IF v_daily_rls_rows <> v_daily_rls_matches
    OR v_daily_rls_unfinished > 1
    OR v_daily_rls_rolled_back > 1
    OR v_daily_rls_applied > 1
    OR v_daily_rls_rows > 2
    OR v_daily_rls_unfinished + v_daily_rls_applied > 1
    OR v_unfinished <> v_current_unfinished + v_correction_unfinished
      + v_activation_unfinished + v_weekly_unfinished
      + v_daily_v4_unfinished + v_daily_rls_unfinished
    OR (v_daily_rls_rows > 0 AND (
      v_history_action <> 'clean' OR v_correction_applied <> 1
      OR v_activation_applied <> 1 OR v_weekly_applied <> 1
      OR v_daily_v4_applied <> 1
    ))
    OR (v_daily_rls_rolled_back = 1 AND v_daily_rls_applied = 1
      AND EXISTS (
        SELECT 1
        FROM public."_prisma_migrations" AS applied
        CROSS JOIN public."_prisma_migrations" AS failed
        WHERE applied.migration_name =
            '20260803174000_reader_summary_daily_execution_tenant_rls'
          AND applied.checksum =
            '6d08c73e03b7af2cc3825893c1605708' ||
            '2cc38a23eb4d7845afbc8de1393e5231'
          AND applied.finished_at IS NOT NULL
          AND applied.rolled_back_at IS NULL
          AND failed.migration_name = applied.migration_name
          AND failed.checksum IN (
            'fc353830f5600e03a12f3f04ca145d00' ||
              '412b7df7367738fc95bca8c07da3910f',
            applied.checksum
          )
          AND failed.finished_at IS NULL
          AND failed.rolled_back_at IS NOT NULL
          AND applied.started_at < failed.rolled_back_at
      )) THEN
    RAISE EXCEPTION 'daily execution tenant RLS migration row diverged';
  END IF;
  IF v_phase = 'social-monitor/original-cutoff-resolved'
    AND (v_history_action <> 'clean' OR v_current_applied <> 1
      OR v_correction_rows <> 0) THEN
    RAISE EXCEPTION 'original-cutoff resolved history diverged';
  ELSIF v_phase = 'social-monitor/original-cutoff-post'
    AND (v_history_action <> 'clean' OR v_current_applied <> 1
      OR v_correction_applied <> 1
      OR v_correction_unfinished <> 0
      OR v_activation_applied <> 1
      OR v_activation_unfinished <> 0
      OR v_weekly_applied <> 1
      OR v_weekly_unfinished <> 0
      OR v_daily_v4_applied <> 1
      OR v_daily_v4_unfinished <> 0
      OR v_daily_rls_applied <> 1
      OR v_daily_rls_unfinished <> 0) THEN
    RAISE EXCEPTION 'original-cutoff correction migration row diverged';
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

  -- A normal clean deploy executes the predecessor at 75/67. The reviewed
  -- production path skips it and must retain its predecessor state at 78/68.
  IF v_legacy_rows = 0 AND v_current_applied = 1 THEN
    v_jul23_rss_count := 75;
    v_jul24_rss_count := 67;
  ELSE
    v_jul23_rss_count := 78;
    v_jul24_rss_count := 68;
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
          '20260803174000_reader_summary_daily_execution_tenant_rls'
        AND checksum IN (
          'fc353830f5600e03a12f3f04ca145d00' ||
            '412b7df7367738fc95bca8c07da3910f',
          '6d08c73e03b7af2cc3825893c1605708' ||
            '2cc38a23eb4d7845afbc8de1393e5231'
        )
        AND finished_at IS NULL AND rolled_back_at IS NULL
    ) THEN 'daily-execution-rls-rollback'
    WHEN EXISTS (
      SELECT 1 FROM public."_prisma_migrations"
      WHERE migration_name =
          '20260802233000_reader_summary_daily_canonical_recovery_v4'
        AND checksum IN (
          'f0798192abd0a9e9615465bfa84810b4' ||
            '8090fc41cf8922247710bcb34bf40907',
          '135e3b402722145c1b8cc0a584924dbb' ||
            '11c8b14c5352a19d618ea158a5b24bad'
        )
        AND finished_at IS NULL AND rolled_back_at IS NULL
    ) THEN 'daily-canonical-v4-rollback'
    WHEN EXISTS (
      SELECT 1 FROM public."_prisma_migrations"
      WHERE migration_name =
          '20260802170000_reader_summary_weekly_review_manifest'
        AND checksum IN (
          '14d2453ee27ce39fcdca890394fe919a4' ||
            '107832700d3084af1964f3380caffe4',
          '930c7de104be51d2ced8b45d1c33a5d1' ||
            'ccfe9c6e279af8b58aa8e2d4726eef8f'
        )
        AND finished_at IS NULL AND rolled_back_at IS NULL
    ) THEN 'weekly-manifest-rollback'
    WHEN EXISTS (
      SELECT 1 FROM public."_prisma_migrations"
      WHERE migration_name =
          '20260802143100_reader_summary_daily_execution_publication_activation_acl'
        AND checksum =
          '2e83d1d4c599336b9196015c76f337b2' ||
          '2d0162b5fb8cf0c08d62993f30962452'
        AND finished_at IS NULL AND rolled_back_at IS NULL
    ) THEN 'activation-acl-rollback'
    WHEN EXISTS (
      SELECT 1 FROM public."_prisma_migrations"
      WHERE migration_name =
          '20260801130000_reader_summary_original_cutoff_consumed_state_correction'
        AND checksum IN (
          'a378d07c649aa6de2e741be727d835ff' ||
            '591f3a08b308ab452eea48430f669ff1',
          'd26709b51ab37d368add42732b4c9fc8' ||
            'c70a56894ec9afdaec417408d4822dbc'
        )
        AND finished_at IS NULL AND rolled_back_at IS NULL
    ) THEN 'correction-rollback'
    WHEN EXISTS (
      SELECT 1 FROM public."_prisma_migrations"
      WHERE migration_name =
          '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
        AND checksum =
          '4100dd4ae236a300e002d2599a880b27d' ||
          'f50972aed2f4a9f33578a3da2fe5c35'
        AND finished_at IS NULL AND rolled_back_at IS NULL
    ) THEN 'rollback'
    WHEN EXISTS (
      SELECT 1 FROM public."_prisma_migrations"
      WHERE migration_name =
          '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
        AND checksum =
          '4100dd4ae236a300e002d2599a880b27d' ||
          'f50972aed2f4a9f33578a3da2fe5c35'
        AND finished_at IS NULL AND rolled_back_at IS NOT NULL
    ) AND NOT EXISTS (
      SELECT 1 FROM public."_prisma_migrations"
      WHERE migration_name =
          '20260731153000_reader_summary_production_recovery_original_cutoff_authority'
        AND checksum =
          '4100dd4ae236a300e002d2599a880b27d' ||
          'f50972aed2f4a9f33578a3da2fe5c35'
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ) THEN 'apply'
    ELSE 'clean'
  END
END;
