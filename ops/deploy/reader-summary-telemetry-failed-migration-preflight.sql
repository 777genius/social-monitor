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
  v_active_owner OID;
  v_schema_owner OID;
  v_definer OID;
  v_publication_owner OID;
  v_publication_runtime OID;
  v_tenant_runtime OID;
  v_terminal OID;
  v_guard_count BIGINT;
  v_guard_pid_text TEXT;
  v_guard_backend_start_text TEXT;
  v_guard_application TEXT;
  v_guard_nonce TEXT;
  v_function_catalog_exact BOOLEAN;
  v_membership_catalog_exact BOOLEAN;
  v_effective_acl_exact BOOLEAN;
  v_schema_catalog_exact BOOLEAN;
  v_sequence_catalog_exact BOOLEAN;
  v_acl_rows BIGINT;
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
    AND applied_steps_count = 0 AND logs IS NOT NULL
    AND started_at <= pg_catalog.statement_timestamp();

  IF v_rows <> 1 OR v_unfinished <> 1
    OR v_normalized_logs IS DISTINCT FROM v_expected_logs
    OR (SELECT count(*) FROM public."_prisma_migrations"
        WHERE migration_name = v_name) <> 1
    OR (SELECT count(*) FROM public."_prisma_migrations"
        WHERE finished_at IS NULL AND rolled_back_at IS NULL) <> 1 THEN
    RAISE EXCEPTION
      'telemetry recovery is not authorized for the exact reviewed failure';
  END IF;

  v_guard_pid_text := pg_catalog.current_setting(
    'social_monitor.telemetry_guard_pid', TRUE
  );
  v_guard_backend_start_text := pg_catalog.current_setting(
    'social_monitor.telemetry_guard_backend_start', TRUE
  );
  v_guard_application := pg_catalog.current_setting(
    'social_monitor.telemetry_guard_application', TRUE
  );
  v_guard_nonce := pg_catalog.current_setting(
    'social_monitor.telemetry_guard_nonce', TRUE
  );
  IF v_guard_pid_text !~ '^[1-9][0-9]*$'
    OR v_guard_backend_start_text IS NULL
    OR v_guard_nonce !~ '^[0-9a-f]{24}$'
    OR v_guard_application IS DISTINCT FROM
      'social-monitor/telemetry-guard/' || v_guard_nonce THEN
    RAISE EXCEPTION 'telemetry recovery guard binding is invalid';
  END IF;

  -- Bind authorization to one exact backend incarnation and nonce, not an
  -- application-name lookalike. The server-side watchdog keeps this same
  -- predicate live while Prisma resolve owns its database connection.
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
  IF v_telemetry_columns <> 0 OR v_identity_constraints <> 1
    OR v_telemetry_constraints <> 0 OR v_v2_functions <> 0
    OR pg_catalog.to_regprocedure(
      'public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character)'
    ) IS NULL THEN
    RAISE EXCEPTION 'telemetry recovery object rollback invariants drifted';
  END IF;

  v_active_owner := session_user::pg_catalog.regrole::OID;
  v_schema_owner :=
    'social_monitor_public_schema_owner'::pg_catalog.regrole::OID;
  v_definer :=
    'social_monitor_reader_summary_daily_publication_definer'::pg_catalog.regrole::OID;
  v_publication_owner :=
    'social_monitor_reader_summary_publication_owner'::pg_catalog.regrole::OID;
  v_publication_runtime :=
    'social_monitor_reader_summary_publication_runtime'::pg_catalog.regrole::OID;
  v_tenant_runtime :=
    'social_monitor_tenant_system_runtime'::pg_catalog.regrole::OID;
  v_terminal :=
    'social_monitor_reader_summary_daily_terminal'::pg_catalog.regrole::OID;
  SELECT count(*) = 3 AND pg_catalog.bool_and(
    procedure.prokind = 'f' AND language.lanname = 'plpgsql'
    AND procedure.provolatile = 'v' AND procedure.proisstrict
    AND procedure.prosecdef AND NOT procedure.proleakproof
    AND procedure.proparallel = 'u'
    AND procedure.proowner = expected.owner_oid
    AND procedure.proconfig = expected.config
    AND pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      pg_catalog.pg_get_functiondef(procedure.oid), 'UTF8'
    )), 'hex') = expected.definition_sha256
    AND (SELECT count(*) = 2 AND pg_catalog.bool_and(
      acl.grantee IN (procedure.proowner,
        'social_monitor_reader_summary_daily_terminal'::pg_catalog.regrole::OID)
      AND acl.grantor = procedure.proowner
      AND acl.privilege_type = 'EXECUTE' AND NOT acl.is_grantable
    ) AND count(*) FILTER (WHERE acl.grantee =
      'social_monitor_reader_summary_daily_terminal'::pg_catalog.regrole::OID
    ) = 1 FROM pg_catalog.aclexplode(procedure.proacl) AS acl)
  ) INTO STRICT v_function_catalog_exact
  FROM (VALUES
    ('public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure::OID,
      v_active_owner, ARRAY['search_path=pg_catalog, public']::TEXT[],
      '5a256df7c312b06182ad56d4100df8c80067a7fd149aa34b4e3862e237502255'),
    ('public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)'::pg_catalog.regprocedure::OID,
      v_schema_owner, ARRAY['search_path=pg_catalog']::TEXT[],
      'edc719fa83b67fa8b4b8b4250614efe055cdd12f210000c778b03214ac90cb4d'),
    ('public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character)'::pg_catalog.regprocedure::OID,
      v_definer, ARRAY['search_path=pg_catalog']::TEXT[],
      'ea468303e63270fba8598848dfa8f642df8aad2436c0c1b2a8f57284e817f2b3')
  ) AS expected(function_oid, owner_oid, config, definition_sha256)
  JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = expected.function_oid
  JOIN pg_catalog.pg_language AS language
    ON language.oid = procedure.prolang;
  IF v_function_catalog_exact IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'telemetry recovery function owner, ACL, metadata, or definition drifted';
  END IF;

  WITH RECURSIVE seed(role_oid) AS (
    SELECT DISTINCT role_oid FROM (VALUES
      (v_active_owner), (v_schema_owner), (v_publication_owner),
      (v_publication_runtime), (v_tenant_runtime), (v_terminal), (v_definer)
    ) AS seeded(role_oid)
  ), closure(role_oid) AS (
    SELECT role_oid FROM seed
    UNION
    SELECT CASE WHEN membership.roleid = closure.role_oid
      THEN membership.member ELSE membership.roleid END
    FROM closure
    JOIN pg_catalog.pg_auth_members AS membership
      ON membership.roleid = closure.role_oid
      OR membership.member = closure.role_oid
  ), edges AS (
    SELECT membership.*, member.rolname AS member_name,
      member.rolcanlogin AS member_login,
      granted.rolname AS granted_name,
      grantor.rolname AS grantor_name, grantor.rolsuper AS grantor_super
    FROM pg_catalog.pg_auth_members AS membership
    JOIN closure ON closure.role_oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
  ), dynamic_members AS (
    SELECT DISTINCT member FROM edges
    WHERE roleid IN (v_publication_runtime, v_tenant_runtime)
      AND member <> v_active_owner
  )
  SELECT count(*) = 12 AND count(*) FILTER (
      WHERE membership.roleid = v_schema_owner
        AND membership.member = v_active_owner
        AND grantor_super AND membership.admin_option
        AND NOT membership.inherit_option AND NOT membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid = v_schema_owner
        AND membership.member = v_active_owner
        AND membership.grantor = v_active_owner
        AND NOT membership.admin_option AND NOT membership.inherit_option
        AND membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid = v_definer
        AND membership.member = v_active_owner
        AND grantor_super AND membership.admin_option
        AND NOT membership.inherit_option AND NOT membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid = v_publication_owner
        AND membership.member = v_active_owner
        AND grantor_super AND membership.admin_option
        AND NOT membership.inherit_option AND NOT membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid = v_publication_owner
        AND membership.member = v_active_owner
        AND membership.grantor = v_active_owner
        AND NOT membership.admin_option AND NOT membership.inherit_option
        AND membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid = v_terminal
        AND membership.member = v_active_owner
        AND grantor_super AND membership.admin_option
        AND NOT membership.inherit_option AND NOT membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid = v_publication_runtime
        AND membership.member = v_active_owner
        AND grantor_super AND membership.admin_option
        AND NOT membership.inherit_option AND NOT membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid = v_publication_runtime
        AND membership.member <> v_active_owner AND member_login
        AND NOT membership.admin_option AND membership.inherit_option
        AND NOT membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid = v_tenant_runtime
        AND membership.member = v_active_owner
        AND grantor_super AND membership.admin_option
        AND NOT membership.inherit_option AND NOT membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid = v_tenant_runtime
        AND membership.member <> v_active_owner AND member_login
        AND NOT membership.admin_option AND membership.inherit_option
        AND NOT membership.set_option
    ) = 1 AND count(*) FILTER (
      WHERE membership.roleid IN (SELECT member FROM dynamic_members)
        AND membership.member = v_active_owner
        AND membership.admin_option AND NOT membership.inherit_option
        AND membership.set_option
    ) = 2 AND NOT pg_catalog.bool_or(NOT (
      (membership.roleid = v_schema_owner
        AND membership.member = v_active_owner)
      OR (membership.roleid = v_publication_owner
        AND membership.member = v_active_owner)
      OR (membership.roleid = v_definer
        AND membership.member = v_active_owner)
      OR (membership.roleid = v_terminal
        AND membership.member = v_active_owner)
      OR (membership.roleid IN (v_publication_runtime, v_tenant_runtime)
        AND (membership.member = v_active_owner OR member_login))
      OR (membership.roleid IN (SELECT member FROM dynamic_members)
        AND membership.member = v_active_owner)
    ))
  INTO STRICT v_membership_catalog_exact
  FROM edges AS membership;
  IF v_membership_catalog_exact IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'telemetry recovery complete role membership closure drifted';
  END IF;

  WITH RECURSIVE seed(role_oid) AS (VALUES
    (v_active_owner), (v_schema_owner), (v_publication_owner),
    (v_publication_runtime), (v_tenant_runtime), (v_terminal), (v_definer)
  ), roles(role_oid) AS (
    SELECT role_oid FROM seed
    UNION
    SELECT CASE WHEN membership.roleid = roles.role_oid
      THEN membership.member ELSE membership.roleid END
    FROM roles JOIN pg_catalog.pg_auth_members AS membership
      ON membership.roleid = roles.role_oid OR membership.member = roles.role_oid
  ), tables(object_name) AS (VALUES
    ('public.reader_summary_daily_execution_cursors'),
    ('public.reader_summary_daily_model_jobs'),
    ('public.reader_summary_daily_source_authorities'),
    ('public.feed_items'), ('public.source_items')
  ), table_privileges(privilege) AS (VALUES
    ('DELETE'), ('INSERT'), ('MAINTAIN'), ('REFERENCES'),
    ('SELECT'), ('TRIGGER'), ('TRUNCATE'), ('UPDATE')
  ), table_matrix AS (
    SELECT role_oid, object_name, privilege,
      role_oid = v_schema_owner
      OR (role_oid = v_active_owner AND (
        (object_name IN (
          'public.reader_summary_daily_execution_cursors',
          'public.reader_summary_daily_model_jobs'
        ) AND privilege IN ('INSERT', 'SELECT', 'UPDATE'))
        OR (object_name = 'public.reader_summary_daily_source_authorities'
          AND privilege IN ('INSERT', 'SELECT'))
        OR (object_name IN ('public.feed_items', 'public.source_items')
          AND privilege = 'SELECT')
      )) OR (role_oid = v_definer
        AND object_name = 'public.reader_summary_daily_model_jobs'
        AND privilege IN ('SELECT', 'UPDATE'))
      OR (role_oid = v_publication_owner
        AND object_name = 'public.reader_summary_daily_model_jobs'
        AND privilege = 'SELECT') AS expected,
      pg_catalog.has_table_privilege(
        role_oid, object_name, privilege
      ) AS observed
    FROM roles CROSS JOIN tables CROSS JOIN table_privileges
  ), schemas AS (
    SELECT role_oid, privilege,
      role_oid = v_schema_owner
        OR (privilege = 'USAGE' AND role_oid IN (
          v_active_owner, v_publication_owner, v_terminal, v_definer
        )) AS expected,
      pg_catalog.has_schema_privilege(role_oid, 'public', privilege)
        AS observed
    FROM roles CROSS JOIN (VALUES ('CREATE'), ('USAGE')) AS p(privilege)
  ), functions(object_name, owner_oid) AS (VALUES
    ('public.claim_reader_summary_daily_execution(uuid,uuid,text,date,timestamp with time zone)', v_active_owner),
    ('public.claim_reader_summary_daily_execution_bounded_maintenance(uuid,uuid,text,date,timestamp with time zone)', v_schema_owner),
    ('public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character)', v_definer)
  ), function_matrix AS (
    SELECT role_oid, object_name,
      role_oid IN (owner_oid, v_terminal) AS expected,
      pg_catalog.has_function_privilege(role_oid, object_name, 'EXECUTE')
        AS observed
    FROM roles CROSS JOIN functions
  ), columns AS (
    SELECT roles.role_oid,
      pg_catalog.format('public.%I', relation.relname) AS object_name,
      attribute.attname, privilege.privilege,
      pg_catalog.has_column_privilege(
        roles.role_oid, relation.oid, attribute.attnum, privilege.privilege
      ) AS observed,
      (roles.role_oid = v_schema_owner)
      OR (roles.role_oid = v_active_owner AND (
        privilege.privilege = 'SELECT'
        OR (relation.relname IN (
          'reader_summary_daily_execution_cursors',
          'reader_summary_daily_model_jobs'
        ) AND privilege.privilege = 'UPDATE')
      ))
      OR (roles.role_oid = v_definer
        AND relation.relname = 'reader_summary_daily_model_jobs'
        AND privilege.privilege IN ('SELECT', 'UPDATE'))
      OR (relation.relname = 'reader_summary_daily_model_jobs'
        AND roles.role_oid = v_publication_owner
        AND privilege.privilege = 'SELECT')
      OR (relation.relname IN ('feed_items', 'source_items')
        AND (roles.role_oid = v_publication_owner OR pg_catalog.pg_has_role(
          roles.role_oid, v_publication_runtime, 'USAGE'
        ))
        AND ((privilege.privilege = 'SELECT' AND attribute.attname = ANY(
          CASE relation.relname
            WHEN 'feed_items' THEN ARRAY[
              'id','tenant_id','workspace_id','interest_id','source_item_id',
              'source_binding_id','provider_key','canonical_url','title',
              'body_preview','author_handle','status','published_at','observed_at'
            ]::NAME[]
            ELSE ARRAY[
              'id','tenant_id','workspace_id','source_binding_id','provider_key',
              'provider_item_id','canonical_url','body','content_hash',
              'provider_content_hash','observed_at','metadata'
            ]::NAME[]
          END
        )) OR (privilege.privilege = 'UPDATE' AND attribute.attname = 'id')))
        AS expected
    FROM roles
    CROSS JOIN (VALUES ('SELECT'), ('UPDATE')) AS privilege(privilege)
    JOIN pg_catalog.pg_class AS relation ON relation.relname IN (
      'reader_summary_daily_execution_cursors',
      'reader_summary_daily_model_jobs',
      'reader_summary_daily_source_authorities', 'feed_items', 'source_items'
    )
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
    JOIN pg_catalog.pg_attribute AS attribute ON attribute.attrelid = relation.oid
      AND attribute.attnum > 0 AND NOT attribute.attisdropped
  ), all_checks AS (
    SELECT expected, observed FROM table_matrix
    UNION ALL SELECT expected, observed FROM schemas
    UNION ALL SELECT expected, observed FROM function_matrix
    UNION ALL SELECT expected, observed FROM columns
  )
  SELECT pg_catalog.bool_and(observed IS NOT DISTINCT FROM expected)
  INTO STRICT v_effective_acl_exact FROM all_checks;
  IF v_effective_acl_exact IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'telemetry recovery effective role/object privileges drifted';
  END IF;

  SELECT namespace.nspowner = v_schema_owner AND namespace.nspacl IS NOT NULL
    AND count(*) = 6
    AND count(*) FILTER (WHERE acl.grantee = 0) = 0
    AND count(*) FILTER (WHERE acl.grantee = v_schema_owner
      AND acl.privilege_type IN ('CREATE', 'USAGE')
      AND acl.is_grantable) = 2
    AND count(*) FILTER (WHERE acl.grantee = v_active_owner
      AND acl.privilege_type = 'USAGE' AND NOT acl.is_grantable) = 1
    AND count(*) FILTER (WHERE acl.grantee =
      'social_monitor_reader_summary_publication_owner'::pg_catalog.regrole::OID
      AND acl.privilege_type = 'USAGE' AND NOT acl.is_grantable) = 1
    AND count(*) FILTER (WHERE acl.grantee =
      'social_monitor_reader_summary_daily_terminal'::pg_catalog.regrole::OID
      AND acl.privilege_type = 'USAGE' AND NOT acl.is_grantable) = 1
    AND count(*) FILTER (WHERE acl.grantee = v_definer
      AND acl.privilege_type = 'USAGE' AND NOT acl.is_grantable) = 1
    AND pg_catalog.bool_and(acl.grantor = v_schema_owner)
    AND pg_catalog.bool_and(
      (acl.grantee = v_schema_owner
        AND acl.privilege_type IN ('CREATE', 'USAGE')
        AND acl.is_grantable)
      OR (acl.grantee = v_active_owner AND acl.privilege_type = 'USAGE'
        AND NOT acl.is_grantable)
      OR (grantee.rolname IN (
          'social_monitor_reader_summary_publication_owner',
          'social_monitor_reader_summary_daily_terminal',
          'social_monitor_reader_summary_daily_publication_definer'
        ) AND acl.privilege_type = 'USAGE' AND NOT acl.is_grantable)
    ) INTO STRICT v_schema_catalog_exact
  FROM pg_catalog.pg_namespace AS namespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl) AS acl
  LEFT JOIN pg_catalog.pg_roles AS grantee ON grantee.oid = acl.grantee
  WHERE namespace.nspname = 'public'
  GROUP BY namespace.nspowner, namespace.nspacl;
  IF v_schema_catalog_exact IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'telemetry recovery schema owner or exact nspacl drifted';
  END IF;

  SELECT count(*) = 0 AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attrdef AS default_value
      WHERE default_value.adrelid = ANY(ARRAY[
          'public.reader_summary_daily_execution_cursors'::pg_catalog.regclass,
          'public.reader_summary_daily_model_jobs'::pg_catalog.regclass,
          'public.reader_summary_daily_source_authorities'::pg_catalog.regclass
        ]::OID[])
        AND pg_catalog.pg_get_expr(
          default_value.adbin, default_value.adrelid
        ) ~ '(^|[^a-z_])nextval[[:space:]]*[(]'
    ) INTO STRICT v_sequence_catalog_exact
  FROM pg_catalog.pg_class AS sequence
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = sequence.relnamespace
  WHERE namespace.nspname = 'public' AND sequence.relkind = 'S'
    AND (sequence.relname LIKE 'reader_summary_daily_model_jobs%telemetry%'
      OR sequence.relname LIKE 'reader_summary_daily_model_jobs%token%'
      OR EXISTS (SELECT 1 FROM pg_catalog.pg_depend AS dependency
        WHERE dependency.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
          AND dependency.objid = sequence.oid
          AND dependency.refclassid =
            'pg_catalog.pg_class'::pg_catalog.regclass
          AND dependency.refobjid = ANY(ARRAY[
            'public.reader_summary_daily_execution_cursors'::pg_catalog.regclass,
            'public.reader_summary_daily_model_jobs'::pg_catalog.regclass,
            'public.reader_summary_daily_source_authorities'::pg_catalog.regclass
          ]::OID[])));
  IF v_sequence_catalog_exact IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'telemetry recovery relevant sequence owner, ACL, or default state drifted';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE relation.oid IS NULL
      OR relation.relowner <> v_schema_owner
      OR (SELECT count(*) FROM pg_catalog.aclexplode(relation.relacl)) <>
        8 + pg_catalog.cardinality(expected.privileges)
          + expected.definer_privilege_count
          + expected.publication_owner_privilege_count
      OR COALESCE((SELECT pg_catalog.array_agg(
        acl.privilege_type ORDER BY acl.privilege_type
      ) FROM pg_catalog.aclexplode(relation.relacl) AS acl
        WHERE acl.grantee = relation.relowner), ARRAY[]::TEXT[]) <>
        ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::TEXT[]
      OR COALESCE((SELECT pg_catalog.array_agg(
        acl.privilege_type ORDER BY acl.privilege_type
      ) FROM pg_catalog.aclexplode(relation.relacl) AS acl
        WHERE acl.grantee = v_active_owner), ARRAY[]::TEXT[]) <> expected.privileges
      OR COALESCE((SELECT pg_catalog.array_agg(
        acl.privilege_type ORDER BY acl.privilege_type
      ) FROM pg_catalog.aclexplode(relation.relacl) AS acl
        WHERE acl.grantee = v_definer), ARRAY[]::TEXT[]) <>
        CASE WHEN expected.definer_privilege_count = 2
          THEN ARRAY['SELECT','UPDATE']::TEXT[] ELSE ARRAY[]::TEXT[] END
      OR COALESCE((SELECT pg_catalog.array_agg(
        acl.privilege_type ORDER BY acl.privilege_type
      ) FROM pg_catalog.aclexplode(relation.relacl) AS acl
        WHERE acl.grantee =
          'social_monitor_reader_summary_publication_owner'::pg_catalog.regrole::OID
      ), ARRAY[]::TEXT[]) <> CASE
        WHEN expected.publication_owner_privilege_count = 1
          THEN ARRAY['SELECT']::TEXT[] ELSE ARRAY[]::TEXT[] END
      OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(relation.relacl) AS acl
        WHERE acl.grantor <> relation.relowner OR acl.is_grantable)
      OR (expected.relation_name = 'feed_items' AND (
        (SELECT count(*) FROM pg_catalog.pg_attribute AS attribute
          CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
          WHERE attribute.attrelid = relation.oid) <> 30
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute
          CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
          WHERE attribute.attrelid = relation.oid AND (
            acl.grantor <> relation.relowner OR acl.is_grantable
            OR acl.grantee NOT IN (
              'social_monitor_reader_summary_publication_owner'::pg_catalog.regrole::OID,
              'social_monitor_reader_summary_publication_runtime'::pg_catalog.regrole::OID
            ) OR (acl.privilege_type = 'SELECT' AND attribute.attname <> ALL(ARRAY[
              'id','tenant_id','workspace_id','interest_id','source_item_id',
              'source_binding_id','provider_key','canonical_url','title',
              'body_preview','author_handle','status','published_at','observed_at'
            ]::NAME[])) OR (acl.privilege_type = 'UPDATE'
              AND attribute.attname <> 'id')
            OR acl.privilege_type NOT IN ('SELECT','UPDATE'))))
      OR (expected.relation_name = 'source_items' AND (
        (SELECT count(*) FROM pg_catalog.pg_attribute AS attribute
          CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
          WHERE attribute.attrelid = relation.oid) <> 26
        OR EXISTS (SELECT 1 FROM pg_catalog.pg_attribute AS attribute
          CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
          WHERE attribute.attrelid = relation.oid AND (
            acl.grantor <> relation.relowner OR acl.is_grantable
            OR acl.grantee NOT IN (
              'social_monitor_reader_summary_publication_owner'::pg_catalog.regrole::OID,
              'social_monitor_reader_summary_publication_runtime'::pg_catalog.regrole::OID
            ) OR (acl.privilege_type = 'SELECT' AND attribute.attname <> ALL(ARRAY[
              'id','tenant_id','workspace_id','source_binding_id','provider_key',
              'provider_item_id','canonical_url','body','content_hash',
              'provider_content_hash','observed_at','metadata'
            ]::NAME[])) OR (acl.privilege_type = 'UPDATE'
              AND attribute.attname <> 'id')
            OR acl.privilege_type NOT IN ('SELECT','UPDATE'))))
      OR (expected.relation_name NOT IN ('feed_items','source_items') AND EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS attribute
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute.attacl) AS acl
        WHERE attribute.attrelid = relation.oid)))
  INTO STRICT v_acl_rows, v_acl_mismatches
  FROM (VALUES
    ('reader_summary_daily_execution_cursors', ARRAY['INSERT','SELECT','UPDATE']::TEXT[], 2, 0),
    ('reader_summary_daily_model_jobs', ARRAY['INSERT','SELECT','UPDATE']::TEXT[], 2, 1),
    ('reader_summary_daily_source_authorities', ARRAY['INSERT','SELECT']::TEXT[], 0, 0),
    ('feed_items', ARRAY['SELECT']::TEXT[], 0, 0),
    ('source_items', ARRAY['SELECT']::TEXT[], 0, 0)
  ) AS expected(
    relation_name, privileges, definer_privilege_count,
    publication_owner_privilege_count
  )
  LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relname = expected.relation_name
  LEFT JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace AND namespace.nspname = 'public'
  WHERE namespace.oid IS NOT NULL OR relation.oid IS NULL;
  IF v_acl_rows <> 5 OR v_acl_mismatches <> 0 THEN
    RAISE EXCEPTION 'telemetry recovery production owner ACL invariants drifted';
  END IF;
END
$reader_summary_telemetry_recovery_authorization$;

SELECT 'authorized' AS case;
