-- @social-monitor-forward-migration
-- Lock risk: ACL/catalog updates only; no explicit table locks or data scan.
-- Forward fix: a later migration must tighten these named grants in place.
-- Backfill: none. Runtime: constant catalog work. Apply after LOGIN bootstrap.
BEGIN;

DO $validate_daily_terminal_login$
DECLARE
  v_terminal_role CONSTANT NAME :=
    'social_monitor_reader_summary_daily_terminal';
  v_terminal RECORD;
BEGIN
  SELECT * INTO v_terminal
  FROM pg_catalog.pg_roles
  WHERE rolname = v_terminal_role;
  IF NOT FOUND OR NOT v_terminal.rolcanlogin OR v_terminal.rolinherit
    OR v_terminal.rolsuper OR v_terminal.rolcreatedb
    OR v_terminal.rolcreaterole OR v_terminal.rolreplication
    OR v_terminal.rolbypassrls
    OR v_terminal.rolconfig IS DISTINCT FROM
      ARRAY['search_path=pg_catalog, public']::TEXT[] THEN
    RAISE EXCEPTION 'daily terminal runtime LOGIN is missing or unsafe';
  END IF;
  IF (
    SELECT count(*) > 1 OR count(*) <> count(*) FILTER (
      WHERE member.rolname = current_user
        AND grantor.rolsuper
        AND membership.admin_option
        AND NOT membership.inherit_option
        AND NOT membership.set_option
    )
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
    WHERE membership.roleid = v_terminal.oid
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members membership
    WHERE membership.member = v_terminal.oid
  ) THEN
    RAISE EXCEPTION 'daily terminal runtime LOGIN memberships are unsafe';
  END IF;
END
$validate_daily_terminal_login$;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
DO $replace_daily_terminal_session_guard$
DECLARE
  v_definition TEXT;
  v_new CONSTANT TEXT :=
    'OR session_user <> ''social_monitor_reader_summary_daily_terminal''';
  v_old CONSTANT TEXT := $guard$OR NOT pg_has_role(
      session_user,
      'social_monitor_reader_summary_publication_runtime',
      'USAGE'
    )$guard$;
  v_signature REGPROCEDURE;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)'
      ::REGPROCEDURE,
    'public.finalize_reader_summary_daily_terminal(uuid,uuid,date,text,text,text,bigint)'
      ::REGPROCEDURE
  ] LOOP
    SELECT pg_catalog.pg_get_functiondef(v_signature)
    INTO STRICT v_definition;
    IF (length(v_definition) - length(replace(v_definition, v_old, '')))
        / length(v_old) <> 1
      OR strpos(v_definition, v_new) <> 0 THEN
      RAISE EXCEPTION 'daily terminal session guard has unexpected definition';
    END IF;
    EXECUTE replace(v_definition, v_old, v_new);
  END LOOP;
END
$replace_daily_terminal_session_guard$;

REVOKE ALL PRIVILEGES ON TABLE
  public.reader_summary_artifacts,
  public.reader_summary_publications,
  public.reader_summary_publication_slots,
  public.reader_summary_weekly_publication_evidence
FROM social_monitor_reader_summary_publication_runtime,
  social_monitor_reader_summary_daily_terminal;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.reader_summary_artifacts
TO social_monitor_reader_summary_publication_runtime;
GRANT SELECT ON TABLE
  public.reader_summary_publications,
  public.reader_summary_publication_slots,
  public.reader_summary_weekly_publication_evidence
TO social_monitor_reader_summary_publication_runtime;
GRANT SELECT ON TABLE
  public.reader_summary_artifacts,
  public.reader_summary_publications,
  public.reader_summary_publication_slots,
  public.reader_summary_weekly_publication_evidence
TO social_monitor_reader_summary_daily_terminal;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.reader_summary_daily_terminal_authority(UUID, UUID, DATE),
  public.claim_reader_summary_daily_terminal(UUID, UUID, UUID, TEXT),
  public.finalize_reader_summary_daily_terminal(
    UUID, UUID, DATE, TEXT, TEXT, TEXT, BIGINT
  ),
  public.publish_reader_summary(JSONB),
  public.publish_reader_summary_legacy_v1(JSONB),
  public.publish_reader_summary_pre_evidence(JSONB),
  public.record_reader_summary_weekly_publication_evidence(UUID)
FROM social_monitor_reader_summary_daily_terminal;
REVOKE ALL PRIVILEGES ON FUNCTION
  public.claim_reader_summary_daily_terminal(UUID, UUID, UUID, TEXT),
  public.finalize_reader_summary_daily_terminal(
    UUID, UUID, DATE, TEXT, TEXT, TEXT, BIGINT
  )
FROM social_monitor_reader_summary_publication_runtime;
GRANT EXECUTE ON FUNCTION
  public.claim_reader_summary_daily_terminal(UUID, UUID, UUID, TEXT),
  public.finalize_reader_summary_daily_terminal(
    UUID, UUID, DATE, TEXT, TEXT, TEXT, BIGINT
  )
TO social_monitor_reader_summary_daily_terminal;
RESET ROLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
REVOKE ALL PRIVILEGES ON TABLE public.reader_summary_jobs
FROM social_monitor_reader_summary_publication_runtime,
  social_monitor_reader_summary_daily_terminal;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reader_summary_jobs
TO social_monitor_reader_summary_publication_runtime;
GRANT USAGE ON SCHEMA public
TO social_monitor_reader_summary_daily_terminal;
REVOKE CREATE ON SCHEMA public
FROM social_monitor_reader_summary_daily_terminal;
RESET ROLE;

DO $audit_daily_terminal_capability$
DECLARE
  v_terminal_role CONSTANT NAME :=
    'social_monitor_reader_summary_daily_terminal';
  v_terminal_oid OID := v_terminal_role::REGROLE::OID;
  v_function REGPROCEDURE;
  v_table REGCLASS;
BEGIN
  IF (
    SELECT count(*) > 1 OR count(*) <> count(*) FILTER (
      WHERE member.rolname = current_user
        AND grantor.rolsuper
        AND membership.admin_option
        AND NOT membership.inherit_option
        AND NOT membership.set_option
    )
    FROM pg_catalog.pg_auth_members membership
    JOIN pg_catalog.pg_roles member ON member.oid = membership.member
    JOIN pg_catalog.pg_roles grantor ON grantor.oid = membership.grantor
    WHERE membership.roleid = v_terminal_oid
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members membership
    WHERE membership.member = v_terminal_oid
  ) OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'social_monitor_reader_summary_publication_runtime'::NAME,
      'social_monitor_tenant_system_runtime'::NAME
    ]) ordinary(name)
    CROSS JOIN unnest(ARRAY['MEMBER', 'USAGE', 'SET']) capability(name)
    WHERE pg_catalog.pg_has_role(
      ordinary.name,
      v_terminal_role,
      capability.name
    )
  ) THEN
    RAISE EXCEPTION 'daily terminal role separation is unsafe';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'public.reader_summary_jobs'::REGCLASS,
    'public.reader_summary_artifacts'::REGCLASS
  ] LOOP
    IF NOT has_table_privilege(
      'social_monitor_reader_summary_publication_runtime',
      v_table,
      'SELECT,INSERT,UPDATE,DELETE'
    ) OR has_table_privilege(
      'social_monitor_reader_summary_publication_runtime',
      v_table,
      'TRUNCATE,REFERENCES,TRIGGER'
    ) THEN
      RAISE EXCEPTION 'ordinary runtime CRUD authority is incomplete';
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'public.reader_summary_publications'::REGCLASS,
    'public.reader_summary_publication_slots'::REGCLASS,
    'public.reader_summary_weekly_publication_evidence'::REGCLASS
  ] LOOP
    IF NOT has_table_privilege(
      'social_monitor_reader_summary_publication_runtime',
      v_table,
      'SELECT'
    ) OR has_table_privilege(
      'social_monitor_reader_summary_publication_runtime',
      v_table,
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) THEN
      RAISE EXCEPTION 'ordinary runtime evidence reads are unsafe';
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'public.reader_summary_artifacts'::REGCLASS,
    'public.reader_summary_publications'::REGCLASS,
    'public.reader_summary_publication_slots'::REGCLASS,
    'public.reader_summary_weekly_publication_evidence'::REGCLASS
  ] LOOP
    IF NOT has_table_privilege(v_terminal_role, v_table, 'SELECT')
      OR has_table_privilege(
        v_terminal_role,
        v_table,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      ) THEN
      RAISE EXCEPTION 'daily terminal evidence authority is unsafe';
    END IF;
  END LOOP;
  IF has_table_privilege(
    v_terminal_role,
    'public.reader_summary_jobs',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) OR EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'reader_summary_production_recovery_leases',
      'reader_summary_production_recovery_days',
      'reader_summary_production_recovery_dry_runs',
      'reader_summary_recovery_receipts',
      'reader_summary_weekly_certification_seals'
    ]) protected_table(name)
    WHERE has_table_privilege(
      v_terminal_role,
      'public.' || protected_table.name,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
  ) THEN
    RAISE EXCEPTION 'daily terminal protected table authority is unsafe';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.claim_reader_summary_daily_terminal(uuid,uuid,uuid,text)'
      ::REGPROCEDURE,
    'public.finalize_reader_summary_daily_terminal(uuid,uuid,date,text,text,text,bigint)'
      ::REGPROCEDURE
  ] LOOP
    IF NOT has_function_privilege(v_terminal_role, v_function, 'EXECUTE')
      OR has_function_privilege(
        'social_monitor_reader_summary_publication_runtime',
        v_function,
        'EXECUTE'
      ) OR NOT (
        SELECT procedure.prosecdef
          AND procedure.proconfig =
            ARRAY['search_path=pg_catalog, public']::TEXT[]
          AND pg_catalog.pg_get_functiondef(procedure.oid)
            !~* 'LOCK[[:space:]]+TABLE'
          AND pg_catalog.pg_get_functiondef(procedure.oid)
            ~* 'ORDER BY[\s\S]+FOR (UPDATE|SHARE)'
        FROM pg_catalog.pg_proc procedure
        WHERE procedure.oid = v_function
      ) THEN
      RAISE EXCEPTION 'daily terminal function authority is unsafe';
    END IF;
  END LOOP;
  IF has_function_privilege(
    v_terminal_role,
    'public.reader_summary_daily_terminal_authority(uuid,uuid,date)',
    'EXECUTE'
  ) OR has_function_privilege(
    v_terminal_role,
    'public.publish_reader_summary(jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'daily terminal internal or weekly execute is unsafe';
  END IF;
END
$audit_daily_terminal_capability$;

COMMIT;
