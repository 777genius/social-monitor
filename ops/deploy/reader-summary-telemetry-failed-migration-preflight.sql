-- Irreversible authorization for exactly one reviewed failed telemetry row.
-- Clean, missing, completed, and already-resolved histories are deliberately
-- rejected here and are classified by the separate read-only state probe.
DO $reader_summary_telemetry_recovery_authorization$
DECLARE
  v_name CONSTANT TEXT :=
    '20260824120000_reader_summary_daily_model_job_telemetry';
  v_old_checksum CONSTANT TEXT :=
    'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad';
  v_expected_logs CONSTANT TEXT :=
$reviewed_failure$A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve

Migration name: 20260824120000_reader_summary_daily_model_job_telemetry

Database error code: 42501

Database error:
ERROR: permission denied for schema public

DbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42501), message: "permission denied for schema public", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("aclchk.c"), line: Some(<server-line>), routine: Some("aclcheck_error") }
$reviewed_failure$;
  v_rows BIGINT;
  v_unfinished BIGINT;
  v_normalized_logs TEXT;
  v_telemetry_columns BIGINT;
  v_identity_constraints BIGINT;
  v_telemetry_constraints BIGINT;
  v_v2_functions BIGINT;
  v_legacy_function OID;
  v_legacy_acl_exact BOOLEAN;
  v_active_definition TEXT;
  v_bounded_definition TEXT;
  v_active_owner OID;
  v_bounded_owner OID;
  v_schema_owner OID;
  v_definer OID;
  v_guard_count BIGINT;
  v_membership_count BIGINT;
  v_acl_mismatches BIGINT;
BEGIN
  IF pg_catalog.to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE EXCEPTION 'telemetry recovery requires the Prisma migration catalog';
  END IF;

  SELECT count(*), count(*) FILTER (
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    ), min(pg_catalog.regexp_replace(pg_catalog.regexp_replace(
      pg_catalog.replace(logs, E'\r\n', E'\n'),
      'line: Some\([0-9]+\)', 'line: Some(<server-line>)', 'g'
    ), E'\n+\\Z', E'\n'))
  INTO STRICT v_rows, v_unfinished, v_normalized_logs
  FROM public."_prisma_migrations"
  WHERE migration_name = v_name AND checksum = v_old_checksum
    AND applied_steps_count = 0 AND logs IS NOT NULL;

  IF v_rows <> 1 OR v_unfinished <> 1
    OR v_normalized_logs IS DISTINCT FROM v_expected_logs
    OR (SELECT count(*) FROM public."_prisma_migrations"
        WHERE migration_name = v_name) <> 1
    OR (SELECT count(*) FROM public."_prisma_migrations"
        WHERE finished_at IS NULL AND rolled_back_at IS NULL) <> 1 THEN
    RAISE EXCEPTION
      'telemetry recovery is not authorized for the exact reviewed failure';
  END IF;

  -- The guard is a database-scoped, session advisory lock held by the shell
  -- orchestrator continuously across this probe, Prisma resolve, and postflight.
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
    RAISE EXCEPTION 'telemetry recovery database guard is not held exactly once';
  END IF;

  SELECT count(*) INTO STRICT v_telemetry_columns
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid =
      'public.reader_summary_daily_model_jobs'::pg_catalog.regclass
    AND attribute.attname = ANY (ARRAY[
      'input_tokens', 'output_tokens', 'total_tokens',
      'usage_source', 'duration_ms'
    ]) AND attribute.attnum > 0 AND NOT attribute.attisdropped;
  SELECT count(*) FILTER (
      WHERE constraint.conname = 'reader_summary_daily_model_jobs_identity_check'
        AND constraint.convalidated
        AND pg_catalog.pg_get_constraintdef(constraint.oid) LIKE
          '%provider = ''codex''%'
        AND pg_catalog.pg_get_constraintdef(constraint.oid) LIKE
          '%model = ''gpt-5.6-sol''%'
        AND pg_catalog.pg_get_constraintdef(constraint.oid) LIKE
          '%reasoning_effort = ''xhigh''%'
        AND pg_catalog.pg_get_constraintdef(constraint.oid) LIKE
          '%runtime_engine = ''subscription-runtime-cli''%'
    ), count(*) FILTER (
      WHERE constraint.conname =
        'reader_summary_daily_model_jobs_telemetry_check'
    )
  INTO STRICT v_identity_constraints, v_telemetry_constraints
  FROM pg_catalog.pg_constraint AS constraint
  WHERE constraint.conrelid =
    'public.reader_summary_daily_model_jobs'::pg_catalog.regclass;
  SELECT count(*) INTO STRICT v_v2_functions
  FROM pg_catalog.pg_proc
  WHERE oid = pg_catalog.to_regprocedure(
    'public.complete_reader_summary_daily_model_job_v2(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character,bigint,bigint,bigint,text,bigint)'
  );
  v_legacy_function := pg_catalog.to_regprocedure(
    'public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character)'
  );
  IF v_telemetry_columns <> 0 OR v_identity_constraints <> 1
    OR v_telemetry_constraints <> 0 OR v_v2_functions <> 0
    OR v_legacy_function IS NULL THEN
    RAISE EXCEPTION 'telemetry recovery object rollback invariants drifted';
  END IF;

  SELECT count(*) FILTER (WHERE acl.grantee =
      'social_monitor_reader_summary_daily_terminal'::pg_catalog.regrole::OID
    ) = 1 AND bool_and(
      acl.grantee IN (procedure.proowner,
        'social_monitor_reader_summary_daily_terminal'::pg_catalog.regrole::OID)
      AND acl.grantor = procedure.proowner
      AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
    ) INTO STRICT v_legacy_acl_exact
  FROM pg_catalog.pg_proc AS procedure
  CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) AS acl
  WHERE procedure.oid = v_legacy_function;
  IF v_legacy_acl_exact IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'telemetry recovery legacy terminal EXECUTE ACL drifted';
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
    RAISE EXCEPTION 'telemetry recovery owner, CREATE, or v1 claim state drifted';
  END IF;

  SELECT count(*) INTO STRICT v_membership_count
  FROM pg_catalog.pg_auth_members
  WHERE roleid = v_definer AND member = v_schema_owner;
  IF v_membership_count <> 0 THEN
    RAISE EXCEPTION 'telemetry recovery temporary definer membership survived';
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
      WHERE acl.grantee = v_active_owner), ARRAY[]::TEXT[]) <> expected.privileges
    OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(relation.relacl) AS acl
      WHERE acl.grantee = v_active_owner
        AND (acl.grantor <> relation.relowner OR acl.is_grantable));
  IF v_acl_mismatches <> 0 THEN
    RAISE EXCEPTION 'telemetry recovery production owner ACL invariants drifted';
  END IF;
END
$reader_summary_telemetry_recovery_authorization$;

SELECT 'authorized' AS case;
