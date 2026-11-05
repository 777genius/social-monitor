import type { Pool } from "pg";
import { pg18FixtureScope } from "./reader-summary-first-publication-pg18.spec-support";

/** Synthetic diagnostics only, never part of the application migration.
 * These intentionally omit the READ COMMITTED requirement to demonstrate
 * that SECURITY DEFINER and strong locks cannot renew a Serializable snapshot.
 * They return an absence predicate or void, have no writes/provider effects,
 * and use only fixed objects and the same finite context/scope validation. */
export async function installFirstpubSnapshotDiagnostics(admin: Pool): Promise<void> {
  await admin.query(`
    CREATE SCHEMA firstpub_snapshot_probe AUTHORIZATION social_monitor_reader_summary_publication_owner;
    REVOKE ALL ON SCHEMA firstpub_snapshot_probe FROM PUBLIC;
    GRANT USAGE ON SCHEMA firstpub_snapshot_probe TO social_monitor_summary_once;
    CREATE FUNCTION firstpub_snapshot_probe.claim_absent() RETURNS boolean
      LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
      SET search_path = pg_catalog AS $probe$
    BEGIN
      LOCK TABLE public.reader_summary_jobs, public.reader_summary_artifacts,
        public.reader_summary_publications, public.reader_summary_publication_slots,
        public.reader_summary_daily_model_jobs IN EXCLUSIVE MODE NOWAIT;
      LOCK TABLE public.tenants, public.workspaces IN SHARE MODE NOWAIT;
      PERFORM public.assert_reader_summary_first_publication_scope(
        '${pg18FixtureScope.tenantId}'::uuid, '${pg18FixtureScope.workspaceId}'::uuid,
        TIMESTAMPTZ '2026-09-29 00:00:00+00', TIMESTAMPTZ '2026-09-30 00:00:00+00', clock_timestamp());
      RETURN NOT EXISTS (SELECT 1 FROM public.reader_summary_jobs
        WHERE tenant_id = '${pg18FixtureScope.tenantId}'::uuid
          AND workspace_id = '${pg18FixtureScope.workspaceId}'::uuid
          AND period_started_at >= TIMESTAMPTZ '2026-09-29 00:00:00+00'
          AND period_started_at < TIMESTAMPTZ '2026-09-30 00:00:00+00');
    END $probe$;
    ALTER FUNCTION firstpub_snapshot_probe.claim_absent() OWNER TO social_monitor_reader_summary_publication_owner;
    REVOKE ALL ON FUNCTION firstpub_snapshot_probe.claim_absent() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION firstpub_snapshot_probe.claim_absent() TO social_monitor_summary_once;
    CREATE FUNCTION firstpub_snapshot_probe.lock_dataset() RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER VOLATILE PARALLEL UNSAFE
      SET search_path = pg_catalog AS $probe$
    BEGIN
      LOCK TABLE public.source_item_engagement_snapshots, public.source_item_engagement_observations,
        public.source_items, public.feed_items, public.source_bindings, public.interests,
        public.source_catalog_entries, public.tenants, public.workspaces IN SHARE MODE NOWAIT;
      PERFORM public.assert_reader_summary_first_publication_scope(
        '${pg18FixtureScope.tenantId}'::uuid, '${pg18FixtureScope.workspaceId}'::uuid,
        TIMESTAMPTZ '2026-09-29 00:00:00+00', TIMESTAMPTZ '2026-09-30 00:00:00+00', clock_timestamp());
    END $probe$;
    ALTER FUNCTION firstpub_snapshot_probe.lock_dataset() OWNER TO social_monitor_reader_summary_publication_owner;
    REVOKE ALL ON FUNCTION firstpub_snapshot_probe.lock_dataset() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION firstpub_snapshot_probe.lock_dataset() TO social_monitor_summary_once;
  `);
}
