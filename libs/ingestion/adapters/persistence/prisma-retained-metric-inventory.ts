import { sourceMetadataWithoutEngagementMetrics } from "../../domain";
import { normalizeJsonObject } from "@social-monitor/shared-kernel";
import type { RefreshDigest, RefreshScope, RetainedMetricInventory, RetainedMetricTarget } from "../../features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { metricRefreshTargetLimit, scopeProblem } from "../../features/refresh-retained-metrics/metric-refresh-admission";

type Row = Record<string, unknown>;
type Table = { findMany(args: Row): Promise<Row[]> };
export type PrismaMetricInventoryClient = {
  sourceItem: Table; sourceBinding: Table; feedItem: Table; interest: Table; sourceCatalogEntry: Table;
  sourceItemEngagementObservation: { count(args: Row): Promise<number> };
};
export class PrismaRetainedMetricInventory implements RetainedMetricInventory {
  constructor(private readonly prisma: PrismaMetricInventoryClient, private readonly digest: RefreshDigest) {}

  async list(scope: RefreshScope, sourceItemIds?: readonly string[]): Promise<readonly RetainedMetricTarget[]> {
    this.requireScope(scope);
    if (sourceItemIds && (sourceItemIds.length > metricRefreshTargetLimit || new Set(sourceItemIds).size !== sourceItemIds.length)) {
      throw new Error("Invalid frozen metric membership");
    }
    const rows = await this.prisma.sourceItem.findMany({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId,
        ...(sourceItemIds ? { id: { in: [...sourceItemIds] } } : { providerKey: { in: ["hacker-news", "reddit"] },
        OR: scope.dates.map((date) => ({ publishedAt: { gte: new Date(`${date}T00:00:00Z`),
          lt: new Date(Math.min(Date.parse(scope.endAt), Date.parse(`${date}T00:00:00Z`) + 86_400_000)) } })) }) },
      orderBy: { id: "asc" }, take: metricRefreshTargetLimit + 1, include: { engagementSnapshot: true },
    });
    if (rows.length > metricRefreshTargetLimit) throw new Error("Metric refresh inventory exceeds 10000; no truncated manifest is admissible");
    const targets: RetainedMetricTarget[] = [];
    for (const row of rows) targets.push(await this.target(scope, row));
    return targets;
  }
  async read(scope: RefreshScope, sourceItemId: string): Promise<RetainedMetricTarget | null> {
    this.requireScope(scope);
    const rows = await this.prisma.sourceItem.findMany({ where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, id: sourceItemId },
      take: 1, include: { engagementSnapshot: true } });
    return rows[0] ? this.target(scope, rows[0]) : null;
  }
  private requireScope(scope: RefreshScope) {
    // The use case supplies the real clock; persistence still enforces the fixed tenant/date boundary.
    const problem = scopeProblem(scope, new Date(scope.endAt));
    if (problem) throw new Error(`Metric inventory ${problem}`);
  }
  private async target(scope: RefreshScope, row: Row): Promise<RetainedMetricTarget> {
    const owned = { tenantId: scope.tenantId, workspaceId: scope.workspaceId };
    const feeds = await this.prisma.feedItem.findMany({ where: { ...owned, sourceItemId: row.id }, orderBy: { id: "asc" }, take: 1001 });
    const bindingIds = [...new Set([row.sourceBindingId, ...feeds.map((feed) => feed.sourceBindingId)])];
    const bindings = await this.prisma.sourceBinding.findMany({ where: { ...owned, id: { in: bindingIds } }, orderBy: { id: "asc" } });
    const interests = await this.prisma.interest.findMany({ where: { ...owned, id: { in: bindings.map((binding) => binding.interestId) } }, orderBy: { id: "asc" } });
    const catalogs = await this.prisma.sourceCatalogEntry.findMany({ where: { id: { in: bindings.map((binding) => binding.sourceCatalogEntryId) } }, orderBy: { id: "asc" } });
    const metadata = normalizeJsonObject(row.metadata);
    const snapshot = row.engagementSnapshot as Row | null;
    const observationScope = { ...owned, sourceItemId: row.id };
    const observationCount = await this.prisma.sourceItemEngagementObservation.count({ where: observationScope });
    const regressionCount = await this.prisma.sourceItemEngagementObservation.count({ where: { ...observationScope, hasRegression: true } });
    const bindingInvalid = bindings.length !== bindingIds.length || bindings.some((binding) => binding.status !== "ENABLED" || binding.deletedAt !== null ||
      !catalogs.some((catalog) => catalog.id === binding.sourceCatalogEntryId && catalog.providerKey === row.providerKey) ||
      !interests.some((interest) => interest.id === binding.interestId && interest.status === "ENABLED" && interest.deletedAt === null));
    const feedLineageInvalid = feeds.some((feed) => feed.providerKey !== row.providerKey ||
      iso(feed.publishedAt) !== iso(row.publishedAt) || feed.canonicalUrl !== row.canonicalUrl ||
      !bindings.some((binding) => binding.id === feed.sourceBindingId && binding.interestId === feed.interestId));
    const rejection = bindingInvalid ? "unbound_disabled_deleted" : feeds.length > 1000 ? "fanout_over_1000" :
      feeds.some((feed) => feed.status !== "VISIBLE") || metadata.deleted === true || metadata.dead === true ? "hidden_deleted" : feedLineageInvalid ? "feed_lineage_mismatch" :
        metadata.kind !== (row.providerKey === "hacker-news" ? "hacker_news_story" : "reddit_post") ? "unsupported_kind" : null;
    const sourceIdentity = Object.fromEntries(Object.entries(row).filter(([key]) => !["engagementSnapshot", "lastObservedAt", "metadata"].includes(key)));
    const cleanMetadata = (value: unknown) => sourceMetadataWithoutEngagementMetrics({ providerKey: String(row.providerKey), metadata: normalizeJsonObject(value) });
    return {
      tenantId: String(row.tenantId), workspaceId: String(row.workspaceId), sourceItemId: String(row.id),
      sourceBindingId: String(row.sourceBindingId), providerKey: row.providerKey as RetainedMetricTarget["providerKey"],
      externalId: String(row.providerItemId), canonicalUrl: String(row.canonicalUrl), publishedAt: iso(row.publishedAt)!,
      configDigest: this.digest({ bindings, interests, catalogs }), identityDigest: this.digest({ ...sourceIdentity, metadata: cleanMetadata(row.metadata) }),
      feedDigest: this.digest(feeds.map((feed) => ({ ...Object.fromEntries(Object.entries(feed).filter(([key]) => !["providerMetadata", "updatedAt"].includes(key))), providerMetadata: cleanMetadata(feed.providerMetadata) }))),
      visibleFeedCount: feeds.filter((feed) => feed.status === "VISIBLE").length, rejection,
      authority: { metricsHash: snapshot ? String(snapshot.metricsHash) : null, observedAt: iso(snapshot?.lastObservedAt),
        observationAt: iso(snapshot?.lastObservationAt), observationCount, regressionCount },
    };
  }
}
const iso = (value: unknown): string | null => value instanceof Date ? value.toISOString() : null;
