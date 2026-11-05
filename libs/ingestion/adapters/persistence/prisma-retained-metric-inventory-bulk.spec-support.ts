import { inventorySqlFake } from "./prisma-retained-metric-inventory-read.spec-support";
import type { Row } from "./prisma-retained-metric-inventory";
import { scope } from "../../../../scripts/lib/retained-metric-refresh.spec-support";

export function inventoryFixture(size = 1) {
  const owned = { tenantId: scope.tenantId, workspaceId: scope.workspaceId };
  const date = new Date("2026-09-04T11:00:00.000Z");
  const sources: Row[] = Array.from({ length: size }, (_, i) => ({ id: `source-${String(i).padStart(5, "0")}`, ...owned,
    sourceBindingId: "binding-z", providerKey: "reddit", providerItemId: `reddit:t3_fixture${i}`,
    canonicalUrl: `https://www.reddit.com/r/sandbox/comments/fixture${i}/example/`, title: "Fixture", body: "Retained body",
    publishedAt: date, observedAt: date, lastObservedAt: date, contentHash: "fixture-hash", schemaVersion: 1,
    metadata: { kind: "reddit_post", score: 5, provenance: "fixture" }, engagementSnapshot: null }));
  const bindings: Row[] = ["z", "a"].map((suffix) => ({ id: `binding-${suffix}`, ...owned, interestId: `interest-${suffix}`,
    sourceCatalogEntryId: `catalog-${suffix}`, status: "ENABLED", deletedAt: null, config: { mode: "fixture" } }));
  const interests: Row[] = ["z", "a"].map((suffix) => ({ id: `interest-${suffix}`, ...owned, status: "ENABLED", deletedAt: null }));
  const catalogs: Row[] = ["z", "a"].map((suffix) => ({ id: `catalog-${suffix}`, providerKey: "reddit", displayName: "Fixture" }));
  const feeds: Row[] = [];
  const observations: Row[] = [];
  const calls: { table: string; args: Row; returned: number }[] = [];
  const table = (name: string, rows: Row[]) => ({ findMany: async (args: Row) => {
    let result = rows.filter((row) => matches(row, args.where as Row));
    if (args.orderBy) result = [...result].sort((a, b) => String(a.id) < String(b.id) ? -1 : 1);
    if (typeof args.take === "number") result = result.slice(0, args.take);
    calls.push({ table: name, args, returned: result.length });
    return result;
  } });
  const client = {
    $queryRaw: inventorySqlFake({ sources, feeds, bindings, interests, catalogs, observations },
      (args, returned) => calls.push({ table: "$queryRaw", args, returned })),
    sourceItem: table("sourceItem", sources), feedItem: table("feedItem", feeds), sourceBinding: table("sourceBinding", bindings),
    interest: table("interest", interests), sourceCatalogEntry: table("sourceCatalogEntry", catalogs),
    sourceItemEngagementObservation: {
      count: async (args: Row) => {
        calls.push({ table: "count", args, returned: 1 });
        return observations.filter((row) => matches(row, args.where as Row)).length;
      },
      groupBy: async (args: Row) => {
        const groups = new Map<string, Row>();
        for (const row of observations.filter((entry) => matches(entry, args.where as Row))) {
          const key = `${row.sourceItemId}:${row.hasRegression}`;
          const group = groups.get(key) ?? { sourceItemId: row.sourceItemId, hasRegression: row.hasRegression, _count: { _all: 0 } };
          (group._count as { _all: number })._all++;
          groups.set(key, group);
        }
        calls.push({ table: "groupBy", args, returned: groups.size });
        return [...groups.values()].reverse();
      },
    },
  };
  const addFeed = (source: Row, id: string, extra: Row = {}) => {
    const feed: Row = { id, ...owned, sourceItemId: source.id, sourceBindingId: "binding-a", interestId: "interest-a", providerKey: source.providerKey,
      canonicalUrl: source.canonicalUrl, publishedAt: source.publishedAt, status: "VISIBLE", title: "Feed fixture", bodyPreview: "Body",
      providerMetadata: { kind: "reddit_post", score: 5, provenance: "fixture" }, updatedAt: date, createdAt: date, ...extra };
    feeds.push(feed); return feed;
  };
  return { sources, feeds, bindings, interests, catalogs, observations, client, calls, addFeed, owned };
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return (value as Row[]).some((option) => matches(row, option));
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      const filter = value as { in?: unknown[]; gt?: string; gte?: Date; lt?: Date };
      if (filter.in && !filter.in.includes(row[key])) return false;
      if (filter.gt !== undefined && !(String(row[key]) > filter.gt)) return false;
      if (filter.gte && !((row[key] as Date) >= filter.gte)) return false;
      if (filter.lt && !((row[key] as Date) < filter.lt)) return false;
      return true;
    }
    return row[key] === value;
  });
}
