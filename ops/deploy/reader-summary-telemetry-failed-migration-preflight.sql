-- Fail-closed catalog probe for the one reviewed telemetry migration rewrite.
-- This file never mutates durable state. Prisma remains the only owner of its
-- migration catalog, and resolution is authorized only after every invariant
-- below proves that the old migration transaction rolled back completely.
DO $reader_summary_telemetry_recovery_probe$
DECLARE
  v_name CONSTANT TEXT :=
    '20260824120000_reader_summary_daily_model_job_telemetry';
  v_old_checksum CONSTANT TEXT :=
    'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad';
  v_new_checksum CONSTANT TEXT :=
    '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250';
  v_default_acl_name CONSTANT TEXT :=
    '20260824121000_reader_summary_daily_function_global_default_acl';
  v_rows BIGINT;
  v_old_unfinished BIGINT;
  v_old_rolled_back BIGINT;
  v_new_finished BIGINT;
  v_unfinished BIGINT;
  v_bad_rows BIGINT;
  v_telemetry_columns BIGINT;
  v_telemetry_constraints BIGINT;
  v_v2_functions BIGINT;
  v_legacy_functions BIGINT;
  v_active_definition TEXT;
  v_bounded_definition TEXT;
  v_active_owner OID;
  v_bounded_owner OID;
  v_schema_owner OID;
  v_definer OID;
  v_acl_mismatches BIGINT;
BEGIN
  IF pg_catalog.to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'telemetry recovery requires the Prisma migration catalog';
  END IF;

  SELECT
    count(*) FILTER (WHERE migration_name = v_name),
    count(*) FILTER (
      WHERE migration_name = v_name AND checksum = v_old_checksum
        AND finished_at IS NULL AND rolled_back_at IS NULL
        AND applied_steps_count = 0 AND logs IS NOT NULL
        AND logs ~* 'permission denied for schema public'
    ),
    count(*) FILTER (
      WHERE migration_name = v_name AND checksum = v_old_checksum
        AND finished_at IS NULL AND rolled_back_at IS NOT NULL
        AND applied_steps_count = 0 AND logs IS NOT NULL
        AND logs ~* 'permission denied for schema public'
    ),
    count(*) FILTER (
      WHERE migration_name = v_name AND checksum = v_new_checksum
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL
    ),
    count(*) FILTER (
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    ),
    count(*) FILTER (
      WHERE migration_name = v_name AND NOT (
        (checksum = v_old_checksum AND finished_at IS NULL
          AND applied_steps_count = 0 AND logs IS NOT NULL
          AND logs ~* 'permission denied for schema public')
        OR (checksum = v_new_checksum AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL)
      )
    )
  INTO STRICT v_rows, v_old_unfinished, v_old_rolled_back, v_new_finished,
    v_unfinished, v_bad_rows
  FROM public."_prisma_migrations";

  IF v_bad_rows <> 0 OR v_rows > 2
    OR (v_rows = 2 AND NOT (
      v_old_rolled_back = 1 AND v_new_finished = 1
    )) THEN
    RAISE EXCEPTION 'telemetry recovery catalog rows are ambiguous or unreviewed';
  END IF;
  IF v_unfinished <> v_old_unfinished OR v_old_unfinished > 1
    OR v_old_rolled_back > 1 OR v_new_finished > 1 THEN
    RAISE EXCEPTION 'telemetry recovery found unexpected unfinished migration state';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."_prisma_migrations"
    WHERE migration_name = v_default_acl_name
      AND v_new_finished = 0
  ) THEN
    RAISE EXCEPTION 'telemetry recovery found a default-ACL row before telemetry completion';
  END IF;

  IF v_old_unfinished = 1 OR v_old_rolled_back = 1 OR v_rows = 0 THEN
    SELECT count(*) INTO STRICT v_telemetry_columns
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid =
        'public.reader_summary_daily_model_jobs'::pg_catalog.regclass
      AND attribute.attname = ANY (ARRAY[
        'input_tokens', 'output_tokens', 'total_tokens',
        'usage_source', 'duration_ms'
      ]) AND attribute.attnum > 0 AND NOT attribute.attisdropped;
    SELECT count(*) INTO STRICT v_telemetry_constraints
    FROM pg_catalog.pg_constraint
    WHERE conrelid =
        'public.reader_summary_daily_model_jobs'::pg_catalog.regclass
      AND conname = 'reader_summary_daily_model_jobs_telemetry_check';
    SELECT count(*) INTO STRICT v_v2_functions
    FROM pg_catalog.pg_proc
    WHERE oid = pg_catalog.to_regprocedure(
      'public.complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,bigint,text,bigint)'
    );
    SELECT count(*) INTO STRICT v_legacy_functions
    FROM pg_catalog.pg_proc
    WHERE oid = pg_catalog.to_regprocedure(
      'public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character)'
    );
    IF v_telemetry_columns <> 0 OR v_telemetry_constraints <> 0
      OR v_v2_functions <> 0 OR v_legacy_functions <> 1 THEN
      RAISE EXCEPTION 'telemetry recovery transaction rollback invariants drifted';
    END IF;

    SELECT pg_catalog.pg_get_functiondef(active_claim.oid), active_claim.proowner,
      pg_catalog.pg_get_functiondef(bounded_claim.oid), bounded_claim.proowner,
      'social_monitor_public_schema_owner'::pg_catalog.regrole::OID,
      'social_monitor_reader_summary_daily_publication_definer'::pg_catalog.regrole::OID
    INTO STRICT v_active_definition, v_active_owner,
      v_bounded_definition, v_bounded_owner, v_schema_owner, v_definer
    FROM pg_catalog.pg_proc AS active_claim
    CROSS JOIN pg_catalog.pg_proc AS bounded_claim
    WHERE active_claim.oid =
        'public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure
      AND bounded_claim.oid =
        'public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure;
    IF v_active_owner <> session_user::pg_catalog.regrole::OID
      OR v_bounded_owner <> v_schema_owner
      OR pg_catalog.has_schema_privilege(v_active_owner, 'public', 'CREATE')
      OR NOT pg_catalog.has_schema_privilege(v_bounded_owner, 'public', 'CREATE')
      OR pg_catalog.has_schema_privilege(v_definer, 'public', 'CREATE')
      OR (pg_catalog.length(v_active_definition) - pg_catalog.length(
        pg_catalog.replace(v_active_definition, '''reader-summary-daily:v1''', '')
      )) / pg_catalog.length('''reader-summary-daily:v1''') <> 1
      OR (pg_catalog.length(v_bounded_definition) - pg_catalog.length(
        pg_catalog.replace(v_bounded_definition, '''reader-summary-daily:v1''', '')
      )) / pg_catalog.length('''reader-summary-daily:v1''') <> 1
      OR pg_catalog.strpos(v_active_definition, '''reader-summary-daily:v2''') <> 0
      OR pg_catalog.strpos(v_bounded_definition, '''reader-summary-daily:v2''') <> 0
      OR (pg_catalog.length(v_active_definition) - pg_catalog.length(
        pg_catalog.replace(v_active_definition, '''xhigh''', '')
      )) / pg_catalog.length('''xhigh''') <> 2
      OR (pg_catalog.length(v_bounded_definition) - pg_catalog.length(
        pg_catalog.replace(v_bounded_definition, '''xhigh''', '')
      )) / pg_catalog.length('''xhigh''') <> 2 THEN
      RAISE EXCEPTION 'telemetry recovery owner or v1 claim invariants drifted';
    END IF;

    SELECT count(*) INTO STRICT v_acl_mismatches
    FROM (VALUES
      ('reader_summary_daily_execution_cursors', ARRAY['INSERT','SELECT','UPDATE']::TEXT[]),
      ('reader_summary_daily_model_jobs', ARRAY['INSERT','SELECT','UPDATE']::TEXT[]),
      ('reader_summary_daily_source_authorities', ARRAY['INSERT','SELECT']::TEXT[]),
      ('feed_items', ARRAY['SELECT']::TEXT[]),
      ('source_items', ARRAY['SELECT']::TEXT[])
    ) AS expected(relation_name, privileges)
    JOIN pg_catalog.pg_class AS relation ON relation.relname = expected.relation_name
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
    WHERE relation.relowner <> v_schema_owner
      OR COALESCE((SELECT pg_catalog.array_agg(
            acl.privilege_type ORDER BY acl.privilege_type
          ) FROM pg_catalog.aclexplode(relation.relacl) AS acl
          WHERE acl.grantee = v_active_owner), ARRAY[]::TEXT[])
        <> expected.privileges
      OR EXISTS (
        SELECT 1 FROM pg_catalog.aclexplode(relation.relacl) AS acl
        WHERE acl.grantee = v_active_owner
          AND (acl.grantor <> relation.relowner OR acl.is_grantable)
      );
    IF v_acl_mismatches <> 0 THEN
      RAISE EXCEPTION 'telemetry recovery production owner ACL invariants drifted';
    END IF;
  END IF;
END
$reader_summary_telemetry_recovery_probe$;

SELECT CASE
  WHEN count(*) FILTER (
    WHERE checksum =
      'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
      AND finished_at IS NULL AND rolled_back_at IS NULL
  ) = 1 THEN 'resolve'
  WHEN count(*) FILTER (
    WHERE checksum =
      'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad'
      AND finished_at IS NULL AND rolled_back_at IS NOT NULL
  ) = 1 AND count(*) FILTER (
    WHERE checksum =
      '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  ) = 0 THEN 'resolved'
  WHEN count(*) FILTER (
    WHERE checksum =
      '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  ) = 1 THEN 'corrected'
  WHEN count(*) = 0 THEN 'clean'
  ELSE 'invalid'
END
FROM public."_prisma_migrations"
WHERE migration_name =
  '20260824120000_reader_summary_daily_model_job_telemetry';
