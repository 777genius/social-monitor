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
  isGitHubTrendingEvidence,
  selectGitHubTrendingSupplementalEvidence,
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
import {
  countTopReadEligibleItemsForProvider,
  crossProviderReserveIds,
  promoteTopReadCandidatesWithinProviders,
  topReadCandidateReserveProviders,
  topReadCandidateSupplementTargetForLimit,
} from "./relevance-reader-summary-top-read-reserve";

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
    const candidateItems = await this.withGitHubTrendingCandidates(
      params,
      await this.withTopReadCandidateSupplements(
        params,
        await this.withProviderDiversitySupplements(params, rankedItems),
      ),
    );
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
    });
    const approvedPairs = await this.verifiedStoryRelationPairs(
      params,
      primaryCandidateItems,
      candidateSelection,
    );
    const verifiedCandidateSelection =
      approvedPairs.size === 0
        ? candidateSelection
        : this.clusterer.cluster({
            identity: {
              tenantId: params.tenantId,
              workspaceId: params.workspaceId,
              scope: params.scope,
            },
            items: primaryCandidateItems,
            limit: primaryCandidateItems.length,
            verifiedStoryRelationPairs: approvedPairs,
          });
    const items = selectRankedEvidence(
      primaryCandidateItems,
      params.maxItems,
      crossProviderReserveIds(verifiedCandidateSelection),
    );
    const selection = this.clusterer.cluster({
      identity: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        scope: params.scope,
      },
      items,
      limit: params.maxItems,
      verifiedStoryRelationPairs: approvedPairs,
    });
    const selectedEvidence = [
      ...selection.selectedEvidence,
      ...githubTrendingEvidence,
    ];
    const personalizedSelection = {
      ...selection,
      sourceWindow: {
        ...selection.sourceWindow,
        selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      },
      selectedEvidence,
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

  private async verifiedStoryRelationPairs(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
    evidence: readonly SummaryEvidenceItem[],
    deterministicSelection: SummaryEvidenceSelection,
  ): Promise<ReadonlySet<string>> {
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
      return new Set();
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
      return approvedPairs;
    } catch {
      this.storyRankingMetrics.recordStoryRelationVerification({
        status: "failed_closed",
        candidateCount: candidates.length,
        approvedCount: 0,
      });
      return new Set();
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

  private async withGitHubTrendingCandidates(
    params: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0],
    rankedItems: readonly SummaryEvidenceItem[],
  ): Promise<readonly SummaryEvidenceItem[]> {
    const itemsById = new Map(
      rankedItems.map((item) => [item.feedItemId, item] as const),
    );
    let cursor: string | undefined;
    do {
      const page = await this.feedItems.list({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        interestId:
          params.scope.type === "interest"
            ? params.scope.interestId
            : undefined,
        providerKey: "github-trending-page",
        publishedAtOrAfter: params.period.startedAt,
        publishedBefore: params.period.endedAt,
        limit: 100,
        cursor,
      });
      for (const feedItem of page.items) {
        const snapshot = feedItem.toSnapshot();
        if (itemsById.has(snapshot.id)) {
          continue;
        }
        itemsById.set(
          snapshot.id,
          mapSupplementFeedItem({
            snapshot,
            qualityPolicy: this.qualityPolicy,
            safetyPolicy: this.safetyPolicy,
            now: this.clock.now(),
          }),
        );
      }
      cursor = page.nextCursor;
    } while (cursor !== undefined);

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
