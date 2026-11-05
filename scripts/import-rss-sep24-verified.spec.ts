import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { execFileSync } from "node:child_process";

import type { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { SourceItem } from "@social-monitor/ingestion/domain";
import { PrismaFeedProjectionAdapter } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter";
import type { PrismaFeedClient } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-client";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { RSS_SEP24_JOURNAL } from "./recover-rss-sep24-verified";

import { createFiniteRssDependencies, finiteRssDatabaseUrl, insertOnlyFeedTransaction,
  parseRssOperatorArgs, planRssOperator, readRssSep24OperatorArtifacts,
  runRssOperatorWithRuntime } from "./import-rss-sep24-verified";

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const bindingId = "00000000-0000-4000-8000-000000000004";
const feedUrl = "https://example.test/rss";
const uid = process.getuid?.() ?? 0;
const scopes = ["--tenant-id", "00000000-0000-4000-8000-000000000001",
  "--workspace-id", "00000000-0000-4000-8000-000000000002",
  "--interest-id", "00000000-0000-4000-8000-000000000003",
  "--binding-id", bindingId,
  "--scan-policy-id", "00000000-0000-4000-8000-000000000005",
  "--correlation-id", "fixture-rss-sep24"];
const pinnedScope = { tenantId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  interestId: "00000000-0000-4000-8000-000000000003", sourceBindingId: bindingId,
  scanPolicyId: "00000000-0000-4000-8000-000000000005" };

describe("RSS Sep 24 operator boundary", () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
  async function capture() {
    const root = await mkdtemp(join(tmpdir(), "rss-sep24-pinned-"));
    roots.push(root);
    const binding = json([{ bindingId, status: "ENABLED", config: { feedUrl, maxItems: 30,
      targetPublishedWindow: { startInclusive: "2026-09-24T00:00:00.000Z",
        endExclusive: "2026-09-25T00:00:00.000Z" } } }]);
    const items = json({ schemaVersion: 1, day: "2026-09-24", items: [{ externalId: "guid-1",
      canonicalUrl: "https://example.test/post/1", title: "Captured", body: "Original text",
      publishedAt: "2026-09-24T12:00:00.000Z", metadata: { kind: "rss_item", feedUrl } }] });
    const manifest = json({ schemaVersion: 1, day: "2026-09-24", providerKey: "rss", bindingId,
      bindingSha256: sha(binding), scope: pinnedScope, scanMode: "read_only", sourceStatus: "partial",
      window: { from: "2026-09-24T00:00:00.000Z", to: "2026-09-25T00:00:00.000Z" },
      selectedIds: ["guid-1"], itemsSha256: sha(items) });
    const pins = json({ schemaVersion: 1, day: "2026-09-24", scope: pinnedScope,
      bindingSha256: sha(binding),
      manifestSha256: sha(manifest), itemsSha256: sha(items) });
    await Promise.all([["bindings-sanitized.json", binding], ["manifest.json", manifest],
      ["items.json", items], ["pins-rss-sep24.json", pins]].map(async ([name, bytes]) => {
      await writeFile(join(root, name as string), bytes as Buffer, { mode: 0o600 });
    }));
    await chmod(root, 0o700);
    return { root, inputRoot: root, expectedPinsSha256: sha(pins), pins };
  }

  // Regression: plan mode must validate exact bytes without any credential or SQL access.
  it("returns a read-only deterministic plan and rejects changed pin bytes", async () => {
    const captured = await capture();
    const request = { inputRoot: captured.root, expectedPinsSha256: captured.expectedPinsSha256 };
    const first = await planRssOperator(request, uid);
    expect(await planRssOperator(request, uid)).toEqual(first);
    expect(first).toMatchObject({ status: "PLAN_ONLY", coverage: "PARTIAL_SOURCE_ONLY",
      selectedCount: 1, distinctCount: 1 });
    await writeFile(join(captured.root, "items.json"), Buffer.from("{}"), { mode: 0o600 });
    await expect(readRssSep24OperatorArtifacts(request, uid)).rejects.toThrow("SHA-256 mismatch");
  });

  // Regression: a pin can name only the capture's tenant/workspace relation.
  it("rejects a re-pinned scope that disagrees with the captured scan", async () => {
    const captured = await capture();
    const altered = JSON.parse(captured.pins.toString("utf8")) as Record<string, unknown>;
    altered.scope = { ...pinnedScope, workspaceId: "00000000-0000-4000-8000-000000000099" };
    const bytes = json(altered);
    await writeFile(join(captured.root, "pins-rss-sep24.json"), bytes, { mode: 0o600 });
    await expect(planRssOperator({ inputRoot: captured.root, expectedPinsSha256: sha(bytes) }, uid))
      .rejects.toThrow("Manifest binding/day/source proof mismatch");
  });

  // Regression: caller paths, directory symlinks, and file symlinks must never escape the explicit mount.
  it("rejects unsafe paths and symlinks", async () => {
    const captured = await capture();
    expect(() => parseRssOperatorArgs(["--plan-only", "--input-root", "relative",
      "--pins-sha256", captured.expectedPinsSha256])).toThrow("absolute");
    await expect(planRssOperator({ inputRoot: undefined as unknown as string,
      expectedPinsSha256: captured.expectedPinsSha256 }, uid)).rejects.toThrow("Path must be explicit and absolute");
    const request = { inputRoot: captured.root, expectedPinsSha256: captured.expectedPinsSha256 };
    await rm(join(captured.root, "items.json"));
    await symlink("/etc/hosts", join(captured.root, "items.json"));
    await expect(readRssSep24OperatorArtifacts(request, uid)).rejects.toThrow("private regular file");
    const linked = join(captured.root, "linked");
    await symlink(captured.root, linked);
    await expect(readRssSep24OperatorArtifacts({ ...request, inputRoot: linked }, uid))
      .rejects.toThrow("Input root must be private");
  });

  // Regression: stale plan, wrong scope, and missing finite credential must fail before DB adapters open.
  it("rejects write preflight failures before opening a database", async () => {
    const captured = await capture();
    const journalDir = join(captured.root, "journal");
    await mkdir(journalDir, { mode: 0o700 });
    const plan = await planRssOperator(captured, uid);
    const parsed = parseRssOperatorArgs(["--write", "--input-root", captured.root,
      "--pins-sha256", captured.expectedPinsSha256, "--plan-sha256", "0".repeat(64),
      "--journal-dir", journalDir, ...scopes]);
    const openSql = jest.fn(); const openPrisma = jest.fn();
    const runtime = { openSql, openPrisma, testOwnerUid: uid };
    await expect(runRssOperatorWithRuntime(parsed.request, "synthetic-db-url", runtime))
      .rejects.toThrow("Pinned plan or binding mismatch");
    await expect(runRssOperatorWithRuntime({ ...parsed.request, expectedPlanSha256: plan.planSha256 }, "", runtime))
      .rejects.toThrow("finite external credential");
    expect(openSql).not.toHaveBeenCalled();
    expect(openPrisma).not.toHaveBeenCalled();
    await expect(readFile(join(journalDir, "rss-verified-posts-2026-09-24.journal.json")))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  // Regression: a valid plan still cannot open a writer when the scoped SQL role is not finite.
  it("refuses a nonfinite collection role before Prisma opens", async () => {
    const captured = await capture();
    const journalDir = join(captured.root, "journal");
    await mkdir(journalDir, { mode: 0o700 });
    const plan = await planRssOperator(captured, uid);
    const request = parseRssOperatorArgs(["--write", "--input-root", captured.root,
      "--pins-sha256", captured.expectedPinsSha256, "--plan-sha256", plan.planSha256,
      "--journal-dir", journalDir, ...scopes]).request;
    const client = { query: jest.fn(async () => ({ rows: [{ allowed: false }] })), release: jest.fn() };
    const end = jest.fn(async () => undefined);
    const openSql = jest.fn(() => ({ connect: async () => client, end }));
    const openPrisma = jest.fn();
    await expect(runRssOperatorWithRuntime(request, "synthetic-db-url", { openSql, openPrisma,
      testOwnerUid: uid } as unknown as Parameters<typeof runRssOperatorWithRuntime>[2]))
      .rejects.toThrow("Finite collection role is unavailable");
    expect(openPrisma).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
    expect(end).toHaveBeenCalled();
  });

  it("refuses a private input or journal below a writable ancestor", async () => {
    const captured = await capture();
    const unsafe = join(captured.root, "shared");
    const child = join(unsafe, "private");
    await mkdir(child, { recursive: true, mode: 0o700 });
    await chmod(unsafe, 0o777);
    await chmod(child, 0o700);
    await expect(readRssSep24OperatorArtifacts({ inputRoot: child,
      expectedPinsSha256: captured.expectedPinsSha256 }, uid)).rejects.toThrow("attacker-writable ancestor");
    const plan = await planRssOperator(captured, uid);
    const runtime = { openSql: jest.fn(), openPrisma: jest.fn(), testOwnerUid: uid };
    await expect(runRssOperatorWithRuntime({ ...captured, expectedPlanSha256: plan.planSha256,
      journalDir: child, scope: pinnedScope as never }, "synthetic-db-url", runtime))
      .rejects.toThrow("attacker-writable ancestor");
    expect(runtime.openSql).not.toHaveBeenCalled();
  });

  it("refuses a journal parent swapped between preflight and the first write", async () => {
    const captured = await capture();
    const journalDir = join(captured.root, "journal");
    const moved = join(captured.root, "journal-moved");
    await mkdir(journalDir, { mode: 0o700 });
    const plan = await planRssOperator(captured, uid);
    const query = jest.fn(async (sql: string) => ({ rows: sql.includes("FROM pg_roles")
      ? [{ allowed: true }] : sql.includes("FROM tenants") ? [{ one: 1 }] : [] }));
    const release = jest.fn();
    const end = jest.fn(async () => undefined);
    const writer = { $transaction: jest.fn(), close: jest.fn(async () => undefined) };
    const openPrisma = jest.fn(async () => {
      await rename(journalDir, moved);
      await mkdir(journalDir, { mode: 0o700 });
      return writer as unknown as PrismaIngestionWorkerConnection;
    });
    const request = { ...captured, expectedPlanSha256: plan.planSha256, journalDir,
      scope: { ...pinnedScope, tenantId: tenantId(pinnedScope.tenantId),
        workspaceId: workspaceId(pinnedScope.workspaceId), correlationId: "fixture" } };
    await expect(runRssOperatorWithRuntime(request, "synthetic-db-url", {
      openSql: () => ({ connect: async () => ({ query, release }), end }), openPrisma,
      testOwnerUid: uid } as unknown as Parameters<typeof runRssOperatorWithRuntime>[2]))
      .rejects.toThrow("journal directory moved");
    expect(writer.$transaction).not.toHaveBeenCalled();
    await expect(readFile(join(moved, RSS_SEP24_JOURNAL))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(journalDir, RSS_SEP24_JOURNAL))).rejects.toMatchObject({ code: "ENOENT" });
    expect(release).toHaveBeenCalled();
    expect(end).toHaveBeenCalled();
    expect(writer.close).toHaveBeenCalled();
  });

  it("makes the actual feed projection refuse both dedupe collisions and existing source rows", async () => {
    const existing = { id: "feed-old", tenantId: pinnedScope.tenantId,
      workspaceId: pinnedScope.workspaceId, interestId: pinnedScope.interestId,
      sourceItemId: "other-source", sourceBindingId: bindingId, providerKey: "rss",
      dedupeKey: "https://example.test/post/1", canonicalUrl: "https://example.test/post/1",
      title: "Original", bodyPreview: "Original body", authorHandle: null,
      publishedAt: new Date("2026-09-24T11:00:00.000Z"), observedAt: new Date("2026-09-24T11:00:00.000Z"),
      createdAt: new Date("2026-09-24T11:00:00.000Z"), providerMetadata: null, status: "VISIBLE" as const };
    const row = { ...existing };
    const model = { findFirst: jest.fn(async ({ where }: { where: { sourceItemId: string } }) =>
      where.sourceItemId === row.sourceItemId ? row : null),
    create: jest.fn(async ({ data }: { data: typeof row }) => {
      if (data.dedupeKey === row.dedupeKey) throw Object.assign(new Error("unique collision"), { code: "P2002" });
      Object.assign(row, data); return row;
    }),
    upsert: jest.fn(async ({ update }: { update: Partial<typeof row> }) => { Object.assign(row, update); return row; }),
    update: jest.fn(async ({ data }: { data: Partial<typeof row> }) => { Object.assign(row, data); return row; }) };
    const tx = insertOnlyFeedTransaction({ feedItem: model,
      feedSignalBaselineSample: { deleteMany: async () => ({ count: 0 }), upsert: async () => { throw new Error("unexpected baseline"); } },
      $transaction: async <T>(work: (client: unknown) => Promise<T>) => work(tx) });
    const adapter = new PrismaFeedProjectionAdapter(tx as unknown as PrismaFeedClient,
      { generate: () => "new-feed-id" });
    const source = (id: string) => SourceItem.ingest({ id, tenantId: tenantId(pinnedScope.tenantId),
      workspaceId: workspaceId(pinnedScope.workspaceId), sourceBindingId: bindingId,
      externalId: "guid-new", canonicalUrl: existing.canonicalUrl, title: "Replacement", body: "Replacement body",
      publishedAt: new Date("2026-09-24T12:00:00.000Z"), ingestedAt: new Date("2026-09-29T00:00:00.000Z"),
      metadata: { kind: "rss_item", feedUrl } });
    const command = { tenantId: tenantId(pinnedScope.tenantId), workspaceId: workspaceId(pinnedScope.workspaceId),
      interestId: pinnedScope.interestId, sourceBindingId: bindingId, providerKey: "rss",
      snapshots: { interestQuerySnapshot: { interestId: pinnedScope.interestId, query: feedUrl },
        sourceBindingSnapshot: { sourceBindingId: bindingId, providerKey: "rss", sourceQuery: { mode: "url" as const, query: feedUrl } },
        workspaceScopeSnapshot: { tenantId: tenantId(pinnedScope.tenantId), workspaceId: workspaceId(pinnedScope.workspaceId) } } };
    await expect(adapter.project({ ...command, sourceItems: [source("new-source")] })).rejects.toThrow();
    expect(row).toEqual(existing);
    expect(model.upsert).not.toHaveBeenCalled();
    await expect(adapter.project({ ...command, sourceItems: [source("other-source")] }))
      .rejects.toThrow("refuses existing rows");
    expect(row).toEqual(existing);
    expect(model.update).not.toHaveBeenCalled();
  });

  it("refuses writes when a relation is disabled before the locked write transaction", async () => {
    let enabled = true;
    let enterTransaction!: () => void;
    const transactionGate = new Promise<void>((resolve) => { enterTransaction = resolve; });
    const queries: string[] = [];
    const connection = { $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
      await transactionGate;
      return work({
      $queryRawUnsafe: async (sql: string) => {
        queries.push(sql);
        if (sql.includes("FROM pg_roles")) return [{ allowed: true }];
        if (sql.includes("FROM tenants")) return enabled ? [{ one: 1 }] : [];
        throw new Error("unexpected query");
      } });
    } } as unknown as PrismaIngestionWorkerConnection;
    const dependencies = createFiniteRssDependencies(connection);
    const work = jest.fn(async () => 1);
    const pending = dependencies.withAtomicWrites({ ...pinnedScope, tenantId: tenantId(pinnedScope.tenantId),
      workspaceId: workspaceId(pinnedScope.workspaceId), correlationId: "fixture" }, feedUrl,
      JSON.stringify({ feedUrl }), work);
    expect(enabled).toBe(true); // the separate preflight saw the approved relation
    enabled = false; // a concurrent disable commits while the writer waits to enter its transaction
    enterTransaction();
    await expect(pending).rejects.toThrow("binding mismatch");
    expect(work).not.toHaveBeenCalled();
    expect(queries.some((query) => query.includes("FOR SHARE OF t, w, i, sb, sce, sp"))).toBe(true);
  });

  it("checks the pinned relation with executable PostgreSQL joins inside the write transaction", () => {
    // PGlite loads WASM through dynamic import. Run it in a child Node process so the
    // repository's normal Jest command can exercise actual PostgreSQL SQL unchanged.
    const script = `
      const { PGlite } = require('@electric-sql/pglite');
      const { createFiniteRssDependencies } = require('./scripts/import-rss-sep24-verified');
      const scope = { ...${JSON.stringify(pinnedScope)}, correlationId: 'fixture' };
      const feedUrl = ${JSON.stringify(feedUrl)};
      (async () => {
        const db = new PGlite();
        try {
          await db.exec(\`CREATE TABLE tenants(id uuid PRIMARY KEY, deleted_at timestamptz);
            CREATE TABLE workspaces(id uuid PRIMARY KEY, tenant_id uuid, deleted_at timestamptz);
            CREATE TABLE interests(id uuid PRIMARY KEY, tenant_id uuid, workspace_id uuid, status text, deleted_at timestamptz);
            CREATE TABLE source_catalog_entries(id uuid PRIMARY KEY, provider_key text);
            CREATE TABLE source_bindings(id uuid PRIMARY KEY, tenant_id uuid, workspace_id uuid, interest_id uuid,
              source_catalog_entry_id uuid, status text, deleted_at timestamptz, config jsonb);
            CREATE TABLE scan_policies(id uuid PRIMARY KEY, tenant_id uuid, workspace_id uuid, source_binding_id uuid);\`);
          const catalogId = '00000000-0000-4000-8000-000000000006';
          await db.query('INSERT INTO tenants(id) VALUES ($1)', [scope.tenantId]);
          await db.query('INSERT INTO workspaces(id, tenant_id) VALUES ($1, $2)', [scope.workspaceId, scope.tenantId]);
          await db.query("INSERT INTO interests(id, tenant_id, workspace_id, status) VALUES ($1, $2, $3, 'ENABLED')",
            [scope.interestId, scope.tenantId, scope.workspaceId]);
          await db.query("INSERT INTO source_catalog_entries(id, provider_key) VALUES ($1, 'rss')", [catalogId]);
          await db.query(\`INSERT INTO source_bindings(id, tenant_id, workspace_id, interest_id,
            source_catalog_entry_id, status, config) VALUES ($1, $2, $3, $4, $5, 'ENABLED', $6::jsonb)\`,
            [scope.sourceBindingId, scope.tenantId, scope.workspaceId, scope.interestId,
              catalogId, JSON.stringify({ feedUrl })]);
          await db.query('INSERT INTO scan_policies(id, tenant_id, workspace_id, source_binding_id) VALUES ($1, $2, $3, $4)',
            [scope.scanPolicyId, scope.tenantId, scope.workspaceId, scope.sourceBindingId]);
          const connection = { $transaction: async (work) => {
            await db.exec('BEGIN');
            try {
              const value = await work({ feedItem: {}, $queryRawUnsafe: async (sql, ...values) =>
                sql.includes('FROM pg_roles') ? [{ allowed: true }] : (await db.query(sql, values)).rows });
              await db.exec('COMMIT');
              return value;
            } catch (error) { await db.exec('ROLLBACK'); throw error; }
          } };
          const dependencies = createFiniteRssDependencies(connection);
          let writes = 0;
          const attempt = () => dependencies.withAtomicWrites(scope, feedUrl, JSON.stringify({ feedUrl }),
            async () => { writes += 1; return 1; });
          if (await attempt() !== 1) throw new Error('approved relation failed');
          await db.query("UPDATE source_bindings SET status = 'DISABLED' WHERE id = $1", [scope.sourceBindingId]);
          await expectRefusal(attempt);
          await db.query("UPDATE source_bindings SET status = 'ENABLED', config = $2::jsonb WHERE id = $1",
            [scope.sourceBindingId, JSON.stringify({ feedUrl: 'https://other.example.test/rss' })]);
          await expectRefusal(attempt);
          if (writes !== 1) throw new Error('changed relation reached writes');
          process.stdout.write('relation SQL OK');
        } finally { await db.close(); }
      })().catch((error) => { process.stderr.write(error.message); process.exitCode = 1; });
      async function expectRefusal(attempt) {
        try { await attempt(); } catch (error) {
          if (error.message.includes('binding mismatch')) return;
          throw error;
        }
        throw new Error('changed relation was accepted');
      }
    `;
    expect(execFileSync(process.execPath, ["-r", "ts-node/register", "-r", "tsconfig-paths/register",
      "-e", script], { cwd: process.cwd(), encoding: "utf8", timeout: 20000 })).toBe("relation SQL OK");
  });

  it("times out a blocked pg query with the finite URL settings without contacting a database", async () => {
    const url = finiteRssDatabaseUrl("postgres://localhost/synthetic");
    const client = new Client({ connectionString: url });
    const parameters = (client as unknown as { connectionParameters: Record<string, unknown> }).connectionParameters;
    expect(parameters.statement_timeout).toBe("20000");
    expect(parameters.lock_timeout).toBe("5000");
    expect(parameters.query_timeout).toBe("25000");
    // A locally queued query never receives a result because connect() is deliberately omitted.
    jest.useFakeTimers();
    try {
      const blocked = expect(client.query("SELECT 1")).rejects.toThrow("Query read timeout");
      await jest.advanceTimersByTimeAsync(25001);
      await blocked;
    } finally { jest.useRealTimers(); }
  });
});
