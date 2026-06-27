import {
  feedProviderMetricsFromMetadata,
  formatFeedProviderMetrics,
  summarizeFeedProviderMetrics,
} from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { type Clock, type JsonObject } from "@social-monitor/shared-kernel";

import { StoryClusteringService, type SummaryEvidenceItem } from "../../domain";
import {
  NOOP_STORY_RANKING_METRICS,
  type ReaderSummaryEvidenceSelectorPort,
  type StoryRankingMetricsPort,
} from "../../ports";

export class RelevanceReaderSummaryEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  private readonly clusterer: StoryClusteringService;

  constructor(
    private readonly rankFeedItems: RankFeedItemsUseCase,
    private readonly feedItems: FeedItemReadRepositoryPort,
    clock: Clock,
    private readonly storyRankingMetrics: StoryRankingMetricsPort = NOOP_STORY_RANKING_METRICS,
  ) {
    this.clusterer = new StoryClusteringService(clock);
  }

  async select(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
  ) {
    const ranked = await this.rankFeedItems.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      topicId: params.scope.type === "topic" ? params.scope.topicId : undefined,
      userId: params.userId,
      observedAfter: inclusiveObservedAfter(params.period.startedAt),
      observedBefore: params.period.endedAt,
      limit: expandedCandidateLimit(params.maxItems),
    });

    if (!ranked.ok) {
      throw ranked.error;
    }

    const items = selectProviderDiverseEvidence(
      filterItemsByReaderSummaryPeriod(
        await this.expandRankedItems(params, ranked.value.items),
        params.period,
      ),
      params.maxItems,
    );

    const selection = this.clusterer.cluster({
      identity: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scope: params.scope,
      },
      items,
      limit: params.maxItems,
    });
    const personalizedSelection = {
      ...selection,
      personalization:
        ranked.value.memoryGuidance === undefined
          ? undefined
          : {
              memoryGuidanceStatus: ranked.value.memoryGuidance.status,
              memoryGuidanceApplied: ranked.value.memoryGuidance.applied,
              providerPreferenceCount:
                ranked.value.memoryGuidance.providerPreferenceCount,
              keywordPreferenceCount:
                ranked.value.memoryGuidance.keywordPreferenceCount,
              mutedKeywordCount: ranked.value.memoryGuidance.mutedKeywordCount,
              blockedProviderCount:
                ranked.value.memoryGuidance.blockedProviderCount,
              signals: ranked.value.memoryGuidance.signals,
            },
    };
    this.storyRankingMetrics.recordStoryRanking(personalizedSelection);

    return personalizedSelection;
  }

  private async expandRankedItems(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
    rankedItems: readonly RankedFeedItemView[],
  ): Promise<readonly SummaryEvidenceItem[]> {
    const itemsById = new Map<string, SummaryEvidenceItem>();

    for (const rankedItem of rankedItems) {
      itemsById.set(rankedItem.feedItemId, mapRankedItem(rankedItem));

      for (const duplicateFeedItemId of rankedItem.duplicateFeedItemIds) {
        if (itemsById.has(duplicateFeedItemId)) {
          continue;
        }

        const duplicate = await this.feedItems.findById({
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          feedItemId: duplicateFeedItemId,
        });

        if (duplicate === null) {
          continue;
        }

        const snapshot = duplicate.toSnapshot();
        itemsById.set(duplicateFeedItemId, {
          feedItemId: snapshot.id,
          sourceItemId: snapshot.sourceItemId,
          sourceBindingId: snapshot.sourceBindingId,
          topicId: snapshot.topicId,
          providerKey: snapshot.providerKey,
          providerName: providerNameForProvider(snapshot.providerKey),
          canonicalUrl: snapshot.canonicalUrl,
          title: snapshot.title,
          bodyPreview: snapshot.bodyPreview,
          authorHandle: snapshot.authorHandle,
          publishedAt: snapshot.publishedAt,
          observedAt: snapshot.observedAt,
          score: Math.max(0, rankedItem.score - 0.001),
          whyImportant: rankedItem.whyImportant,
          readerActionKind: readerActionKindForProvider(snapshot.providerKey),
          ...providerMetricFacts({
            providerKey: snapshot.providerKey,
            providerMetadata: snapshot.providerMetadata,
          }),
          storyKeyHint: rankedItem.clusterId,
        });
      }
    }

    return [...itemsById.values()];
  }
}

const mapRankedItem = (item: RankedFeedItemView): SummaryEvidenceItem => ({
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  sourceBindingId: item.sourceBindingId,
  topicId: item.topicId,
  providerKey: item.providerKey,
  providerName: providerNameForProvider(item.providerKey),
  canonicalUrl: item.canonicalUrl,
  title: item.title,
  bodyPreview: item.bodyPreview,
  authorHandle: item.authorHandle,
  publishedAt: new Date(item.publishedAt),
  observedAt: new Date(item.observedAt),
  score: item.score,
  whyImportant: item.whyImportant,
  readerActionKind: readerActionKindForProvider(item.providerKey),
  ...providerMetricFacts({
    providerKey: item.providerKey,
    providerMetadata: item.providerMetadata,
  }),
  storyKeyHint: item.clusterId,
});

const providerMetricFacts = (params: {
  readonly providerKey: string;
  readonly providerMetadata?: JsonObject;
}): Pick<
  SummaryEvidenceItem,
  "providerMetricLabels" | "providerMetricSummary"
> => {
  const metrics = feedProviderMetricsFromMetadata(params);

  return {
    providerMetricLabels: formatFeedProviderMetrics(metrics),
    providerMetricSummary: summarizeFeedProviderMetrics(metrics),
  };
};

const readerActionKindForProvider = (
  providerKey: string,
): SummaryEvidenceItem["readerActionKind"] =>
  providerKey === "github-repo-radar" || providerKey === "github-trending-page"
    ? "watch_repository"
    : "read_source";

const providerNameForProvider = (providerKey: string): string => {
  switch (providerKey.toLowerCase()) {
    case "github-trending-page":
      return "GitHub Trending";
    case "github-repo-radar":
      return "Repo Radar";
    case "github-issues":
    case "github":
      return "GitHub";
    case "hacker-news":
    case "hn":
      return "Hacker News";
    case "reddit":
      return "Reddit";
    case "rss":
      return "RSS";
    default:
      return providerKey;
  }
};

const expandedCandidateLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return limit;
  }

  return Math.min(50, Math.max(limit, limit * 3));
};

const selectProviderDiverseEvidence = (
  items: readonly SummaryEvidenceItem[],
  limit: number,
): readonly SummaryEvidenceItem[] => {
  const normalizedLimit = normalizeSelectionLimit(limit);

  if (items.length <= normalizedLimit) {
    return items;
  }

  const selected: SummaryEvidenceItem[] = [];
  const selectedIds = new Set<string>();
  const selectedProviderKeys = new Set<string>();
  const providerFamilies = uniqueStable(
    items.map((item) => providerFamilyKey(item.providerKey)),
  );

  for (const providerFamily of providerFamilies) {
    if (selected.length >= normalizedLimit) {
      break;
    }

    const providerItem = items.find(
      (item) => providerFamilyKey(item.providerKey) === providerFamily,
    );
    if (providerItem !== undefined) {
      selected.push(providerItem);
      selectedIds.add(providerItem.feedItemId);
      selectedProviderKeys.add(providerItem.providerKey);
    }
  }

  const providerKeys = uniqueStable(items.map((item) => item.providerKey));

  for (const providerKey of providerKeys) {
    if (selected.length >= normalizedLimit) {
      break;
    }

    if (selectedProviderKeys.has(providerKey)) {
      continue;
    }

    const providerItem = items.find(
      (item) =>
        item.providerKey === providerKey && !selectedIds.has(item.feedItemId),
    );
    if (providerItem !== undefined) {
      selected.push(providerItem);
      selectedIds.add(providerItem.feedItemId);
      selectedProviderKeys.add(providerItem.providerKey);
    }
  }

  for (const item of items) {
    if (selected.length >= normalizedLimit) {
      break;
    }

    if (selectedIds.has(item.feedItemId)) {
      continue;
    }

    selected.push(item);
    selectedIds.add(item.feedItemId);
  }

  return selected;
};

const filterItemsByReaderSummaryPeriod = (
  items: readonly SummaryEvidenceItem[],
  period: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0]["period"],
): readonly SummaryEvidenceItem[] =>
  items.filter(
    (item) =>
      item.observedAt.getTime() >= period.startedAt.getTime() &&
      item.observedAt.getTime() < period.endedAt.getTime(),
  );

const inclusiveObservedAfter = (startedAt: Date): Date =>
  new Date(startedAt.getTime() - 1);

const providerFamilyKey = (providerKey: string): string => {
  const normalized = providerKey.toLowerCase();

  if (normalized === "github" || normalized.startsWith("github-")) {
    return "github";
  }

  if (normalized === "reddit") {
    return "reddit";
  }

  if (normalized === "hacker-news" || normalized === "hn") {
    return "hacker-news";
  }

  if (
    normalized === "x-twitter" ||
    normalized === "twitter" ||
    normalized === "x"
  ) {
    return "x-twitter";
  }

  return normalized;
};

const normalizeSelectionLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(limit, 50);
};

const uniqueStable = <T>(values: readonly T[]): readonly T[] => {
  const seen = new Set<T>();
  const result: T[] = [];

  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }

  return result;
};
