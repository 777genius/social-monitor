import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";

import type {
  CountReaderSummaryCollectedFeedItemsQuery,
  ReaderSummaryCollectedFeedItemCoverage,
  ReaderSummaryCollectedProviderCoverage,
  ReaderSummaryCollectedQueryCoverage,
  ReaderSummaryCollectedTopicCoverage,
  ReaderSummaryCoverageCounterPort,
  ReaderSummaryProviderCollectionHealth,
  ReaderSummaryProviderCollectionHealthReaderPort,
} from "../../ports";
import { NOOP_READER_SUMMARY_PROVIDER_COLLECTION_HEALTH_READER } from "../../ports";
import { statsForFeedItemMetadata } from "./feed-item-collection-stats";
import { isDefaultReaderSummaryEvidenceProvider } from "./reader-summary-evidence-provider-filter";
import { inclusiveObservedBefore } from "./relevance-reader-summary-evidence-support";

const PAGE_LIMIT = 100;
const MAX_PAGES = 1000;

export class FeedReaderSummaryCoverageCounter implements ReaderSummaryCoverageCounterPort {
  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly collectionHealth: ReaderSummaryProviderCollectionHealthReaderPort = NOOP_READER_SUMMARY_PROVIDER_COLLECTION_HEALTH_READER,
  ) {}

  async countCollectedFeedItems(
    query: CountReaderSummaryCollectedFeedItemsQuery,
  ): Promise<number | undefined> {
    const coverage = await this.countCollectedFeedItemCoverage(query);
    return coverage?.collectedFeedItemCount;
  }

  async countCollectedFeedItemCoverage(
    query: CountReaderSummaryCollectedFeedItemsQuery,
  ): Promise<ReaderSummaryCollectedFeedItemCoverage | undefined> {
    const observedBefore =
      query.observedThrough === undefined
        ? undefined
        : inclusiveObservedBefore(query.observedThrough);
    let cursor: string | undefined;
    let total = 0;
    const totals = emptyCoverageCounts();
    const providerCounts = new Map<string, CoverageBucket>();
    const topicCounts = new Map<string, CoverageBucket>();
    const queryCounts = new Map<string, CoverageBucket>();
    const collectionHealthPromise =
      this.collectionHealth.readProviderCollectionHealth(query);

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.feedItems.list({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        interestId:
          query.scope.type === "interest" ? query.scope.interestId : undefined,
        publishedAtOrAfter: query.period.startedAt,
        publishedBefore: query.period.endedAt,
        observedBefore,
        limit: PAGE_LIMIT,
        cursor,
      });
      for (const item of result.items) {
        const snapshot = item.toSnapshot();
        const providerKey = snapshot.providerKey;
        if (!isDefaultReaderSummaryEvidenceProvider(providerKey)) {
          continue;
        }
        const stats = statsForFeedItemMetadata(snapshot.providerMetadata);

        total += 1;
        incrementBucket(totals, stats);
        incrementNamedBucket(providerCounts, providerKey, stats);
        incrementNamedBucket(topicCounts, snapshot.interestId, stats, {
          label: stats.topicLabel,
        });
        for (const searchQuery of stats.searchQueries) {
          incrementNamedBucket(queryCounts, searchQuery, stats);
        }
      }

      if (result.nextCursor === undefined) {
        return {
          collectedFeedItemCount: total,
          lowRelevanceFeedItemCount: totals.lowRelevanceFeedItemCount,
          mutedFeedItemCount: totals.mutedFeedItemCount,
          userRatedFeedItemCount: totals.userRatedFeedItemCount,
          providerBreakdown: mergeProviderCollectionHealth(
            coverageRows(providerCounts).map(
              ([
                providerKey,
                bucket,
              ]): ReaderSummaryCollectedProviderCoverage => ({
                providerKey,
                ...bucket,
              }),
            ),
            await collectionHealthPromise,
          ),
          topicBreakdown: coverageRows(topicCounts).map(
            ([topicKey, bucket]): ReaderSummaryCollectedTopicCoverage => ({
              topicKey,
              ...(bucket.label === undefined
                ? {}
                : { topicLabel: bucket.label }),
              collectedFeedItemCount: bucket.collectedFeedItemCount,
              lowRelevanceFeedItemCount: bucket.lowRelevanceFeedItemCount,
              mutedFeedItemCount: bucket.mutedFeedItemCount,
              userRatedFeedItemCount: bucket.userRatedFeedItemCount,
            }),
          ),
          queryBreakdown: coverageRows(queryCounts).map(
            ([queryText, bucket]): ReaderSummaryCollectedQueryCoverage => ({
              query: queryText,
              ...bucket,
            }),
          ),
        };
      }

      if (result.nextCursor === cursor) {
        return undefined;
      }
      cursor = result.nextCursor;
    }

    return undefined;
  }
}

type FeedItemCollectionStats = ReturnType<typeof statsForFeedItemMetadata>;

type CoverageBucket = {
  collectedFeedItemCount: number;
  lowRelevanceFeedItemCount: number;
  mutedFeedItemCount: number;
  userRatedFeedItemCount: number;
  label?: string;
};

const emptyCoverageCounts = (): CoverageBucket => ({
  collectedFeedItemCount: 0,
  lowRelevanceFeedItemCount: 0,
  mutedFeedItemCount: 0,
  userRatedFeedItemCount: 0,
});

const incrementNamedBucket = (
  buckets: Map<string, CoverageBucket>,
  rawKey: string,
  stats: FeedItemCollectionStats,
  options: { readonly label?: string } = {},
): void => {
  const key = rawKey.trim();
  if (key.length === 0) {
    return;
  }
  const bucket = buckets.get(key) ?? emptyCoverageCounts();
  incrementBucket(bucket, stats);
  if (bucket.label === undefined && options.label !== undefined) {
    bucket.label = options.label;
  }
  buckets.set(key, bucket);
};

const incrementBucket = (
  bucket: CoverageBucket,
  stats: FeedItemCollectionStats,
): void => {
  bucket.collectedFeedItemCount += 1;
  if (stats.lowRelevance) {
    bucket.lowRelevanceFeedItemCount += 1;
  }
  if (stats.muted) {
    bucket.mutedFeedItemCount += 1;
  }
  if (stats.userRated) {
    bucket.userRatedFeedItemCount += 1;
  }
};

const coverageRows = (
  buckets: ReadonlyMap<string, CoverageBucket>,
): readonly (readonly [string, CoverageBucket])[] =>
  [...buckets.entries()].sort((left, right) => {
    const countDiff =
      right[1].collectedFeedItemCount - left[1].collectedFeedItemCount;
    return countDiff === 0 ? left[0].localeCompare(right[0]) : countDiff;
  });

const mergeProviderCollectionHealth = (
  coverage: readonly ReaderSummaryCollectedProviderCoverage[],
  health: readonly ReaderSummaryProviderCollectionHealth[],
): readonly ReaderSummaryCollectedProviderCoverage[] => {
  const byProvider = new Map(
    coverage.map((provider) => [provider.providerKey, provider]),
  );
  for (const providerHealth of health) {
    const providerKey = providerHealth.providerKey.trim();
    if (!isDefaultReaderSummaryEvidenceProvider(providerKey)) {
      continue;
    }
    const current = byProvider.get(providerKey) ?? {
      providerKey,
      collectedFeedItemCount: 0,
      lowRelevanceFeedItemCount: 0,
      mutedFeedItemCount: 0,
      userRatedFeedItemCount: 0,
    };
    const { providerKey: _ignored, ...collectionHealth } = providerHealth;
    byProvider.set(providerKey, { ...current, collectionHealth });
  }

  return [...byProvider.values()].sort((left, right) => {
    const countDiff =
      right.collectedFeedItemCount - left.collectedFeedItemCount;
    return countDiff === 0
      ? left.providerKey.localeCompare(right.providerKey)
      : countDiff;
  });
};
