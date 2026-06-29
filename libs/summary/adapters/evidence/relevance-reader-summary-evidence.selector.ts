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
import type { SummaryEvidenceSelection } from "../../domain";
import {
  NOOP_STORY_RANKING_METRICS,
  type ReaderSummaryEvidenceSelectorPort,
  type StoryRankingMetricsPort,
} from "../../ports";

const maxReaderSummaryEvidenceItems = 200;

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
      interestId: params.scope.type === "interest" ? params.scope.interestId : undefined,
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

    const selection = prioritizeSocialNewsSelection(
      this.clusterer.cluster({
        identity: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          scope: params.scope,
        },
        items,
        limit: params.maxItems,
      }),
    );
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
          interestId: snapshot.interestId,
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
          contentQuality: rankedItem.contentQuality,
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
  interestId: item.interestId,
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
  contentQuality: item.contentQuality,
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
    case "x-twitter":
    case "twitter":
      return "X/Twitter";
    case "rss":
      return "RSS";
    default:
      return providerKey;
  }
};

const expandedCandidateLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(
    maxReaderSummaryEvidenceItems,
    Math.max(limit, limit * 3),
  );
};

const selectProviderDiverseEvidence = (
  items: readonly SummaryEvidenceItem[],
  limit: number,
): readonly SummaryEvidenceItem[] => {
  const normalizedLimit = normalizeSelectionLimit(limit);
  const eligibleItems = items.filter(isEligibleForEvidence);

  if (eligibleItems.length <= normalizedLimit) {
    return eligibleItems;
  }

  const selected: SummaryEvidenceItem[] = [];
  const selectedIds = new Set<string>();
  const providerFamilies = orderedProviderFamilies(eligibleItems);

  for (const providerFamily of providerFamilies) {
    if (selected.length >= normalizedLimit) {
      break;
    }

    const providerItem = eligibleItems.find(
      (item) => providerFamilyKey(item.providerKey) === providerFamily,
    );
    if (providerItem !== undefined) {
      selected.push(providerItem);
      selectedIds.add(providerItem.feedItemId);
    }
  }

  for (const item of roundRobinByProviderFamily(eligibleItems, selectedIds)) {
    if (selected.length >= normalizedLimit) {
      break;
    }

    selected.push(item);
    selectedIds.add(item.feedItemId);
  }

  return selected;
};

const prioritizeSocialNewsSelection = (
  selection: SummaryEvidenceSelection,
): SummaryEvidenceSelection => {
  const selectedEvidence = [...selection.selectedEvidence].sort(
    compareSocialNewsEvidence,
  );

  return {
    ...selection,
    sourceWindow: {
      ...selection.sourceWindow,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
    },
    selectedEvidence,
  };
};

const isEligibleForEvidence = (item: SummaryEvidenceItem): boolean =>
  item.contentQuality?.eligibleForSummary !== false;

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

const socialNewsProviderFamilyOrder = [
  "x-twitter",
  "reddit",
  "hacker-news",
  "rss",
  "github",
] as const;

const orderedProviderFamilies = (
  items: readonly SummaryEvidenceItem[],
): readonly string[] => {
  const families = uniqueStable(
    items.map((item) => providerFamilyKey(item.providerKey)),
  );
  const familySet = new Set(families);
  const ordered = socialNewsProviderFamilyOrder.filter((family) =>
    familySet.has(family),
  );
  const orderedSet = new Set<string>(ordered);
  const remaining = families.filter((family) => !orderedSet.has(family));

  return [...ordered, ...remaining];
};

const roundRobinByProviderFamily = (
  items: readonly SummaryEvidenceItem[],
  selectedIds: ReadonlySet<string>,
): readonly SummaryEvidenceItem[] => {
  const families = orderedProviderFamilies(items);
  const itemsByFamily = new Map(
    families.map(
      (family) =>
        [
          family,
          items.filter(
            (item) =>
              providerFamilyKey(item.providerKey) === family &&
              !selectedIds.has(item.feedItemId),
          ),
        ] as const,
    ),
  );
  const result: SummaryEvidenceItem[] = [];
  let added = true;

  while (added) {
    added = false;

    for (const family of families) {
      const item = itemsByFamily.get(family)?.shift();
      if (item === undefined) {
        continue;
      }

      result.push(item);
      added = true;
    }
  }

  return result;
};

const compareSocialNewsEvidence = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number => {
  const familyPriorityDiff =
    providerFamilyPriority(left.providerKey) -
    providerFamilyPriority(right.providerKey);
  if (familyPriorityDiff !== 0) {
    return familyPriorityDiff;
  }

  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  const observedAtDiff = right.observedAt.getTime() - left.observedAt.getTime();
  if (observedAtDiff !== 0) {
    return observedAtDiff;
  }

  return left.feedItemId.localeCompare(right.feedItemId);
};

const providerFamilyPriority = (providerKey: string): number => {
  const family = providerFamilyKey(providerKey);
  const index = socialNewsProviderFamilyOrder.findIndex(
    (candidate) => candidate === family,
  );

  return index === -1 ? socialNewsProviderFamilyOrder.length : index;
};

const normalizeSelectionLimit = (limit: number): number => {
  if (!Number.isInteger(limit) || limit < 1) {
    return 1;
  }

  return Math.min(limit, maxReaderSummaryEvidenceItems);
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
