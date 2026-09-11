-- @social-monitor-forward-migration
-- Two fixed lock-only capabilities under the respective existing table owners.
-- No row rewrite; table locks remain coarse across tenants and last until the
-- caller transaction ends. Admission must be quiesced before reverse removal.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL ROLE social_monitor_public_schema_owner;
GRANT USAGE, CREATE ON SCHEMA public TO social_monitor_reader_summary_publication_owner;
RESET ROLE;

SET LOCAL ROLE social_monitor_reader_summary_publication_owner;
CREATE FUNCTION public.lock_reader_summary_refresh_publication_ledgers(
  target_tenant_id uuid, target_workspace_id uuid, target_date date
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  IF target_tenant_id IS NULL OR target_workspace_id IS NULL OR target_date IS NULL
    OR target_tenant_id <> '00000000-0000-7000-8000-000000006101'::uuid
    OR target_workspace_id <> '00000000-0000-7000-8000-000000006102'::uuid
    OR target_date NOT IN (DATE '2026-08-30', DATE '2026-08-31', DATE '2026-09-01',
      DATE '2026-09-02', DATE '2026-09-03', DATE '2026-09-04', DATE '2026-09-05')
    OR pg_catalog.current_setting('social_monitor.tenant_id', true)
      IS DISTINCT FROM target_tenant_id::text
    OR pg_catalog.current_setting('social_monitor.workspace_id', true)
      IS DISTINCT FROM target_workspace_id::text
    OR COALESCE(pg_catalog.current_setting('social_monitor.system_access', true), '')
      NOT IN ('', 'false')
    OR NOT pg_catalog.pg_has_role(session_user,
      'social_monitor_reader_summary_publication_runtime', 'USAGE')
    OR pg_catalog.pg_has_role(session_user, 'social_monitor_reader_summary_publication_owner', 'SET')
    OR pg_catalog.pg_has_role(session_user, 'social_monitor_public_schema_owner', 'SET') THEN
    RAISE EXCEPTION 'refresh lock capability scope denied' USING ERRCODE = '42501';
  END IF;
  LOCK TABLE public.reader_summary_publications, public.reader_summary_publication_slots IN SHARE MODE NOWAIT;
  RETURN true;
END
$function$;
REVOKE ALL ON FUNCTION public.lock_reader_summary_refresh_publication_ledgers(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_reader_summary_refresh_publication_ledgers(uuid, uuid, date)
  TO social_monitor_reader_summary_publication_runtime;
RESET ROLE;

SET LOCAL ROLE social_monitor_public_schema_owner;
CREATE FUNCTION public.lock_reader_summary_refresh_reconciliation(
  target_tenant_id uuid, target_workspace_id uuid, target_date date
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  IF target_tenant_id IS NULL OR target_workspace_id IS NULL OR target_date IS NULL
    OR target_tenant_id <> '00000000-0000-7000-8000-000000006101'::uuid
    OR target_workspace_id <> '00000000-0000-7000-8000-000000006102'::uuid
    OR target_date NOT IN (DATE '2026-08-30', DATE '2026-08-31', DATE '2026-09-01',
      DATE '2026-09-02', DATE '2026-09-03', DATE '2026-09-04', DATE '2026-09-05')
    OR pg_catalog.current_setting('social_monitor.tenant_id', true)
      IS DISTINCT FROM target_tenant_id::text
    OR pg_catalog.current_setting('social_monitor.workspace_id', true)
      IS DISTINCT FROM target_workspace_id::text
    OR COALESCE(pg_catalog.current_setting('social_monitor.system_access', true), '')
      NOT IN ('', 'false')
    OR NOT pg_catalog.pg_has_role(session_user,
      'social_monitor_reader_summary_publication_runtime', 'USAGE')
    OR pg_catalog.pg_has_role(session_user, 'social_monitor_reader_summary_publication_owner', 'SET')
    OR pg_catalog.pg_has_role(session_user, 'social_monitor_public_schema_owner', 'SET') THEN
    RAISE EXCEPTION 'refresh lock capability scope denied' USING ERRCODE = '42501';
  END IF;
  LOCK TABLE public.reader_summary_new_input_refresh_reconciliations IN SHARE MODE NOWAIT;
  RETURN true;
END
$function$;
REVOKE ALL ON FUNCTION public.lock_reader_summary_refresh_reconciliation(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_reader_summary_refresh_reconciliation(uuid, uuid, date)
  TO social_monitor_reader_summary_publication_runtime;
RESET ROLE;

SET LOCAL ROLE social_monitor_public_schema_owner;
REVOKE CREATE ON SCHEMA public FROM social_monitor_reader_summary_publication_owner;
RESET ROLE;

-- Restore append-only ACLs after ownership/bootstrap replay, including grants
-- inherited by either configured login. This changes no rows or triggers.
DO $refresh_reconciliation_acl$
DECLARE
  relation RECORD;
  recipient RECORD;
  column_grant RECORD;
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (
        'reader_summary_new_input_refresh_reconciliations',
        'reader_summary_new_input_refresh_reconciliation_counters')) NOT IN (0, 2) THEN
    RAISE EXCEPTION 'refresh reconciliation inventory is incomplete';
  END IF;
  SET LOCAL ROLE social_monitor_public_schema_owner;
  FOR relation IN
    SELECT c.oid, c.relname, c.relowner, c.relacl, c.relkind
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN (
      'reader_summary_new_input_refresh_reconciliations',
      'reader_summary_new_input_refresh_reconciliation_counters')
  LOOP
    IF relation.relowner <> 'social_monitor_public_schema_owner'::pg_catalog.regrole
      OR relation.relkind <> 'r' THEN
      RAISE EXCEPTION 'refresh reconciliation owner or kind is unsafe';
    END IF;
    EXECUTE pg_catalog.format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', relation.relname);
    FOR recipient IN
      SELECT DISTINCT acl.grantee FROM pg_catalog.aclexplode(relation.relacl) acl
      WHERE acl.grantee <> 0 AND acl.grantee <> relation.relowner
    LOOP
      EXECUTE pg_catalog.format(
        'REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM %I',
        relation.relname, pg_catalog.pg_get_userbyid(recipient.grantee));
    END LOOP;
    FOR column_grant IN
      SELECT a.attname, acl.grantee FROM pg_catalog.pg_attribute a
      CROSS JOIN LATERAL pg_catalog.aclexplode(a.attacl) acl
      WHERE a.attrelid = relation.oid AND acl.grantee <> relation.relowner
        AND acl.privilege_type IN ('UPDATE', 'REFERENCES')
    LOOP
      EXECUTE pg_catalog.format(
        'REVOKE UPDATE (%I), REFERENCES (%I) ON TABLE public.%I FROM %s',
        column_grant.attname, column_grant.attname, relation.relname,
        CASE WHEN column_grant.grantee = 0 THEN 'PUBLIC'
          ELSE pg_catalog.quote_ident(pg_catalog.pg_get_userbyid(column_grant.grantee)) END);
    END LOOP;
    EXECUTE pg_catalog.format('GRANT SELECT, INSERT ON TABLE public.%I TO '
      'social_monitor_reader_summary_publication_runtime', relation.relname);
  END LOOP;
  RESET ROLE;
END
$refresh_reconciliation_acl$;

-- Fail the whole migration on unexpected global/schema default grants or owner
-- drift. Explicit revocation above handles the global PUBLIC EXECUTE default.
DO $refresh_lock_capability_audit$
DECLARE
  capability RECORD;
  routine RECORD;
BEGIN
  IF (SELECT count(*) FROM (VALUES
      ('reader_summary_publications', 'social_monitor_reader_summary_publication_owner'),
      ('reader_summary_publication_slots', 'social_monitor_reader_summary_publication_owner'),
      ('reader_summary_new_input_refresh_reconciliations', 'social_monitor_public_schema_owner'),
      ('reader_summary_new_input_refresh_reconciliation_counters', 'social_monitor_public_schema_owner')
    ) AS expected(name, owner_name)
    JOIN pg_catalog.pg_class c ON c.oid = pg_catalog.to_regclass('public.' || expected.name)
    WHERE c.relowner = expected.owner_name::pg_catalog.regrole AND c.relkind = 'r'
      AND NOT pg_catalog.has_table_privilege('social_monitor_reader_summary_publication_runtime',
        c.oid, 'UPDATE,DELETE,TRUNCATE')
      AND (expected.owner_name = 'social_monitor_public_schema_owner'
        OR NOT pg_catalog.has_table_privilege('social_monitor_reader_summary_publication_runtime',
          c.oid, 'INSERT'))) <> 4 THEN
    RAISE EXCEPTION 'refresh protected relation ownership or runtime write ACL is unsafe';
  END IF;
  FOR capability IN SELECT * FROM (VALUES
    ('lock_reader_summary_refresh_publication_ledgers', 'social_monitor_reader_summary_publication_owner'),
    ('lock_reader_summary_refresh_reconciliation', 'social_monitor_public_schema_owner')
  ) AS expected(name, owner_name)
  LOOP
    SELECT p.* INTO STRICT routine FROM pg_catalog.pg_proc p
    WHERE p.oid = pg_catalog.to_regprocedure(
      'public.' || capability.name || '(uuid,uuid,date)');
    IF routine.proowner <> capability.owner_name::pg_catalog.regrole
      OR NOT routine.prosecdef OR routine.proisstrict
      OR routine.provolatile <> 'v' OR routine.proparallel <> 'u'
      OR routine.prorettype <> 'boolean'::pg_catalog.regtype
      OR routine.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog']::text[]
      OR EXISTS (SELECT 1 FROM pg_catalog.aclexplode(routine.proacl) acl
        WHERE acl.grantee NOT IN (routine.proowner,
          'social_monitor_reader_summary_publication_runtime'::pg_catalog.regrole)
          OR acl.privilege_type <> 'EXECUTE'
          OR (acl.grantee <> routine.proowner AND acl.is_grantable))
      OR NOT pg_catalog.has_function_privilege(
        'social_monitor_reader_summary_publication_runtime', routine.oid, 'EXECUTE')
      OR pg_catalog.pg_has_role('social_monitor_reader_summary_publication_runtime',
        capability.owner_name, 'MEMBER')
      OR pg_catalog.pg_has_role('social_monitor_reader_summary_publication_runtime',
        capability.owner_name, 'SET') THEN
      RAISE EXCEPTION 'refresh lock capability ACL or owner is unsafe';
    END IF;
  END LOOP;
END
$refresh_lock_capability_audit$;
COMMIT;
