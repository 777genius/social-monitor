\set ON_ERROR_STOP on

BEGIN;

SELECT set_config(
  'social_monitor.bootstrap_runtime_role',
  :'runtime_role',
  false
);
SELECT set_config(
  'social_monitor.bootstrap_system_runtime_role',
  :'system_runtime_role',
  false
);

DO $bootstrap$
DECLARE
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
  v_system_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_system_runtime_role'
  )::NAME;
  v_admin_role RECORD;
  v_role RECORD;
BEGIN
  IF v_runtime_role::TEXT !~ '^[a-z_][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'reader summary runtime role name is invalid';
  END IF;
  IF v_system_runtime_role::TEXT !~ '^[a-z_][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'tenant system runtime role name is invalid';
  END IF;
  IF v_runtime_role IN (
    current_user,
    'social_monitor_public_schema_owner',
    'social_monitor_reader_summary_publication_owner',
    'social_monitor_reader_summary_publication_runtime'
  ) THEN
    RAISE EXCEPTION 'reader summary runtime and migration roles must be distinct';
  END IF;
  IF v_system_runtime_role IN (
    current_user,
    'social_monitor_public_schema_owner',
    'social_monitor_reader_summary_publication_owner',
    'social_monitor_reader_summary_publication_runtime',
    'social_monitor_tenant_system_runtime'
  ) THEN
    RAISE EXCEPTION 'tenant system runtime role conflicts with a protected role';
  END IF;

  SELECT * INTO v_admin_role FROM pg_roles WHERE rolname = current_user;
  IF NOT v_admin_role.rolsuper AND NOT v_admin_role.rolcreaterole THEN
    RAISE EXCEPTION
      'reader summary bootstrap requires a separate CREATEROLE admin';
  END IF;
  IF NOT v_admin_role.rolsuper AND NOT v_admin_role.rolinherit THEN
    RAISE EXCEPTION
      'reader summary migration admin must inherit protected ownership';
  END IF;

  SELECT * INTO v_role FROM pg_roles WHERE rolname = v_runtime_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reader summary runtime role % does not exist',
      v_runtime_role;
  END IF;
  IF NOT v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb OR v_role.rolcreaterole
    OR v_role.rolreplication OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'reader summary runtime role has unsafe privileges';
  END IF;

  SELECT * INTO v_role FROM pg_roles
  WHERE rolname = v_system_runtime_role;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant system runtime role % does not exist',
      v_system_runtime_role;
  END IF;
  IF NOT v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb
    OR v_role.rolcreaterole OR v_role.rolreplication
    OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'tenant system runtime role has unsafe privileges';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'social_monitor_public_schema_owner'
  ) THEN
    PERFORM pg_catalog.set_config('createrole_self_grant', 'set', true);
    EXECUTE 'CREATE ROLE social_monitor_public_schema_owner '
      'NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT '
      'NOREPLICATION NOBYPASSRLS';
  END IF;
  PERFORM pg_catalog.set_config('createrole_self_grant', '', true);
  SELECT * INTO v_role FROM pg_roles
  WHERE rolname = 'social_monitor_public_schema_owner';
  IF v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb
    OR v_role.rolcreaterole OR v_role.rolinherit OR v_role.rolreplication
    OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'public schema owner role is unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'social_monitor_reader_summary_publication_owner'
  ) THEN
    PERFORM pg_catalog.set_config('createrole_self_grant', 'set', true);
    EXECUTE 'CREATE ROLE social_monitor_reader_summary_publication_owner '
      'NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT '
      'NOREPLICATION NOBYPASSRLS';
  END IF;
  PERFORM pg_catalog.set_config('createrole_self_grant', '', true);
  SELECT * INTO v_role FROM pg_roles
  WHERE rolname = 'social_monitor_reader_summary_publication_owner';
  IF v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb
    OR v_role.rolcreaterole OR v_role.rolinherit OR v_role.rolreplication
    OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'reader summary publication owner role is unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'social_monitor_reader_summary_publication_runtime'
  ) THEN
    EXECUTE 'CREATE ROLE social_monitor_reader_summary_publication_runtime '
      'NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT '
      'NOREPLICATION NOBYPASSRLS';
  END IF;
  SELECT * INTO v_role FROM pg_roles
  WHERE rolname = 'social_monitor_reader_summary_publication_runtime';
  IF v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb
    OR v_role.rolcreaterole OR v_role.rolinherit OR v_role.rolreplication
    OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'reader summary publication runtime role is unsafe';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'social_monitor_tenant_system_runtime'
  ) THEN
    EXECUTE 'CREATE ROLE social_monitor_tenant_system_runtime '
      'NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT '
      'NOREPLICATION NOBYPASSRLS';
  END IF;
  SELECT * INTO v_role FROM pg_roles
  WHERE rolname = 'social_monitor_tenant_system_runtime';
  IF v_role.rolcanlogin OR v_role.rolsuper OR v_role.rolcreatedb
    OR v_role.rolcreaterole OR v_role.rolinherit OR v_role.rolreplication
    OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'tenant system capability role is unsafe';
  END IF;

  EXECUTE format(
    'GRANT USAGE, CREATE ON SCHEMA public TO %I',
    current_user
  );
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname = 'social_monitor_public_schema_owner'
      AND member.rolname <> current_user
  ) THEN
    RAISE EXCEPTION 'public schema owner has an unreviewed member';
  END IF;
  IF pg_has_role(
    v_runtime_role,
    'social_monitor_public_schema_owner',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'runtime role can assume public schema ownership';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_owner'
      AND member.rolname <> current_user
  ) THEN
    RAISE EXCEPTION 'publication owner has an unreviewed member';
  END IF;
  IF pg_has_role(
    v_runtime_role,
    'social_monitor_reader_summary_publication_owner',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'runtime role can assume publication ownership';
  END IF;
  IF pg_has_role(
    'social_monitor_reader_summary_publication_runtime',
    'social_monitor_reader_summary_publication_owner',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'publication capability can assume publication ownership';
  END IF;
  IF pg_has_role(
    'social_monitor_tenant_system_runtime',
    'social_monitor_public_schema_owner',
    'MEMBER'
  ) OR pg_has_role(
    'social_monitor_tenant_system_runtime',
    'social_monitor_reader_summary_publication_owner',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'tenant system capability can assume protected ownership';
  END IF;

  EXECUTE format(
    'GRANT social_monitor_reader_summary_publication_runtime TO %I '
      'WITH ADMIN FALSE GRANTED BY CURRENT_USER',
    v_runtime_role
  );
  EXECUTE format(
    'GRANT social_monitor_reader_summary_publication_runtime TO %I '
      'WITH INHERIT TRUE GRANTED BY CURRENT_USER',
    v_runtime_role
  );
  EXECUTE format(
    'GRANT social_monitor_reader_summary_publication_runtime TO %I '
      'WITH SET FALSE GRANTED BY CURRENT_USER',
    v_runtime_role
  );

  IF v_system_runtime_role <> v_runtime_role THEN
    EXECUTE format(
      'GRANT %I TO %I WITH ADMIN FALSE GRANTED BY CURRENT_USER',
      v_runtime_role,
      v_system_runtime_role
    );
    EXECUTE format(
      'GRANT %I TO %I WITH INHERIT TRUE GRANTED BY CURRENT_USER',
      v_runtime_role,
      v_system_runtime_role
    );
    EXECUTE format(
      'GRANT %I TO %I WITH SET FALSE GRANTED BY CURRENT_USER',
      v_runtime_role,
      v_system_runtime_role
    );
  END IF;
  EXECUTE format(
    'GRANT social_monitor_tenant_system_runtime TO %I '
      'WITH ADMIN FALSE GRANTED BY CURRENT_USER',
    v_system_runtime_role
  );
  EXECUTE format(
    'GRANT social_monitor_tenant_system_runtime TO %I '
      'WITH INHERIT TRUE GRANTED BY CURRENT_USER',
    v_system_runtime_role
  );
  EXECUTE format(
    'GRANT social_monitor_tenant_system_runtime TO %I '
      'WITH SET FALSE GRANTED BY CURRENT_USER',
    v_system_runtime_role
  );
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_runtime'
      AND member.rolname NOT IN (v_runtime_role, current_user)
  ) THEN
    RAISE EXCEPTION 'publication capability has an unreviewed member';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname = 'social_monitor_tenant_system_runtime'
      AND member.rolname NOT IN (v_system_runtime_role, current_user)
  ) THEN
    RAISE EXCEPTION 'tenant system capability has an unreviewed member';
  END IF;
  IF (
    SELECT count(*) <> 2
      OR count(*) FILTER (
        WHERE membership.admin_option
          AND NOT membership.inherit_option
          AND NOT membership.set_option
          AND grantor.rolsuper
      ) <> 1
      OR count(*) FILTER (
        WHERE NOT membership.admin_option
          AND NOT membership.inherit_option
          AND membership.set_option
          AND grantor.rolname = current_user
      ) <> 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname = 'social_monitor_public_schema_owner'
      AND member.rolname = current_user
  ) THEN
    RAISE EXCEPTION 'public schema owner membership is unsafe';
  END IF;
  IF (
    SELECT count(*) <> 2
      OR count(*) FILTER (
        WHERE membership.admin_option
          AND NOT membership.inherit_option
          AND NOT membership.set_option
          AND grantor.rolsuper
      ) <> 1
      OR count(*) FILTER (
        WHERE NOT membership.admin_option
          AND NOT membership.inherit_option
          AND membership.set_option
          AND grantor.rolname = current_user
      ) <> 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_owner'
      AND member.rolname = current_user
  ) THEN
    RAISE EXCEPTION 'publication owner membership is unsafe';
  END IF;
  IF (
    SELECT count(*) <> 1 OR NOT bool_and(
      membership.admin_option
      AND NOT membership.inherit_option
      AND NOT membership.set_option
      AND grantor.rolsuper
    )
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_runtime'
      AND member.rolname = current_user
  ) THEN
    RAISE EXCEPTION 'publication capability admin membership is unsafe';
  END IF;
  IF (
    SELECT count(*) <> 1 OR NOT bool_and(
      NOT membership.admin_option
      AND membership.inherit_option
      AND NOT membership.set_option
      AND grantor.rolname = current_user
    )
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_runtime'
      AND member.rolname = v_runtime_role
  ) THEN
    RAISE EXCEPTION 'publication capability runtime membership is unsafe';
  END IF;
  IF (
    SELECT count(*) <> 1 OR NOT bool_and(
      membership.admin_option
      AND NOT membership.inherit_option
      AND membership.set_option
      AND (
        grantor.rolsuper OR (
          grantor.rolcreaterole
          AND grantor.rolname NOT IN (
            current_user,
            v_runtime_role,
            'social_monitor_public_schema_owner',
            'social_monitor_reader_summary_publication_owner',
            'social_monitor_reader_summary_publication_runtime'
          )
          AND EXISTS (
            SELECT 1
            FROM pg_auth_members provisioner_membership
            JOIN pg_roles root_grantor
              ON root_grantor.oid = provisioner_membership.grantor
            WHERE provisioner_membership.roleid = membership.roleid
              AND provisioner_membership.member = membership.grantor
              AND provisioner_membership.admin_option
              AND root_grantor.rolsuper
          )
        )
      )
    )
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    JOIN pg_roles grantor ON grantor.oid = membership.grantor
    WHERE granted.rolname = v_runtime_role
      AND member.rolname = current_user
  ) THEN
    RAISE EXCEPTION 'runtime admin membership grantor is unsafe';
  END IF;
END
$bootstrap$;

-- PostgreSQL requires the new owner to be able to create in the containing
-- schema during ALTER ... OWNER. The forward migration revokes this temporary
-- bootstrap authority after every protected object has changed owner.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public
TO social_monitor_reader_summary_publication_owner;

-- Managed PostgreSQL initially makes the application login the database owner,
-- while public is owned by the dynamic pg_database_owner role. Direct REVOKE
-- cannot remove an owner's implicit CREATE authority. Move public to a
-- dedicated NOLOGIN role inside this transaction, remove the temporary upward
-- membership before commit, and grant the migrator only the authority needed
-- for the ordered Prisma migration.
DO $schema_ownership_transfer$
DECLARE
  v_admin_role NAME := current_user;
  v_database_owner NAME;
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
  v_schema_owner NAME;
BEGIN
  SELECT owner.rolname INTO v_database_owner
  FROM pg_database database
  JOIN pg_roles owner ON owner.oid = database.datdba
  WHERE database.datname = current_database();

  SELECT pg_get_userbyid(namespace.nspowner) INTO v_schema_owner
  FROM pg_namespace namespace
  WHERE namespace.nspname = 'public';

  IF EXISTS (
    SELECT 1
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(
        namespace.nspacl,
        acldefault('n', namespace.nspowner)
      )
    ) privilege
    LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
    WHERE namespace.nspname = 'public'
      AND privilege.privilege_type = 'CREATE'
      AND (
        privilege.grantee = 0
        OR grantee.rolname NOT IN (
          'pg_database_owner',
          v_admin_role,
          v_runtime_role,
          'social_monitor_public_schema_owner',
          'social_monitor_reader_summary_publication_owner'
        )
      )
  ) THEN
    RAISE EXCEPTION 'public schema has an unreviewed CREATE grant';
  END IF;

  IF v_schema_owner = 'pg_database_owner' THEN
    IF v_database_owner <> v_runtime_role THEN
      RAISE EXCEPTION
        'public schema requires an explicitly reviewed ownership transfer';
    END IF;
    EXECUTE format(
      'GRANT social_monitor_public_schema_owner TO %I '
        'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER',
      v_runtime_role
    );
    EXECUTE format('SET LOCAL ROLE %I', v_runtime_role);
    ALTER SCHEMA public OWNER TO social_monitor_public_schema_owner;
    EXECUTE 'RESET ROLE';
    EXECUTE format(
      'REVOKE social_monitor_public_schema_owner FROM %I '
        'GRANTED BY CURRENT_USER',
      v_runtime_role
    );
  ELSIF v_schema_owner <>
    'social_monitor_public_schema_owner' THEN
    RAISE EXCEPTION 'public schema has an unexpected owner';
  END IF;

  EXECUTE format(
    'REVOKE CREATE ON SCHEMA public FROM %I '
      'GRANTED BY CURRENT_USER CASCADE',
    v_runtime_role
  );
  EXECUTE 'SET LOCAL ROLE social_monitor_public_schema_owner';
  EXECUTE format(
    'GRANT USAGE, CREATE ON SCHEMA public TO %I WITH GRANT OPTION',
    v_admin_role
  );
  REVOKE CREATE ON SCHEMA public
  FROM pg_database_owner,
    PUBLIC,
    social_monitor_reader_summary_publication_owner,
    social_monitor_reader_summary_publication_runtime
  CASCADE;
  EXECUTE format(
    'REVOKE CREATE ON SCHEMA public FROM %I',
    v_runtime_role
  );
  EXECUTE 'RESET ROLE';

  IF pg_get_userbyid((
    SELECT namespace.nspowner
    FROM pg_namespace namespace
    WHERE namespace.nspname = 'public'
  )) <> 'social_monitor_public_schema_owner'
    OR pg_has_role(
      v_runtime_role,
      'social_monitor_public_schema_owner',
      'MEMBER'
    )
    OR has_schema_privilege(v_runtime_role, 'public', 'CREATE')
    OR EXISTS (
      SELECT 1
      FROM pg_namespace namespace
      CROSS JOIN LATERAL aclexplode(
        COALESCE(
          namespace.nspacl,
          acldefault('n', namespace.nspowner)
        )
      ) privilege
      LEFT JOIN pg_roles grantee ON grantee.oid = privilege.grantee
      WHERE namespace.nspname = 'public'
        AND privilege.privilege_type = 'CREATE'
        AND (
          privilege.grantee = 0
          OR grantee.rolname NOT IN (
            'social_monitor_public_schema_owner',
            v_admin_role,
            'social_monitor_reader_summary_publication_owner'
          )
        )
    ) THEN
    RAISE EXCEPTION
      'public schema ownership transfer is unsafe (owner=%, member=%, create=%)',
      (
        SELECT pg_get_userbyid(namespace.nspowner)
        FROM pg_namespace namespace
        WHERE namespace.nspname = 'public'
      ),
      pg_has_role(
        v_runtime_role,
        'social_monitor_public_schema_owner',
        'MEMBER'
      ),
      has_schema_privilege(v_runtime_role, 'public', 'CREATE');
  END IF;
END
$schema_ownership_transfer$;

-- Existing installations were migrated by the application login before the
-- protected publication owner existed. Transfer the artifact table while all
-- temporary upward membership remains uncommitted and therefore invisible to
-- every application session. The separate admin may retain membership in the
-- lower-privileged legacy owner so future migrations and credential rotation
-- can repair grants without ever making the application login a member of the
-- protected publication owner.
DO $ownership_transfer$
DECLARE
  v_admin_role NAME := current_user;
  v_artifact_owner NAME;
  v_job_owner NAME;
  v_migration_owner NAME;
  v_outbox_owner NAME;
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
  v_switched_role BOOLEAN := FALSE;
  v_temporary_owner_membership BOOLEAN := FALSE;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO v_artifact_owner
  FROM pg_class
  WHERE oid = to_regclass('public.reader_summary_artifacts');
  SELECT pg_get_userbyid(relowner) INTO v_job_owner
  FROM pg_class
  WHERE oid = to_regclass('public.reader_summary_jobs');
  SELECT pg_get_userbyid(relowner) INTO v_migration_owner
  FROM pg_class
  WHERE oid = to_regclass('public._prisma_migrations');
  SELECT pg_get_userbyid(relowner) INTO v_outbox_owner
  FROM pg_class
  WHERE oid = to_regclass('public.outbox_events');

  IF v_artifact_owner IS NULL OR v_job_owner IS NULL
    OR v_migration_owner IS NULL OR v_outbox_owner IS NULL THEN
    RAISE EXCEPTION
      'reader summary bootstrap requires the ordered baseline and repairs';
  END IF;
  IF NOT (
    (
      v_job_owner = v_migration_owner
      AND v_job_owner = v_outbox_owner
      AND v_job_owner IN (v_runtime_role, v_admin_role)
    )
    OR (
      v_job_owner = 'social_monitor_public_schema_owner'
      AND v_outbox_owner = 'social_monitor_public_schema_owner'
      AND v_migration_owner IN (v_runtime_role, v_admin_role)
    )
  ) THEN
    RAISE EXCEPTION
      'legacy migration tables have an unexpected owner '
        '(job=%, migrations=%, outbox=%, runtime=%, admin=%)',
      v_job_owner,
      v_migration_owner,
      v_outbox_owner,
      v_runtime_role,
      v_admin_role;
  END IF;
  IF v_artifact_owner NOT IN (
    v_job_owner,
    'social_monitor_reader_summary_publication_owner'
  ) THEN
    RAISE EXCEPTION 'reader summary artifact has an unexpected owner';
  END IF;

  IF v_artifact_owner = v_job_owner AND v_job_owner <> v_admin_role THEN
    EXECUTE format(
      'GRANT social_monitor_reader_summary_publication_owner TO %I '
        'WITH ADMIN FALSE',
      v_job_owner
    );
    EXECUTE format(
      'GRANT social_monitor_reader_summary_publication_owner TO %I '
        'WITH INHERIT FALSE',
      v_job_owner
    );
    EXECUTE format(
      'GRANT social_monitor_reader_summary_publication_owner TO %I '
        'WITH SET TRUE',
      v_job_owner
    );
    v_temporary_owner_membership := TRUE;
  END IF;

  IF v_job_owner <> v_admin_role THEN
    IF NOT pg_has_role(v_admin_role, v_job_owner, 'SET') THEN
      RAISE EXCEPTION
        'migration admin lacks the pre-provisioned SET membership';
    END IF;
    EXECUTE format('SET LOCAL ROLE %I', v_job_owner);
    v_switched_role := TRUE;
  END IF;

  IF v_artifact_owner = v_job_owner THEN
    -- The old application remains live until the deployment admission lock
    -- reaches service replacement. Preserve only its candidate read/write
    -- path in the same transaction that removes implicit owner authority.
    GRANT SELECT, INSERT, UPDATE
      ON TABLE public.reader_summary_artifacts
      TO social_monitor_reader_summary_publication_runtime;
    ALTER TABLE public.reader_summary_artifacts
      OWNER TO social_monitor_reader_summary_publication_owner;
  END IF;

  GRANT SELECT, UPDATE, REFERENCES ON TABLE public.reader_summary_jobs
    TO social_monitor_reader_summary_publication_owner;
  GRANT SELECT, INSERT, REFERENCES ON TABLE public.outbox_events
    TO social_monitor_reader_summary_publication_owner;
  EXECUTE format(
    'GRANT REFERENCES ON TABLE public.reader_summary_jobs, '
      'public.outbox_events TO %I',
    v_admin_role
  );

  IF v_switched_role THEN
    EXECUTE 'RESET ROLE';
    v_switched_role := FALSE;
  END IF;

  IF v_migration_owner <> v_admin_role THEN
    IF NOT pg_has_role(v_admin_role, v_migration_owner, 'SET') THEN
      RAISE EXCEPTION
        'migration admin lacks SET authority for the migration table owner';
    END IF;
    EXECUTE format('SET LOCAL ROLE %I', v_migration_owner);
    v_switched_role := TRUE;
  END IF;

  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE '
      'public._prisma_migrations TO %I',
    v_admin_role
  );

  IF v_switched_role THEN
    EXECUTE 'RESET ROLE';
    v_switched_role := FALSE;
  END IF;
  IF v_temporary_owner_membership THEN
    EXECUTE format(
      'REVOKE social_monitor_reader_summary_publication_owner FROM %I',
      v_job_owner
    );
  END IF;
END
$ownership_transfer$;

-- Move ordinary application tables away from the LOGIN runtime before RLS is
-- enabled. The temporary membership is transaction-local from the point of
-- view of concurrent sessions and is revoked before commit.
DO $tenant_table_ownership_transfer$
DECLARE
  v_admin_role NAME := current_user;
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
  v_relation RECORD;
  v_type RECORD;
  v_switched_to_runtime BOOLEAN := FALSE;
  v_temporary_owner_membership BOOLEAN := FALSE;
BEGIN
  IF NOT pg_has_role(
    v_admin_role,
    'social_monitor_public_schema_owner',
    'SET'
  ) THEN
    RAISE EXCEPTION 'migration admin cannot assume public schema ownership';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname NOT IN (
        '_prisma_migrations',
        'reader_summary_artifacts',
        'reader_summary_publications',
        'reader_summary_publication_slots',
        'reader_summary_production_recovery_days',
        'reader_summary_production_recovery_dry_runs',
        'reader_summary_production_recovery_leases',
        'reader_summary_recovery_receipts',
        'reader_summary_weekly_publication_evidence'
      )
      AND owner.rolname NOT IN (
        v_admin_role,
        v_runtime_role,
        'social_monitor_public_schema_owner'
      )
  ) THEN
    RAISE EXCEPTION 'ordinary application table has an unexpected owner';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname NOT IN (
        '_prisma_migrations',
        'reader_summary_artifacts',
        'reader_summary_publications',
        'reader_summary_publication_slots',
        'reader_summary_production_recovery_days',
        'reader_summary_production_recovery_dry_runs',
        'reader_summary_production_recovery_leases',
        'reader_summary_recovery_receipts',
        'reader_summary_weekly_publication_evidence'
      )
      AND owner.rolname = v_runtime_role
  ) THEN
    EXECUTE format(
      'GRANT social_monitor_public_schema_owner TO %I WITH ADMIN FALSE',
      v_runtime_role
    );
    EXECUTE format(
      'GRANT social_monitor_public_schema_owner TO %I WITH INHERIT FALSE',
      v_runtime_role
    );
    EXECUTE format(
      'GRANT social_monitor_public_schema_owner TO %I WITH SET TRUE',
      v_runtime_role
    );
    v_temporary_owner_membership := TRUE;
  END IF;

  FOR v_relation IN
    SELECT relation.relname, owner.rolname AS owner_name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname NOT IN (
        '_prisma_migrations',
        'reader_summary_artifacts',
        'reader_summary_publications',
        'reader_summary_publication_slots',
        'reader_summary_production_recovery_days',
        'reader_summary_production_recovery_dry_runs',
        'reader_summary_production_recovery_leases',
        'reader_summary_recovery_receipts',
        'reader_summary_weekly_publication_evidence'
      )
      AND owner.rolname IN (v_admin_role, v_runtime_role)
    ORDER BY owner.rolname, relation.relname
  LOOP
    IF v_relation.owner_name = v_runtime_role
      AND NOT v_switched_to_runtime THEN
      EXECUTE format('SET LOCAL ROLE %I', v_runtime_role);
      v_switched_to_runtime := TRUE;
    ELSIF v_relation.owner_name = v_admin_role
      AND v_switched_to_runtime THEN
      EXECUTE 'RESET ROLE';
      v_switched_to_runtime := FALSE;
    END IF;
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I',
      v_relation.relname,
      v_runtime_role
    );
    EXECUTE format(
      'ALTER TABLE public.%I OWNER TO social_monitor_public_schema_owner',
      v_relation.relname
    );
  END LOOP;

  IF v_switched_to_runtime THEN
    EXECUTE 'RESET ROLE';
    v_switched_to_runtime := FALSE;
  END IF;

  FOR v_type IN
    SELECT type.typname, owner.rolname AS owner_name
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    JOIN pg_roles owner ON owner.oid = type.typowner
    WHERE namespace.nspname = 'public'
      AND type.typtype = 'e'
      AND owner.rolname IN (v_admin_role, v_runtime_role)
    ORDER BY owner.rolname, type.typname
  LOOP
    IF v_type.owner_name = v_runtime_role
      AND NOT v_switched_to_runtime THEN
      EXECUTE format('SET LOCAL ROLE %I', v_runtime_role);
      v_switched_to_runtime := TRUE;
    ELSIF v_type.owner_name = v_admin_role
      AND v_switched_to_runtime THEN
      EXECUTE 'RESET ROLE';
      v_switched_to_runtime := FALSE;
    END IF;
    EXECUTE format(
      'ALTER TYPE public.%I OWNER TO social_monitor_public_schema_owner',
      v_type.typname
    );
  END LOOP;

  IF v_switched_to_runtime THEN
    EXECUTE 'RESET ROLE';
  END IF;
  IF v_temporary_owner_membership THEN
    EXECUTE format(
      'REVOKE social_monitor_public_schema_owner FROM %I',
      v_runtime_role
    );
  END IF;

  EXECUTE 'SET LOCAL ROLE social_monitor_public_schema_owner';
  FOR v_relation IN
    SELECT relation.relname
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname <> '_prisma_migrations'
      AND relation.relowner = (
        SELECT oid FROM pg_roles
        WHERE rolname = 'social_monitor_public_schema_owner'
      )
    ORDER BY relation.relname
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I',
      v_relation.relname,
      v_runtime_role
    );
  END LOOP;
  EXECUTE 'RESET ROLE';
END
$tenant_table_ownership_transfer$;

DO $ownership_transfer_audit$
DECLARE
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p')
      AND relation.relname IN (
        'reader_summary_artifacts',
        'reader_summary_publications',
        'reader_summary_publication_slots',
        'reader_summary_production_recovery_days',
        'reader_summary_production_recovery_dry_runs',
        'reader_summary_production_recovery_leases',
        'reader_summary_recovery_receipts',
        'reader_summary_weekly_publication_evidence'
      )
      AND owner.rolname <>
        'social_monitor_reader_summary_publication_owner'
  ) THEN
    RAISE EXCEPTION 'publication-owned table has an unexpected owner';
  END IF;

  IF NOT has_table_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_artifacts',
    'SELECT'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_artifacts',
    'INSERT'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_artifacts',
    'UPDATE'
  ) OR has_table_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_artifacts',
    'DELETE'
  ) OR has_table_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_artifacts',
    'TRUNCATE'
  ) OR has_table_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_artifacts',
    'REFERENCES'
  ) OR has_table_privilege(
    'social_monitor_reader_summary_publication_runtime',
    'public.reader_summary_artifacts',
    'TRIGGER'
  ) THEN
    RAISE EXCEPTION
      'pre-migration publication capability artifact grants are unsafe';
  END IF;

  IF NOT has_table_privilege(
    v_runtime_role, 'public.reader_summary_artifacts', 'SELECT'
  ) OR NOT has_table_privilege(
    v_runtime_role, 'public.reader_summary_artifacts', 'INSERT'
  ) OR NOT has_table_privilege(
    v_runtime_role, 'public.reader_summary_artifacts', 'UPDATE'
  ) OR has_table_privilege(
    v_runtime_role, 'public.reader_summary_artifacts', 'DELETE'
  ) OR has_table_privilege(
    v_runtime_role, 'public.reader_summary_artifacts', 'TRUNCATE'
  ) OR has_table_privilege(
    v_runtime_role, 'public.reader_summary_artifacts', 'REFERENCES'
  ) OR has_table_privilege(
    v_runtime_role, 'public.reader_summary_artifacts', 'TRIGGER'
  ) THEN
    RAISE EXCEPTION
      'pre-migration runtime artifact continuity grants are unsafe';
  END IF;

  IF pg_has_role(
    v_runtime_role,
    'social_monitor_public_schema_owner',
    'MEMBER'
  ) OR has_schema_privilege(
    v_runtime_role,
    'public',
    'CREATE'
  ) THEN
    RAISE EXCEPTION 'runtime retained temporary public schema ownership';
  END IF;

  IF pg_has_role(
    v_runtime_role,
    'social_monitor_reader_summary_publication_owner',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'runtime retained temporary publication ownership';
  END IF;
END
$ownership_transfer_audit$;

COMMIT;
