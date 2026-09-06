import type { FeedItemReadRepositoryPort, PromotionFeedItemSnapshotRepositoryPort } from "@social-monitor/feed/ports";
import { InMemoryUserRelevanceProfileRepository } from "@social-monitor/relevance/adapters/persistence/in-memory-user-relevance-profile.repository";
import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { RelevanceReaderSummaryEvidenceSelector } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence.selector";
import { buildReaderSummaryPeriod, primaryReaderSummaryEvidence, admitReaderPostPromotionEvidence } from "@social-monitor/summary/domain";
import type { PrismaSummaryClient } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";
import { tenantId, workspaceId, type Clock } from "@social-monitor/shared-kernel";
import { captureReaderSummaryDayDatasetManifest } from "./reader-summary-day-dataset-manifest";
import { readRefreshMutableAuthority } from "./reader-summary-new-input-refresh-postgres";
import { refreshScope, refreshHash } from "./reader-summary-new-input-refresh-manifest";

export const refreshPeriod = (date: string) => buildReaderSummaryPeriod({
  cadence: "daily", startedAt: new Date(`${date}T00:00:00.000Z`),
  endedAt: new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000), timezone: "UTC",
});
export async function captureRefreshAuthority(input: {
  client: Pick<PrismaSummaryClient, "$queryRaw">;
  feed: FeedItemReadRepositoryPort & PromotionFeedItemSnapshotRepositoryPort;
  date: string; observedThrough: Date; clock: Clock;
}) {
  const period = refreshPeriod(input.date);
  const database = await captureRefreshDatabaseAuthority(input);
  const snapshot = await input.feed.readPromotionSnapshot({
    tenantId: tenantId(refreshScope.tenantId), workspaceId: workspaceId(refreshScope.workspaceId),
    windowStartedAt: period.startedAt, windowEndedAt: period.endedAt,
    timestampPolicy: "published_at", observedThrough: input.observedThrough,
  });
  if (!snapshot.ok || !snapshot.exhausted) throw new Error("Refresh canonical promotion snapshot is incomplete");
  return { ...database, canonicalInputSha256: refreshHash(snapshot),
    eligibleCount: snapshot.candidates.length };
}
// Complete backing rows are revalidated on the publisher's transaction. This
// avoids a nested read-only feed transaction on the shared bounded runtime pool.
export async function captureRefreshDatabaseAuthority(input: {
  client: Pick<PrismaSummaryClient, "$queryRaw">; date: string; clock: Clock;
}) {
  const period = refreshPeriod(input.date);
  const mutable = await readRefreshMutableAuthority(input.client, input.date);
  const dataset = await captureReaderSummaryDayDatasetManifest({
    client: input.client, ...refreshScope, startedAt: period.startedAt, endedAt: period.endedAt,
    generatedAt: input.clock.now(), timestampPolicy: "published_at",
  });
  return { ...mutable, datasetSha256: dataset.dataset.aggregateSha256,
    feedCount: dataset.dataset.feedRowCount };
}
// This uses the current selector on the complete repository. No paid relation
// verifier is composed for preparation. Apply uses the normal agent verifier.
export async function preflightRefreshSelection(input: {
  feed: FeedItemReadRepositoryPort; date: string; observedThrough: Date; clock: Clock;
}): Promise<number> {
  const selector = new RelevanceReaderSummaryEvidenceSelector(new RankFeedItemsUseCase(
    input.feed, new InMemoryUserRelevanceProfileRepository(), input.clock,
  ), input.feed, input.clock);
  const selection = await selector.select({
    tenantId: tenantId(refreshScope.tenantId), workspaceId: workspaceId(refreshScope.workspaceId),
    scope: { type: "workspace" }, period: refreshPeriod(input.date),
    observedThrough: input.observedThrough, maxItems: 120,
  });
  return primaryReaderSummaryEvidence(admitReaderPostPromotionEvidence(selection)).selectedEvidence.length;
}
export async function assertRefreshHasNewInput(client: Pick<PrismaSummaryClient, "$queryRaw">,
  date: string, previous: string, cutoff: string): Promise<void> {
  const rows = await client.$queryRaw<readonly { count: number }[]>`
    select count(*)::int as count from feed_items f
    where f.tenant_id = ${refreshScope.tenantId}::uuid and f.workspace_id = ${refreshScope.workspaceId}::uuid
      and f.status = 'VISIBLE' and f.published_at >= ${date}::date::timestamp at time zone 'UTC'
      and f.published_at < (${date}::date + 1)::timestamp at time zone 'UTC'
      and (f.observed_at > ${previous}::timestamptz and f.observed_at <= ${cutoff}::timestamptz
        or exists (select 1 from source_item_engagement_observations o
          where o.tenant_id = f.tenant_id and o.workspace_id = f.workspace_id
            and o.source_item_id = f.source_item_id and o.provider_key = f.provider_key
            and o.observed_at > ${previous}::timestamptz and o.observed_at <= ${cutoff}::timestamptz))
  `;
  if (rows[0]?.count === undefined || rows[0].count < 1) throw new Error("Refresh has no new canonical input or observation");
}
