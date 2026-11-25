-- @social-monitor-forward-migration
BEGIN;

SET LOCAL ROLE social_monitor_public_schema_owner;

GRANT SELECT(id, tenant_id, workspace_id, interest_id, source_item_id, source_binding_id, provider_key, canonical_url, status, published_at, observed_at) ON public.feed_items TO social_monitor_reader_summary_publication_owner;
GRANT UPDATE(id) ON public.feed_items TO social_monitor_reader_summary_publication_owner;

GRANT SELECT(id, tenant_id, workspace_id, source_binding_id, provider_key, provider_item_id, canonical_url, content_hash, provider_content_hash, observed_at, metadata) ON public.source_items TO social_monitor_reader_summary_publication_owner;
GRANT UPDATE(id) ON public.source_items TO social_monitor_reader_summary_publication_owner;

GRANT SELECT(id, tenant_id, workspace_id, status, deleted_at) ON public.interests TO social_monitor_reader_summary_publication_owner;
GRANT SELECT(id, provider_key) ON public.source_catalog_entries TO social_monitor_reader_summary_publication_owner;

GRANT SELECT(id, tenant_id, workspace_id, source_binding_id, scan_job_id, source_item_id, repository_full_name, repository_url, primary_window, rank, checked_at, observed_at) ON public.github_repository_trend_results TO social_monitor_reader_summary_publication_owner;
GRANT UPDATE(id) ON public.github_repository_trend_results TO social_monitor_reader_summary_publication_owner;

GRANT SELECT(id, tenant_id, workspace_id, source_binding_id, status) ON public.scan_jobs TO social_monitor_reader_summary_publication_owner;
GRANT UPDATE(id) ON public.scan_jobs TO social_monitor_reader_summary_publication_owner;

GRANT SELECT(scan_job_id, tenant_id, workspace_id, source_binding_id, attempt_number, status, finished_at) ON public.scan_attempts TO social_monitor_reader_summary_publication_owner;
GRANT UPDATE(scan_job_id) ON public.scan_attempts TO social_monitor_reader_summary_publication_owner;

COMMIT;
