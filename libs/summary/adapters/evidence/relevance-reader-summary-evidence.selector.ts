import {
  feedProviderMetricsFromMetadata,
  feedProviderMetricStrength,
  formatFeedProviderMetrics,
  summarizeFeedProviderMetrics,
  type FeedItem,
} from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import {
  SourceContentQualityPolicy,
  SourceContentSafetyPolicy,
} from "@social-monitor/relevance/domain";
import { type Clock, type JsonObject } from "@social-monitor/shared-kernel";

import { StoryClusteringService, type SummaryEvidenceItem } from "../../domain";
import type { SummaryEvidenceSelection } from "../../domain";
import {
  NOOP_STORY_RANKING_METRICS,
  type ReaderSummaryEvidenceSelectorPort,
  type StoryRankingMetricsPort,
} from "../../ports";
import { previewMediaFromProviderMetadata } from "./provider-preview-media";
import { isDefaultReaderSummaryEvidenceProvider } from "./reader-summary-evidence-provider-filter";

import {
  countItemsForProvider,
  expandedCandidateLimit,
  filterItemsByDefaultReaderSummaryProviders,
  filterItemsByReaderSummaryPeriod,
  inclusiveObservedAfter,
  mapRankedItem,
  mapSupplementFeedItem,
  providerMetricFacts,
  providerNameForProvider,
  providerSupplementTargetForLimit,
  readerActionKindForProvider,
  readerSummaryProviderDiversityOrder,
  selectRankedEvidence,
} from "./relevance-reader-summary-evidence-support";

export class RelevanceReaderSummaryEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  private readonly clusterer: StoryClusteringService;
  private readonly qualityPolicy = new SourceContentQualityPolicy();
  private readonly safetyPolicy = new SourceContentSafetyPolicy();

  constructor(
    private readonly rankFeedItems: RankFeedItemsUseCase,
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly clock: Clock,
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
      interestId:
        params.scope.type === "interest" ? params.scope.interestId : undefined,
      userId: params.userId,
      observedAfter: inclusiveObservedAfter(params.period.startedAt),
      observedBefore: params.period.endedAt,
      limit: expandedCandidateLimit(params.maxItems),
    });

    if (!ranked.ok) {
      throw ranked.error;
    }

    const rankedItems = filterItemsByReaderSummaryPeriod(
      filterItemsByDefaultReaderSummaryProviders(
        await this.expandRankedItems(params, ranked.value.items),
      ),
      params.period,
    );
    const items = selectRankedEvidence(
      await this.withProviderDiversitySupplements(params, rankedItems),
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
          previewMedia: previewMediaFromProviderMetadata({
            providerKey: snapshot.providerKey,
            providerMetadata: snapshot.providerMetadata,
            title: snapshot.title,
            canonicalUrl: snapshot.canonicalUrl,
          }),
          storyKeyHint: rankedItem.clusterId,
        });
      }
    }

    return [...itemsById.values()];
  }

  private async withProviderDiversitySupplements(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
    rankedItems: readonly SummaryEvidenceItem[],
  ): Promise<readonly SummaryEvidenceItem[]> {
    const itemsById = new Map(
      rankedItems.map((item) => [item.feedItemId, item] as const),
    );
    const target = providerSupplementTargetForLimit(params.maxItems);

    for (const providerKey of readerSummaryProviderDiversityOrder) {
      if (!isDefaultReaderSummaryEvidenceProvider(providerKey)) {
        continue;
      }

      let providerCount = countItemsForProvider(itemsById.values(), providerKey);
      if (providerCount >= target) {
        continue;
      }

      const page = await this.feedItems.list({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        interestId:
          params.scope.type === "interest" ? params.scope.interestId : undefined,
        providerKey,
        observedAfter: inclusiveObservedAfter(params.period.startedAt),
        observedBefore: params.period.endedAt,
        limit: target * 2,
      });

      for (const feedItem of page.items) {
        if (providerCount >= target) {
          break;
        }

        const snapshot = feedItem.toSnapshot();
        if (itemsById.has(snapshot.id)) {
          continue;
        }

        const supplement = mapSupplementFeedItem({
          snapshot,
          qualityPolicy: this.qualityPolicy,
          safetyPolicy: this.safetyPolicy,
          now: this.clock.now(),
        });

        if (supplement.contentQuality?.eligibleForSummary === false) {
          continue;
        }

        itemsById.set(supplement.feedItemId, supplement);
        providerCount += 1;
      }
    }

    return [...itemsById.values()];
  }
}
