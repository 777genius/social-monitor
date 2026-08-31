import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { Clock } from "@social-monitor/shared-kernel";

import {
  isGitHubTrendingEvidence,
  primaryReaderSummaryEvidence,
  selectGitHubTrendingSupplementalEvidence,
  StoryClusteringService,
  type SummaryEvidenceItem,
} from "../../domain";
import {
  NOOP_STORY_RANKING_METRICS,
  type ReaderSummaryEvidenceSelectorPort,
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

/**
 * Original source text is considered through 256k UTF-16 code units. The cap
 * is applied before safety-policy sanitization to bound transient regex/string
 * allocations; only the sanitized result can reach relation verification.
 */
export const READER_SUMMARY_ORIGINAL_SOURCE_TEXT_SAFETY_CAP = 256_000;

export class RelevanceReaderSummaryEvidenceSelector implements ReaderSummaryEvidenceSelectorPort {
  private readonly clusterer: StoryClusteringService;
  constructor(
    private readonly rankFeedItems: RankFeedItemsUseCase,
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly clock: Clock,
    private readonly storyRankingMetrics: StoryRankingMetricsPort = NOOP_STORY_RANKING_METRICS,
    private readonly storyRelationVerifier?: ReaderSummaryStoryRelationVerifierPort,
    private readonly relatedTopicVerifierTimeoutMs = RELATED_TOPIC_VERIFIER_TIMEOUT_MS,
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
    const periodQuery = readerSummaryPeriodQuery(query);
    const ranked = await this.rankFeedItems.execute({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      interestId:
        params.scope.type === "interest" ? params.scope.interestId : undefined,
      userId: params.userId,
      ...periodQuery,
      observedAtOrBefore: ingestionCutoff,
      rankingProfile: "reader_post_promotion",
      limit: expandedCandidateLimit(params.maxItems),
    });

    if (!ranked.ok) {
      throw ranked.error;
    }
    const expandedRankedItems = filterItemsByReaderSummaryPeriod(
      ranked.value.items.map((item) => mapRankedItem(item, query.observedThrough)),
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
    const approvedRelations = await verifiedReaderSummaryStoryRelations({
      query,
      evidence: primaryCandidateItems,
      deterministicSelection: candidateSelection,
      requestedAt: ingestionCutoff,
      verifier: this.storyRelationVerifier,
      metrics: this.storyRankingMetrics,
      additionalCandidates: promotionSupportCandidates({
        evidence: primaryCandidateItems,
        clusters: candidateSelection.clusters,
        leadIds: promotionCandidateIds,
        promotionCandidateIds,
      }),
    });
    const verifiedCandidateSelection =
      approvedRelations.pairs.size === 0
        ? candidateSelection
        : this.clusterer.cluster({
            identity: {
              tenantId: params.tenantId,
              workspaceId: params.workspaceId,
              scope: params.scope,
            },
            items: primaryCandidateItems,
            limit: primaryCandidateItems.length,
            verifiedStoryRelationPairs: approvedRelations.pairs,
            now: ingestionCutoff,
          });
    const verifiedPromotionSelection = promotionPolicySelection({
      ...verifiedCandidateSelection,
      sourceWindow: {
        ...verifiedCandidateSelection.sourceWindow,
        periodStartedAt: params.period.startedAt,
        periodEndedAt: params.period.endedAt,
        ingestionCutoff,
      },
    }, promotionPolicyItems);
    const fullPromotionSelection = {
      ...verifiedPromotionSelection,
      approvedSameStoryRelations: approvedRelations.relations,
    };
    const editorialSlate = composeReaderSummaryEditorialSlate({
      selection: fullPromotionSelection,
      candidates: promotionPolicyItems,
    });
    const finalSelection = materializeReaderSummaryEditorialSlate({
      selection: fullPromotionSelection,
      slate: editorialSlate,
      supplementalEvidence: githubTrendingEvidence,
    });
    const relatedTopicRelations = await verifiedReaderSummaryRelatedTopics({
      query,
      // Related-topic verification needs the bounded context candidates that
      // ranking rejected from the immutable publication slate. The returned
      // relation is metadata only; finalSelection still keeps those subjects
      // out of model evidence and reader-visible promotion cards.
      selection: fullPromotionSelection,
      requestedAt: ingestionCutoff,
      verifier: this.storyRelationVerifier,
      metrics: this.storyRankingMetrics,
      now: () => ingestionCutoff,
      timeoutMs: this.relatedTopicVerifierTimeoutMs,
    });
    const personalizedSelection = {
      ...finalSelection,
      relatedTopicRelations,
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
    });
    return personalizedSelection;
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
