-- @social-monitor-forward-migration
-- Finite Sep29 first publication only. No runtime table privilege or role
-- membership is widened. Existing invoker slot trigger is left untouched:
-- only the established publication owner can insert the durable null slot.
BEGIN;
SET LOCAL search_path = pg_catalog;

-- Require the established trusted owner; never use a migrator/superuser as
-- an accidental SECURITY DEFINER owner. The finite operator is provisioned
-- separately; absence is fail-closed, not a reason to create a login here.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'social_monitor_reader_summary_publication_owner'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'social_monitor_summary_once'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR pg_catalog.pg_has_role('social_monitor_summary_once',
      'social_monitor_reader_summary_publication_owner', 'MEMBER')
    OR pg_catalog.pg_has_role('social_monitor_summary_once',
      'social_monitor_public_schema_owner', 'MEMBER') THEN
    RAISE EXCEPTION 'first publication requires isolated trusted owner and finite operator';
  END IF;
END
$roles$;

SET LOCAL ROLE social_monitor_public_schema_owner;
GRANT USAGE, CREATE ON SCHEMA public TO social_monitor_reader_summary_publication_owner;
-- PG18 MAINTAIN is the lock-only alternative to granting new data writes.
-- It stays on the inaccessible NOLOGIN owner, never the runtime operator.
GRANT MAINTAIN ON public.reader_summary_jobs, public.reader_summary_daily_model_jobs,
  public.feed_items, public.source_items, public.source_bindings, public.interests,
  public.source_catalog_entries, public.source_item_engagement_snapshots,
  public.source_item_engagement_observations, public.tenants, public.workspaces
  TO social_monitor_reader_summary_publication_owner;
GRANT SELECT ON public.source_item_engagement_snapshots,
  public.source_item_engagement_observations TO social_monitor_reader_summary_publication_owner;
-- Preserve the existing full parent-row digest byte contract. Every current
-- parent column is needed internally; none is returned to the operator.
GRANT SELECT(id, slug, name, created_at, updated_at, deleted_at) ON public.tenants TO social_monitor_reader_summary_publication_owner;
GRANT SELECT(id, tenant_id, slug, name, created_at, updated_at, deleted_at) ON public.workspaces TO social_monitor_reader_summary_publication_owner;
RESET ROLE;
SET LOCAL ROLE social_monitor_reader_summary_publication_owner;
-- These relations are already owned by this role; their maintenance/lock
-- privileges are inherent. No new ownership transfers are introduced.

CREATE FUNCTION public.assert_reader_summary_first_publication_scope(
  target_tenant_id uuid, target_workspace_id uuid,
  period_start timestamptz, period_end timestamptz, as_of timestamptz
) RETURNS void
LANGUAGE plpgsql VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  IF target_tenant_id IS DISTINCT FROM '00000000-0000-7000-8000-000000006101'::uuid
    OR target_workspace_id IS DISTINCT FROM '00000000-0000-7000-8000-000000006102'::uuid
    OR period_start IS DISTINCT FROM TIMESTAMPTZ '2026-09-29 00:00:00+00'
    OR period_end IS DISTINCT FROM TIMESTAMPTZ '2026-09-30 00:00:00+00'
    OR as_of IS NULL OR NOT pg_catalog.isfinite(as_of)
    OR as_of < period_end OR as_of > pg_catalog.clock_timestamp()
    OR pg_catalog.current_setting('social_monitor.tenant_id', true)
      IS DISTINCT FROM target_tenant_id::text
    OR pg_catalog.current_setting('social_monitor.workspace_id', true)
      IS DISTINCT FROM target_workspace_id::text
    OR COALESCE(pg_catalog.current_setting('social_monitor.system_access', true), '')
      NOT IN ('', 'false')
    OR NOT pg_catalog.pg_has_role(session_user, 'social_monitor_summary_once', 'USAGE')
    OR pg_catalog.pg_has_role(session_user, 'social_monitor_reader_summary_publication_owner', 'SET')
    OR pg_catalog.pg_has_role(session_user, 'social_monitor_public_schema_owner', 'SET') THEN
    RAISE EXCEPTION 'first publication scope denied' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants t JOIN public.workspaces w ON w.tenant_id = t.id
    WHERE t.id = target_tenant_id AND w.id = target_workspace_id
      AND t.deleted_at IS NULL AND w.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'first publication requires active tenant and workspace';
  END IF;
END
$function$;
REVOKE ALL ON FUNCTION public.assert_reader_summary_first_publication_scope(uuid,uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC;

CREATE FUNCTION public.reserve_reader_summary_first_publication(
  target_tenant_id uuid, target_workspace_id uuid,
  period_start timestamptz, period_end timestamptz, admitted_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  -- Middleware SELECTs may have run already. VOLATILE's post-lock SQL reads
  -- get a new command snapshot only under READ COMMITTED, never Serializable.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'first publication reservation requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  LOCK TABLE public.reader_summary_jobs, public.reader_summary_artifacts,
    public.reader_summary_publications, public.reader_summary_publication_slots,
    public.reader_summary_daily_model_jobs IN EXCLUSIVE MODE NOWAIT;
  LOCK TABLE public.tenants, public.workspaces IN SHARE MODE NOWAIT;
  PERFORM public.assert_reader_summary_first_publication_scope(
    target_tenant_id, target_workspace_id, period_start, period_end, admitted_at);
  IF admitted_at < pg_catalog.clock_timestamp() - INTERVAL '30 minutes' THEN
    RAISE EXCEPTION 'first publication admission expired';
  END IF;
  IF EXISTS (SELECT 1 FROM public.reader_summary_jobs WHERE tenant_id = target_tenant_id
      AND workspace_id = target_workspace_id AND period_started_at >= period_start AND period_started_at < period_end)
    OR EXISTS (SELECT 1 FROM public.reader_summary_artifacts WHERE tenant_id = target_tenant_id
      AND workspace_id = target_workspace_id AND period_started_at >= period_start AND period_started_at < period_end)
    OR EXISTS (SELECT 1 FROM public.reader_summary_publications WHERE tenant_id = target_tenant_id
      AND workspace_id = target_workspace_id AND period_started_at >= period_start AND period_started_at < period_end)
    OR EXISTS (SELECT 1 FROM public.reader_summary_publication_slots WHERE tenant_id = target_tenant_id
      AND workspace_id = target_workspace_id AND period_started_at >= period_start AND period_started_at < period_end)
    OR EXISTS (SELECT 1 FROM public.reader_summary_daily_model_jobs WHERE tenant_id = target_tenant_id
      AND workspace_id = target_workspace_id AND requested_utc_date = DATE '2026-09-29') THEN
    RAISE EXCEPTION 'First publication day already claimed, including failed or uncertain attempts';
  END IF;
  INSERT INTO public.reader_summary_publication_slots(tenant_id,workspace_id,scope_type,scope_key,
    cadence,period_started_at,period_ended_at,period_timezone,current_publication_id,updated_at)
  VALUES(target_tenant_id,target_workspace_id,'workspace','workspace','daily',
    period_start,period_end,'UTC',NULL,admitted_at);
  RETURN true;
END
$function$;

CREATE FUNCTION public.lock_reader_summary_first_publication_dataset(
  target_tenant_id uuid, target_workspace_id uuid,
  period_start timestamptz, period_end timestamptz, as_of timestamptz
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'first publication dataset requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  LOCK TABLE public.source_item_engagement_snapshots, public.source_item_engagement_observations,
    public.source_items, public.feed_items, public.source_bindings, public.interests,
    public.source_catalog_entries, public.tenants, public.workspaces IN SHARE MODE NOWAIT;
  PERFORM public.assert_reader_summary_first_publication_scope(
    target_tenant_id,target_workspace_id,period_start,period_end,as_of);
  RETURN true;
END
$function$;

CREATE FUNCTION public.observe_reader_summary_first_publication(
  target_tenant_id uuid, target_workspace_id uuid,
  period_start timestamptz, period_end timestamptz, as_of timestamptz
) RETURNS TABLE("visibleCount" integer, "validCount" integer, "scopeValid" boolean, sha256 text)
LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM public.assert_reader_summary_first_publication_scope(
    target_tenant_id,target_workspace_id,period_start,period_end,as_of);
  RETURN QUERY
    with inventory as (
      select f.id, (s.id is not null and b.id is not null and i.id is not null and c.id is not null
        and f.provider_key = s.provider_key and f.provider_key = c.provider_key
        and f.interest_id = b.interest_id and s.source_binding_id = f.source_binding_id
        and s.canonical_url = f.canonical_url
        and b.created_at <= as_of and i.created_at <= as_of
        and f.updated_at <= as_of
        and b.deleted_at is null and i.deleted_at is null
        and b.status = 'ENABLED' and i.status = 'ENABLED'
        and f.observed_at >= period_start
        and f.observed_at <= as_of
        and s.observed_at >= period_start
        and s.observed_at <= as_of
        and coalesce(s.last_observed_at, s.observed_at) <= as_of
        and coalesce(s.content_updated_at, s.observed_at) <= as_of) is true as valid,
        jsonb_build_array(to_jsonb(f), to_jsonb(s), to_jsonb(b), to_jsonb(i), to_jsonb(c)) as row
      from public.feed_items f
      left join public.source_items s on s.id = f.source_item_id
        and s.tenant_id = f.tenant_id and s.workspace_id = f.workspace_id
      left join public.source_bindings b on b.id = f.source_binding_id
        and b.tenant_id = f.tenant_id and b.workspace_id = f.workspace_id
      left join public.interests i on i.id = f.interest_id
        and i.tenant_id = f.tenant_id and i.workspace_id = f.workspace_id
      left join public.source_catalog_entries c on c.id = b.source_catalog_entry_id
      where f.tenant_id = target_tenant_id::uuid
        and f.workspace_id = target_workspace_id::uuid and f.status = 'VISIBLE'
        and f.published_at >= period_start
        and f.published_at < period_end
    ), metrics as (
      select 'snapshot' as kind, to_jsonb(e) as row, e.last_observed_at as observed_at
      from public.source_item_engagement_snapshots e where e.tenant_id = target_tenant_id::uuid
        and e.workspace_id = target_workspace_id::uuid
        and e.source_item_id in (select source_item_id from public.feed_items where id in (select id from inventory))
      union all
      select 'observation', to_jsonb(e), e.observed_at from public.source_item_engagement_observations e
      where e.tenant_id = target_tenant_id::uuid and e.workspace_id = target_workspace_id::uuid
        and e.source_item_id in (select source_item_id from public.feed_items where id in (select id from inventory))
    ), scope_rows as (
      select jsonb_build_array(to_jsonb(t), to_jsonb(w)) as row,
        (t.deleted_at is null and w.deleted_at is null) as valid
      from public.tenants t join public.workspaces w on w.tenant_id = t.id
      where t.id = target_tenant_id::uuid and w.id = target_workspace_id::uuid
    )
    select (select count(*)::int from inventory) as "visibleCount",
      (select count(*)::int from inventory where valid) as "validCount",
      ((select count(*) = 1 and bool_and(valid) from scope_rows) and
        not exists(select 1 from metrics where observed_at is null or observed_at > as_of)) as "scopeValid",
      encode(sha256(convert_to(jsonb_build_array(
        (select coalesce(jsonb_agg(row order by id), '[]') from inventory),
        (select coalesce(jsonb_agg(row), '[]') from scope_rows),
        (select coalesce(jsonb_agg(jsonb_build_array(kind, row) order by kind, row::text), '[]') from metrics)
      )::text, 'UTF8')), 'hex') as sha256;
END
$function$;

REVOKE ALL ON FUNCTION public.reserve_reader_summary_first_publication(uuid,uuid,timestamptz,timestamptz,timestamptz),
  public.lock_reader_summary_first_publication_dataset(uuid,uuid,timestamptz,timestamptz,timestamptz),
  public.observe_reader_summary_first_publication(uuid,uuid,timestamptz,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_reader_summary_first_publication(uuid,uuid,timestamptz,timestamptz,timestamptz),
  public.lock_reader_summary_first_publication_dataset(uuid,uuid,timestamptz,timestamptz,timestamptz),
  public.observe_reader_summary_first_publication(uuid,uuid,timestamptz,timestamptz,timestamptz) TO social_monitor_summary_once;
-- Fail closed if deployment defaults granted a new function to anyone else.
-- No blanket changes to existing function defaults or ordinary capabilities.
DO $acl$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(p.proacl,
      pg_catalog.acldefault('f', p.proowner))) a
    WHERE p.oid IN (
      'public.assert_reader_summary_first_publication_scope(uuid,uuid,timestamptz,timestamptz,timestamptz)'::regprocedure,
      'public.reserve_reader_summary_first_publication(uuid,uuid,timestamptz,timestamptz,timestamptz)'::regprocedure,
      'public.lock_reader_summary_first_publication_dataset(uuid,uuid,timestamptz,timestamptz,timestamptz)'::regprocedure,
      'public.observe_reader_summary_first_publication(uuid,uuid,timestamptz,timestamptz,timestamptz)'::regprocedure)
      AND (p.proowner <> 'social_monitor_reader_summary_publication_owner'::regrole
        OR a.privilege_type <> 'EXECUTE' OR a.is_grantable
        OR a.grantee NOT IN ('social_monitor_reader_summary_publication_owner'::regrole,
          CASE WHEN p.proname = 'assert_reader_summary_first_publication_scope'
            THEN 'social_monitor_reader_summary_publication_owner'::regrole
            ELSE 'social_monitor_summary_once'::regrole END))
  ) THEN RAISE EXCEPTION 'first publication function ACL is not finite'; END IF;
END
$acl$;
RESET ROLE;
SET LOCAL ROLE social_monitor_public_schema_owner;
REVOKE CREATE ON SCHEMA public FROM social_monitor_reader_summary_publication_owner;
RESET ROLE;
COMMIT;
