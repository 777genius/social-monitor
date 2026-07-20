\set ON_ERROR_STOP on

SELECT set_config(
  'social_monitor.bootstrap_runtime_role',
  :'runtime_role',
  false
);
SELECT set_config(
  'social_monitor.bootstrap_migrator_role',
  current_user,
  false
);

-- The migrator receives CREATE WITH GRANT OPTION only inside the committed pre
-- phase so Prisma can apply the ordered migration. Remove it as the dedicated
-- schema owner before auditing the runtime boundary.
SET ROLE social_monitor_public_schema_owner;
REVOKE CREATE ON SCHEMA public
FROM pg_database_owner,
  PUBLIC,
  social_monitor_reader_summary_publication_owner,
  social_monitor_reader_summary_publication_runtime,
  :"runtime_role"
CASCADE;
DO $revoke_migrator_schema_create$
BEGIN
  EXECUTE format(
    'REVOKE CREATE ON SCHEMA public FROM %I CASCADE',
    current_setting('social_monitor.bootstrap_migrator_role')::NAME
  );
END
$revoke_migrator_schema_create$;
RESET ROLE;

-- Protected object ACLs can only be repaired as their NOLOGIN owner. The
-- migrator has SET but deliberately does not inherit this role.
SET ROLE social_monitor_reader_summary_publication_owner;
REVOKE ALL PRIVILEGES ON TABLE
  public.reader_summary_publications,
  public.reader_summary_publication_slots,
  public.reader_summary_artifacts
FROM :"runtime_role";
REVOKE ALL PRIVILEGES ON FUNCTION
  public.reader_summary_model_authority_rank(text),
  public.publish_reader_summary(jsonb),
  public.guard_reader_summary_publication_insert(),
  public.reject_reader_summary_publication_mutation(),
  public.guard_published_reader_summary_artifact_update(),
  public.guard_reader_summary_active_slot_update()
FROM :"runtime_role";
RESET ROLE;

DO $bootstrap$
DECLARE
  v_runtime_role NAME := current_setting(
    'social_monitor.bootstrap_runtime_role'
  )::NAME;
  v_owner_count INTEGER;
  v_trigger_count INTEGER;
  v_function RECORD;
  v_role RECORD;
BEGIN
  -- Remove any direct authority retained from an older runtime-owned schema.
  -- The application receives only the audited capability-role grants.
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

  SELECT * INTO v_role FROM pg_roles
  WHERE rolname = 'social_monitor_public_schema_owner';
  IF NOT FOUND OR v_role.rolcanlogin OR v_role.rolsuper
    OR v_role.rolcreatedb OR v_role.rolcreaterole OR v_role.rolinherit
    OR v_role.rolreplication OR v_role.rolbypassrls THEN
    RAISE EXCEPTION 'public schema owner role is unsafe';
  END IF;
  IF (
    SELECT pg_get_userbyid(namespace.nspowner)
    FROM pg_namespace namespace
    WHERE namespace.nspname = 'public'
  ) <> 'social_monitor_public_schema_owner' THEN
    RAISE EXCEPTION 'public schema has an unsafe owner';
  END IF;
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
        OR grantee.rolname <> 'social_monitor_public_schema_owner'
      )
  ) THEN
    RAISE EXCEPTION 'public schema retains an unreviewed CREATE grant';
  END IF;

  SELECT count(*) INTO v_owner_count
  FROM pg_class relation
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_roles owner ON owner.oid = relation.relowner
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'reader_summary_artifacts',
      'reader_summary_publications',
      'reader_summary_publication_slots'
    )
    AND owner.rolname =
      'social_monitor_reader_summary_publication_owner';
  IF v_owner_count <> 3 THEN
    RAISE EXCEPTION 'protected reader summary tables have unsafe owners';
  END IF;

  SELECT count(*) INTO v_owner_count
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_roles owner ON owner.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname IN (
      'reader_summary_model_authority_rank',
      'publish_reader_summary',
      'guard_reader_summary_publication_insert',
      'reject_reader_summary_publication_mutation',
      'guard_published_reader_summary_artifact_update',
      'guard_reader_summary_active_slot_update'
    )
    AND owner.rolname =
      'social_monitor_reader_summary_publication_owner';
  IF v_owner_count <> 6 THEN
    RAISE EXCEPTION 'reader summary publication functions have unsafe owners';
  END IF;

  SELECT procedure.prosecdef, procedure.proconfig INTO v_function
  FROM pg_proc procedure
  WHERE procedure.oid = 'public.publish_reader_summary(jsonb)'::REGPROCEDURE;
  IF NOT v_function.prosecdef
    OR v_function.proconfig IS NULL
    OR v_function.proconfig <>
      ARRAY['search_path=pg_catalog, public, pg_temp']::TEXT[] THEN
    RAISE EXCEPTION 'publication function SECURITY DEFINER path is unsafe';
  END IF;

  SELECT count(*) INTO v_trigger_count
  FROM pg_trigger trigger
  JOIN pg_class relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relname IN (
      'reader_summary_artifacts',
      'reader_summary_publications',
      'reader_summary_publication_slots'
    )
    AND trigger.tgname IN (
      'reader_summary_artifacts_published_immutable',
      'reader_summary_publications_insert_guarded',
      'reader_summary_publications_immutable',
      'reader_summary_publication_slots_guarded'
    )
    -- ROW | BEFORE | INSERT | UPDATE. Exact equality excludes the DELETE,
    -- TRUNCATE, and INSTEAD OF bits from the artifact guard.
    AND (
      trigger.tgname <> 'reader_summary_artifacts_published_immutable'
      OR (
        relation.relname = 'reader_summary_artifacts'
        AND trigger.tgtype = 23
        AND trigger.tgfoid =
          'public.guard_published_reader_summary_artifact_update()'::REGPROCEDURE
      )
    )
    AND trigger.tgenabled = 'O';
  IF v_trigger_count <> 4 THEN
    RAISE EXCEPTION 'reader summary publication triggers are not enforced';
  END IF;

  IF pg_has_role(
    v_runtime_role,
    'social_monitor_reader_summary_publication_owner',
    'MEMBER'
  ) OR pg_has_role(
    v_runtime_role,
    'social_monitor_public_schema_owner',
    'MEMBER'
  ) OR NOT pg_has_role(
    v_runtime_role,
    'social_monitor_reader_summary_publication_runtime',
    'MEMBER'
  ) OR pg_has_role(
    'social_monitor_reader_summary_publication_runtime',
    'social_monitor_reader_summary_publication_owner',
    'MEMBER'
  ) OR EXISTS (
    SELECT 1
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
    WHERE granted.rolname =
      'social_monitor_reader_summary_publication_runtime'
      AND member.rolname NOT IN (v_runtime_role, current_user)
  ) OR has_schema_privilege(v_runtime_role, 'public', 'CREATE')
    OR has_schema_privilege(
      'social_monitor_reader_summary_publication_owner',
      'public',
      'CREATE'
  ) THEN
    RAISE EXCEPTION 'runtime role can bypass publication ownership';
  END IF;
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

  IF NOT has_table_privilege(
    v_runtime_role, 'public.reader_summary_publications', 'SELECT'
  ) OR NOT has_table_privilege(
    v_runtime_role, 'public.reader_summary_publication_slots', 'SELECT'
  ) OR has_table_privilege(
    v_runtime_role, 'public.reader_summary_publications',
    'INSERT,UPDATE,DELETE,TRUNCATE'
  ) OR has_table_privilege(
    v_runtime_role, 'public.reader_summary_publication_slots',
    'INSERT,UPDATE,DELETE,TRUNCATE'
  ) THEN
    RAISE EXCEPTION 'runtime publication-table privileges are unsafe';
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
  ) OR NOT has_table_privilege(
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
    RAISE EXCEPTION 'runtime reader-summary artifact privileges are unsafe';
  END IF;

  IF NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.reader_summary_jobs',
    'SELECT'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.reader_summary_jobs',
    'UPDATE'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.outbox_events',
    'SELECT'
  ) OR NOT has_table_privilege(
    'social_monitor_reader_summary_publication_owner',
    'public.outbox_events',
    'INSERT'
  ) THEN
    RAISE EXCEPTION 'publication owner base-table grants are incomplete';
  END IF;

  IF NOT has_function_privilege(
    v_runtime_role, 'public.publish_reader_summary(jsonb)', 'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.guard_reader_summary_active_slot_update()',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.guard_published_reader_summary_artifact_update()',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.reader_summary_model_authority_rank(text)',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.guard_reader_summary_publication_insert()',
    'EXECUTE'
  ) OR has_function_privilege(
    v_runtime_role,
    'public.reject_reader_summary_publication_mutation()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'runtime publication-function privileges are unsafe';
  END IF;
END
$bootstrap$;
