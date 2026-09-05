import { PrismaRetainedMetricInventory, type PrismaMetricInventoryClient } from "./prisma-retained-metric-inventory";
import { metricRefreshDigest } from "../../../../scripts/lib/retained-metric-refresh-receipts";
import { scope, target } from "../../../../scripts/lib/retained-metric-refresh.spec-support";
import { sameTarget } from "../../features/refresh-retained-metrics/metric-refresh-admission";

function setup() {
  const t = target();
  const source = { id: t.sourceItemId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, providerKey: "reddit", providerItemId: t.externalId,
    canonicalUrl: t.canonicalUrl, sourceBindingId: t.sourceBindingId, publishedAt: new Date(t.publishedAt), title: "Retained",
    body: "Content", contentHash: "retained-hash", observedAt: new Date(t.publishedAt), metadata: { kind: "reddit_post", score: 0 }, engagementSnapshot: null };
  const binding = { id: t.sourceBindingId, interestId: "interest", sourceCatalogEntryId: "catalog", status: "ENABLED", deletedAt: null, config: { mode: "search" } };
  const client = {
    sourceItem: { findMany: jest.fn(async () => [source]) },
    sourceBinding: { findMany: jest.fn(async () => [binding]) },
    interest: { findMany: jest.fn(async () => [{ id: "interest", status: "ENABLED", deletedAt: null }]) },
    sourceCatalogEntry: { findMany: jest.fn(async () => [{ id: "catalog", providerKey: "reddit" }]) },
    feedItem: { findMany: jest.fn(async (): Promise<Record<string, unknown>[]> => []) },
    sourceItemEngagementObservation: { count: jest.fn(async () => 0) },
  };
  return { client, binding, source, inventory: new PrismaRetainedMetricInventory(client as PrismaMetricInventoryClient, metricRefreshDigest) };
}
describe("scoped retained metric inventory", () => {
  it("enumerates every retained row with no score floor/top16, with scoped explicit day windows", async () => {
    const f = setup();
    f.client.sourceItem.findMany.mockResolvedValue(Array.from({ length: 37 }, (_, i) => ({ ...f.source, id: `id-${i}`, providerItemId: `reddit:t3_a${i}` })));
    expect(await f.inventory.list(scope)).toHaveLength(37);
    expect(f.client.sourceItem.findMany.mock.calls[0]).toEqual([{ where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
      providerKey: { in: ["hacker-news", "reddit"] }, OR: expect.arrayContaining([{ publishedAt: { gte: new Date("2026-09-05T00:00:00Z"), lt: new Date(scope.endAt) } }]) },
      take: 10001, include: { engagementSnapshot: true }, orderBy: { id: "asc" } }]);
  });
  it("rejects wrong scope before persistence and detects binding/config/content drift", async () => {
    const f = setup();
    await expect(f.inventory.list({ ...scope, workspaceId: "wrong" })).rejects.toThrow("wrong_scope");
    expect(f.client.sourceItem.findMany).not.toHaveBeenCalled();
    const first = (await f.inventory.list(scope))[0]!;
    f.binding.config = { mode: "listing" };
    expect(sameTarget(first, (await f.inventory.list(scope))[0]!, metricRefreshDigest)).toBe(false);
    f.binding.config = { mode: "search" }; f.source.body = "modified content";
    expect(sameTarget(first, (await f.inventory.list(scope))[0]!, metricRefreshDigest)).toBe(false);
  });
  it("does not treat canonical metric refresh as identity/config drift", async () => {
    const f = setup(); const first = (await f.inventory.list(scope))[0]!;
    f.source.metadata.score = 90;
    expect(sameTarget(first, (await f.inventory.list(scope))[0]!, metricRefreshDigest)).toBe(true);
  });
  it("rejects an otherwise visible projection outside the retained source publication scope", async () => {
    const f = setup();
    f.client.feedItem.findMany.mockResolvedValue([{ id: "feed", sourceBindingId: f.binding.id, interestId: "interest",
      providerKey: "reddit", canonicalUrl: f.source.canonicalUrl, status: "VISIBLE", publishedAt: new Date("2026-08-29T00:00:00Z") }]);
    expect((await f.inventory.list(scope))[0]!.rejection).toBe("feed_lineage_mismatch");
  });
  it.each(["HIDDEN", "TOMBSTONED", "fanout", "disabled", "unbound"])("reports ineligible %s targets, preserving them for manifest review", async (state) => {
    const f = setup();
    if (state === "disabled") f.binding.status = "DISABLED";
    else if (state === "unbound") f.client.sourceBinding.findMany.mockResolvedValue([]);
    else f.client.feedItem.findMany.mockResolvedValue(Array.from({ length: state === "fanout" ? 1001 : 1 }, (_, i) => ({
      id: `feed-${i}`, sourceBindingId: target().sourceBindingId, status: state === "fanout" ? "VISIBLE" : state })));
    expect((await f.inventory.list(scope))[0]!.rejection).not.toBeNull();
  });
});
