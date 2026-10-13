import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../prisma/generated/client/client';
import type { RssSep24PinnedScope } from '../../recover-rss-sep24-verified';
import { CONFIG, sha } from './fixtures';
export const ROLE = 'social_monitor_collection_v2';
export function url(database: string, user = 'postgres'): string {
  assert(/^sm_test_[a-f0-9_]+$/u.test(database));
  return `postgresql://${user}@pg:5432/${database}`;
}
export function pool(database: string, user = 'postgres'): Pool {
  return new Pool({ connectionString: url(database, user), max: 1, min: 0,
    connectionTimeoutMillis: 5000, statement_timeout: 15000, query_timeout: 18000,
    application_name: 'rss-current-postgres-boundary-TEST' });
}
export async function setup(admin: Pool, s: RssSep24PinnedScope, existing: string, testFeedKey?: string) {
  const identity = (await admin.query(`SELECT current_database() AS database, current_setting('server_version_num')::int AS version,
    (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables,
    (SELECT count(*)::int FROM pg_roles WHERE rolname LIKE 'social_monitor_%') AS roles`)).rows[0];
  assert.equal(identity.version, 180006); assert.equal(identity.tables, 0); assert.equal(identity.roles, 0);
  // On a fresh private TEST cluster only. No credentials, inherited memberships or production authority.
  await admin.query(`CREATE ROLE social_monitor_public_schema_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    CREATE ROLE social_monitor_reader_summary_publication_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    CREATE ROLE social_monitor_tenant_system_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    DO $ttl$ BEGIN EXECUTE format('ALTER ROLE ${ROLE} VALID UNTIL %L', clock_timestamp() + interval '20 minutes'); END $ttl$;
    ALTER ROLE ${ROLE} SET search_path = pg_catalog, public;
    ALTER SCHEMA public OWNER TO social_monitor_public_schema_owner;
    REVOKE ALL ON SCHEMA public FROM PUBLIC;`);
  await admin.query('SET ROLE social_monitor_public_schema_owner');
  await admin.query(await readFile('/app/fixture.sql', 'utf8'));
  await admin.query('RESET ROLE');
  // Diff DDL was executed by the synthetic admin, then its fixture objects get the required owner.
  const tables = (await admin.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
  for (const { tablename } of tables) { assert(/^[a-z_]+$/u.test(tablename));
    await admin.query(`ALTER TABLE public.${tablename} OWNER TO social_monitor_public_schema_owner`); }
  const generated = new PrismaClient({ adapter: new PrismaPg(admin, { disposeExternalPool: false }) });
  const catalog = randomUUID();
  await generated.$transaction(async tx => {
    await tx.sourceCatalogEntry.create({ data: { id: catalog, providerKey: 'rss', displayName: 'Synthetic TEST RSS', acquisitionMode: 'fixture', readiness: 'fixture_only' } });
    await tx.capabilityProfile.create({ data: { id: randomUUID(), sourceId: catalog, version: 1, config: {} } });
    await tx.tenant.create({ data: { id: s.tenantId, slug: randomUUID(), name: 'Synthetic TEST tenant' } });
    await tx.workspace.create({ data: { id: s.workspaceId, tenantId: s.tenantId, slug: randomUUID(), name: 'Synthetic TEST workspace' } });
    await tx.interest.create({ data: { id: s.interestId, tenantId: s.tenantId, workspaceId: s.workspaceId, name: 'Synthetic TEST RSS', query: 'Synthetic TEST', status: 'ENABLED' } });
    await tx.sourceBinding.create({ data: { id: s.sourceBindingId, tenantId: s.tenantId, workspaceId: s.workspaceId,
      interestId: s.interestId, sourceCatalogEntryId: catalog, capabilityProfileVersion: 1, status: 'ENABLED', config: CONFIG } });
    await tx.scanPolicy.create({ data: { id: s.scanPolicyId, tenantId: s.tenantId, workspaceId: s.workspaceId,
      sourceBindingId: s.sourceBindingId, intervalSeconds: 3600, freshnessSeconds: 3600, retryBudget: 0, nextRunAt: new Date('2026-10-07T00:00:00Z') } });
    const source = await tx.sourceItem.create({ data: { id: randomUUID(), tenantId: s.tenantId, workspaceId: s.workspaceId,
      sourceBindingId: s.sourceBindingId, providerKey: 'rss', providerItemId: existing,
      canonicalUrl: `https://example.test/${existing}`, title: 'Existing synthetic immutable TEST title', body: 'Existing synthetic TEST body.',
      publishedAt: new Date('2026-09-24T08:00:00Z'), observedAt: new Date('2026-09-24T09:00:00Z'),
      contentHash: sha('TEST existing content'), providerContentHash: sha('TEST existing provider'), metadata: { synthetic: true } } });
    await tx.feedItem.create({ data: { id: randomUUID(), tenantId: s.tenantId, workspaceId: s.workspaceId, interestId: s.interestId,
      sourceItemId: source.id, sourceBindingId: s.sourceBindingId, providerKey: 'rss', dedupeKey: testFeedKey ?? randomUUID(),
      canonicalUrl: source.canonicalUrl, title: source.title, bodyPreview: source.body,
      publishedAt: source.publishedAt, observedAt: source.observedAt, providerMetadata: { synthetic: true } } });
  });
  await generated.$disconnect();
  const body = await readFile('/app/guard-body.sql', 'utf8');
  assert.equal(sha(body), 'e3baba5e3f65abdebd469c743a6042c0f4f5a28555de952371d6a4c1906d6782');
  const oid = (await admin.query<{ oid: number }>(`SELECT oid FROM pg_roles WHERE rolname='${ROLE}'`)).rows[0]?.oid;
  assert(oid);
  await admin.query(`SET ROLE social_monitor_public_schema_owner;
    CREATE FUNCTION public.social_monitor_current_source_guard() RETURNS trigger LANGUAGE plpgsql
      VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $guard$${body}$guard$;
    REVOKE ALL ON FUNCTION public.social_monitor_current_source_guard() FROM PUBLIC;
    RESET ROLE;`);
  for (const table of ['source_items', 'feed_items']) await admin.query(`CREATE TRIGGER social_monitor_current_source_rows
    BEFORE INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.social_monitor_current_source_guard('${oid}');
    CREATE TRIGGER social_monitor_current_source_truncate BEFORE TRUNCATE ON public.${table}
    FOR EACH STATEMENT EXECUTE FUNCTION public.social_monitor_current_source_guard('${oid}');
    ALTER TABLE public.${table} ENABLE ALWAYS TRIGGER social_monitor_current_source_rows;
    ALTER TABLE public.${table} ENABLE ALWAYS TRIGGER social_monitor_current_source_truncate;`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO ${ROLE};
    GRANT SELECT, UPDATE ON tenants, workspaces, interests, source_bindings, source_catalog_entries, scan_policies TO ${ROLE};
    GRANT SELECT, INSERT ON source_items, feed_items TO ${ROLE};
    GRANT SELECT, INSERT, UPDATE ON scan_attempts TO ${ROLE};
    GRANT SELECT, INSERT, DELETE ON scan_leases TO ${ROLE};
    GRANT SELECT ON source_item_engagement_snapshots TO ${ROLE};
    GRANT SELECT, INSERT, UPDATE, DELETE ON feed_signal_baseline_samples TO ${ROLE};
    CREATE SEQUENCE test_source_count; CREATE SEQUENCE test_failure_count;
    CREATE TABLE test_identity (effective text, authenticated text, tenant text, workspace text, system_access text, isolation text, database text);
    GRANT USAGE ON SEQUENCE test_source_count, test_failure_count TO ${ROLE};
    GRANT INSERT ON test_identity TO ${ROLE};
    CREATE FUNCTION test_observe_source() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $observe$
    BEGIN PERFORM nextval('public.test_source_count');
      INSERT INTO public.test_identity VALUES (current_user, session_user,
        current_setting('social_monitor.tenant_id',true), current_setting('social_monitor.workspace_id',true),
        current_setting('social_monitor.system_access',true), current_setting('transaction_isolation'), current_database());
      RETURN NEW; END $observe$;
    CREATE TRIGGER test_observe_source AFTER INSERT ON source_items FOR EACH ROW EXECUTE FUNCTION test_observe_source();`);
  return { identity, oid, tables: tables.map(v => v.tablename) };
}
