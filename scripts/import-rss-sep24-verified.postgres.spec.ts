/** Run only through check-rss-sep24-postgres.sh against its disposable PostgreSQL 18. */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

import type { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { FakeScanAttemptRepository, FakeScanLease } from
  "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case.spec-support";
import { type TenantId, type WorkspaceId } from "@social-monitor/shared-kernel";
import { createFiniteRssDependencies, finiteRssDatabaseUrl,
  insertOnlyFeedTransaction, verifyScopedRssRelation } from "./import-rss-sep24-verified";
import { importRssSep24Verified, planRssSep24Verified, RSS_SEP24_JOURNAL,
  type RssSep24Artifacts, type RssSep24Dependencies, type RssSep24Scope } from "./recover-rss-sep24-verified";

const adminUrl = process.env.RSS_SEP24_PG18_URL;
if (!adminUrl) {
  describe.skip("disposable PostgreSQL 18 proof (run scripts/check-rss-sep24-postgres.sh)", () => {
    it("requires an isolated database", () => undefined);
  });
} else {
const target = new URL(adminUrl);
if (target.hostname !== "127.0.0.1" || target.pathname !== "/rssproof" ||
  target.username !== "postgres" || target.password !== "synthetic-rss-only") {
  throw new Error("Proof accepts only its loopback synthetic PostgreSQL database");
}
const roleUrl = new URL(adminUrl);
roleUrl.username = "social_monitor_collection";
roleUrl.password = "synthetic-rss-only";
const scope: RssSep24Scope = {
  tenantId: "00000000-0000-4000-8000-000000000001" as TenantId,
  workspaceId: "00000000-0000-4000-8000-000000000002" as WorkspaceId,
  interestId: "00000000-0000-4000-8000-000000000003",
  sourceBindingId: "00000000-0000-4000-8000-000000000004",
  scanPolicyId: "00000000-0000-4000-8000-000000000005", correlationId: "synthetic-rss-proof",
};
const catalogId = "00000000-0000-4000-8000-000000000006";
const feedUrl = "https://example.test/rss";
const bindingConfig = { feedUrl, maxItems: 30, targetPublishedWindow: {
  startInclusive: "2026-09-24T00:00:00.000Z", endExclusive: "2026-09-25T00:00:00.000Z" } };
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const sha = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve }; };
function artifacts(ids: readonly string[], canonicalUrlFor = (id: string) =>
  `https://example.test/posts/${id}`): RssSep24Artifacts {
  const pinnedScope = { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
    interestId: scope.interestId, sourceBindingId: scope.sourceBindingId, scanPolicyId: scope.scanPolicyId };
  const bindingBytes = json([{ bindingId: scope.sourceBindingId, status: "ENABLED", config: bindingConfig }]);
  const itemsBytes = json({ schemaVersion: 1, day: "2026-09-24", items: ids.map((id) => ({ externalId: id,
    canonicalUrl: canonicalUrlFor(id), title: `Synthetic ${id}`, body: "Synthetic captured text",
    publishedAt: "2026-09-24T12:00:00.000Z", metadata: { kind: "rss_item", feedUrl } })) });
  const manifestBytes = json({ schemaVersion: 1, day: "2026-09-24", providerKey: "rss",
    bindingId: scope.sourceBindingId, bindingSha256: sha(bindingBytes), scope: pinnedScope,
    scanMode: "read_only", sourceStatus: "partial", window: {
      from: "2026-09-24T00:00:00.000Z", to: "2026-09-25T00:00:00.000Z" },
    selectedIds: ids, itemsSha256: sha(itemsBytes) });
  return { pinnedScope, bindingBytes, expectedBindingSha256: sha(bindingBytes),
    itemsBytes, expectedItemsSha256: sha(itemsBytes), manifestBytes, expectedManifestSha256: sha(manifestBytes) };
}

const admin = new Pool({ connectionString: adminUrl, max: 2, connectionTimeoutMillis: 3000 });
const writer = new Pool({ connectionString: finiteRssDatabaseUrl(roleUrl.toString()),
  max: 2, connectionTimeoutMillis: 5000 });
type TransactionOptions = { isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable";
  maxWait?: number; timeout?: number };
const transactionOptions: TransactionOptions[] = [];
async function acquireWriter(maxWait: number): Promise<PoolClient> {
  return new Promise<PoolClient>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      reject(new Error("Synthetic writer acquisition timed out"));
    }, maxWait);
    void writer.connect().then((client) => {
      if (settled) { client.release(); return; }
      settled = true;
      clearTimeout(timer);
      resolve(client);
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}
function sqlClient(client: PoolClient) {
  const sourceColumns = `id, tenant_id AS "tenantId", workspace_id AS "workspaceId",
    source_binding_id AS "sourceBindingId", provider_key AS "providerKey",
    provider_item_id AS "providerItemId", canonical_url AS "canonicalUrl", title, body,
    author_handle AS "authorHandle", published_at AS "publishedAt", content_hash AS "contentHash",
    provider_content_hash AS "providerContentHash", observed_at AS "observedAt",
    last_observed_at AS "lastObservedAt", content_updated_at AS "contentUpdatedAt",
    created_at AS "createdAt", metadata`;
  const feedColumns = `id, tenant_id AS "tenantId", workspace_id AS "workspaceId",
    interest_id AS "interestId", source_item_id AS "sourceItemId",
    source_binding_id AS "sourceBindingId", provider_key AS "providerKey",
    dedupe_key AS "dedupeKey", canonical_url AS "canonicalUrl", title,
    body_preview AS "bodyPreview", author_handle AS "authorHandle",
    published_at AS "publishedAt", observed_at AS "observedAt", status,
    created_at AS "createdAt", provider_metadata AS "providerMetadata"`;
  return { $queryRawUnsafe: async (sql: string, ...values: unknown[]) => (await client.query(sql, values)).rows,
    sourceItem: {
      findMany: async ({ where }: { where: { tenantId: string; workspaceId: string; providerKey: string;
        providerItemId: { in: readonly string[] } } }) => (await client.query(
        `SELECT ${sourceColumns} FROM source_items WHERE tenant_id = $1 AND workspace_id = $2
          AND provider_key = $3 AND provider_item_id = ANY($4::text[])`,
        [where.tenantId, where.workspaceId, where.providerKey, where.providerItemId.in])).rows,
      create: async ({ data }: { data: Record<string, unknown> }) => (await client.query(
        `INSERT INTO source_items(id, tenant_id, workspace_id, source_binding_id, provider_key,
          provider_item_id, canonical_url, title, body, author_handle, published_at, content_hash,
          provider_content_hash, observed_at, last_observed_at, content_updated_at, metadata)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
          RETURNING ${sourceColumns}`,
        [data.id, data.tenantId, data.workspaceId, data.sourceBindingId, data.providerKey,
          data.providerItemId, data.canonicalUrl, data.title, data.body, data.authorHandle,
          data.publishedAt, data.contentHash, data.providerContentHash, data.observedAt,
          data.lastObservedAt, data.contentUpdatedAt, JSON.stringify(data.metadata)])).rows[0],
    },
    feedItem: {
      findFirst: async ({ where }: { where: { tenantId: string; workspaceId: string; interestId: string;
        sourceItemId: string; status: string } }) => (await client.query(
        `SELECT ${feedColumns} FROM feed_items WHERE tenant_id = $1 AND workspace_id = $2
          AND interest_id = $3 AND source_item_id = $4 AND status = $5 LIMIT 1`,
        [where.tenantId, where.workspaceId, where.interestId, where.sourceItemId, where.status])).rows[0] ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => (await client.query(
        `INSERT INTO feed_items(id, tenant_id, workspace_id, interest_id, source_item_id,
          source_binding_id, provider_key, dedupe_key, canonical_url, title, body_preview,
          author_handle, published_at, observed_at, provider_metadata, status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16)
          RETURNING ${feedColumns}`,
        [data.id, data.tenantId, data.workspaceId, data.interestId, data.sourceItemId,
          data.sourceBindingId, data.providerKey, data.dedupeKey, data.canonicalUrl,
          data.title, data.bodyPreview, data.authorHandle, data.publishedAt, data.observedAt,
          JSON.stringify(data.providerMetadata ?? null), data.status])).rows[0],
    },
    sourceItemEngagementSnapshot: { findUnique: async ({ where }: { where: {
      tenantId_workspaceId_sourceItemId: { tenantId: string; workspaceId: string; sourceItemId: string } } }) => {
      const key = where.tenantId_workspaceId_sourceItemId;
      return (await client.query<{ lastObservedAt: Date }>(`
        SELECT last_observed_at AS "lastObservedAt" FROM source_item_engagement_snapshots
        WHERE tenant_id = $1 AND workspace_id = $2 AND source_item_id = $3`,
      [key.tenantId, key.workspaceId, key.sourceItemId])).rows[0] ?? null;
    } },
    feedSignalBaselineSample: {
      deleteMany: async ({ where }: { where: { tenantId: string; workspaceId: string; feedItemId: string } }) =>
        client.query(`DELETE FROM feed_signal_baseline_samples WHERE tenant_id = $1
          AND workspace_id = $2 AND feed_item_id = $3`, [where.tenantId, where.workspaceId, where.feedItemId]),
      upsert: async () => { throw new Error("Unexpected RSS baseline sample"); },
    },
  };
}
const connection = { $transaction: async <T>(work: (tx: unknown) => Promise<T>,
  options?: TransactionOptions): Promise<T> => {
  transactionOptions.push(options ?? {});
  if (options?.isolationLevel !== "Serializable" || options.maxWait !== 5000 || options.timeout !== 120000) {
    throw new Error("Production transaction options changed; review this PostgreSQL proof");
  }
  const client = await acquireWriter(options.maxWait);
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${options.isolationLevel.toUpperCase()}`);
    await client.query("SELECT set_config('transaction_timeout', $1, true)", [`${options.timeout}ms`]);
    const value = await work(sqlClient(client));
    await client.query("COMMIT");
    return value;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
} } as unknown as PrismaIngestionWorkerConnection;
const finite = createFiniteRssDependencies(connection);
const journalRoots: string[] = [];
async function journalPath(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "rss-sep24-pg18-"));
  journalRoots.push(root);
  return join(root, RSS_SEP24_JOURNAL);
}
function databaseWrites(failAfterFeed = false): RssSep24Dependencies {
  return { withAtomicWrites: (writeScope, url, config, work) => finite.withAtomicWrites(writeScope, url, config,
    async (writes) => {
      return work({ ...writes, scanAttempts: new FakeScanAttemptRepository(), scanLeases: new FakeScanLease(),
        feedProjection: failAfterFeed ? { project: async (command) => {
          await writes.feedProjection.project(command);
          throw new Error("synthetic failure after both production adapter writes");
        } } : writes.feedProjection });
    }) };
}

jest.setTimeout(30000);
beforeAll(async () => {
  const version = Number((await admin.query<{ server_version_num: string }>("SHOW server_version_num")).rows[0]?.server_version_num);
  if (version < 180000 || version >= 190000) throw new Error(`Expected PostgreSQL 18, got ${version}`);
  await admin.query(`CREATE TABLE tenants(id uuid PRIMARY KEY, deleted_at timestamptz);
    CREATE TABLE workspaces(id uuid PRIMARY KEY, tenant_id uuid, deleted_at timestamptz);
    CREATE TABLE interests(id uuid PRIMARY KEY, tenant_id uuid, workspace_id uuid, status text, deleted_at timestamptz);
    CREATE TABLE source_catalog_entries(id uuid PRIMARY KEY, provider_key text);
    CREATE TABLE source_bindings(id uuid PRIMARY KEY, tenant_id uuid, workspace_id uuid, interest_id uuid,
      source_catalog_entry_id uuid, status text, deleted_at timestamptz, config jsonb);
    CREATE TABLE scan_policies(id uuid PRIMARY KEY, tenant_id uuid, workspace_id uuid, source_binding_id uuid);
    CREATE TABLE source_items(id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
      source_binding_id uuid NOT NULL, provider_key text NOT NULL, provider_item_id text NOT NULL,
      canonical_url text NOT NULL, title text NOT NULL, body text NOT NULL, author_handle text,
      published_at timestamptz NOT NULL, content_hash text NOT NULL, provider_content_hash text,
      observed_at timestamptz NOT NULL, last_observed_at timestamptz, content_updated_at timestamptz,
      metadata jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, workspace_id, provider_key, provider_item_id));
    CREATE TABLE feed_items(id uuid PRIMARY KEY, tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
      interest_id uuid NOT NULL, source_item_id uuid NOT NULL REFERENCES source_items(id),
      source_binding_id uuid NOT NULL, provider_key text NOT NULL, dedupe_key text NOT NULL,
      canonical_url text NOT NULL, title text NOT NULL, body_preview text NOT NULL,
      author_handle text, published_at timestamptz NOT NULL, observed_at timestamptz NOT NULL,
      provider_metadata jsonb, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(tenant_id, interest_id, dedupe_key));
    CREATE TABLE source_item_engagement_snapshots(tenant_id uuid NOT NULL, workspace_id uuid NOT NULL,
      source_item_id uuid NOT NULL REFERENCES source_items(id), last_observed_at timestamptz NOT NULL,
      PRIMARY KEY(tenant_id, workspace_id, source_item_id));
    CREATE TABLE feed_signal_baseline_samples(id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
      workspace_id uuid NOT NULL, interest_id uuid NOT NULL, feed_item_id uuid NOT NULL REFERENCES feed_items(id),
      provider_key text NOT NULL, source_key text NOT NULL, content_type text NOT NULL,
      strength double precision NOT NULL, published_at timestamptz NOT NULL, observed_at timestamptz NOT NULL);`);
  await admin.query(`CREATE ROLE social_monitor_collection LOGIN PASSWORD 'synthetic-rss-only'
    VALID UNTIL '${new Date(Date.now() + 15 * 60_000).toISOString()}'`);
  await admin.query(`GRANT USAGE ON SCHEMA public TO social_monitor_collection;
    GRANT SELECT ON tenants, workspaces, interests, source_catalog_entries, source_bindings,
      scan_policies, source_items, feed_items, source_item_engagement_snapshots,
      feed_signal_baseline_samples TO social_monitor_collection;
    GRANT UPDATE(id) ON tenants, workspaces, interests, source_catalog_entries,
      source_bindings, scan_policies TO social_monitor_collection;
    GRANT INSERT ON source_items, feed_items TO social_monitor_collection;
    GRANT DELETE ON feed_signal_baseline_samples TO social_monitor_collection`);
  await admin.query("INSERT INTO tenants(id) VALUES($1)", [scope.tenantId]);
  await admin.query("INSERT INTO workspaces(id, tenant_id) VALUES($1, $2)", [scope.workspaceId, scope.tenantId]);
  await admin.query("INSERT INTO interests(id, tenant_id, workspace_id, status) VALUES($1, $2, $3, 'ENABLED')",
    [scope.interestId, scope.tenantId, scope.workspaceId]);
  await admin.query("INSERT INTO source_catalog_entries(id, provider_key) VALUES($1, 'rss')", [catalogId]);
  await admin.query(`INSERT INTO source_bindings(id, tenant_id, workspace_id, interest_id,
    source_catalog_entry_id, status, config) VALUES($1, $2, $3, $4, $5, 'ENABLED', $6::jsonb)`,
  [scope.sourceBindingId, scope.tenantId, scope.workspaceId, scope.interestId, catalogId, JSON.stringify(bindingConfig)]);
  await admin.query("INSERT INTO scan_policies(id, tenant_id, workspace_id, source_binding_id) VALUES($1, $2, $3, $4)",
    [scope.scanPolicyId, scope.tenantId, scope.workspaceId, scope.sourceBindingId]);
});
afterAll(async () => {
  await Promise.all(journalRoots.map((root) => rm(root, { recursive: true, force: true })));
  await writer.end(); await admin.end();
});
beforeEach(async () => {
  transactionOptions.length = 0;
  await admin.query("DELETE FROM feed_signal_baseline_samples");
  await admin.query("DELETE FROM source_item_engagement_snapshots");
  await admin.query("DELETE FROM feed_items"); await admin.query("DELETE FROM source_items");
  await admin.query("UPDATE source_bindings SET status = 'ENABLED', config = $1::jsonb", [JSON.stringify(bindingConfig)]);
  await admin.query("UPDATE source_catalog_entries SET provider_key = 'rss'");
});
async function seedExisting(guid: string, title: string): Promise<void> {
  const sourceId = "00000000-0000-4000-8000-000000000007";
  const feedId = "00000000-0000-4000-8000-000000000008";
  const url = `https://example.test/posts/${guid}`;
  await admin.query(`INSERT INTO source_items(id, tenant_id, workspace_id, source_binding_id, provider_key,
    provider_item_id, canonical_url, title, body, published_at, content_hash, observed_at, metadata)
    VALUES($1,$2,$3,$4,'rss',$5,$6,$7,'Original body','2026-09-24T12:00:00Z','original-hash',
      '2026-09-29T00:00:00Z','{}'::jsonb)`,
  [sourceId, scope.tenantId, scope.workspaceId, scope.sourceBindingId, guid, url, title]);
  await admin.query(`INSERT INTO feed_items(id, tenant_id, workspace_id, interest_id, source_item_id,
    source_binding_id, provider_key, dedupe_key, canonical_url, title, body_preview,
    published_at, observed_at, status)
    VALUES($1,$2,$3,$4,$5,$6,'rss',$7,$7,$8,'Original body',
      '2026-09-24T12:00:00Z','2026-09-29T00:00:00Z','VISIBLE')`,
  [feedId, scope.tenantId, scope.workspaceId, scope.interestId, sourceId, scope.sourceBindingId, url, title]);
}

// Regression: the writer must request Serializable isolation, hold authority locks, and refuse changed authority.
it("holds source and binding authority through the Serializable write, then refuses changed authority", async () => {
  const entered = deferred(); const release = deferred();
  const pending = finite.withAtomicWrites(scope, feedUrl, JSON.stringify(bindingConfig), async () => {
    entered.resolve(); await release.promise; return "committed";
  });
  try {
    await Promise.race([entered.promise, pending.then(() => { throw new Error("Writer exited before lock probe"); })]);
    const control = await admin.connect();
    try {
      await control.query("SET lock_timeout = '250ms'");
      await expect(control.query("UPDATE source_bindings SET status = 'DISABLED' WHERE id = $1",
        [scope.sourceBindingId])).rejects.toMatchObject({ code: "55P03" });
      await expect(control.query("UPDATE source_catalog_entries SET provider_key = 'other' WHERE id = $1",
        [catalogId])).rejects.toMatchObject({ code: "55P03" });
    } finally { control.release(); }
  } finally { release.resolve(); }
  await expect(pending).resolves.toBe("committed");
  expect(transactionOptions).toEqual([{ isolationLevel: "Serializable", maxWait: 5000, timeout: 120000 }]);
  await admin.query("UPDATE source_bindings SET status = 'DISABLED' WHERE id = $1", [scope.sourceBindingId]);
  await expect(finite.withAtomicWrites(scope, feedUrl, JSON.stringify(bindingConfig), async () => "unsafe"))
    .rejects.toThrow("binding mismatch");
  await admin.query("UPDATE source_bindings SET status = 'ENABLED' WHERE id = $1", [scope.sourceBindingId]);
  await admin.query("UPDATE source_catalog_entries SET provider_key = 'other' WHERE id = $1", [catalogId]);
  await expect(finite.withAtomicWrites(scope, feedUrl, JSON.stringify(bindingConfig), async () => "unsafe"))
    .rejects.toThrow("binding mismatch");
});

// Regression: a finite collection login must not be able to edit approved bindings or existing feed content.
it("enforces the finite role and column ACL on real PostgreSQL sessions", async () => {
  expect(await verifyScopedRssRelation(writer, scope, feedUrl, JSON.stringify(bindingConfig))).toBe(true);
  const client = await writer.connect();
  try {
    const settings = await client.query<{ role: string; lock_timeout: string; statement_timeout: string }>(
      "SELECT current_user AS role, current_setting('lock_timeout') AS lock_timeout, " +
      "current_setting('statement_timeout') AS statement_timeout");
    expect(settings.rows).toEqual([{ role: "social_monitor_collection",
      lock_timeout: "5s", statement_timeout: "20s" }]);
    await expect(client.query("UPDATE source_bindings SET status = 'DISABLED' WHERE id = $1",
      [scope.sourceBindingId])).rejects.toMatchObject({ code: "42501" });
    await seedExisting("guid-1", "Original");
    await expect(client.query("UPDATE feed_items SET title = 'Corrupted' WHERE title = 'Original'"))
      .rejects.toMatchObject({ code: "42501" });
    const guarded = insertOnlyFeedTransaction({ feedItem: {
      create: async ({ data }: { data: { id: string; dedupeKey: string; title: string } }) =>
        client.query(`INSERT INTO feed_items(id, tenant_id, workspace_id, interest_id, source_item_id,
          source_binding_id, provider_key, dedupe_key, canonical_url, title, body_preview,
          published_at, observed_at, status)
          SELECT $1, tenant_id, workspace_id, interest_id, source_item_id, source_binding_id,
            provider_key, $2, canonical_url, $3, body_preview, published_at, observed_at, status
          FROM feed_items WHERE title = 'Original'`, [data.id, data.dedupeKey, data.title]),
      upsert: async (args: { create: { id: string; dedupeKey: string; title: string } }) => {
        void args;
        throw new Error("unsafe upsert reached");
      },
      update: async () => { throw new Error("unsafe update reached"); },
    } });
    await expect(guarded.feedItem.upsert({ create: { id: "00000000-0000-4000-8000-000000000009",
      dedupeKey: "https://example.test/posts/guid-1", title: "Corrupted" } }))
      .rejects.toMatchObject({ code: "23505" });
    const rows = await admin.query<{ title: string }>(
      "SELECT title FROM feed_items WHERE dedupe_key = 'https://example.test/posts/guid-1'");
    expect(rows.rows).toEqual([{ title: "Original" }]);
  } finally { client.release(); }
});

// Regression: an unlimited or overlong collection login must be refused before the write callback runs.
it("refuses invalid finite role lifetimes before entering a write callback", async () => {
  for (const until of ["infinity", new Date(Date.now() + 60 * 60_000).toISOString()]) {
    await admin.query(`ALTER ROLE social_monitor_collection VALID UNTIL '${until}'`);
    const write = jest.fn(async () => "unsafe");
    try {
      await expect(finite.withAtomicWrites(scope, feedUrl, JSON.stringify(bindingConfig), write))
        .rejects.toThrow("Finite collection role is unavailable");
      expect(write).not.toHaveBeenCalled();
    } finally {
      await admin.query(`ALTER ROLE social_monitor_collection VALID UNTIL
        '${new Date(Date.now() + 15 * 60_000).toISOString()}'`);
    }
  }
  expect((await admin.query("SELECT 1 FROM source_items")).rowCount).toBe(0);
  expect((await admin.query("SELECT 1 FROM feed_items")).rowCount).toBe(0);
});

// Regression: production source/feed adapters must preserve an existing GUID and derive URL dedupe for the new item.
it("preserves an existing GUID and imports only the absent synthetic item", async () => {
  await seedExisting("guid-1", "Original");
  const capture = artifacts(["guid-1", "guid-2"]); const plan = planRssSep24Verified(capture);
  const path = await journalPath();
  const receipt = await importRssSep24Verified({ artifacts: capture, expectedPlanSha256: plan.planSha256,
    journalPath: path, scope, dependencies: databaseWrites() });
  expect(receipt).toMatchObject({ inserted: 1, alreadyPresent: 1, postWritePresent: 2 });
  expect(JSON.parse((await readFile(path)).toString("utf8"))).toMatchObject({ status: "complete" });
  const sourceRows = await admin.query<{ provider_item_id: string; title: string }>(
    "SELECT provider_item_id, title FROM source_items ORDER BY provider_item_id");
  expect(sourceRows.rows).toEqual([{ provider_item_id: "guid-1", title: "Original" },
    { provider_item_id: "guid-2", title: "Synthetic guid-2" }]);
  const feedRows = await admin.query<{ dedupe_key: string; title: string }>(
    "SELECT dedupe_key, title FROM feed_items ORDER BY dedupe_key");
  expect(feedRows.rows).toEqual([{ dedupe_key: "https://example.test/posts/guid-1", title: "Original" },
    { dedupe_key: "https://example.test/posts/guid-2", title: "Synthetic guid-2" }]);
  const linked = await admin.query<{ provider_item_id: string; dedupe_key: string }>(`
    SELECT s.provider_item_id, f.dedupe_key FROM feed_items f
    JOIN source_items s ON s.id = f.source_item_id ORDER BY s.provider_item_id`);
  expect(linked.rows).toEqual([{ provider_item_id: "guid-1", dedupe_key: "https://example.test/posts/guid-1" },
    { provider_item_id: "guid-2", dedupe_key: "https://example.test/posts/guid-2" }]);
  expect((await admin.query("SELECT 1 FROM feed_signal_baseline_samples")).rowCount).toBe(0);
});

// Regression: a second GUID for the same canonical URL must hit real feed dedupe, preserve the old row, and roll back.
it("rejects a distinct GUID whose derived feed key already exists", async () => {
  await seedExisting("guid-1", "Original");
  const capture = artifacts(["guid-other"], () => "https://example.test/posts/guid-1");
  const plan = planRssSep24Verified(capture);
  const path = await journalPath();
  await expect(importRssSep24Verified({ artifacts: capture, expectedPlanSha256: plan.planSha256,
    journalPath: path, scope, dependencies: databaseWrites() })).rejects.toThrow("journal remains started");
  expect(JSON.parse((await readFile(path)).toString("utf8"))).toMatchObject({ status: "started" });
  const sources = await admin.query<{ provider_item_id: string }>(
    "SELECT provider_item_id FROM source_items ORDER BY provider_item_id");
  expect(sources.rows).toEqual([{ provider_item_id: "guid-1" }]);
  const feeds = await admin.query<{ title: string; dedupe_key: string }>(
    "SELECT title, dedupe_key FROM feed_items");
  expect(feeds.rows).toEqual([{ title: "Original", dedupe_key: "https://example.test/posts/guid-1" }]);
  expect((await admin.query("SELECT 1 FROM feed_signal_baseline_samples")).rowCount).toBe(0);
});

// Regression: a competing authority transaction must time out the finite writer and preserve its started journal.
it("bounds a blocked importer lock and preserves a journal for reconciliation", async () => {
  const blocker = await admin.connect();
  const capture = artifacts(["guid-timeout"]); const plan = planRssSep24Verified(capture);
  const path = await journalPath();
  try {
    await blocker.query("BEGIN");
    await blocker.query("UPDATE source_bindings SET status = 'DISABLED' WHERE id = $1", [scope.sourceBindingId]);
    await expect(importRssSep24Verified({ artifacts: capture, expectedPlanSha256: plan.planSha256,
      journalPath: path, scope, dependencies: databaseWrites() })).rejects.toMatchObject({ code: "55P03" });
  } finally { await blocker.query("ROLLBACK"); blocker.release(); }
  expect(JSON.parse((await readFile(path)).toString("utf8"))).toMatchObject({ status: "started" });
  expect((await admin.query("SELECT 1 FROM source_items")).rowCount).toBe(0);
  expect((await admin.query("SELECT 1 FROM feed_items")).rowCount).toBe(0);
  expect((await admin.query("SELECT 1 FROM feed_signal_baseline_samples")).rowCount).toBe(0);
});

// Regression: failure after both production adapters write must roll back source/feed/baseline rows and retain the journal.
it("rolls back a failed write and leaves the started journal recoverable", async () => {
  const capture = artifacts(["guid-rollback"]); const plan = planRssSep24Verified(capture);
  const path = await journalPath();
  const request = { artifacts: capture, expectedPlanSha256: plan.planSha256,
    journalPath: path, scope, dependencies: databaseWrites(true) };
  await expect(importRssSep24Verified(request)).rejects.toThrow("journal remains started");
  expect(JSON.parse((await readFile(path)).toString("utf8"))).toMatchObject({ status: "started",
    candidateIds: ["guid-rollback"] });
  expect((await admin.query("SELECT 1 FROM source_items")).rowCount).toBe(0);
  expect((await admin.query("SELECT 1 FROM feed_items")).rowCount).toBe(0);
  expect((await admin.query("SELECT 1 FROM feed_signal_baseline_samples")).rowCount).toBe(0);
  await expect(importRssSep24Verified({ ...request, dependencies: databaseWrites() }))
    .rejects.toThrow("Previous RSS journal/replay");
});
}
