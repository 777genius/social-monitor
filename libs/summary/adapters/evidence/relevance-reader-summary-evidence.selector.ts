import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import {
  SourceContentQualityPolicy,
  SourceContentSafetyPolicy,
} from "@social-monitor/relevance/domain";
import type { Clock } from "@social-monitor/shared-kernel";

import {
  approvedStoryRelationPairs,
  buildStoryRelationCandidates,
  StoryClusteringService,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";
import { isTopReadEligibleEvidence } from "../../domain/policies/top-read-eligibility-policy";
import {
  NOOP_STORY_RANKING_METRICS,
  type ReaderSummaryEvidenceSelectorPort,
  type ReaderSummaryStoryRelationVerifierPort,
  type StoryRankingMetricsPort,
} from "../../ports";
import { isDefaultReaderSummaryEvidenceProvider } from "./reader-summary-evidence-provider-filter";

import {
  countItemsForProvider,
  expandedCandidateLimit,
  filterItemsByDefaultReaderSummaryProviders,
  filterItemsByReaderSummaryPeriod,
  mapRankedItem,
  mapSupplementFeedItem,
  providerSupplementTargetForLimit,
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
    private readonly storyRelationVerifier?: ReaderSummaryStoryRelationVerifierPort,
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
      publishedAtOrAfter: params.period.startedAt,
      publishedBefore: params.period.endedAt,
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
      await this.withTopReadCandidateSupplements(
        params,
        await this.withProviderDiversitySupplements(params, rankedItems),
      ),
      params.maxItems,
    );

    const deterministicSelection = this.clusterer.cluster({
      identity: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scope: params.scope,
      },
      items,
      limit: params.maxItems,
    });
    const selection = await this.withVerifiedStoryRelations(
      params,
      items,
      deterministicSelection,
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

    return this.withOriginalSourceText(params, personalizedSelection);
  }

  private async withVerifiedStoryRelations(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
    evidence: readonly SummaryEvidenceItem[],
    deterministicSelection: SummaryEvidenceSelection,
  ): Promise<SummaryEvidenceSelection> {
    const candidates = buildStoryRelationCandidates({
      selection: deterministicSelection,
      evidence,
    });
    if (this.storyRelationVerifier === undefined || candidates.length === 0) {
      this.storyRankingMetrics.recordStoryRelationVerification({
        status: "skipped",
        candidateCount: candidates.length,
        approvedCount: 0,
      });
      return deterministicSelection;
    }

    try {
      const decisions = await this.storyRelationVerifier.verify({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scope: params.scope,
        period: params.period,
        requestedAt: this.clock.now(),
        clusters: deterministicSelection.clusters,
        evidence,
        candidates,
      });
      const approvedPairs = approvedStoryRelationPairs({
        candidates,
        decisions,
      });
      this.storyRankingMetrics.recordStoryRelationVerification({
        status: "completed",
        candidateCount: candidates.length,
        approvedCount: approvedPairs.size,
      });
      if (approvedPairs.size === 0) {
        return deterministicSelection;
      }

      return this.clusterer.cluster({
        identity: {
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          scope: params.scope,
        },
        items: evidence,
        limit: params.maxItems,
        verifiedStoryRelationPairs: approvedPairs,
      });
    } catch {
      this.storyRankingMetrics.recordStoryRelationVerification({
        status: "failed_closed",
        candidateCount: candidates.length,
        approvedCount: 0,
      });
      return deterministicSelection;
    }
  }

  private async withOriginalSourceText(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
    selection: SummaryEvidenceSelection,
  ): Promise<SummaryEvidenceSelection> {
    const readSourceContent = this.feedItems.readSourceContent;
    if (
      readSourceContent === undefined ||
      selection.selectedEvidence.length === 0
    ) {
      return selection;
    }

    try {
      const sourceContent = await readSourceContent.call(this.feedItems, {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        feedItemIds: selection.selectedEvidence.map((item) => item.feedItemId),
      });
      const sourceTextByFeedItemId = new Map(
        sourceContent.map((item) => [item.feedItemId, item] as const),
      );

      return {
        ...selection,
        selectedEvidence: selection.selectedEvidence.map((item) => {
          const source = sourceTextByFeedItemId.get(item.feedItemId);
          if (
            source === undefined ||
            source.sourceItemId !== item.sourceItemId
          ) {
            return item;
          }
          const safety = this.safetyPolicy.evaluate({
            providerKey: item.providerKey,
            title: item.title,
            bodyPreview: source.body.slice(0, 50_000),
            canonicalUrl: item.canonicalUrl,
          });

          return safety.sanitizedBodyPreview === undefined
            ? item
            : { ...item, sourceText: safety.sanitizedBodyPreview };
        }),
      };
    } catch {
      return selection;
    }
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

        const supplement = mapSupplementFeedItem({
          snapshot: duplicate.toSnapshot(),
          qualityPolicy: this.qualityPolicy,
          safetyPolicy: this.safetyPolicy,
          now: this.clock.now(),
        });
        itemsById.set(duplicateFeedItemId, {
          ...supplement,
          score: Math.min(
            supplement.score,
            Math.max(0, rankedItem.score - 0.001),
          ),
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

      let providerCount = countItemsForProvider(
        itemsById.values(),
        providerKey,
      );
      if (providerCount >= target) {
        continue;
      }

      const page = await this.feedItems.list({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        interestId:
          params.scope.type === "interest"
            ? params.scope.interestId
            : undefined,
        providerKey,
        publishedAtOrAfter: params.period.startedAt,
        publishedBefore: params.period.endedAt,
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

  private async withTopReadCandidateSupplements(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
    rankedItems: readonly SummaryEvidenceItem[],
  ): Promise<readonly SummaryEvidenceItem[]> {
    const itemsById = new Map(
      rankedItems.map((item) => [item.feedItemId, item] as const),
    );
    const target = topReadCandidateSupplementTargetForLimit(params.maxItems);

    for (const providerKey of topReadCandidateReserveProviders) {
      let providerEligibleCount = countTopReadEligibleItemsForProvider(
        itemsById.values(),
        providerKey,
      );
      if (providerEligibleCount >= target) {
        continue;
      }

      const page = await this.feedItems.list({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        interestId:
          params.scope.type === "interest"
            ? params.scope.interestId
            : undefined,
        providerKey,
        publishedAtOrAfter: params.period.startedAt,
        publishedBefore: params.period.endedAt,
        limit: target * 4,
      });

      for (const feedItem of page.items) {
        if (providerEligibleCount >= target) {
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

        if (
          supplement.contentQuality?.eligibleForSummary === false ||
          !isTopReadEligibleEvidence(supplement)
        ) {
          continue;
        }

        itemsById.set(supplement.feedItemId, supplement);
        providerEligibleCount += 1;
      }
    }

    return promoteTopReadCandidatesWithinProviders([...itemsById.values()]);
  }
}

const topReadCandidateReserveProviders = ["x-twitter", "reddit"] as const;

const topReadCandidateSupplementTargetForLimit = (limit: number): number => {
  if (limit >= 80) {
    return 10;
  }

  if (limit >= 40) {
    return 6;
  }

  return 3;
};

const countTopReadEligibleItemsForProvider = (
  items: Iterable<SummaryEvidenceItem>,
  providerKey: string,
): number => {
  let count = 0;

  for (const item of items) {
    if (item.providerKey === providerKey && isTopReadEligibleEvidence(item)) {
      count += 1;
    }
  }

  return count;
};

const promoteTopReadCandidatesWithinProviders = (
  items: readonly SummaryEvidenceItem[],
): readonly SummaryEvidenceItem[] => {
  const rankedByProvider = new Map<string, SummaryEvidenceItem[]>();
  for (const item of items) {
    rankedByProvider.set(item.providerKey, [
      ...(rankedByProvider.get(item.providerKey) ?? []),
      item,
    ]);
  }

  for (const [providerKey, providerItems] of rankedByProvider.entries()) {
    rankedByProvider.set(
      providerKey,
      [...providerItems].sort(compareTopReadFit),
    );
  }

  return items.map(
    (item) => rankedByProvider.get(item.providerKey)?.shift() ?? item,
  );
};

const compareTopReadFit = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): number => {
  const eligibilityDiff =
    Number(isTopReadEligibleEvidence(right)) -
    Number(isTopReadEligibleEvidence(left));
  if (eligibilityDiff !== 0) {
    return eligibilityDiff;
  }

  const scoreDiff = right.score - left.score;
  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return right.observedAt.getTime() - left.observedAt.getTime();
};
