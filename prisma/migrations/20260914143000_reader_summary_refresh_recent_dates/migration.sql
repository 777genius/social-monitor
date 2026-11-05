-- @social-monitor-forward-migration
-- Extend the two existing lock-only refresh capabilities to the bounded recent
-- recovery window. No rows or relation privileges are changed.
BEGIN;
SET LOCAL search_path = pg_catalog;

SET LOCAL ROLE social_monitor_public_schema_owner;
GRANT CREATE ON SCHEMA public TO social_monitor_reader_summary_publication_owner;
RESET ROLE;

SET LOCAL ROLE social_monitor_reader_summary_publication_owner;
CREATE OR REPLACE FUNCTION public.lock_reader_summary_refresh_publication_ledgers(
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
      DATE '2026-09-02', DATE '2026-09-03', DATE '2026-09-04', DATE '2026-09-05',
      DATE '2026-09-06', DATE '2026-09-07', DATE '2026-09-08', DATE '2026-09-09',
      DATE '2026-09-10', DATE '2026-09-11', DATE '2026-09-12', DATE '2026-09-13')
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
CREATE OR REPLACE FUNCTION public.lock_reader_summary_refresh_reconciliation(
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
      DATE '2026-09-02', DATE '2026-09-03', DATE '2026-09-04', DATE '2026-09-05',
      DATE '2026-09-06', DATE '2026-09-07', DATE '2026-09-08', DATE '2026-09-09',
      DATE '2026-09-10', DATE '2026-09-11', DATE '2026-09-12', DATE '2026-09-13')
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

COMMIT;
