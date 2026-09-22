import {
  MAX_FEED_ITEM_PAGE_LIMIT,
  type FeedItemReadRepositoryPort,
} from "@social-monitor/feed/ports";
import {
  SourceContentQualityPolicy,
  SourceContentSafetyPolicy,
} from "@social-monitor/relevance/domain";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { Clock } from "@social-monitor/shared-kernel";

import {
  githubTrendingProviderKey,
  isGitHubTrendingEvidence,
  primaryReaderSummaryEvidence,
  selectGitHubTrendingSupplementalEvidence,
  StoryClusteringService,
  type SummaryEvidenceItem,
} from "../../domain";
import {
  NOOP_STORY_RANKING_METRICS,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummarySupplementalEvidenceSelectorPort,
  type ReaderSummaryStoryRelationVerifierPort,
  type StoryRankingMetricsPort,
} from "../../ports";
import {
  scheduleReaderSummarySafeRecallShadowObservation,
  verifiedReaderSummaryStoryRelations,
} from "./relevance-reader-summary-story-relation-decisions";
import {
  RELATED_TOPIC_VERIFIER_TIMEOUT_MS,
  verifiedReaderSummaryRelatedTopics,
} from "./relevance-reader-summary-related-topics";

import {
  expandedCandidateLimit,
  filterItemsByDefaultReaderSummaryProviders,
  filterItemsByReaderSummaryPeriod,
  mapRankedItem,
  mapSupplementFeedItem,
  readerSummaryPeriodQuery,
} from "./relevance-reader-summary-evidence-support";
import {
  promotionPolicySelection,
  promotionSupportCandidates,
} from "./relevance-reader-summary-promotion-candidates";
import {
  composeReaderSummaryEditorialSlate,
  materializeReaderSummaryEditorialSlate,
} from "./reader-summary-editorial-slate";

import {
  excludedPreparationIds,
  observeReaderPromotionSnapshot,
  observeReaderSummaryPreparation,
  unclusteredPreparationIds,
  type ReaderSummaryPreparationObserver,
} from "./reader-summary-preparation-observer";

/**
 * Original source text is considered through 256k UTF-16 code units. The cap
 * is applied before safety-policy sanitization to bound transient regex/string
 * allocations; only the sanitized result can reach relation verification.
 */
export const READER_SUMMARY_ORIGINAL_SOURCE_TEXT_SAFETY_CAP = 256_000;

export class RelevanceReaderSummaryEvidenceSelector implements
ReaderSummaryEvidenceSelectorPort, ReaderSummarySupplementalEvidenceSelectorPort {
  private readonly clusterer: StoryClusteringService;
  private readonly qualityPolicy = new SourceContentQualityPolicy();
  private readonly safetyPolicy = new SourceContentSafetyPolicy();

  constructor(
    private readonly rankFeedItems: RankFeedItemsUseCase,
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly clock: Clock,
    private readonly storyRankingMetrics: StoryRankingMetricsPort = NOOP_STORY_RANKING_METRICS,
    private readonly storyRelationVerifier?: ReaderSummaryStoryRelationVerifierPort,
    private readonly relatedTopicVerifierTimeoutMs = RELATED_TOPIC_VERIFIER_TIMEOUT_MS,
    private readonly preparationObserver?: ReaderSummaryPreparationObserver,
  ) {
    this.clusterer = new StoryClusteringService(clock);
  }

  async select(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
  ) {
    const ingestionCutoff = new Date(
      (params.observedThrough ?? this.clock.now()).getTime(),
    );
    const query = { ...params, observedThrough: ingestionCutoff };
    const ranked = await this.loadRankedInventory(query, ingestionCutoff);
    const rankedInventory = ranked.items;
    const expandedRankedItems = filterItemsByReaderSummaryPeriod(
      rankedInventory,
      params.period,
      params.timestampPolicy,
    );
    const promotionCandidates = expandedRankedItems.filter((item) =>
      item.promotionFacts !== undefined && !isGitHubTrendingEvidence(item));
    const promotionCandidateIds = new Set(
      promotionCandidates.map((item) => item.feedItemId),
    );

    const rankedItems = filterItemsByDefaultReaderSummaryProviders(
      expandedRankedItems,
    );
    const rankedGitHubTrendingItems = expandedRankedItems.filter(
      isGitHubTrendingEvidence,
    );
    const candidateItems = uniqueEvidence([
      ...promotionCandidates,
      ...rankedItems,
      ...rankedGitHubTrendingItems,
    ]);
    const primaryCandidateItems = candidateItems.filter(
      (item) => !isGitHubTrendingEvidence(item),
    );
    const githubTrendingEvidence =
      selectGitHubTrendingSupplementalEvidence(candidateItems);
    const candidateSelection = this.clusterer.cluster({
      identity: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scope: params.scope,
      },
      items: primaryCandidateItems,
      limit: primaryCandidateItems.length,
      now: ingestionCutoff,
    });
    const promotionPolicyItems = primaryCandidateItems.filter((item) =>
      promotionCandidateIds.has(item.feedItemId));
    const additionalRelationCandidates = promotionSupportCandidates({
      evidence: primaryCandidateItems,
      clusters: candidateSelection.clusters,
      leadIds: promotionCandidateIds,
      promotionCandidateIds,
    });
    const approvedRelations = await verifiedReaderSummaryStoryRelations({
      query,
      evidence: primaryCandidateItems,
      deterministicSelection: candidateSelection,
      requestedAt: ingestionCutoff,
      verifier: this.storyRelationVerifier,
      metrics: this.storyRankingMetrics,
      additionalCandidates: additionalRelationCandidates,
    });
    const authoritativeCandidateSelection = this.clusterer.cluster({
      identity: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scope: params.scope,
      },
      items: primaryCandidateItems,
      limit: primaryCandidateItems.length,
      now: ingestionCutoff,
      verifiedStoryRelationPairs: approvedRelations.pairs,
      verifiedStrictTitleRelationPairs: approvedRelations.strictTitlePairs,
    });
    const authoritativeClusterByEvidenceId = new Map<string, string>();
    for (const cluster of authoritativeCandidateSelection.clusters) {
      for (const feedItemId of [
        cluster.representativeFeedItemId,
        ...cluster.duplicateFeedItemIds,
      ]) {
        authoritativeClusterByEvidenceId.set(feedItemId, cluster.id);
      }
    }
    const graduatedRelations = approvedRelations.relations.filter(
      (relation) =>
        authoritativeClusterByEvidenceId.get(relation.leftFeedItemId) !==
          undefined &&
        authoritativeClusterByEvidenceId.get(relation.leftFeedItemId) ===
          authoritativeClusterByEvidenceId.get(relation.rightFeedItemId),
    );
    const prePolicySelection = {
      ...authoritativeCandidateSelection,
      approvedSameStoryRelations: graduatedRelations,
      sourceWindow: {
        ...authoritativeCandidateSelection.sourceWindow,
        periodStartedAt: params.period.startedAt,
        periodEndedAt: params.period.endedAt,
        ingestionCutoff,
      },
    };
    if (this.preparationObserver !== undefined) {
      observeReaderSummaryPreparation(this.preparationObserver, {
        rankingOrder: ranked.rankingOrder,
        rankedInventory,
        periodExcludedIds: excludedPreparationIds(rankedInventory, expandedRankedItems),
        defaultProviderExcludedIds: excludedPreparationIds(expandedRankedItems, rankedItems),
        periodFiltered: expandedRankedItems,
        defaultProviderFiltered: rankedItems,
        candidateItems,
        groupingInput: primaryCandidateItems,
        initialGrouping: candidateSelection,
        authoritativeGrouping: authoritativeCandidateSelection,
        initialUnclusteredIds: unclusteredPreparationIds(primaryCandidateItems, candidateSelection),
        authoritativeUnclusteredIds: unclusteredPreparationIds(primaryCandidateItems, authoritativeCandidateSelection),
        relationCandidates: approvedRelations.candidates,
        verifiedPairs: [...approvedRelations.pairs],
        strictTitlePairs: [...approvedRelations.strictTitlePairs],
        approvedRelations: approvedRelations.relations,
        graduatedRelations,
        policyItems: promotionPolicyItems,
        prePolicySelection,
        admittedSupplemental: githubTrendingEvidence,
      });
    }
    const deterministicPromotionSelection = promotionPolicySelection(
      prePolicySelection, promotionPolicyItems,
    );
    const editorialSlate = composeReaderSummaryEditorialSlate({
      selection: deterministicPromotionSelection,
      candidates: promotionPolicyItems,
      displayScope: params,
    });
    const deterministicFinalSelection = materializeReaderSummaryEditorialSlate({
      selection: deterministicPromotionSelection,
      slate: editorialSlate,
      supplementalEvidence: githubTrendingEvidence,
    });
    const relatedTopicRelations = await verifiedReaderSummaryRelatedTopics({
      query,
      // Related-topic verification needs the bounded context candidates that
      // ranking rejected from the immutable publication slate. The returned
      // relation is metadata only; finalSelection still keeps those subjects
      // out of model evidence and reader-visible promotion cards.
      selection: deterministicPromotionSelection,
      requestedAt: ingestionCutoff,
      verifier: this.storyRelationVerifier,
      metrics: this.storyRankingMetrics,
      now: () => ingestionCutoff,
      timeoutMs: this.relatedTopicVerifierTimeoutMs,
    });
    const personalizedSelection = {
      ...deterministicFinalSelection,
      approvedSameStoryRelations: graduatedRelations,
      relatedTopicRelations,
      personalization:
        ranked.memoryGuidance === undefined
          ? undefined
          : {
              memoryGuidanceStatus: ranked.memoryGuidance.status,
              memoryGuidanceApplied: ranked.memoryGuidance.applied,
              providerPreferenceCount:
                ranked.memoryGuidance.providerPreferenceCount,
              keywordPreferenceCount:
                ranked.memoryGuidance.keywordPreferenceCount,
              mutedKeywordCount: ranked.memoryGuidance.mutedKeywordCount,
              blockedProviderCount:
                ranked.memoryGuidance.blockedProviderCount,
              signals: ranked.memoryGuidance.signals,
            },
    };
    this.recordTelemetry(() =>
      this.storyRankingMetrics.recordStoryRanking(
        primaryReaderSummaryEvidence(personalizedSelection),
      ),
    );

    scheduleReaderSummarySafeRecallShadowObservation({
      query,
      evidence: primaryCandidateItems,
      deterministicSelection: candidateSelection,
      requestedAt: ingestionCutoff,
      verifier: this.storyRelationVerifier,
      metrics: this.storyRankingMetrics,
      authoritativeCandidates: approvedRelations.candidates,
    });
    return personalizedSelection;
  }

  async selectSupplemental(
    params: Parameters<ReaderSummarySupplementalEvidenceSelectorPort[
      "selectSupplemental"
    ]>[0],
  ): Promise<readonly SummaryEvidenceItem[]> {
    const ingestionCutoff = new Date(
      (params.observedThrough ?? this.clock.now()).getTime(),
    );
    const query = { ...params, observedThrough: ingestionCutoff };
    const page = await this.feedItems.list({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      interestId:
        params.scope.type === "interest" ? params.scope.interestId : undefined,
      providerKey: githubTrendingProviderKey,
      ...readerSummaryPeriodQuery(query),
      observedAtOrBefore: ingestionCutoff,
      limit: MAX_FEED_ITEM_PAGE_LIMIT,
    });
    const supplemental = page.items.map((item) =>
      mapSupplementFeedItem({
        snapshot: item.toSnapshot(),
        qualityPolicy: this.qualityPolicy,
        safetyPolicy: this.safetyPolicy,
        now: ingestionCutoff,
      }));

    return selectGitHubTrendingSupplementalEvidence(
      filterItemsByReaderSummaryPeriod(
        supplemental,
        params.period,
        params.timestampPolicy,
      ),
    );
  }

  private async loadRankedInventory(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
    ingestionCutoff: Date,
  ) {
    const periodQuery = readerSummaryPeriodQuery(params);
    const ranked = await this.rankFeedItems.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      interestId:
        params.scope.type === "interest" ? params.scope.interestId : undefined,
      userId: params.userId,
      ...periodQuery,
      observedAtOrBefore: ingestionCutoff,
      rankingProfile: "reader_post_promotion",
      ...(params.retainedEngagementAuthority === undefined ? {} : {
        retainedEngagementAuthority: params.retainedEngagementAuthority,
      }),
      limit: expandedCandidateLimit(params.maxItems),
      ...(this.preparationObserver === undefined ? {} : {
        observePromotionPreparation: (preparation) => observeReaderPromotionSnapshot(
          this.preparationObserver!, preparation, ingestionCutoff, params,
        ),
      }),
    });

    if (!ranked.ok) {
      throw ranked.error;
    }
    return {
      items: ranked.value.items.map((item) =>
        mapRankedItem(item, ingestionCutoff, params)),
      rankingOrder: ranked.value.items.map(({ feedItemId, rank }) => ({
        feedItemId,
        rank,
      })),
      memoryGuidance: ranked.value.memoryGuidance,
    };
  }

  private recordTelemetry(record: () => void): void {
    try {
      record();
    } catch {
      // Observability must never alter evidence selection or relation decisions.
    }
  }

}

const uniqueEvidence = (
  items: readonly SummaryEvidenceItem[],
): readonly SummaryEvidenceItem[] => {
  const byId = new Map<string, SummaryEvidenceItem>();
  for (const item of items) {
    if (!byId.has(item.feedItemId)) byId.set(item.feedItemId, item);
  }
  return [...byId.values()];
};
