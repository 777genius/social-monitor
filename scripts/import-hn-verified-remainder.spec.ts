import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HackerNewsClientPort, HackerNewsSearchOptions, HackerNewsStory } from
  "@social-monitor/ingestion/adapters/source/hacker-news/hacker-news-client.port";
import { PrismaSourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository";
import {
  FakeConversationProjection, FakeFeedProjection, FakeScanAttemptRepository, FakeScanLease,
  FakeSourceItemRepository, SequenceIdGenerator,
} from "@social-monitor/ingestion/features/execute-scan/execute-scan.use-case.spec-support";
import type { SaveSourceItemsCommand } from "@social-monitor/ingestion/ports";
import { FixedClock, type TenantId, type WorkspaceId } from "@social-monitor/shared-kernel";
import { currentDatabaseAccess, runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";

import type { PrismaIngestionWorkerConnection } from "../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection";
import { recoverHnPublicHistoricalDay } from "./recover-hn-public-historical-day";
import * as recovery from "./recover-hn-verified-remainder";
import { importVerifiedHnRemainder, planVerifiedHnRemainder,
  type PinnedDayArtifact, type VerifiedHnImportDependencies, type VerifiedHnImportScope } from
  "./recover-hn-verified-remainder";
import { assertFiniteCollectionRole, composeImportDependencies, findScopedExistingIds,
  parseOperatorArgs, readOperatorArtifacts, redactedOperatorReceipt, runVerifiedHnOperatorWithRuntime,
  verifyCurrentRelation,
  type OperatorRequest } from "./import-hn-verified-remainder";

const sha = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");
const testOwnerUid = process.getuid?.() ?? 0;
const journalName = "hn-verified-remainder-2026-09-20_27.journal.json";
const scope: VerifiedHnImportScope = {
  tenantId: "00000000-0000-4000-8000-000000000001" as TenantId,
  workspaceId: "00000000-0000-4000-8000-000000000002" as WorkspaceId,
  interestId: "00000000-0000-4000-8000-000000000003",
  sourceBindingId: "00000000-0000-4000-8000-000000000004",
  scanPolicyId: "00000000-0000-4000-8000-000000000005", correlationId: "synthetic-correlation",
};

class SyntheticHnClient implements HackerNewsClientPort {
  async searchStories(query: string, _limit: number, options?: HackerNewsSearchOptions): Promise<readonly HackerNewsStory[]> {
    const index = Number(/^term-(\d+)$/u.exec(query)?.[1] ?? 0);
    const from = options?.from;
    if (from === undefined) throw new Error("Synthetic day window missing");
    const count = index === 1 ? 3 : 1;
    return Array.from({ length: count }, (_, offset) => ({
      id: (from.getUTCDate() - 20) * 1000 + index * 10 + offset + 1,
      kind: "story" as const, title: `Synthetic title ${index}-${offset}`,
      time: Math.floor(from.getTime() / 1000) + index + 1,
    }));
  }
  async searchComments(): Promise<readonly HackerNewsStory[]> { throw new Error("No synthetic comment fetch"); }
  async getStory(): Promise<HackerNewsStory | null> { throw new Error("No synthetic story fetch"); }
  async listStoryComments(): Promise<readonly HackerNewsStory[]> { throw new Error("No synthetic comment expansion"); }
  async listStories(): Promise<readonly HackerNewsStory[]> { throw new Error("No live listing"); }
}

const roots: string[] = [];
afterEach(async () => {
  jest.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function campaign() {
  const root = await mkdtemp(join(tmpdir(), "hn-operator-synthetic-"));
  roots.push(root);
  const bindingPath = join(root, "bindings-sanitized.json");
  await writeFile(bindingPath, JSON.stringify([{ bindingId: scope.sourceBindingId, status: "ENABLED", config: {
    mode: "search", query: "synthetic query", maxItems: 100, maxItemAgeHours: 48,
    scanPasses: Array.from({ length: 28 }, (_, index) => ({ mode: "search", target: "story",
      query: `term-${index}`, maxItems: 2 })),
  } }]), { mode: 0o600 });
  const bindingBytes = await readFile(bindingPath);
  const days: PinnedDayArtifact[] = [];
  const dayPins: { day: string; directory: string; manifestSha256: string }[] = [];
  for (let index = 0; index < 8; index++) {
    const day = `2026-09-${index + 20}`;
    const directory = `filevault-hetzner-${day}`;
    const outputDir = join(root, directory);
    await recoverHnPublicHistoricalDay({ day, bindingsPath: bindingPath, outputDir,
      client: new SyntheticHnClient() });
    const manifestPath = join(outputDir, "manifest.json");
    const itemsPath = join(outputDir, "items.json");
    const manifestBytes = await readFile(manifestPath);
    const itemsBytes = await readFile(itemsPath);
    days.push({ day, manifestBytes, itemsBytes, expectedManifestSha256: sha(manifestBytes) });
    dayPins.push({ day, directory, manifestSha256: sha(manifestBytes) });
  }
  const pinsPath = join(root, "pins-20260928.json");
  await writeFile(pinsPath, JSON.stringify({ schemaVersion: 1,
    bindingSha256: sha(bindingBytes), days: dayPins }), { mode: 0o600 });
  const artifacts = { bindingBytes, expectedBindingSha256: sha(bindingBytes), days };
  const request: OperatorRequest = { inputRoot: root, pinsPath,
    expectedPlanSha256: planVerifiedHnRemainder(artifacts).planSha256, journalDir: root, scope };
  return { root, request, artifacts, dayPins };
}

function syntheticDependencies(): VerifiedHnImportDependencies {
  const sourceItems = new FakeSourceItemRepository();
  return { verifyCurrentBinding: async () => true, findExistingExternalIds: async () => [],
    sourceItems: { saveBatchInsertOnly: (command) => sourceItems.saveBatch(command) },
    feedProjection: new FakeFeedProjection(), conversationProjection: new FakeConversationProjection(),
    scanAttempts: new FakeScanAttemptRepository(), scanLeases: new FakeScanLease(),
    ids: new SequenceIdGenerator(), clock: new FixedClock(new Date("2026-09-28T00:00:00.000Z")) };
}

function fakeSql(rows: readonly Record<string, unknown>[]) {
  const calls: { text: string; values: readonly unknown[] }[] = [];
  const client = {
    query: jest.fn(async (text: string, values: readonly unknown[] = []) => {
      calls.push({ text, values });
      if (text.includes("FROM pg_roles")) return { rows: [{ allowed: true }] };
      if (text.includes("FROM tenants")) return { rows };
      if (text.includes("FROM source_items")) return { rows };
      return { rows: [] };
    }),
    release: jest.fn(),
  };
  const pool = { connect: jest.fn(async () => client) };
  return { pool: pool as unknown as Parameters<typeof verifyCurrentRelation>[0], client, calls };
}

describe("verified HN operator admission", () => {
  it.each(["wrong user", "expired", "infinite", "more than 30 minutes", "LOGIN disabled"])(
    "refuses %s role before a journal or write", async () => {
      const query = jest.fn(async (sql: string) => { void sql; return { rows: [{ allowed: false }] }; });
      await expect(assertFiniteCollectionRole({ query } as unknown as Parameters<typeof assertFiniteCollectionRole>[0]))
        .rejects.toThrow("Finite collection role");
      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0]?.[0]).toContain("current_user = 'social_monitor_collection'");
      expect(query.mock.calls[0]?.[0]).toContain("rolcanlogin");
      expect(query.mock.calls[0]?.[0]).toContain("rolvaliduntil IS NOT NULL");
      expect(query.mock.calls[0]?.[0]).toContain("rolvaliduntil > now()");
      expect(query.mock.calls[0]?.[0]).toContain("rolvaliduntil <= now() + interval '30 minutes'");
    });

  it("reads the complete real-shaped eight-day pin archive", async () => {
    const { request, artifacts } = await campaign();
    const read = await readOperatorArtifacts(request, testOwnerUid);
    expect(planVerifiedHnRemainder(read).planSha256).toBe(request.expectedPlanSha256);
    expect(read.days.map((day) => day.day)).toEqual(artifacts.days.map((day) => day.day));
  });

  it("rejects changed or missing archive bytes and unsafe directories before SQL or journal", async () => {
    const { root, request, dayPins } = await campaign();
    const pins = JSON.parse(await readFile(request.pinsPath, "utf8")) as Record<string, unknown>;
    const first = join(root, dayPins[0]!.directory);
    const originalItems = await readFile(join(first, "items.json"));
    await writeFile(join(first, "items.json"), Buffer.concat([originalItems, Buffer.from(" ")]));
    const openSql = jest.fn();
    const openPrisma = jest.fn();
    const runtime = { openSql, openPrisma, testOwnerUid } as unknown as
      Parameters<typeof runVerifiedHnOperatorWithRuntime>[2];
    await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime))
      .rejects.toThrow("SHA-256 mismatch");
    expect(openSql).not.toHaveBeenCalled();
    await writeFile(join(first, "items.json"), originalItems);
    const originalManifest = await readFile(join(first, "manifest.json"));
    await writeFile(join(first, "manifest.json"), Buffer.concat([originalManifest, Buffer.from(" ")]));
    await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime))
      .rejects.toThrow("SHA-256 mismatch");
    await writeFile(join(first, "manifest.json"), originalManifest);
    const originalBinding = await readFile(join(root, "bindings-sanitized.json"));
    await writeFile(join(root, "bindings-sanitized.json"), Buffer.concat([originalBinding, Buffer.from(" ")]));
    await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime))
      .rejects.toThrow("SHA-256 mismatch");
    await writeFile(join(root, "bindings-sanitized.json"), originalBinding);
    const diagnostic = { ...(JSON.parse(originalManifest.toString("utf8")) as Record<string, unknown>),
      windowHours: 4 };
    const diagnosticBytes = Buffer.from(`${JSON.stringify(diagnostic, null, 2)}\n`);
    await writeFile(join(first, "manifest.json"), diagnosticBytes);
    await writeFile(request.pinsPath, JSON.stringify({ ...pins, days: dayPins.map((pin, index) =>
      index === 0 ? { ...pin, manifestSha256: sha(diagnosticBytes) } : pin) }));
    await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime))
      .rejects.toThrow("manifest binding/day/coverage mismatch");
    await writeFile(join(first, "manifest.json"), originalManifest);
    await writeFile(request.pinsPath, JSON.stringify(pins));
    for (const [field, value, failure] of [
      ["day", "2026-09-21", "Day manifest binding or day mismatch"],
      ["bindingSha256", "0".repeat(64), "Day manifest binding or day mismatch"],
      ["itemsSha256", "0".repeat(64), "SHA-256 mismatch"],
    ] as const) {
      const changedBytes = Buffer.from(`${JSON.stringify({
        ...(JSON.parse(originalManifest.toString("utf8")) as Record<string, unknown>), [field]: value,
      }, null, 2)}\n`);
      await writeFile(join(first, "manifest.json"), changedBytes);
      await writeFile(request.pinsPath, JSON.stringify({ ...pins, days: dayPins.map((pin, index) =>
        index === 0 ? { ...pin, manifestSha256: sha(changedBytes) } : pin) }));
      await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime))
        .rejects.toThrow(failure);
      expect(openSql).not.toHaveBeenCalled();
    }
    await writeFile(join(first, "manifest.json"), originalManifest);
    await writeFile(request.pinsPath, JSON.stringify(pins));
    for (const directory of ["../elsewhere", "sub/day", "sub\\day", "/absolute", "."]) {
      await writeFile(request.pinsPath, JSON.stringify({ ...pins, days: dayPins.map((pin, index) =>
        index === 0 ? { ...pin, directory } : pin) }));
      await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime))
        .rejects.toThrow("Day pin directory");
      expect(openSql).not.toHaveBeenCalled();
    }
    for (const changedPins of [
      { ...pins, unexpected: true },
      { ...pins, days: dayPins.map((pin, index) => index === 0 ? { ...pin, itemsSha256: sha(originalItems) } : pin) },
      { ...pins, days: [dayPins[1], dayPins[0], ...dayPins.slice(2)] },
    ]) {
      await writeFile(request.pinsPath, JSON.stringify(changedPins));
      await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime)).rejects.toThrow();
      expect(openSql).not.toHaveBeenCalled();
    }
    await writeFile(request.pinsPath, JSON.stringify({ ...pins, days: dayPins.map((pin, index) =>
      index === 0 ? { ...pin, directory: "missing-day" } : pin) }));
    await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime)).rejects.toThrow();
    expect(openSql).not.toHaveBeenCalled();
    await writeFile(request.pinsPath, JSON.stringify(pins));
    await rm(join(first, "manifest.json"));
    await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime)).rejects.toThrow();
    expect(openSql).not.toHaveBeenCalled();
    await rm(request.pinsPath);
    await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime)).rejects.toThrow();
    expect(openSql).not.toHaveBeenCalled();
    expect(openPrisma).not.toHaveBeenCalled();
    await expect(readFile(join(root, journalName))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a mismatched plan before opening either database adapter", async () => {
    const { root, request } = await campaign();
    const openSql = jest.fn();
    const openPrisma = jest.fn();
    await expect(runVerifiedHnOperatorWithRuntime({ ...request,
      expectedPlanSha256: "0".repeat(64) }, "synthetic-db-url", {
      openSql, openPrisma, testOwnerUid,
    } as unknown as Parameters<typeof runVerifiedHnOperatorWithRuntime>[2]))
      .rejects.toThrow("Pinned plan or binding mismatch");
    expect(openSql).not.toHaveBeenCalled();
    expect(openPrisma).not.toHaveBeenCalled();
    await expect(readFile(join(root, journalName))).rejects.toMatchObject({ code: "ENOENT" });
    // Red if a stale plan can reach a SQL session, journal, or write.
  });

  it("rejects relation mismatch and scopes every relation key with the pinned query", async () => {
    const sql = fakeSql([]);
    await expect(verifyCurrentRelation(sql.pool, scope, "synthetic query")).resolves.toBe(false);
    const relation = sql.calls.find((call) => call.text.includes("FROM tenants"));
    expect(relation?.values).toEqual([scope.tenantId, scope.workspaceId, scope.interestId,
      scope.sourceBindingId, scope.scanPolicyId, "synthetic query"]);
    expect(relation?.text).toContain("sb.config->>'query' = $6");
    expect(relation?.text).toContain("t.id = $1::uuid");
    expect(relation?.text).toContain("w.id = $2::uuid");
    expect(relation?.text).toContain("w.tenant_id = t.id");
    expect(relation?.text).toContain("i.tenant_id = t.id");
    expect(relation?.text).toContain("i.workspace_id = w.id");
    expect(relation?.text).toContain("sb.tenant_id = t.id");
    expect(relation?.text).toContain("sb.workspace_id = w.id");
    expect(relation?.text).toContain("sb.interest_id = i.id");
    expect(relation?.text).toContain("sp.tenant_id = t.id");
    expect(relation?.text).toContain("sp.workspace_id = w.id");
    expect(relation?.text).toContain("sp.source_binding_id = sb.id");
    expect(relation?.text).toContain("sce.id = sb.source_catalog_entry_id");
    expect(relation?.text).toContain("i.id = $3::uuid");
    expect(relation?.text).toContain("sb.id = $4::uuid");
    expect(relation?.text).toContain("sp.id = $5::uuid");
    expect(relation?.text).toContain("sce.provider_key = 'hacker-news'");
    expect(relation?.text).toMatch(/i.status = 'ENABLED'.*i.deleted_at IS NULL/su);
    expect(relation?.text).toMatch(/sb.status = 'ENABLED'.*sb.deleted_at IS NULL/su);
    expect(relation?.text).toContain("t.deleted_at IS NULL");
    expect(relation?.text).toContain("w.deleted_at IS NULL");
    expect(sql.calls.find((call) => call.text.includes("FROM pg_roles"))).toBeDefined();
    expect(sql.calls.find((call) => call.text.includes("set_config"))).toBeDefined();
    // Red if another tenant/workspace/interest/policy or a changed binding query can pass.
  });

  it("the actual operator flow refuses a wrong role or relation before journal and domain writes", async () => {
    const { root, request } = await campaign();
    const openPrisma = jest.fn(async () => ({ close: jest.fn(async () => undefined) } as unknown as
      PrismaIngestionWorkerConnection));
    for (const condition of ["role", "relation"]) {
      const sql = fakeSql([]);
      if (condition === "role") sql.client.query.mockImplementation(async (text: string) =>
        text.includes("FROM pg_roles") ? { rows: [{ allowed: false }] } : { rows: [] });
      const end = jest.fn(async () => undefined);
      await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", {
        openSql: () => ({ ...sql.pool, end } as unknown as ReturnType<Parameters<typeof runVerifiedHnOperatorWithRuntime>[2]["openSql"]>),
        openPrisma, testOwnerUid,
      })).rejects.toThrow(condition === "role" ? "Finite collection role" : "Scoped HN relation");
      expect(end).toHaveBeenCalledTimes(1);
      expect(openPrisma).not.toHaveBeenCalled();
      await expect(readFile(join(root, journalName))).rejects.toMatchObject({ code: "ENOENT" });
    }
    // Red if either admission failure reaches the importer and creates a journal or write.
  });

  it("reads cross-binding existing IDs within tenant, workspace and provider", async () => {
    const sql = fakeSql([{ providerItemId: "hn:1" }]);
    await expect(findScopedExistingIds(sql.pool, scope, ["hn:1"])).resolves.toEqual(["hn:1"]);
    const read = sql.calls.find((call) => call.text.includes("FROM source_items"));
    expect(read?.values).toEqual([scope.tenantId, scope.workspaceId, ["hn:1"]]);
    expect(read?.text).toContain("provider_key = 'hacker-news'");
    expect(read?.text).not.toContain("source_binding_id");
    expect(sql.calls.find((call) => call.text.includes("set_config"))?.values)
      .toEqual([scope.tenantId, scope.workspaceId]);
  });

  it("counts another binding's existing candidate without inserting or updating it", async () => {
    const { root, request, artifacts } = await campaign();
    const existingIds = planVerifiedHnRemainder(artifacts).candidates.map((candidate) => candidate.externalId);
    const sql = fakeSql(existingIds.map((providerItemId) => ({ providerItemId })));
    const deps: VerifiedHnImportDependencies = { ...syntheticDependencies(),
      findExistingExternalIds: (selectedScope, ids) => findScopedExistingIds(sql.pool, selectedScope, ids) };
    const insert = jest.spyOn(deps.sourceItems, "saveBatchInsertOnly");
    const result = await importVerifiedHnRemainder({ artifacts, expectedPlanSha256: request.expectedPlanSha256,
      journalPath: join(root, journalName), scope, dependencies: deps });
    expect(result).toMatchObject({ inserted: 0, alreadyPresent: existingIds.length });
    expect(insert).not.toHaveBeenCalled();
  });

  it("runs the composed async import under the exact tenant scope and rejects an incompatible outer scope", async () => {
    const { request } = await campaign();
    const sql = fakeSql([{ matched: 1 }]);
    const close = jest.fn(async () => undefined);
    const openPrisma = jest.fn(async () => ({ close } as unknown as PrismaIngestionWorkerConnection));
    const save = jest.spyOn(PrismaSourceItemRepository.prototype, "saveBatchInsertOnly")
      .mockImplementation(async () => {
        await Promise.resolve();
        expect(currentDatabaseAccess()).toEqual({ kind: "tenant", tenantId: scope.tenantId,
          workspaceId: scope.workspaceId });
        return { inserted: 0, contentUpdated: 0, skippedDuplicates: 0, items: [] } as
          Awaited<ReturnType<PrismaSourceItemRepository["saveBatchInsertOnly"]>>;
      });
    const importer = jest.spyOn(recovery, "importVerifiedHnRemainder").mockImplementation(async (input) => {
      await Promise.resolve();
      expect(currentDatabaseAccess()).toEqual({ kind: "tenant", tenantId: scope.tenantId,
        workspaceId: scope.workspaceId });
      await input.dependencies.sourceItems.saveBatchInsertOnly({} as SaveSourceItemsCommand);
      return { planSha256: request.expectedPlanSha256, inserted: 0, alreadyPresent: 0 };
    });
    const runtime = { openSql: () => ({ ...sql.pool, end: jest.fn(async () => undefined) }),
      openPrisma, testOwnerUid } as unknown as Parameters<typeof runVerifiedHnOperatorWithRuntime>[2];
    await expect(runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime))
      .resolves.toMatchObject({ status: "COMPLETE" });
    expect(importer).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    await expect(runWithTenantDatabaseAccess({ tenantId: scope.tenantId,
      workspaceId: "00000000-0000-4000-8000-000000000099" },
    () => runVerifiedHnOperatorWithRuntime(request, "synthetic-db-url", runtime)))
      .rejects.toThrow("Nested database access scope cannot change");
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("never exposes an ordinary updating source repository in composition", async () => {
    const insertOnly = jest.spyOn(PrismaSourceItemRepository.prototype, "saveBatchInsertOnly")
      .mockResolvedValue({ inserted: 0, contentUpdated: 0, skippedDuplicates: 0, items: [] } as
        Awaited<ReturnType<PrismaSourceItemRepository["saveBatchInsertOnly"]>>);
    const updating = jest.spyOn(PrismaSourceItemRepository.prototype, "saveBatch")
      .mockRejectedValue(new Error("Ordinary update must not be called"));
    const composed = composeImportDependencies({} as PrismaIngestionWorkerConnection, fakeSql([]).pool);
    expect("saveBatch" in composed.sourceItems).toBe(false);
    await composed.sourceItems.saveBatchInsertOnly({} as SaveSourceItemsCommand);
    expect(insertOnly).toHaveBeenCalledTimes(1);
    expect(updating).not.toHaveBeenCalled();
    // Red if composition offers or calls the update-capable saveBatch entrypoint.
  });

  it.each(["started", "complete", "uncertain"])("refuses an existing %s campaign journal", async (status) => {
    const { root, request, artifacts } = await campaign();
    await writeFile(join(root, journalName), JSON.stringify({ status }));
    const deps = syntheticDependencies();
    const verify = jest.spyOn(deps, "verifyCurrentBinding");
    const insert = jest.spyOn(deps.sourceItems, "saveBatchInsertOnly");
    await expect(importVerifiedHnRemainder({ artifacts, expectedPlanSha256: request.expectedPlanSha256,
      journalPath: join(root, journalName), scope, dependencies: deps }))
      .rejects.toThrow("journal exists");
    expect(verify).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    // Red if any existing or uncertain journal is replayed or overwritten.
  });

  it("returns only a redacted hash and counts after a synthetic success", async () => {
    const { root, request, artifacts } = await campaign();
    const result = await importVerifiedHnRemainder({ artifacts, expectedPlanSha256: request.expectedPlanSha256,
      journalPath: join(root, journalName), scope, dependencies: syntheticDependencies() });
    const contaminated = { ...result, title: "Synthetic title", query: "synthetic query", externalId: "hn:1" };
    const receipt = JSON.stringify(redactedOperatorReceipt(contaminated));
    expect(JSON.parse(receipt)).toEqual({ status: "COMPLETE", planSha256: request.expectedPlanSha256,
      inserted: result.inserted, alreadyPresent: 0 });
    expect(receipt).not.toContain("Synthetic title");
    expect(receipt).not.toContain("synthetic query");
    expect(receipt).not.toContain("hn:");
    expect(receipt).not.toContain(scope.sourceBindingId);
    // Red if output includes post IDs, payload, query, binding, or anything beyond status/hash/counts.
  });

  it("requires an explicit complete invocation", () => {
    expect(() => parseOperatorArgs([])).toThrow("Missing operator argument");
    expect(() => parseOperatorArgs(["--input-root", "/tmp/input"])).toThrow();
    expect(() => parseOperatorArgs(["--input-root", "/tmp/input", "--input-root", "/tmp/other"]))
      .toThrow("duplicated");
  });
});
