import { readFileSync } from "node:fs";
import { PrismaRetainedMetricInventory } from "./prisma-retained-metric-inventory";
import { loadMetricInventoryChunk } from "./prisma-retained-metric-inventory-bulk";
import { inventoryFixture } from "./prisma-retained-metric-inventory-bulk.spec-support";
import { LegacyRetainedMetricInventory } from "./prisma-retained-metric-inventory-legacy.spec-support";
import { readMetricInventorySource } from "./prisma-retained-metric-inventory-read";
import { canonicalMetricRefreshJson, metricRefreshDigest } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { scope } from "../../../../scripts/lib/retained-metric-refresh.spec-support";

type Fixture = ReturnType<typeof inventoryFixture>;
async function parity(f: Fixture, id = String(f.sources[0]?.id ?? "missing")) {
  const before: string[] = [], after: string[] = [];
  const digest = (into: string[]) => (value: unknown) => { into.push(canonicalMetricRefreshJson(value)); return metricRefreshDigest(value); };
  const expected = await new LegacyRetainedMetricInventory(f.client, digest(before)).read(scope, id);
  // The unchanged 43b28 bulk enrichment is a second, exact predecessor oracle.
  const source = f.sources.find((row) => row.id === id && row.tenantId === scope.tenantId && row.workspaceId === scope.workspaceId);
  const enriched = source ? (await loadMetricInventoryChunk(f.client, scope, [source])).get(id) : null;
  const raw = await readMetricInventorySource(f.client, scope, id);
  expect(raw?.enrichment ?? null).toEqual(enriched);
  f.calls.length = 0;
  const actual = await new PrismaRetainedMetricInventory(f.client, digest(after)).read(scope, id);
  expect(actual).toEqual(expected);
  expect(after).toEqual(before); // Exact canonical digest bytes, not only hash equality.
  expect(f.calls.map((call) => call.table)).toEqual(["$queryRaw"]);
  return actual;
}

describe("single statement retained metric guard", () => {
  it("preserves no rows, no snapshot, no feeds and shared configuration", async () => {
    const f = inventoryFixture(2);
    await parity(f, "missing"); await parity(f);
    f.addFeed(f.sources[0]!, "z"); f.addFeed(f.sources[0]!, "a");
    f.addFeed(f.sources[1]!, "other-source");
    await parity(f);
  });

  it.each(["missing-binding", "deleted-binding", "disabled-binding", "missing-interest", "deleted-interest", "disabled-interest",
    "missing-catalog", "wrong-catalog", "hidden", "tombstoned", "deleted-source", "dead-source", "unsupported-kind",
    "feed-provider", "feed-date", "feed-url", "feed-interest", "cross-binding", "cross-interest"])("preserves %s rejection and exact digest bytes", async (state) => {
    const f = inventoryFixture(), source = f.sources[0]!, feed = f.addFeed(source, "feed");
    if (state === "missing-binding") f.bindings.pop();
    if (state === "deleted-binding") f.bindings[1]!.deletedAt = new Date(scope.endAt);
    if (state === "disabled-binding") f.bindings[1]!.status = "DISABLED";
    if (state === "missing-interest") f.interests.pop();
    if (state === "deleted-interest") f.interests[1]!.deletedAt = new Date(scope.endAt);
    if (state === "disabled-interest") f.interests[1]!.status = "DISABLED";
    if (state === "missing-catalog") f.catalogs.pop();
    if (state === "wrong-catalog") f.catalogs[1]!.providerKey = "hacker-news";
    if (state === "hidden") feed.status = "HIDDEN";
    if (state === "tombstoned") feed.status = "TOMBSTONED";
    if (state === "deleted-source") source.metadata = { kind: "reddit_post", deleted: true };
    if (state === "dead-source") source.metadata = { kind: "reddit_post", dead: true };
    if (state === "unsupported-kind") source.metadata = { kind: "unsupported" };
    if (state === "feed-provider") feed.providerKey = "hacker-news";
    if (state === "feed-date") feed.publishedAt = new Date(scope.endAt);
    if (state === "feed-url") feed.canonicalUrl = "https://example.com/mismatch";
    if (state === "feed-interest") feed.interestId = "wrong";
    if (state === "cross-binding") f.bindings[1]!.tenantId = "other";
    if (state === "cross-interest") f.interests[1]!.workspaceId = "other";
    expect((await parity(f))!.rejection).not.toBeNull();
  });

  it.each([1000, 1001, 1100])("bounds ordered feed inputs at %i fanout with binding-first rejection", async (size) => {
    const f = inventoryFixture();
    for (let i = size; i > 0; i--) f.addFeed(f.sources[0]!, String(i).padStart(5, "0"));
    expect((await parity(f))!.visibleFeedCount).toBe(Math.min(size, 1001));
    f.bindings[0]!.status = "DISABLED";
    expect((await parity(f))!.rejection).toBe("unbound_disabled_deleted");
  });

  it.each(["reddit", "hacker-news"])("normalizes %s dates, JSON nulls and grouped counts without reviving JSON strings", async (providerKey) => {
    const f = inventoryFixture(), source = f.sources[0]!;
    source.providerKey = providerKey;
    for (const catalog of f.catalogs) catalog.providerKey = providerKey;
    source.metadata = { kind: providerKey === "reddit" ? "reddit_post" : "hacker_news_story", textDate: scope.endAt, nested: [null, { score: 12 }], score: 6 };
    source.contentUpdatedAt = null; source.createdAt = new Date(scope.endAt);
    source.engagementSnapshot = { metricsHash: "snapshot", lastObservedAt: new Date(scope.endAt), lastObservationAt: new Date("2026-09-05T01:02:03.123Z") };
    f.bindings[0]!.cursorResetRequestedAt = new Date(scope.endAt);
    f.addFeed(source, "feed", { providerMetadata: null });
    for (let i = 0; i < 10000; i++) f.observations.push({ ...f.owned, sourceItemId: source.id, hasRegression: i % 3 === 0 });
    f.observations.push({ ...f.owned, tenantId: "other", sourceItemId: source.id, hasRegression: true });
    f.observations.push({ ...f.owned, workspaceId: "other", sourceItemId: source.id, hasRegression: true });
    expect((await parity(f))!.authority).toMatchObject({ observationCount: 10000, regressionCount: 3334 });
  });

  it("revives every DateTime column, preserves JSON and converts bigint-sized grouped counts", async () => {
    const f = inventoryFixture(), source = f.sources[0]!;
    const date = new Date("2026-09-05T01:02:03.123Z");
    Object.assign(source, { authorHandle: null, providerContentHash: null, rawPointer: null, contentUpdatedAt: date, createdAt: date });
    for (const binding of f.bindings) Object.assign(binding, { capabilityProfileVersion: 1, cursorResetRequestedAt: date, createdAt: date, updatedAt: date });
    for (const interest of f.interests) Object.assign(interest, { name: "Fixture", query: "fixture", createdAt: date, updatedAt: date });
    for (const catalog of f.catalogs) Object.assign(catalog, { acquisitionMode: "poll", readiness: "fixture", createdAt: date, updatedAt: date });
    f.addFeed(source, "feed", { authorHandle: null, observedAt: date, dedupeKey: "fixture" });
    source.engagementSnapshot = { metricsHash: "snapshot", lastObservedAt: date, lastObservationAt: date, score: 9007199254740993n };
    await parity(f);
    const original = f.client.$queryRaw;
    f.client.$queryRaw = async <T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
      const rows = await original<Record<string, unknown>[]>(query, ...values);
      rows[0]!.counts = [{ hasRegression: true, count: "4294967297" }, { hasRegression: false, count: "1000000000000" }];
      (rows[0]!.source as Record<string, unknown>).publishedAt = "2026-09-05T03:02:03.123456+02:00";
      return rows as T;
    };
    const result = await readMetricInventorySource(f.client, scope, String(source.id));
    expect(result!.enrichment).toMatchObject({ observationCount: 1004294967297, regressionCount: 4294967297 });
    expect(result!.source.publishedAt).toEqual(date);
  });

  it("keeps date/provider drift visible, excludes foreign rows and refreshes each transaction invocation", async () => {
    const f = inventoryFixture(), source = f.sources[0]!, id = String(source.id);
    source.publishedAt = new Date("2026-08-01T00:00:00Z"); source.providerKey = "x";
    expect(await parity(f)).not.toBeNull();
    f.addFeed(source, "foreign", { tenantId: "other" });
    f.addFeed(source, "foreign-workspace", { workspaceId: "other" });
    expect((await parity(f))!.visibleFeedCount).toBe(0);
    source.tenantId = "other"; expect(await parity(f)).toBeNull(); source.tenantId = scope.tenantId;
    source.workspaceId = "other"; expect(await parity(f)).toBeNull(); source.workspaceId = scope.workspaceId;
    const inventory = new PrismaRetainedMetricInventory(f.client, metricRefreshDigest);
    const initial = await inventory.read(scope, id); source.body = "changed";
    expect(await inventory.read(scope, id)).not.toEqual(initial);
    const transaction = inventoryFixture();
    expect(await new PrismaRetainedMetricInventory(transaction.client, metricRefreshDigest).read(scope, id)).not.toEqual(await inventory.read(scope, id));
    f.sources.length = 0; expect(await inventory.read(scope, id)).toBeNull();
  });

  it("parameterizes every caller value, validates scope before SQL and propagates SQL failure without fallback", async () => {
    const f = inventoryFixture(), inventory = new PrismaRetainedMetricInventory(f.client, metricRefreshDigest);
    const id = "'::uuid); SELECT injected --";
    await inventory.read(scope, id);
    const { sql, values } = f.calls[0]!.args;
    expect(values).toEqual([scope.tenantId, scope.workspaceId, id]);
    for (const value of values as string[]) expect(sql).not.toContain(value);
    f.calls.length = 0;
    await expect(inventory.read({ ...scope, workspaceId: "wrong" }, id)).rejects.toThrow("wrong_scope");
    expect(f.calls).toEqual([]);
    f.client.$queryRaw = async () => { throw new Error("SQL failed"); };
    await expect(inventory.read(scope, id)).rejects.toThrow("SQL failed");
    expect(f.calls).toEqual([]);
  });

  it("projects every schema scalar with its mapped column and guards all tenant-owned subqueries", async () => {
    const f = inventoryFixture(); await parity(f);
    const sql = f.calls[0]!.args.sql as string;
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    for (const [model, alias] of [["SourceItem", "s"], ["FeedItem", "f"], ["SourceBinding", "b"], ["Interest", "i"], ["SourceCatalogEntry", "c"]]) {
      const block = schema.split(`model ${model} {`)[1]!.split("\n}")[0]!;
      for (const line of block.split("\n")) {
        const field = /^\s+(\w+)\s+(String|DateTime|Json|Int|FeedItemStatus|SourceBindingStatus|InterestStatus)\??(?:\s|$)/.exec(line);
        if (!field) continue;
        const column = /@map\("([^"]+)"\)/.exec(line)?.[1] ?? field[1];
        expect(sql).toContain(`${alias}.${column} AS "${field[1]}"`);
      }
    }
    for (const alias of ["s", "f", "b", "i", "p", "h"]) {
      expect(sql).toContain(`${alias}.tenant_id = o.tenant_id AND ${alias}.workspace_id = o.workspace_id`);
    }
    expect(sql).toContain("ORDER BY f.id ASC LIMIT 1001");
    expect(sql).toContain("GROUP BY h.has_regression");
    expect(sql).not.toMatch(/SELECT\s+\*|jsonb_agg|\$queryRawUnsafe/i);
  });
});
