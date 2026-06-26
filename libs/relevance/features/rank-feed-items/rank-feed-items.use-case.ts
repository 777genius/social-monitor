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
} from "../../domain";
import type {
  RelevanceMemoryGuidanceReaderPort,
  UserRelevanceProfileRepositoryPort,
} from "../../ports";
import { NOOP_RELEVANCE_MEMORY_GUIDANCE_READER } from "../../ports";
import {
  presentSourceContentSafety,
  presentUserRelevanceProfile,
} from "../shared/relevance-presenter";
import type { RankFeedItemsCommand } from "./rank-feed-items.command";
import type {
  RankedFeedItemView,
  RankFeedItemsResult,
} from "./rank-feed-items.result";

type RankFeedItemsFailure = DomainError | Error;

const maxLimit = 50;
const maxCandidateScan = 200;

export class RankFeedItemsUseCase {
  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly profiles: UserRelevanceProfileRepositoryPort,
    private readonly clock: Clock,
    private readonly rankingPolicy = new RankingPolicy(),
    private readonly memoryGuidance: RelevanceMemoryGuidanceReaderPort =
      NOOP_RELEVANCE_MEMORY_GUIDANCE_READER,
  ) {}

  async execute(
    command: RankFeedItemsCommand,
  ): Promise<Result<RankFeedItemsResult, RankFeedItemsFailure>> {
    const limit = normalizeLimit(command.limit);

    if (limit === null) {
      return err(
        new DomainError(
          "validation.failed",
          "Relevance ranking limit must be between 1 and 50",
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
    const candidates = await this.feedItems.list({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: normalizeOptional(command.topicId),
      observedAfter: command.observedAfter,
      limit: maxCandidateScan,
    });
    const generatedAt = this.clock.now();
    const snapshotsById = new Map(
      candidates.items.map((item) => {
        const snapshot = item.toSnapshot();

        return [snapshot.id, snapshot] as const;
      }),
    );
    const rankingCandidates = candidates.items.map(toRankingCandidate);
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
      memoryGuidance,
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
      items,
    });
  }

  private async buildMemoryGuidance(params: {
    readonly userId: string | undefined;
    readonly candidates: readonly RankingCandidate[];
    readonly tenantId: RankFeedItemsCommand["tenantId"];
    readonly workspaceId: RankFeedItemsCommand["workspaceId"];
    readonly generatedAt: Date;
  }): Promise<RankingMemoryGuidance | undefined> {
    if (params.userId === undefined || params.candidates.length === 0) {
      return undefined;
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

      return guidance.status === "available" ? guidance : undefined;
    } catch {
      return undefined;
    }
  }
}

type FeedItemSnapshot = ReturnType<FeedItem["toSnapshot"]>;

const toRankingCandidate = (item: FeedItem): RankingCandidate => {
  const snapshot = item.toSnapshot();

  return {
    id: snapshot.id,
    topicId: snapshot.topicId,
    providerKey: snapshot.providerKey,
    canonicalUrl: snapshot.canonicalUrl,
    title: snapshot.title,
    bodyPreview: snapshot.bodyPreview,
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
  topicId: snapshot.topicId,
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
        redactSensitiveText(`${candidate.title} ${candidate.bodyPreview ?? ""}`),
      ),
    ),
  ).slice(0, 30);

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values
    .map((value) => value.trim())
    .filter((value) => value.length > 0))]
    .sort((left, right) => left.localeCompare(right));
