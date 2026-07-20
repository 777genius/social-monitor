\set ON_ERROR_STOP on

BEGIN;

SELECT set_config(
  'social_monitor.bootstrap_runtime_role',
  :'runtime_role',
  false
);

DO $bootstrap$
DECLARE
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
  v_admin_role RECORD;
  v_role RECORD;
BEGIN
  IF v_runtime_role::TEXT !~ '^[a-z_][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'reader summary runtime role name is invalid';
  END IF;
  IF v_runtime_role IN (
    current_user,
    'social_monitor_public_schema_owner',
    'social_monitor_reader_summary_publication_owner',
    'social_monitor_reader_summary_publication_runtime'
  ) THEN
    RAISE EXCEPTION 'reader summary runtime and migration roles must be distinct';
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
    OR has_schema_privilege(v_runtime_role, 'public', 'CREATE') THEN
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
  IF v_job_owner <> v_migration_owner OR v_job_owner <> v_outbox_owner
    OR v_job_owner NOT IN (v_runtime_role, v_admin_role) THEN
    RAISE EXCEPTION 'legacy migration tables have an unexpected owner';
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
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE '
      'public._prisma_migrations TO %I',
    v_admin_role
  );
  EXECUTE format(
    'GRANT REFERENCES ON TABLE public.reader_summary_jobs, '
      'public.outbox_events TO %I',
    v_admin_role
  );

  IF v_switched_role THEN
    EXECUTE 'RESET ROLE';
  END IF;
  IF v_temporary_owner_membership THEN
    EXECUTE format(
      'REVOKE social_monitor_reader_summary_publication_owner FROM %I',
      v_job_owner
    );
  END IF;
END
$ownership_transfer$;

DO $ownership_transfer_audit$
DECLARE
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
BEGIN
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
    'social_monitor_reader_summary_publication_owner',
    'MEMBER'
  ) THEN
    RAISE EXCEPTION 'runtime retained temporary publication ownership';
  END IF;
END
$ownership_transfer_audit$;

COMMIT;
