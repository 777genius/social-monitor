-- Read-only verification of the complete recovery receipt, its protected
-- owner/ACL topology, exact history binding, database identity, and digest.
DO $telemetry_recovery_attestation_verify$
DECLARE
  v_name CONSTANT TEXT :=
    '20260824120000_reader_summary_daily_model_job_telemetry';
  v_old_checksum CONSTANT TEXT :=
    'e3e5b65d71d47942513478849dd745835f16c72175eb2ef821e245af02b79cad';
  v_corrected_checksum CONSTANT TEXT :=
    '575ece3521b26d769c5f65aae4d4a47ba33502695ac866030524319808812250';
  v_attestor OID;
  v_authorized OID;
  v_data JSONB;
  v_row social_monitor_telemetry_recovery.migration_attestations%ROWTYPE;
  v_expected JSONB;
  v_schema_acl_exact BOOLEAN;
  v_table_acl_exact BOOLEAN;
  v_function_acl_exact BOOLEAN;
  v_public_schema_acl_exact BOOLEAN;
  v_history_acl_exact BOOLEAN;
BEGIN
  IF pg_catalog.to_regrole('social_monitor_telemetry_recovery_attestor') IS NULL
    OR pg_catalog.to_regnamespace('social_monitor_telemetry_recovery') IS NULL
    OR pg_catalog.to_regclass(
      'social_monitor_telemetry_recovery.migration_attestations'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'social_monitor_telemetry_recovery.record_attestation(text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'social_monitor_telemetry_recovery.read_attestation()'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'social_monitor_telemetry_recovery.assert_guard()'
    ) IS NULL THEN
    RAISE EXCEPTION 'telemetry recovery attestation ledger is missing';
  END IF;
  v_attestor :=
    'social_monitor_telemetry_recovery_attestor'::pg_catalog.regrole::OID;
  SELECT relation.relowner INTO STRICT v_authorized
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public._prisma_migrations'::REGCLASS;
  IF (SELECT role.oid <> v_authorized
        AND NOT role.rolsuper AND NOT role.rolinherit AND NOT role.rolcreaterole
        AND NOT role.rolcreatedb AND NOT role.rolcanlogin
        AND NOT role.rolreplication AND NOT role.rolbypassrls
      FROM pg_catalog.pg_roles AS role WHERE role.oid = v_attestor)
      IS DISTINCT FROM TRUE
    OR (SELECT count(*) = 1 AND pg_catalog.bool_and(
          membership.roleid = v_attestor
          AND membership.member = v_authorized
          AND grantor.rolsuper AND membership.admin_option
          AND NOT membership.inherit_option AND NOT membership.set_option
        )
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS grantor
          ON grantor.oid = membership.grantor
        WHERE membership.roleid = v_attestor
          OR membership.member = v_attestor) IS DISTINCT FROM TRUE
  THEN
    RAISE EXCEPTION 'telemetry recovery attestor role topology is unsafe';
  END IF;

  SELECT namespace.nspowner = v_attestor AND namespace.nspacl IS NOT NULL
      AND count(*) = 3
      AND count(*) FILTER (WHERE acl.grantee = v_attestor
        AND acl.privilege_type IN ('CREATE', 'USAGE')
        AND NOT acl.is_grantable AND acl.grantor = v_attestor) = 2
      AND count(*) FILTER (
        WHERE acl.grantee = v_authorized
          AND acl.privilege_type = 'USAGE' AND NOT acl.is_grantable
          AND acl.grantor = v_attestor) = 1
    INTO STRICT v_schema_acl_exact
  FROM pg_catalog.pg_namespace AS namespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl) AS acl
  WHERE namespace.nspname = 'social_monitor_telemetry_recovery'
  GROUP BY namespace.nspowner, namespace.nspacl;

  SELECT relation.relowner = v_attestor AND relation.relacl IS NOT NULL
      AND count(*) = 8 AND pg_catalog.bool_and(
        acl.grantee = v_attestor AND acl.grantor = v_attestor
        AND acl.privilege_type IN (
          'DELETE', 'INSERT', 'MAINTAIN', 'REFERENCES',
          'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'
        ) AND NOT acl.is_grantable)
    INTO STRICT v_table_acl_exact
  FROM pg_catalog.pg_class AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS acl
  WHERE relation.oid =
    'social_monitor_telemetry_recovery.migration_attestations'::REGCLASS
  GROUP BY relation.relowner, relation.relacl;

  SELECT count(*) = 1 AND pg_catalog.bool_and(
      acl.grantee = v_attestor
      AND acl.grantor = namespace.nspowner
      AND acl.privilege_type = 'USAGE' AND NOT acl.is_grantable
    ) INTO STRICT v_public_schema_acl_exact
  FROM pg_catalog.pg_namespace AS namespace
  CROSS JOIN LATERAL pg_catalog.aclexplode(namespace.nspacl) AS acl
  WHERE namespace.nspname = 'public' AND acl.grantee = v_attestor;

  SELECT count(*) = 1 AND pg_catalog.bool_and(
      acl.grantee = v_attestor
      AND acl.grantor = relation.relowner
      AND acl.privilege_type = 'SELECT' AND NOT acl.is_grantable
    ) INTO STRICT v_history_acl_exact
  FROM pg_catalog.pg_class AS relation
  CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS acl
  WHERE relation.oid = 'public._prisma_migrations'::REGCLASS
    AND acl.grantee = v_attestor;

  SELECT count(DISTINCT procedure.oid) = 3 AND count(*) = 6
      AND pg_catalog.bool_and(procedure.proowner = v_attestor
        AND procedure.prosecdef = expected.security_definer
        AND procedure.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
        AND procedure.proacl IS NOT NULL
        AND acl.grantee IN (v_attestor, v_authorized)
        AND acl.grantor = v_attestor AND acl.privilege_type = 'EXECUTE'
        AND NOT acl.is_grantable)
      AND count(*) FILTER (WHERE acl.grantee = v_attestor) = 3
      AND count(*) FILTER (WHERE acl.grantee = v_authorized) = 3
    INTO STRICT v_function_acl_exact
  FROM (VALUES
    ('social_monitor_telemetry_recovery.record_attestation(text)'::REGPROCEDURE,
      TRUE),
    ('social_monitor_telemetry_recovery.read_attestation()'::REGPROCEDURE,
      TRUE),
    ('social_monitor_telemetry_recovery.assert_guard()'::REGPROCEDURE,
      FALSE)
  ) AS expected(procedure_oid, security_definer)
  JOIN pg_catalog.pg_proc AS procedure
    ON procedure.oid = expected.procedure_oid
  CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) AS acl;
  IF v_schema_acl_exact IS DISTINCT FROM TRUE
    OR v_table_acl_exact IS DISTINCT FROM TRUE
    OR v_function_acl_exact IS DISTINCT FROM TRUE
    OR v_public_schema_acl_exact IS DISTINCT FROM TRUE
    OR v_history_acl_exact IS DISTINCT FROM TRUE
    OR NOT pg_catalog.has_schema_privilege(v_attestor, 'public', 'USAGE')
    OR pg_catalog.has_schema_privilege(v_attestor, 'public', 'CREATE')
    OR NOT pg_catalog.has_table_privilege(
      v_attestor, 'public._prisma_migrations', 'SELECT'
    )
    OR pg_catalog.has_table_privilege(v_attestor,
      'public._prisma_migrations',
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
    )
    OR pg_catalog.has_table_privilege(v_authorized,
      'social_monitor_telemetry_recovery.migration_attestations',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR pg_catalog.has_schema_privilege(
      'public', 'social_monitor_telemetry_recovery', 'USAGE'
    )
    OR pg_catalog.has_function_privilege(
      'public',
      'social_monitor_telemetry_recovery.record_attestation(text)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'public',
      'social_monitor_telemetry_recovery.read_attestation()',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'public',
      'social_monitor_telemetry_recovery.assert_guard()',
      'EXECUTE'
    )
    OR EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles AS role
      WHERE role.rolname = ANY(ARRAY[
        'social_monitor_public_schema_owner',
        'social_monitor_reader_summary_publication_owner',
        'social_monitor_reader_summary_publication_runtime',
        'social_monitor_tenant_system_runtime',
        'social_monitor_reader_summary_daily_terminal',
        'social_monitor_reader_summary_daily_publication_definer'
      ]) AND (
        pg_catalog.has_schema_privilege(
          role.oid, 'social_monitor_telemetry_recovery', 'USAGE'
        ) OR pg_catalog.has_table_privilege(role.oid,
          'social_monitor_telemetry_recovery.migration_attestations',
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
        ) OR pg_catalog.has_function_privilege(role.oid,
          'social_monitor_telemetry_recovery.record_attestation(text)',
          'EXECUTE'
        ) OR pg_catalog.has_function_privilege(role.oid,
          'social_monitor_telemetry_recovery.read_attestation()',
          'EXECUTE'
        ) OR pg_catalog.has_function_privilege(role.oid,
          'social_monitor_telemetry_recovery.assert_guard()',
          'EXECUTE'
        )
      )
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(relation.relacl) AS acl
      WHERE namespace.nspname = 'public'
        AND relation.oid <> 'public._prisma_migrations'::REGCLASS
        AND acl.grantee = v_attestor
    ) OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = procedure.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(procedure.proacl) AS acl
      WHERE namespace.nspname = 'public' AND acl.grantee = v_attestor
    ) THEN
    RAISE EXCEPTION 'telemetry recovery attestation owner or ACL is unsafe';
  END IF;

  BEGIN
    v_data := social_monitor_telemetry_recovery.read_attestation();
    SELECT * INTO STRICT v_row FROM pg_catalog.jsonb_populate_record(
      NULL::social_monitor_telemetry_recovery.migration_attestations,
      v_data
    );
  EXCEPTION WHEN no_data_found OR too_many_rows THEN
    RAISE EXCEPTION 'telemetry recovery attestation multiplicity is invalid';
  END;
  v_expected := pg_catalog.jsonb_build_object(
    'authorizedAt', pg_catalog.to_char(v_row.authorized_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'authorizedRoleName', v_row.authorized_role_name,
    'authorizedRoleOid', v_row.authorized_role_oid,
    'completedAt', pg_catalog.to_char(v_row.completed_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'correctedChecksum', pg_catalog.btrim(v_row.corrected_checksum),
    'correctedFinishedAt', pg_catalog.to_char(
      v_row.corrected_finished_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'correctedMigrationId', v_row.corrected_migration_id,
    'correctedStartedAt', pg_catalog.to_char(
      v_row.corrected_started_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'databaseName', v_row.database_name, 'databaseOid', v_row.database_oid,
    'guardApplication', v_row.guard_application,
    'guardBackendPid', v_row.guard_backend_pid,
    'guardBackendStart', pg_catalog.to_char(
      v_row.guard_backend_start AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'migrationName', v_row.migration_name,
    'oldChecksum', pg_catalog.btrim(v_row.old_checksum),
    'oldMigrationId', v_row.old_migration_id,
    'recoveryNonce', pg_catalog.btrim(v_row.recovery_nonce),
    'resolvedAt', pg_catalog.to_char(v_row.resolved_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'schemaVersion', 'reader_summary.telemetry_recovery.v1',
    'state', v_row.state
  );
  IF v_row.state <> 'COMPLETED'
    OR v_row.database_oid IS DISTINCT FROM
      (SELECT database.oid FROM pg_catalog.pg_database AS database
        WHERE database.datname = pg_catalog.current_database())
    OR v_row.database_name IS DISTINCT FROM pg_catalog.current_database()
    OR v_row.authorized_role_oid IS DISTINCT FROM v_authorized
    OR v_row.authorized_role_name IS DISTINCT FROM
      pg_catalog.pg_get_userbyid(v_authorized)
    OR pg_catalog.btrim(v_row.old_checksum) IS DISTINCT FROM v_old_checksum
    OR pg_catalog.btrim(v_row.corrected_checksum)
      IS DISTINCT FROM v_corrected_checksum
    OR v_row.receipt IS DISTINCT FROM v_expected
    OR pg_catalog.btrim(v_row.receipt_sha256) IS DISTINCT FROM
      pg_catalog.encode(pg_catalog.sha256(
        pg_catalog.convert_to(v_expected::TEXT, 'UTF8')), 'hex')
    OR v_row.authorized_at > v_row.resolved_at
    OR v_row.resolved_at > v_row.corrected_started_at
    OR v_row.corrected_started_at > v_row.corrected_finished_at
    OR v_row.corrected_finished_at > v_row.completed_at
    OR (SELECT count(*) FROM public."_prisma_migrations"
        WHERE migration_name = v_name) <> 2
    OR (SELECT count(*) FROM public."_prisma_migrations" AS migration
        WHERE migration.id = v_row.old_migration_id
          AND migration.migration_name = v_name
          AND migration.checksum = v_old_checksum
          AND migration.applied_steps_count = 0 AND migration.logs IS NOT NULL
          AND migration.finished_at IS NULL
          AND migration.rolled_back_at IS NOT NULL
          AND migration.started_at <= migration.rolled_back_at) <> 1
    OR (SELECT count(*) FROM public."_prisma_migrations" AS migration
        WHERE migration.id = v_row.corrected_migration_id
          AND migration.migration_name = v_name
          AND migration.checksum = v_corrected_checksum
          AND migration.applied_steps_count = 1 AND migration.logs IS NULL
          AND migration.finished_at = v_row.corrected_finished_at
          AND migration.started_at = v_row.corrected_started_at
          AND migration.rolled_back_at IS NULL) <> 1 THEN
    RAISE EXCEPTION 'telemetry recovery attestation receipt is invalid';
  END IF;
END
$telemetry_recovery_attestation_verify$;

SELECT 'recovered' AS case;
