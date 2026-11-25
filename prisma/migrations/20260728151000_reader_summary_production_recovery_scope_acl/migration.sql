-- @social-monitor-forward-migration
BEGIN;

SET LOCAL ROLE social_monitor_public_schema_owner;

GRANT SELECT(id, deleted_at) ON public.tenants TO social_monitor_reader_summary_publication_owner;
GRANT SELECT(id, tenant_id, deleted_at) ON public.workspaces TO social_monitor_reader_summary_publication_owner;
GRANT UPDATE(id) ON public.tenants, public.workspaces TO social_monitor_reader_summary_publication_owner;

COMMIT;
