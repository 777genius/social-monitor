import type { Clock } from "@social-monitor/shared-kernel";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";

import type {
  ReaderSummaryPeriod,
  SummaryEvidenceSelection,
} from "../../domain";
import type { StoryRankingMetricsPort } from "../../ports";

export const readerSummaryEvidenceTestClock: Clock = {
  now: () => new Date("2026-06-23T12:00:00.000Z"),
};

export const readerSummaryEvidenceTestPeriod: ReaderSummaryPeriod = {
  cadence: "daily",
  startedAt: new Date("2026-06-23T00:00:00.000Z"),
  endedAt: new Date("2026-06-24T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
};

export const githubTrendingMetadataFixture = (starsGained: number) => ({
  kind: "github_trending_page_repository",
  repository: {
    fullName: "owner/repository",
    totalStars: 20_000,
    forksCount: 500,
  },
  trending: { rank: 1, starsGained, window: "daily" },
});

export const readerSummaryRankedItemFixture = (
  overrides: Partial<RankedFeedItemView> & {
    readonly feedItemId: string;
    readonly providerKey: string;
    readonly rank: number;
    readonly score: number;
  },
): RankedFeedItemView => {
  const { feedItemId, providerKey, rank, score, ...rest } = overrides;

  return {
    feedItemId,
    sourceItemId: `source-${feedItemId}`,
    sourceBindingId: `binding-${providerKey}`,
    interestId: "interest-ai",
    providerKey,
    canonicalUrl: `https://example.test/${feedItemId}`,
    title: `${providerKey} story ${rank}`,
    bodyPreview: "Useful source evidence for an AI developer summary.",
    publishedAt: "2026-06-23T10:00:00.000Z",
    observedAt: new Date(
      Date.UTC(2026, 5, 23, 10, 0, 0) + rank * 60_000,
    ).toISOString(),
    score,
    rank,
    clusterId: `cluster-${feedItemId}`,
    clusterSize: 1,
    duplicateFeedItemIds: [],
    whyImportant: ["Fresh item in the current monitoring window"],
    providerMetadata: defaultPromotionMetadata(providerKey),
    safety: {
      status: "allowed",
      categories: ["raw_payload_retention_disabled"],
      rawPayloadRetained: false,
      retentionPolicy: "normalized_preview_only",
    },
    contentQuality: {
      qualityScore: 1,
      interestRelevanceScore: 1,
      engagementIntegrityScore: 1,
      eligibleForSummary: true,
      eligibleForTopRead: true,
      needsLlmReview: false,
      decision: "promote",
      flags: [],
      reason: "Test evidence is eligible.",
    },
    ...rest,
  };
};

const defaultPromotionMetadata = (
  providerKey: string,
): RankedFeedItemView["providerMetadata"] => {
  switch (providerKey.trim().toLocaleLowerCase("en-US")) {
    case "x":
    case "twitter":
    case "x-twitter":
      return {
        kind: "x_post", contentKind: "original_post", likes: 100, reposts: 20,
      };
    case "reddit":
      return { kind: "reddit_post", score: 100, comments: 10 };
    case "hn":
    case "hacker-news":
      return { kind: "hacker_news_story", points: 100, comments: 10 };
    case "github":
    case "github-repository":
    case "github-repo-radar":
      return {
        kind: "github_repository_trend",
        repository: { forksCount: 50 },
        trend: {
          primaryWindow: "24h",
          checkedAt: "2026-06-23T10:00:00.000Z",
          stars24h: 20,
          forks24h: 5,
        },
      };
    default:
      return undefined;
  }
};

export class FakeStoryRankingMetrics implements StoryRankingMetricsPort {
  readonly recorded: SummaryEvidenceSelection[] = [];
  readonly storyRelationMetrics: Parameters<
    StoryRankingMetricsPort["recordStoryRelationVerification"]
  >[0][] = [];

  recordStoryRanking(selection: SummaryEvidenceSelection): void {
    this.recorded.push(selection);
  }

  recordStoryRelationVerification(
    metric: Parameters<
      StoryRankingMetricsPort["recordStoryRelationVerification"]
    >[0],
  ): void {
    this.storyRelationMetrics.push(metric);
  }
}

export const emptyPromotionSnapshot = async () => ({
  ok: true as const,
  candidates: [],
  sourceContent: [],
  physicalRowsRead: 0,
  exhausted: true as const,
});
