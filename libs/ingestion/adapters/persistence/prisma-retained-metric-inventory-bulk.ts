import type { RefreshScope } from "../../features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import type { PrismaMetricInventoryClient, Row } from "./prisma-retained-metric-inventory";

export const metricInventoryChunkSize = 64;
const feedPageSize = 1024;
const feedSentinel = 1001;
const configurationChunkSize = 512;
export type MetricInventoryEnrichment = {
  feeds: Row[]; bindings: Row[]; interests: Row[]; catalogs: Row[];
  observationCount: number; regressionCount: number;
};

// Invocation-local only: both list and the per-target transactional guard read current data.
export async function loadMetricInventoryChunk(
  prisma: PrismaMetricInventoryClient, scope: RefreshScope, sources: Row[],
): Promise<Map<string, MetricInventoryEnrichment>> {
  const owned = { tenantId: scope.tenantId, workspaceId: scope.workspaceId };
  const sourceIds = sources.map((source) => String(source.id));
  const feeds = await loadFeeds(prisma, owned, sourceIds);
  const bindings = await loadConfiguration(prisma.sourceBinding, owned,
    sources.flatMap((source) => [source.sourceBindingId, ...feeds.get(String(source.id))!.map((feed) => feed.sourceBindingId)]));
  const interests = await loadConfiguration(prisma.interest, owned, [...bindings.values()].map((binding) => binding.interestId));
  const catalogs = await loadConfiguration(prisma.sourceCatalogEntry, {}, [...bindings.values()].map((binding) => binding.sourceCatalogEntryId));
  // Aggregate in PostgreSQL, never materialize observation histories. At most two groups per source.
  const counts = await prisma.sourceItemEngagementObservation.groupBy({
    by: ["sourceItemId", "hasRegression"], where: { ...owned, sourceItemId: { in: sourceIds } }, _count: { _all: true },
  });
  const totals = new Map<string, { observationCount: number; regressionCount: number }>();
  for (const count of counts) {
    const id = String(count.sourceItemId);
    const total = totals.get(id) ?? { observationCount: 0, regressionCount: 0 };
    const value = (count._count as { _all: number })._all;
    total.observationCount += value;
    if (count.hasRegression === true) total.regressionCount += value;
    totals.set(id, total);
  }
  return new Map(sources.map((source) => {
    const id = String(source.id);
    const targetFeeds = feeds.get(id)!;
    const targetBindings = selectRows(bindings, [source.sourceBindingId, ...targetFeeds.map((feed) => feed.sourceBindingId)]);
    return [id, { feeds: targetFeeds, bindings: targetBindings,
      interests: selectRows(interests, targetBindings.map((binding) => binding.interestId)),
      catalogs: selectRows(catalogs, targetBindings.map((binding) => binding.sourceCatalogEntryId)),
      ...(totals.get(id) ?? { observationCount: 0, regressionCount: 0 }),
    }];
  }));
}

async function loadFeeds(prisma: PrismaMetricInventoryClient, owned: Row, sourceIds: string[]): Promise<Map<string, Row[]>> {
  const feeds = new Map(sourceIds.map((id) => [id, [] as Row[]]));
  let active = sourceIds;
  let after: unknown;
  // A global page is NOT the fanout limit. Continue unsaturated sources past every full page.
  // Each nonterminal page adds 1024 useful rows or saturates a source; <=128 pages/chunk.
  // Removing saturated IDs avoids scanning/materializing arbitrarily large fanouts.
  while (active.length) {
    const page = await prisma.feedItem.findMany({ where: { ...owned, sourceItemId: { in: active },
      ...(after === undefined ? {} : { id: { gt: after } }) }, orderBy: { id: "asc" }, take: feedPageSize });
    for (const feed of page) {
      const target = feeds.get(String(feed.sourceItemId))!;
      if (target.length < feedSentinel) target.push(feed);
    }
    if (page.length < feedPageSize) break;
    after = page[page.length - 1]!.id;
    active = active.filter((id) => feeds.get(id)!.length < feedSentinel);
  }
  return feeds;
}

async function loadConfiguration(table: { findMany(args: Row): Promise<Row[]> }, owned: Row, ids: unknown[]): Promise<Map<unknown, Row>> {
  const unique = [...new Set(ids)];
  const rows = new Map<unknown, Row>();
  for (let start = 0; start < unique.length; start += configurationChunkSize) {
    const chunk = await table.findMany({ where: { ...owned, id: { in: unique.slice(start, start + configurationChunkSize) } }, orderBy: { id: "asc" } });
    for (const row of chunk) rows.set(row.id, row);
  }
  return rows;
}

function selectRows(rows: Map<unknown, Row>, ids: unknown[]): Row[] {
  return [...new Set(ids)].flatMap((id) => rows.has(id) ? [rows.get(id)!] : [])
    .sort((left, right) => String(left.id) < String(right.id) ? -1 : String(left.id) > String(right.id) ? 1 : 0);
}
