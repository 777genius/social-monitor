import type { FeedItem } from "@social-monitor/feed/domain";
import type {
  FeedItemReadRepositoryPort,
  ListFeedItemSignalCandidatesQuery,
} from "@social-monitor/feed/ports";

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
    let cursor: string | undefined;
    const accumulator = emptyCoverageAccumulator();
    const collectionHealthPromise =
      this.collectionHealth.readProviderCollectionHealth(query);
    const candidateReader = this.feedItems.listSignalCandidates;
    const feedQuery = coverageFeedItemQuery(query);

    if (candidateReader !== undefined) {
      const items = await candidateReader.call(this.feedItems, feedQuery);
      recordCoverageItems(items, accumulator);
      return coverageResult(accumulator, await collectionHealthPromise);
    }

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.feedItems.list({
        ...feedQuery,
        limit: PAGE_LIMIT,
        cursor,
      });
      recordCoverageItems(result.items, accumulator);

      if (result.nextCursor === undefined) {
        return coverageResult(accumulator, await collectionHealthPromise);
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

type CoverageAccumulator = {
  total: number;
  readonly totals: CoverageBucket;
  readonly providerCounts: Map<string, CoverageBucket>;
  readonly topicCounts: Map<string, CoverageBucket>;
  readonly queryCounts: Map<string, CoverageBucket>;
};

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

const emptyCoverageAccumulator = (): CoverageAccumulator => ({
  total: 0,
  totals: emptyCoverageCounts(),
  providerCounts: new Map(),
  topicCounts: new Map(),
  queryCounts: new Map(),
});

const coverageFeedItemQuery = (
  query: CountReaderSummaryCollectedFeedItemsQuery,
): ListFeedItemSignalCandidatesQuery => ({
  tenantId: query.tenantId,
  workspaceId: query.workspaceId,
  interestId:
    query.scope.type === "interest" ? query.scope.interestId : undefined,
  publishedAtOrAfter: query.period.startedAt,
  publishedBefore: query.period.endedAt,
  observedAtOrBefore: query.observedThrough,
});

const recordCoverageItems = (
  items: readonly FeedItem[],
  accumulator: CoverageAccumulator,
): void => {
  for (const item of items) {
    const snapshot = item.toSnapshot();
    const providerKey = snapshot.providerKey;
    if (!isDefaultReaderSummaryEvidenceProvider(providerKey)) {
      continue;
    }
    const stats = statsForFeedItemMetadata(snapshot.providerMetadata);

    accumulator.total += 1;
    incrementBucket(accumulator.totals, stats);
    incrementNamedBucket(accumulator.providerCounts, providerKey, stats);
    incrementNamedBucket(
      accumulator.topicCounts,
      snapshot.interestId,
      stats,
      { label: stats.topicLabel },
    );
    for (const searchQuery of stats.searchQueries) {
      incrementNamedBucket(accumulator.queryCounts, searchQuery, stats);
    }
  }
};

const coverageResult = (
  accumulator: CoverageAccumulator,
  collectionHealth: readonly ReaderSummaryProviderCollectionHealth[],
): ReaderSummaryCollectedFeedItemCoverage => ({
  collectedFeedItemCount: accumulator.total,
  lowRelevanceFeedItemCount:
    accumulator.totals.lowRelevanceFeedItemCount,
  mutedFeedItemCount: accumulator.totals.mutedFeedItemCount,
  userRatedFeedItemCount: accumulator.totals.userRatedFeedItemCount,
  providerBreakdown: mergeProviderCollectionHealth(
    coverageRows(accumulator.providerCounts).map(
      ([providerKey, bucket]): ReaderSummaryCollectedProviderCoverage => ({
        providerKey,
        ...bucket,
      }),
    ),
    collectionHealth,
  ),
  topicBreakdown: coverageRows(accumulator.topicCounts).map(
    ([topicKey, bucket]): ReaderSummaryCollectedTopicCoverage => ({
      topicKey,
      ...(bucket.label === undefined ? {} : { topicLabel: bucket.label }),
      collectedFeedItemCount: bucket.collectedFeedItemCount,
      lowRelevanceFeedItemCount: bucket.lowRelevanceFeedItemCount,
      mutedFeedItemCount: bucket.mutedFeedItemCount,
      userRatedFeedItemCount: bucket.userRatedFeedItemCount,
    }),
  ),
  queryBreakdown: coverageRows(accumulator.queryCounts).map(
    ([queryText, bucket]): ReaderSummaryCollectedQueryCoverage => ({
      query: queryText,
      ...bucket,
    }),
  ),
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
    void _ignored;
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
