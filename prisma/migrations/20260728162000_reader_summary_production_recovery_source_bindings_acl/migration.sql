-- @social-monitor-forward-migration
BEGIN;

SET LOCAL ROLE social_monitor_public_schema_owner;

GRANT SELECT(id, tenant_id, workspace_id, interest_id, source_catalog_entry_id, status, deleted_at, config) ON public.source_bindings TO social_monitor_reader_summary_publication_owner;
GRANT UPDATE(id) ON public.source_bindings TO social_monitor_reader_summary_publication_owner;

COMMIT;
