import {
  type FeedItem,
  feedProviderMetricsFromMetadata,
  feedProviderMetricStrength,
} from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import {
  type Clock,
  DomainError,
  err,
  ok,
  redactSensitiveText,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  extractSignalKeywords,
  RankingPolicy,
  type RankedRelevanceCandidate,
  type RankingMemoryGuidance,
  type RankingCandidate,
  SourceContentQualityPolicy,
  type SourceContentQualityVerdict,
} from "../../domain";
import type {
  RelevanceMemoryGuidanceReaderPort,
  SourceContentQualityReviewerPort,
  UserRelevanceProfileRepositoryPort,
} from "../../ports";
import {
  NOOP_RELEVANCE_MEMORY_GUIDANCE_READER,
  NOOP_SOURCE_CONTENT_QUALITY_REVIEWER,
} from "../../ports";
import {
  presentSourceContentQuality,
  presentSourceContentSafety,
  presentUserRelevanceProfile,
} from "../shared/relevance-presenter";
import type { RankFeedItemsCommand } from "./rank-feed-items.command";
import type {
  RankedFeedItemView,
  RankFeedItemsResult,
  RelevanceMemoryGuidanceView,
} from "./rank-feed-items.result";

type RankFeedItemsFailure = DomainError | Error;

const maxLimit = 200;
const maxCandidatePageLimit = 200;
const maxCandidateScan = 1_000;
const maxQualityReviewBatch = 25;

export class RankFeedItemsUseCase {
  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly profiles: UserRelevanceProfileRepositoryPort,
    private readonly clock: Clock,
    private readonly rankingPolicy = new RankingPolicy(),
    private readonly memoryGuidance: RelevanceMemoryGuidanceReaderPort = NOOP_RELEVANCE_MEMORY_GUIDANCE_READER,
    private readonly qualityPolicy = new SourceContentQualityPolicy(),
    private readonly qualityReviewer: SourceContentQualityReviewerPort = NOOP_SOURCE_CONTENT_QUALITY_REVIEWER,
  ) {}

  async execute(
    command: RankFeedItemsCommand,
  ): Promise<Result<RankFeedItemsResult, RankFeedItemsFailure>> {
    const limit = normalizeLimit(command.limit);

    if (limit === null) {
      return err(
        new DomainError(
          "validation.failed",
          "Relevance ranking limit must be between 1 and 200",
        ),
      );
    }

    const userId = normalizeOptional(command.userId);
    const profile =
      userId === undefined
        ? null
        : await this.profiles.findByUser({
            tenantId: command.tenantId,
            workspaceId: command.workspaceId,
            userId,
          });
    const candidates = await this.listCandidateFeedItems(command);
    const generatedAt = this.clock.now();
    const snapshotsById = new Map(
      candidates.map((item) => {
        const snapshot = item.toSnapshot();

        return [snapshot.id, snapshot] as const;
      }),
    );
    const baseRankingCandidates = candidates.map(toRankingCandidate);
    const contentQualityByCandidateId = await this.buildContentQuality(
      baseRankingCandidates,
    );
    const rankingCandidates = baseRankingCandidates.map((candidate) => ({
      ...candidate,
      contentQuality:
        contentQualityByCandidateId.get(candidate.id) ??
        this.qualityPolicy.evaluate(candidate),
    }));
    const memoryGuidance = await this.buildMemoryGuidance({
      userId,
      candidates: rankingCandidates,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      generatedAt,
    });
    const ranked = this.rankingPolicy.rank({
      candidates: rankingCandidates,
      profile,
      memoryGuidance: memoryGuidance.guidance,
      generatedAt,
      limit,
    });

    const items: RankedFeedItemView[] = [];
    for (const item of ranked) {
      const snapshot = snapshotsById.get(item.candidate.id);

      if (snapshot === undefined) {
        return err(
          new DomainError(
            "operation.conflict",
            "Ranked feed item snapshot is missing",
            {
              feedItemId: item.candidate.id,
            },
          ),
        );
      }

      items.push(presentRankedFeedItem(item, snapshot, items.length + 1));
    }

    return ok({
      generatedAt: generatedAt.toISOString(),
      profileApplied: profile !== null,
      profile:
        profile === null ? undefined : presentUserRelevanceProfile(profile),
      memoryGuidance: memoryGuidance.view,
      items,
    });
  }

  private async listCandidateFeedItems(
    command: RankFeedItemsCommand,
  ): Promise<readonly FeedItem[]> {
    const items: FeedItem[] = [];
    let cursor: string | undefined;

    while (items.length < maxCandidateScan) {
      const pageLimit = Math.min(
        maxCandidatePageLimit,
        maxCandidateScan - items.length,
      );
      const page = await this.feedItems.list({
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        interestId: normalizeOptional(command.interestId),
        observedAfter: command.observedAfter,
        observedBefore: command.observedBefore,
        limit: pageLimit,
        cursor,
      });

      items.push(...page.items);
      if (page.nextCursor === undefined || page.nextCursor === cursor) {
        break;
      }
      cursor = page.nextCursor;
    }

    return items;
  }

  private async buildMemoryGuidance(params: {
    readonly userId: string | undefined;
    readonly candidates: readonly RankingCandidate[];
    readonly tenantId: RankFeedItemsCommand["tenantId"];
    readonly workspaceId: RankFeedItemsCommand["workspaceId"];
    readonly generatedAt: Date;
  }): Promise<{
    readonly guidance?: RankingMemoryGuidance;
    readonly view: RelevanceMemoryGuidanceView;
  }> {
    if (params.userId === undefined || params.candidates.length === 0) {
      return {
        view: {
          status: "disabled",
          applied: false,
          providerPreferenceCount: 0,
          keywordPreferenceCount: 0,
          mutedKeywordCount: 0,
          blockedProviderCount: 0,
          signals:
            params.userId === undefined
              ? ["memory_guidance_requires_user"]
              : ["memory_guidance_requires_candidates"],
        },
      };
    }

    try {
      const guidance = await this.memoryGuidance.buildGuidance({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        providerKeys: uniqueSorted(
          params.candidates.map((candidate) => candidate.providerKey),
        ),
        keywords: memoryGuidanceKeywords(params.candidates),
        requestedAt: params.generatedAt,
      });

      return {
        guidance: guidance.status === "available" ? guidance : undefined,
        view: presentMemoryGuidance(guidance),
      };
    } catch {
      return {
        view: {
          status: "unavailable",
          applied: false,
          providerPreferenceCount: 0,
          keywordPreferenceCount: 0,
          mutedKeywordCount: 0,
          blockedProviderCount: 0,
          signals: ["memory_guidance_unavailable"],
        },
      };
    }
  }

  private async buildContentQuality(
    candidates: readonly RankingCandidate[],
  ): Promise<ReadonlyMap<string, SourceContentQualityVerdict>> {
    const deterministicById = new Map(
      candidates.map(
        (candidate) =>
          [candidate.id, this.qualityPolicy.evaluate(candidate)] as const,
      ),
    );
    const reviewRequests = candidates
      .map((candidate) => ({
        ...candidate,
        candidateId: candidate.id,
        deterministic:
          deterministicById.get(candidate.id) ??
          this.qualityPolicy.evaluate(candidate),
      }))
      .filter(
        (request) =>
          request.deterministic.needsLlmReview &&
          isXProvider(request.providerKey),
      )
      .slice(0, maxQualityReviewBatch);

    if (reviewRequests.length === 0) {
      return deterministicById;
    }

    try {
      const reviews = await this.qualityReviewer.reviewBatch(reviewRequests);
      const reviewsByCandidateId = new Map(
        reviews.map((review) => [review.candidateId, review] as const),
      );

      return new Map(
        candidates.map((candidate) => {
          const deterministic =
            deterministicById.get(candidate.id) ??
            this.qualityPolicy.evaluate(candidate);

          return [
            candidate.id,
            this.qualityPolicy.mergeWithReview(
              deterministic,
              reviewsByCandidateId.get(candidate.id),
            ),
          ] as const;
        }),
      );
    } catch {
      return deterministicById;
    }
  }
}

type FeedItemSnapshot = ReturnType<FeedItem["toSnapshot"]>;

const toRankingCandidate = (item: FeedItem): RankingCandidate => {
  const snapshot = item.toSnapshot();

  return {
    id: snapshot.id,
    interestId: snapshot.interestId,
    providerKey: snapshot.providerKey,
    canonicalUrl: snapshot.canonicalUrl,
    title: snapshot.title,
    bodyPreview: snapshot.bodyPreview,
    authorHandle: snapshot.authorHandle,
    providerMetadata: snapshot.providerMetadata,
    publishedAt: snapshot.publishedAt,
    sourceSignalScore: providerSignalScore(
      snapshot.providerKey,
      snapshot.providerMetadata,
    ),
  };
};

const presentRankedFeedItem = (
  item: RankedRelevanceCandidate,
  snapshot: FeedItemSnapshot,
  rank: number,
): RankedFeedItemView => ({
  feedItemId: snapshot.id,
  sourceItemId: snapshot.sourceItemId,
  sourceBindingId: snapshot.sourceBindingId,
  interestId: snapshot.interestId,
  providerKey: snapshot.providerKey,
  canonicalUrl: item.safety.sanitizedCanonicalUrl ?? snapshot.canonicalUrl,
  title: item.safety.sanitizedTitle,
  bodyPreview: item.safety.sanitizedBodyPreview,
  providerMetadata: snapshot.providerMetadata,
  authorHandle: snapshot.authorHandle,
  publishedAt: snapshot.publishedAt.toISOString(),
  observedAt: snapshot.observedAt.toISOString(),
  score: item.score,
  rank,
  clusterId: item.clusterId,
  clusterSize: item.clusterSize,
  duplicateFeedItemIds: item.duplicateCandidateIds,
  whyImportant: item.whyImportant,
  safety: presentSourceContentSafety(item.safety),
  contentQuality: presentSourceContentQuality(item.contentQuality),
});

const providerSignalScore = (
  providerKey: string,
  providerMetadata: FeedItemSnapshot["providerMetadata"],
): number => {
  const metrics = feedProviderMetricsFromMetadata({
    providerKey,
    providerMetadata,
  });

  if (metrics === undefined) {
    return 0;
  }

  return Math.min(0.85, feedProviderMetricStrength(metrics) / 10);
};

const isXProvider = (providerKey: string): boolean => {
  const normalized = providerKey.trim().toLocaleLowerCase("en-US");

  return (
    normalized === "x-twitter" || normalized === "twitter" || normalized === "x"
  );
};

const normalizeLimit = (value: number): number | null =>
  Number.isInteger(value) && value >= 1 && value <= maxLimit ? value : null;

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

const memoryGuidanceKeywords = (
  candidates: readonly RankingCandidate[],
): readonly string[] =>
  uniqueSorted(
    candidates.flatMap((candidate) =>
      extractSignalKeywords(
        redactSensitiveText(
          `${candidate.title} ${candidate.bodyPreview ?? ""}`,
        ),
      ),
    ),
  ).slice(0, 30);

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  ].sort((left, right) => left.localeCompare(right));

const presentMemoryGuidance = (
  guidance: Awaited<
    ReturnType<RelevanceMemoryGuidanceReaderPort["buildGuidance"]>
  >,
): RelevanceMemoryGuidanceView => {
  const providerPreferenceCount = guidance.providerPreferences?.length ?? 0;
  const keywordPreferenceCount = guidance.keywordPreferences?.length ?? 0;
  const mutedKeywordCount = guidance.mutedKeywords?.length ?? 0;
  const blockedProviderCount = guidance.blockedProviderKeys?.length ?? 0;
  const applied =
    guidance.status === "available" &&
    (providerPreferenceCount > 0 ||
      keywordPreferenceCount > 0 ||
      mutedKeywordCount > 0 ||
      blockedProviderCount > 0);

  return {
    status: guidance.status,
    applied,
    providerPreferenceCount,
    keywordPreferenceCount,
    mutedKeywordCount,
    blockedProviderCount,
    signals: memoryGuidanceSignals({
      status: guidance.status,
      applied,
      providerPreferenceCount,
      keywordPreferenceCount,
      mutedKeywordCount,
      blockedProviderCount,
    }),
  };
};

const memoryGuidanceSignals = (params: {
  readonly status: RelevanceMemoryGuidanceView["status"];
  readonly applied: boolean;
  readonly providerPreferenceCount: number;
  readonly keywordPreferenceCount: number;
  readonly mutedKeywordCount: number;
  readonly blockedProviderCount: number;
}): readonly string[] => {
  if (params.status === "disabled") {
    return ["memory_guidance_disabled"];
  }

  if (params.status === "unavailable") {
    return ["memory_guidance_unavailable"];
  }

  if (params.status === "empty") {
    return ["memory_guidance_empty"];
  }

  const signals = ["memory_guidance_available"];
  if (params.providerPreferenceCount > 0) {
    signals.push("memory_provider_preferences");
  }
  if (params.keywordPreferenceCount > 0) {
    signals.push("memory_keyword_preferences");
  }
  if (params.mutedKeywordCount > 0) {
    signals.push("memory_muted_keywords");
  }
  if (params.blockedProviderCount > 0) {
    signals.push("memory_blocked_providers");
  }
  if (params.applied) {
    signals.push("memory_guidance_applied");
  }

  return signals;
};
