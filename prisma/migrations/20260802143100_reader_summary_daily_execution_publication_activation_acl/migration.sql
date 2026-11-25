-- @social-monitor-forward-migration
-- Release B ACL: admit only the daily terminal after activation is fail-closed.
-- Lock risk: ACL/catalog updates only; no table scan or explicit table lock.
BEGIN;
SET LOCAL search_path = pg_catalog;

-- Bootstrap owns this PG18 role lifecycle, so the forward migration never
-- creates the definer. The one upstream-superuser creator-admin edge for this
-- migrator is durable (ADMIN, NOINHERIT, NOSET): GRANTED BY CURRENT_USER
-- cannot remove it, and every other membership fails.
DO $validate_daily_publication_definer_bootstrap$
DECLARE
  v_definer pg_catalog.pg_roles%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_definer
  FROM pg_catalog.pg_roles
  WHERE rolname = 'social_monitor_reader_summary_daily_publication_definer';

  IF v_definer.rolcanlogin OR v_definer.rolsuper
    OR v_definer.rolcreatedb OR v_definer.rolcreaterole
    OR v_definer.rolinherit OR v_definer.rolreplication
    OR v_definer.rolbypassrls OR v_definer.rolconfig IS NOT NULL THEN
    RAISE EXCEPTION 'daily activation definer role is unsafe';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.member = v_definer.oid
  ) THEN
    RAISE EXCEPTION 'daily activation definer has an outgoing membership';
  END IF;
  IF (
    SELECT count(*) <> 1
      OR count(*) FILTER (
        WHERE member.rolname = session_user
          AND grantor.rolsuper
          AND membership.admin_option
          AND NOT membership.inherit_option
          AND NOT membership.set_option
      ) <> 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
    WHERE membership.roleid = v_definer.oid
  ) THEN
    RAISE EXCEPTION 'daily activation definer PG18 bootstrap membership is unsafe';
  END IF;
END
$validate_daily_publication_definer_bootstrap$;

DO $validate_daily_activation_principals$
DECLARE
  v_schema_owner RECORD;
  v_terminal RECORD;
BEGIN
  SELECT * INTO STRICT v_schema_owner
  FROM pg_catalog.pg_roles
  WHERE rolname = 'social_monitor_public_schema_owner';
  SELECT * INTO STRICT v_terminal
  FROM pg_catalog.pg_roles
  WHERE rolname = 'social_monitor_reader_summary_daily_terminal';

  IF v_schema_owner.rolcanlogin OR v_schema_owner.rolsuper
    OR v_schema_owner.rolcreatedb OR v_schema_owner.rolcreaterole
    OR v_schema_owner.rolreplication OR v_schema_owner.rolbypassrls THEN
    RAISE EXCEPTION 'daily activation schema owner is unsafe';
  END IF;
  IF NOT v_terminal.rolcanlogin OR v_terminal.rolinherit
    OR v_terminal.rolsuper OR v_terminal.rolcreatedb
    OR v_terminal.rolcreaterole OR v_terminal.rolreplication
    OR v_terminal.rolbypassrls THEN
    RAISE EXCEPTION 'daily activation terminal LOGIN is unsafe';
  END IF;
END
$validate_daily_activation_principals$;

DO $grant_daily_activation_definer_set$
BEGIN
  EXECUTE pg_catalog.format(
    'GRANT social_monitor_reader_summary_daily_publication_definer TO %I '
      'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER',
    session_user
  );
END
$grant_daily_activation_definer_set$;

SET LOCAL ROLE social_monitor_public_schema_owner;
GRANT CREATE ON SCHEMA public
TO social_monitor_reader_summary_daily_publication_definer;
RESET ROLE;

DO $transfer_daily_activation_function_owner$
DECLARE
  v_function REGPROCEDURE;
  v_old_owner NAME;
  v_schema_owner_has_temporary_definer_set BOOLEAN := FALSE;
BEGIN
  FOREACH v_function IN ARRAY ARRAY[
    'public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character)'::REGPROCEDURE,
    'public.finalize_reader_summary_daily_publication(uuid,uuid,date,text,bigint,timestamp with time zone,uuid,uuid,uuid,character,character,character,bytea,character,bytea,character)'::REGPROCEDURE
  ] LOOP
    SELECT owner.rolname INTO STRICT v_old_owner
    FROM pg_catalog.pg_proc AS proc
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = proc.proowner
    WHERE proc.oid = v_function;

    IF v_old_owner =
      'social_monitor_reader_summary_daily_publication_definer' THEN
      CONTINUE;
    END IF;
    IF v_old_owner <> 'social_monitor_public_schema_owner' THEN
      RAISE EXCEPTION
        'daily activation function has an unexpected predecessor owner: %',
        v_old_owner;
    END IF;
    IF NOT pg_catalog.pg_has_role(
      session_user, v_old_owner, 'SET'
    ) THEN
      RAISE EXCEPTION 'migration admin cannot SET the daily activation owner';
    END IF;
    IF pg_catalog.pg_has_role(
      v_old_owner,
      'social_monitor_reader_summary_daily_publication_definer',
      'MEMBER'
    ) AND NOT v_schema_owner_has_temporary_definer_set THEN
      RAISE EXCEPTION
        'daily activation predecessor owner has definer membership';
    END IF;

    IF NOT v_schema_owner_has_temporary_definer_set THEN
      EXECUTE
        'GRANT social_monitor_reader_summary_daily_publication_definer '
        'TO social_monitor_public_schema_owner '
        'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER';
      v_schema_owner_has_temporary_definer_set := TRUE;
    END IF;
    EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_old_owner);
    EXECUTE pg_catalog.format(
      'ALTER FUNCTION %s OWNER TO '
        'social_monitor_reader_summary_daily_publication_definer',
      v_function
    );
    EXECUTE 'RESET ROLE';
  END LOOP;
END
$transfer_daily_activation_function_owner$;

SET LOCAL ROLE "social_monitor_reader_summary_daily_publication_definer";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
REVOKE ALL PRIVILEGES ON FUNCTION
  public."complete_reader_summary_daily_model_job"(
    UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR(64), JSONB,
    BYTEA, CHAR(64), BYTEA, CHAR(64)),
  public."finalize_reader_summary_daily_publication"(
    UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, UUID, UUID, UUID,
    CHAR(64), CHAR(64), CHAR(64), BYTEA, CHAR(64), BYTEA, CHAR(64))
FROM PUBLIC,
  "social_monitor_public_schema_owner",
  "social_monitor_reader_summary_publication_owner",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime",
  "social_monitor_reader_summary_daily_terminal";
GRANT EXECUTE ON FUNCTION
  public."complete_reader_summary_daily_model_job"(
    UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, BYTEA, CHAR(64), JSONB,
    BYTEA, CHAR(64), BYTEA, CHAR(64)),
  public."finalize_reader_summary_daily_publication"(
    UUID, UUID, DATE, TEXT, BIGINT, TIMESTAMPTZ, UUID, UUID, UUID,
    CHAR(64), CHAR(64), CHAR(64), BYTEA, CHAR(64), BYTEA, CHAR(64))
TO "social_monitor_reader_summary_daily_terminal";
RESET ROLE;

DO $revoke_daily_activation_definer_set$
BEGIN
  EXECUTE
    'REVOKE social_monitor_reader_summary_daily_publication_definer '
    'FROM social_monitor_public_schema_owner GRANTED BY CURRENT_USER';
  EXECUTE pg_catalog.format(
    'REVOKE social_monitor_reader_summary_daily_publication_definer FROM %I '
      'GRANTED BY CURRENT_USER',
    session_user
  );
END
$revoke_daily_activation_definer_set$;

-- Apply durable ACLs only after every temporary definer SET edge is gone.
SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_daily_publication_definer";
RESET ROLE;

DO $grant_daily_activation_cursor_model_acl$
DECLARE
  v_cursor_owner NAME;
  v_model_owner NAME;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(relation.relowner)
  INTO STRICT v_cursor_owner
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid =
    'public.reader_summary_daily_execution_cursors'::REGCLASS;

  SELECT pg_catalog.pg_get_userbyid(relation.relowner)
  INTO STRICT v_model_owner
  FROM pg_catalog.pg_class AS relation
  WHERE relation.oid = 'public.reader_summary_daily_model_jobs'::REGCLASS;

  IF v_cursor_owner IS DISTINCT FROM v_model_owner THEN
    RAISE EXCEPTION
      'daily activation cursor/model relations have different owners: %, %',
      v_cursor_owner,
      v_model_owner;
  END IF;
  IF NOT pg_catalog.pg_has_role(session_user, v_cursor_owner, 'SET') THEN
    RAISE EXCEPTION
      'migration admin cannot SET the daily activation cursor/model owner';
  END IF;

  EXECUTE pg_catalog.format('SET LOCAL ROLE %I', v_cursor_owner);
REVOKE ALL PRIVILEGES ON TABLE
  public."reader_summary_daily_execution_cursors",
  public."reader_summary_daily_model_jobs"
FROM "social_monitor_reader_summary_daily_publication_definer";
GRANT SELECT, UPDATE ON TABLE
  public."reader_summary_daily_execution_cursors",
  public."reader_summary_daily_model_jobs"
TO "social_monitor_reader_summary_daily_publication_definer";
  EXECUTE 'RESET ROLE';
END
$grant_daily_activation_cursor_model_acl$;

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE ALL PRIVILEGES ON TABLE public."reader_summary_jobs"
FROM "social_monitor_reader_summary_daily_publication_definer";
GRANT SELECT ON TABLE public."reader_summary_jobs"
TO "social_monitor_reader_summary_daily_publication_definer";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
REVOKE ALL PRIVILEGES ON TABLE
  public."reader_summary_artifacts",
  public."reader_summary_publications",
  public."reader_summary_weekly_publication_evidence"
FROM "social_monitor_reader_summary_daily_publication_definer";
GRANT SELECT ON TABLE
  public."reader_summary_artifacts",
  public."reader_summary_publications",
  public."reader_summary_weekly_publication_evidence"
TO "social_monitor_reader_summary_daily_publication_definer";
RESET ROLE;

-- The ordinary schema owner may remain the relowner after a bootstrap replay,
-- but it is no longer a SECURITY DEFINER owner here.
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_daily_publication_definer";
RESET ROLE;

DO $audit_daily_activation_acl$
DECLARE
  v_definer_oid OID :=
    'social_monitor_reader_summary_daily_publication_definer'::REGROLE::OID;
  v_schema_owner_oid OID :=
    'social_monitor_public_schema_owner'::REGROLE::OID;
  v_terminal_oid OID :=
    'social_monitor_reader_summary_daily_terminal'::REGROLE::OID;
  v_function REGPROCEDURE;
  v_table REGCLASS;
  v_relation_diagnostics TEXT;
  v_outgoing_memberships TEXT;
  v_incoming_memberships TEXT;
BEGIN
  SELECT pg_catalog.string_agg(
    pg_catalog.format(
      '%s(relowner=%s, bypassrls=%s, definer_member=%s, '
      'definer_usage=%s, definer_set=%s)',
      relation.relname,
      owner.rolname,
      owner.rolbypassrls,
      pg_catalog.pg_has_role(
        'social_monitor_reader_summary_daily_publication_definer',
        owner.rolname,
        'MEMBER'
      ),
      pg_catalog.pg_has_role(
        'social_monitor_reader_summary_daily_publication_definer',
        owner.rolname,
        'USAGE'
      ),
      pg_catalog.pg_has_role(
        'social_monitor_reader_summary_daily_publication_definer',
        owner.rolname,
        'SET'
      )
    ),
    '; ' ORDER BY relation.relname
  ) INTO v_relation_diagnostics
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
  WHERE namespace.nspname = 'public'
    AND relation.relname = ANY(ARRAY[
      'reader_summary_daily_execution_cursors',
      'reader_summary_daily_model_jobs'
    ]);

  SELECT pg_catalog.string_agg(
    pg_catalog.format(
      '%s->%s(admin=%s, inherit=%s, set=%s, grantor=%s)',
      member.rolname,
      granted.rolname,
      membership.admin_option,
      membership.inherit_option,
      membership.set_option,
      grantor.rolname
    ),
    '; ' ORDER BY granted.rolname, grantor.rolname
  ) INTO v_outgoing_memberships
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
  JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
  WHERE membership.member = v_definer_oid;

  SELECT pg_catalog.string_agg(
    pg_catalog.format(
      '%s->%s(admin=%s, inherit=%s, set=%s, grantor=%s)',
      member.rolname,
      granted.rolname,
      membership.admin_option,
      membership.inherit_option,
      membership.set_option,
      grantor.rolname
    ),
    '; ' ORDER BY member.rolname, grantor.rolname
  ) INTO v_incoming_memberships
  FROM pg_catalog.pg_auth_members AS membership
  JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
  JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
  JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
  WHERE membership.roleid = v_definer_oid;

  IF (
    SELECT count(*) <> 1
      OR count(*) FILTER (
        WHERE member.rolname = session_user
          AND grantor.rolsuper
          AND membership.admin_option
          AND NOT membership.inherit_option
          AND NOT membership.set_option
      ) <> 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
    WHERE membership.roleid = v_definer_oid
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles AS definer
    WHERE definer.oid = v_definer_oid
      AND (
        definer.rolcanlogin OR definer.rolsuper
        OR definer.rolcreatedb OR definer.rolcreaterole
        OR definer.rolinherit OR definer.rolreplication
        OR definer.rolbypassrls OR definer.rolconfig IS NOT NULL
      )
  ) OR v_outgoing_memberships IS NOT NULL THEN
    RAISE EXCEPTION
      'daily activation definer role or memberships are unsafe '
      '(outgoing=%, incoming=%)',
      COALESCE(v_outgoing_memberships, '<none>'),
      COALESCE(v_incoming_memberships, '<none>');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_roles AS owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY(ARRAY[
        'reader_summary_daily_execution_cursors',
        'reader_summary_daily_model_jobs'
      ])
      AND (
        relation.relowner = v_definer_oid
        OR owner.rolbypassrls
        OR pg_catalog.pg_has_role(
          'social_monitor_reader_summary_daily_publication_definer',
          owner.rolname,
          'MEMBER'
        )
        OR pg_catalog.pg_has_role(
          'social_monitor_reader_summary_daily_publication_definer',
          owner.rolname,
          'USAGE'
        )
        OR pg_catalog.pg_has_role(
          'social_monitor_reader_summary_daily_publication_definer',
          owner.rolname,
          'SET'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'daily activation definer can reach a protected relation owner: %',
      COALESCE(v_relation_diagnostics, '<missing daily relations>');
  END IF;

  IF pg_catalog.has_schema_privilege(
    'social_monitor_reader_summary_daily_publication_definer', 'public', 'CREATE'
  ) OR NOT pg_catalog.has_schema_privilege(
    'social_monitor_reader_summary_daily_publication_definer', 'public', 'USAGE'
  ) THEN
    RAISE EXCEPTION 'daily activation definer schema boundary is unsafe';
  END IF;

  IF pg_catalog.has_schema_privilege(
    'social_monitor_reader_summary_publication_owner', 'public', 'CREATE'
  ) OR pg_catalog.has_schema_privilege(
    'social_monitor_reader_summary_publication_runtime', 'public', 'CREATE'
  ) OR pg_catalog.has_schema_privilege(
    'social_monitor_tenant_system_runtime', 'public', 'CREATE'
  ) OR pg_catalog.has_schema_privilege(
    'social_monitor_reader_summary_daily_terminal', 'public', 'CREATE'
  ) THEN
    RAISE EXCEPTION 'daily activation retained broad public schema CREATE';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.complete_reader_summary_daily_model_job(uuid,uuid,date,text,bigint,timestamp with time zone,bytea,character,jsonb,bytea,character,bytea,character)'::REGPROCEDURE,
    'public.finalize_reader_summary_daily_publication(uuid,uuid,date,text,bigint,timestamp with time zone,uuid,uuid,uuid,character,character,character,bytea,character,bytea,character)'::REGPROCEDURE
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc
      WHERE proc.oid = v_function
        AND proc.proowner = v_definer_oid
        AND proc.prosecdef
        AND proc.provolatile = 'v'
        AND proc.proconfig = ARRAY['search_path=pg_catalog']::TEXT[]
    ) THEN
      RAISE EXCEPTION 'daily activation function metadata is unsafe';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc AS proc
      CROSS JOIN LATERAL pg_catalog.aclexplode(proc.proacl) AS acl
      WHERE proc.oid = v_function
        AND acl.privilege_type = 'EXECUTE'
        AND acl.grantee NOT IN (v_definer_oid, v_terminal_oid)
    ) OR NOT pg_catalog.has_function_privilege(
      v_terminal_oid, v_function, 'EXECUTE'
    ) THEN
      RAISE EXCEPTION 'daily activation EXECUTE ACL is not terminal-only';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS defaults
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(defaults.defaclacl) AS acl
    WHERE defaults.defaclrole IN (v_definer_oid, v_schema_owner_oid)
      AND defaults.defaclobjtype = 'f'
      AND namespace.nspname = 'public'
      AND acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'daily activation function defaults admit PUBLIC EXECUTE';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'public.reader_summary_daily_execution_cursors'::REGCLASS,
    'public.reader_summary_daily_model_jobs'::REGCLASS
  ] LOOP
    IF NOT pg_catalog.has_table_privilege(
      'social_monitor_reader_summary_daily_publication_definer',
      v_table,
      'SELECT,UPDATE'
    ) OR pg_catalog.has_table_privilege(
      'social_monitor_reader_summary_daily_publication_definer',
      v_table,
      'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) THEN
      RAISE EXCEPTION
        'daily activation definer effective cursor/model ACL is unsafe: %',
        v_table;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'public.reader_summary_artifacts'::REGCLASS,
    'public.reader_summary_publications'::REGCLASS,
    'public.reader_summary_weekly_publication_evidence'::REGCLASS,
    'public.reader_summary_jobs'::REGCLASS
  ] LOOP
    IF NOT pg_catalog.has_table_privilege(
      'social_monitor_reader_summary_daily_publication_definer', v_table, 'SELECT'
    ) OR pg_catalog.has_table_privilege(
      'social_monitor_reader_summary_daily_publication_definer', v_table,
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) OR NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid = v_table
        AND relation.relrowsecurity
        AND relation.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'daily activation definer read or RLS boundary is unsafe';
    END IF;
  END LOOP;
END
$audit_daily_activation_acl$;

COMMIT;
