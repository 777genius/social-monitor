import { PrismaRetainedMetricInventory } from "./prisma-retained-metric-inventory";
import { LegacyRetainedMetricInventory } from "./prisma-retained-metric-inventory-legacy.spec-support";
import { inventoryFixture } from "./prisma-retained-metric-inventory-bulk.spec-support";
import { metricRefreshDigest } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { nativeRenewalSourceRows } from "../../../../scripts/lib/retained-metric-native-fixture";
import { scope } from "../../../../scripts/lib/retained-metric-refresh.spec-support";

type Fixture = ReturnType<typeof inventoryFixture>;
async function parity(f: Fixture, ids?: string[]) {
  const oldInputs: string[] = [], newInputs: string[] = [];
  const old = new LegacyRetainedMetricInventory(f.client, (value) => { oldInputs.push(JSON.stringify(value)); return metricRefreshDigest(value); });
  const current = new PrismaRetainedMetricInventory(f.client, (value) => { newInputs.push(JSON.stringify(value)); return metricRefreshDigest(value); });
  const expected = await old.list(scope, ids);
  f.calls.length = 0;
  const actual = await current.list(scope, ids);
  expect(actual).toEqual(expected);
  expect(newInputs).toEqual(oldInputs); // Byte-for-byte field order, values and target-local membership, before hashing.
  return actual;
}

describe("bounded retained metric inventory enrichment", () => {
  it("matches full old/new targets and digest inputs for unordered rows, shared bindings and zero feeds", async () => {
    const f = inventoryFixture(70);
    for (const source of f.sources.slice(1)) {
      f.addFeed(source, `z-${source.id}`);
      f.addFeed(source, `a-${source.id}`, { sourceBindingId: "binding-z", interestId: "interest-z" });
      f.observations.push({ ...f.owned, sourceItemId: source.id, hasRegression: true },
        { ...f.owned, sourceItemId: source.id, hasRegression: false }, { ...f.owned, sourceItemId: source.id, hasRegression: false });
      source.engagementSnapshot = { metricsHash: "snapshot", lastObservedAt: new Date(scope.endAt), lastObservationAt: new Date(scope.endAt) };
    }
    f.sources.reverse(); f.feeds.reverse();
    const result = await parity(f);
    expect(result[0]!.visibleFeedCount).toBe(0);
    expect(result[1]!.authority).toMatchObject({ observationCount: 3, regressionCount: 1 });
    expect(result.every((target) => target.rejection === null)).toBe(true);
    expect(f.calls).toHaveLength(1 + 5 * Math.ceil(70 / 64));
  });

  it.each(["missing-binding", "deleted-binding", "disabled-binding", "missing-interest", "deleted-interest", "disabled-interest",
    "missing-catalog", "wrong-catalog", "hidden", "tombstoned", "deleted-source", "dead-source", "unsupported-kind",
    "feed-provider", "feed-date", "feed-url", "feed-interest", "cross-binding", "cross-interest"])("preserves %s rejection and digests", async (state) => {
    const f = inventoryFixture(2), source = f.sources[0]!;
    const feed = f.addFeed(source, "feed");
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
    const result = await parity(f);
    expect(result[0]!.rejection).not.toBeNull();
    expect(result[1]!.rejection).toBeNull();
  });

  it("keeps independent first-1001 sentinels with overflowing and later targets, including rejection precedence", async () => {
    const f = inventoryFixture(4);
    for (let source = 0; source < 3; source++) for (let i = 0; i < [10000, 1001, 1000][source]!; i++) {
      f.addFeed(f.sources[source]!, `${source}-${String(i).padStart(6, "0")}`);
    }
    f.addFeed(f.sources[3]!, "z-final");
    let result = await parity(f);
    expect(result.map((target) => target.visibleFeedCount)).toEqual([1001, 1001, 1000, 1]);
    expect(result.map((target) => target.rejection)).toEqual(["fanout_over_1000", "fanout_over_1000", null, null]);
    const pages = f.calls.filter((call) => call.table === "feedItem");
    expect(pages.length).toBeLessThanOrEqual(8);
    expect(pages.every((call) => call.returned <= 1024)).toBe(true);
    expect(pages.reduce((sum, call) => sum + call.returned, 0)).toBeLessThan(5000);
    f.bindings[1]!.status = "DISABLED";
    result = await parity(f);
    expect(result[0]!.rejection).toBe("unbound_disabled_deleted");
  });

  it("preserves tenant/workspace, frozen IDs, missing rows, date/provider drift and empty membership", async () => {
    const f = inventoryFixture(5);
    const ids = f.sources.map((source) => String(source.id));
    f.sources[1]!.tenantId = "other"; f.sources[2]!.workspaceId = "other";
    f.sources[3]!.publishedAt = new Date("2026-08-01T00:00:00Z"); f.sources[4]!.providerKey = "x";
    f.addFeed(f.sources[0]!, "other-tenant", { tenantId: "other" });
    f.addFeed(f.sources[0]!, "other-workspace", { workspaceId: "other" });
    f.observations.push({ ...f.owned, tenantId: "other", sourceItemId: ids[0], hasRegression: true },
      { ...f.owned, workspaceId: "other", sourceItemId: ids[0], hasRegression: false });
    expect(await parity(f)).toHaveLength(1);
    expect(await parity(f, [...ids, "missing"])).toHaveLength(3);
    f.sources.shift();
    expect(await parity(f, [ids[0]!])).toEqual([]);
    expect(await parity(f, [])).toEqual([]);
    expect(f.calls).toHaveLength(1);
  });

  it("keeps the 10001 discovery sentinel and refuses a truncated manifest", async () => {
    const f = inventoryFixture(10001);
    await expect(new PrismaRetainedMetricInventory(f.client, metricRefreshDigest).list(scope)).rejects.toThrow("exceeds 10000");
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.args.take).toBe(10001);
  });

  it("bounds 3329-target delegate calls by explicit 64-source chunks instead of N+1", async () => {
    const f = inventoryFixture(3329);
    for (const source of f.sources) f.addFeed(source, `feed-${source.id}`);
    const result = await parity(f);
    expect(result).toHaveLength(3329);
    expect(f.calls).toHaveLength(1 + 5 * Math.ceil(3329 / 64));
    expect(f.calls.some((call) => call.table === "count")).toBe(false);
    expect(f.calls.filter((call) => call.table === "groupBy").every((call) =>
      JSON.stringify(call.args.by) === JSON.stringify(["sourceItemId", "hasRegression"]) &&
      JSON.stringify(call.args._count) === JSON.stringify({ _all: true }))).toBe(true);
  });

  it("reads fresh data after captures and in separate transaction clients without root-client/cache reuse", async () => {
    const f = inventoryFixture(), id = String(f.sources[0]!.id);
    const inventory = new PrismaRetainedMetricInventory(f.client, metricRefreshDigest);
    const first = await inventory.read(scope, id);
    f.bindings[0]!.config = { changed: true };
    f.observations.push({ ...f.owned, sourceItemId: id, hasRegression: true });
    const next = await inventory.read(scope, id);
    expect(next!.configDigest).not.toBe(first!.configDigest);
    expect(next!.authority).toMatchObject({ observationCount: 1, regressionCount: 1 });
    expect(next).toEqual(await new LegacyRetainedMetricInventory(f.client, metricRefreshDigest).read(scope, id));
    const transaction = inventoryFixture(); transaction.sources[0]!.body = "transaction-local content";
    expect(await new PrismaRetainedMetricInventory(transaction.client, metricRefreshDigest).read(scope, id)).not.toEqual(next);
    f.sources.length = 0;
    expect(await inventory.read(scope, id)).toBeNull();
  });
  it("chunks unique configuration IDs without leaking other targets into config digests", async () => {
    const f = inventoryFixture(2);
    for (let i = 0; i < 1100; i++) {
      const suffix = String(i).padStart(5, "0");
      f.bindings.push({ ...f.bindings[0], id: `binding-${suffix}`, interestId: `interest-${suffix}`, sourceCatalogEntryId: `catalog-${suffix}` });
      f.interests.push({ ...f.interests[0], id: `interest-${suffix}` });
      f.catalogs.push({ ...f.catalogs[0], id: `catalog-${suffix}` });
      f.addFeed(f.sources[i % 2]!, `feed-${suffix}`, { sourceBindingId: `binding-${suffix}`, interestId: `interest-${suffix}` });
    }
    expect((await parity(f)).every((target) => target.rejection === null)).toBe(true);
    for (const name of ["sourceBinding", "interest", "sourceCatalogEntry"]) {
      const calls = f.calls.filter((call) => call.table === name);
      expect(calls).toHaveLength(3);
      expect(calls.every((call) => ((call.args.where as { id: { in: unknown[] } }).id.in.length <= 512))).toBe(true);
    }
  });

  it("preserves Hacker News fieldsets and strips only canonical engagement fields", async () => {
    const f = inventoryFixture();
    const source = f.sources[0]!;
    source.providerKey = "hacker-news"; source.providerItemId = "hacker-news:123";
    source.metadata = { kind: "hacker_news_story", points: 1, comments: 3, retained: "identity" };
    for (const catalog of f.catalogs) catalog.providerKey = "hacker-news";
    const feed = f.addFeed(source, "hn-feed", { providerMetadata: source.metadata });
    const first = (await parity(f))[0]!;
    source.metadata = { kind: "hacker_news_story", points: 99, comments: 30, retained: "identity" };
    feed.providerMetadata = source.metadata; feed.updatedAt = new Date(scope.endAt);
    source.lastObservedAt = new Date(scope.endAt);
    const next = (await parity(f))[0]!;
    expect(next).toEqual(first);
    expect(next.rejection).toBeNull();
  });

  it("matches all 3306 canonical native zero-feed source rows without changing the native fixture", async () => {
    const f = inventoryFixture(0);
    const native = nativeRenewalSourceRows(0, 3306);
    f.sources.push(...native.map((row) => ({ ...row, engagementSnapshot: null })));
    f.bindings[0]!.id = native[0]!.sourceBindingId;
    const targets = await parity(f);
    expect(targets).toHaveLength(3306);
    expect(targets.every((target) => target.rejection === null && target.visibleFeedCount === 0)).toBe(true);
    expect(f.calls).toHaveLength(1 + 5 * Math.ceil(3306 / 64));
  });

});
