import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";

import type {
  ReaderSummaryTopicCollectionMetrics,
  ReaderSummaryTopicCollectionMetricsQuery,
  ReaderSummaryTopicCollectionMetricsReaderPort,
} from "../../ports";
import { statsForFeedItemMetadata } from "./feed-item-collection-stats";
import { isDefaultReaderSummaryEvidenceProvider } from "./reader-summary-evidence-provider-filter";

const PAGE_LIMIT = 100;
const MAX_PAGES_PER_QUERY = 100;

export class FeedReaderSummaryTopicCollectionMetricsReader implements ReaderSummaryTopicCollectionMetricsReaderPort {
  constructor(private readonly feedItems: FeedItemReadRepositoryPort) {}

  async readTopicCollectionMetrics(
    query: ReaderSummaryTopicCollectionMetricsQuery,
  ): Promise<ReaderSummaryTopicCollectionMetrics | undefined> {
    const feedItemStats = new Map<string, FeedItemTopicStats>();
    const selectors = topicSelectors(query);

    if (selectors.length === 0) {
      return emptyCollectionMetrics();
    }

    for (const selector of selectors) {
      const collected = await this.collectFeedItemIds({
        ...query,
        interestId: selector.interestId,
        searchQuery: selector.searchQuery,
      });
      if (collected === undefined) {
        return undefined;
      }

      for (const [feedItemId, stats] of collected.entries()) {
        feedItemStats.set(
          feedItemId,
          mergeStats(feedItemStats.get(feedItemId), stats),
        );
      }
    }

    return {
      collectedPostCount: feedItemStats.size,
      lowRelevancePostCount: countStats(feedItemStats, "lowRelevance"),
      mutedPostCount: countStats(feedItemStats, "muted"),
      userRatedPostCount: countStats(feedItemStats, "userRated"),
    };
  }

  private async collectFeedItemIds(query: {
    readonly tenantId: ReaderSummaryTopicCollectionMetricsQuery["tenantId"];
    readonly workspaceId: ReaderSummaryTopicCollectionMetricsQuery["workspaceId"];
    readonly period: ReaderSummaryTopicCollectionMetricsQuery["period"];
    readonly interestId?: string;
    readonly searchQuery?: string;
  }): Promise<ReadonlyMap<string, FeedItemTopicStats> | undefined> {
    let cursor: string | undefined;
    const feedItemStats = new Map<string, FeedItemTopicStats>();

    for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
      const result = await this.feedItems.list({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        interestId: query.interestId,
        searchQuery: query.searchQuery,
        publishedAtOrAfter: query.period.startedAt,
        publishedBefore: query.period.endedAt,
        limit: PAGE_LIMIT,
        cursor,
      });

      for (const item of result.items) {
        const snapshot = item.toSnapshot();
        if (!isDefaultReaderSummaryEvidenceProvider(snapshot.providerKey)) {
          continue;
        }
        feedItemStats.set(
          snapshot.id,
          mergeStats(
            feedItemStats.get(snapshot.id),
            statsForFeedItem(snapshot),
          ),
        );
      }

      if (result.nextCursor === undefined) {
        return feedItemStats;
      }

      if (result.nextCursor === cursor) {
        return undefined;
      }
      cursor = result.nextCursor;
    }

    return undefined;
  }
}

type TopicSelector = {
  readonly interestId?: string;
  readonly searchQuery?: string;
};

type FeedItemTopicStats = {
  readonly lowRelevance: boolean;
  readonly muted: boolean;
  readonly userRated: boolean;
};

const topicSelectors = (
  query: ReaderSummaryTopicCollectionMetricsQuery,
): readonly TopicSelector[] => {
  const interestIds = uniqueNonEmpty([
    ...query.interestIds,
    query.scope.type === "interest" ? query.scope.interestId : "",
  ]);
  const topicSearch = query.topicLabel.trim();

  if (topicSearch.length === 0) {
    return [];
  }

  if (interestIds.length === 0) {
    return [{ searchQuery: topicSearch }];
  }

  return interestIds.map((interestId) => ({
    interestId,
    searchQuery: topicSearch,
  }));
};

const uniqueNonEmpty = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const emptyCollectionMetrics = (): ReaderSummaryTopicCollectionMetrics => ({
  collectedPostCount: 0,
  lowRelevancePostCount: 0,
  mutedPostCount: 0,
  userRatedPostCount: 0,
});

const statsForFeedItem = (snapshot: {
  readonly providerMetadata?: Readonly<Record<string, unknown>>;
}): FeedItemTopicStats => {
  const stats = statsForFeedItemMetadata(snapshot.providerMetadata);

  return {
    lowRelevance: stats.lowRelevance,
    muted: stats.muted,
    userRated: stats.userRated,
  };
};

const mergeStats = (
  left: FeedItemTopicStats | undefined,
  right: FeedItemTopicStats = emptyStats,
): FeedItemTopicStats => ({
  lowRelevance: (left?.lowRelevance ?? false) || right.lowRelevance,
  muted: (left?.muted ?? false) || right.muted,
  userRated: (left?.userRated ?? false) || right.userRated,
});

const emptyStats: FeedItemTopicStats = {
  lowRelevance: false,
  muted: false,
  userRated: false,
};

const countStats = (
  stats: ReadonlyMap<string, FeedItemTopicStats>,
  key: keyof FeedItemTopicStats,
): number => [...stats.values()].filter((value) => value[key]).length;
