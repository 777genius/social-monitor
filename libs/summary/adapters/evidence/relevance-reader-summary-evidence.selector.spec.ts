import { FeedItem } from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsCommand } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.command";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import {
  ok,
  tenantId,
  workspaceId,
  type Clock,
} from "@social-monitor/shared-kernel";

import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";
import type {
  ReaderSummaryPeriod,
  SummaryEvidenceSelection,
} from "../../domain";
import type { StoryRankingMetricsPort } from "../../ports";

const clock: Clock = {
  now: () => new Date("2026-06-23T12:00:00.000Z"),
};

const readerSummaryPeriod: ReaderSummaryPeriod = {
  cadence: "daily",
  startedAt: new Date("2026-06-23T00:00:00.000Z"),
  endedAt: new Date("2026-06-24T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-06-23T00:00:00.000Z:2026-06-24T00:00:00.000Z:UTC",
};

const rankedItem = (
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

describe("RelevanceReaderSummaryEvidenceSelector", () => {
  it("keeps workspace reader summary evidence provider-diverse after expanded relevance ranking", async () => {
    const rankedItems = [
      rankedItem({
        feedItemId: "feed-trending",
        providerKey: "github-trending-page",
        rank: 1,
        score: 2.5,
      }),
      rankedItem({
        feedItemId: "feed-hn",
        providerKey: "hacker-news",
        rank: 2,
        score: 2.4,
      }),
      rankedItem({
        feedItemId: "feed-reddit",
        providerKey: "reddit",
        rank: 3,
        score: 2.3,
      }),
      rankedItem({
        feedItemId: "feed-rss",
        providerKey: "rss",
        rank: 4,
        score: 2.2,
        providerMetadata: {
          kind: "rss_item",
          mediaThumbnailUrl: "https://cdn.example.test/rss-preview.jpg",
        },
      }),
      rankedItem({
        feedItemId: "feed-trending-2",
        providerKey: "github-trending-page",
        rank: 5,
        score: 2.1,
      }),
      rankedItem({
        feedItemId: "feed-issues",
        providerKey: "github-issues",
        rank: 6,
        score: 2.0,
      }),
    ];
    const rankFeedItems = {
      execute: jest.fn(async (command: RankFeedItemsCommand) =>
        ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          memoryGuidance: {
            status: "available",
            applied: true,
            providerPreferenceCount: 1,
            keywordPreferenceCount: 2,
            mutedKeywordCount: 0,
            blockedProviderCount: 0,
            signals: ["provider:reddit", "keyword:agent"],
          },
          items: rankedItems.slice(0, command.limit),
        }),
      ),
    } as unknown as RankFeedItemsUseCase;
    const feedItems: FeedItemReadRepositoryPort = {
      list: jest.fn(),
      findById: jest.fn(async () => null),
    };
    const storyRankingMetrics = new FakeStoryRankingMetrics();
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      clock,
      storyRankingMetrics,
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 5,
    });

    expect(rankFeedItems.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        observedAfter: new Date("2026-06-22T23:59:59.999Z"),
        observedBefore: readerSummaryPeriod.endedAt,
        limit: 200,
      }),
    );
    expect(
      selection.selectedEvidence.map((item) => item.providerKey).sort(),
    ).toEqual([
      "github-trending-page",
      "github-trending-page",
      "hacker-news",
      "reddit",
      "rss",
    ]);
    expect(selection.selectedEvidence.map((item) => item.providerKey)).toEqual([
      "reddit",
      "hacker-news",
      "rss",
      "github-trending-page",
      "github-trending-page",
    ]);
    expect(selection.sourceWindow.selectedFeedItemIds).toContain(
      "feed-trending-2",
    );
    expect(
      selection.selectedEvidence.find((item) => item.feedItemId === "feed-rss")
        ?.previewMedia,
    ).toEqual({
      kind: "image",
      url: "https://cdn.example.test/rss-preview.jpg",
      sourceUrl: "https://example.test/feed-rss",
      altText: "rss story 4",
    });
    expect(storyRankingMetrics.recorded[0]?.rankingPolicyVersion).toBe(
      "story_ranking_v1",
    );
    expect(selection.personalization).toEqual({
      memoryGuidanceStatus: "available",
      memoryGuidanceApplied: true,
      providerPreferenceCount: 1,
      keywordPreferenceCount: 2,
      mutedKeywordCount: 0,
      blockedProviderCount: 0,
      signals: ["provider:reddit", "keyword:agent"],
    });
    expect(storyRankingMetrics.recorded[0]?.personalization).toEqual(
      selection.personalization,
    );
  });

  it("keeps provider diversity when a source first appears deep in the ranked candidates", async () => {
    const rankedItems = [
      ...Array.from({ length: 80 }, (_, index) =>
        rankedItem({
          feedItemId: `feed-reddit-${index + 1}`,
          providerKey: "reddit",
          rank: index + 1,
          score: 3 - index / 100,
        }),
      ),
      rankedItem({
        feedItemId: "feed-github-deep",
        providerKey: "github-issues",
        rank: 81,
        score: 1.5,
      }),
    ];
    const rankFeedItems = {
      execute: jest.fn(async (command: RankFeedItemsCommand) =>
        ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          items: rankedItems.slice(0, command.limit),
        }),
      ),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      {
        list: jest.fn(),
        findById: jest.fn(async () => null),
      },
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-deep-reader-provider"),
      workspaceId: workspaceId("workspace-deep-reader-provider"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 5,
    });

    expect(rankFeedItems.execute).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    );
    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toContain(
      "feed-github-deep",
    );
  });

  it("treats GitHub provider variants as secondary after social news families", async () => {
    const rankedItems = [
      rankedItem({
        feedItemId: "feed-github-trending",
        providerKey: "github-trending-page",
        rank: 1,
        score: 3.0,
      }),
      rankedItem({
        feedItemId: "feed-github-repo",
        providerKey: "github-repo-radar",
        rank: 2,
        score: 2.9,
      }),
      rankedItem({
        feedItemId: "feed-github-issues",
        providerKey: "github-issues",
        rank: 3,
        score: 2.8,
      }),
      rankedItem({
        feedItemId: "feed-reddit",
        providerKey: "reddit",
        rank: 4,
        score: 2.2,
      }),
      rankedItem({
        feedItemId: "feed-hn",
        providerKey: "hacker-news",
        rank: 5,
        score: 2.1,
      }),
      rankedItem({
        feedItemId: "feed-rss",
        providerKey: "rss",
        rank: 6,
        score: 2.0,
      }),
    ];
    const rankFeedItems = {
      execute: jest.fn(async (command: RankFeedItemsCommand) =>
        ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          items: rankedItems.slice(0, command.limit),
        }),
      ),
    } as unknown as RankFeedItemsUseCase;
    const feedItems: FeedItemReadRepositoryPort = {
      list: jest.fn(),
      findById: jest.fn(async () => null),
    };
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-family"),
      workspaceId: workspaceId("workspace-family"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 4,
    });

    expect(
      selection.selectedEvidence.map((item) => item.providerKey),
    ).toEqual(["reddit", "hacker-news", "rss", "github-trending-page"]);
  });

  it("keeps roughly thirty selected evidence items per source family when the summary asks for one hundred fifty", async () => {
    const providerKeys = [
      "x-twitter",
      "reddit",
      "hacker-news",
      "rss",
      "github-trending-page",
    ] as const;
    const rankedItems = providerKeys.flatMap((providerKey, providerIndex) =>
      Array.from({ length: 35 }, (_, index) =>
        rankedItem({
          feedItemId: `feed-${providerKey}-${index + 1}`,
          providerKey,
          rank: providerIndex * 35 + index + 1,
          score: 3 - index / 100 - providerIndex / 1000,
        }),
      ),
    );
    const rankFeedItems = {
      execute: jest.fn(async (command: RankFeedItemsCommand) =>
        ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          items: rankedItems.slice(0, command.limit),
        }),
      ),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      {
        list: jest.fn(),
        findById: jest.fn(async () => null),
      },
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-wide-evidence"),
      workspaceId: workspaceId("workspace-wide-evidence"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 150,
    });
    const counts = selection.selectedEvidence.reduce(
      (result, item) =>
        result.set(item.providerKey, (result.get(item.providerKey) ?? 0) + 1),
      new Map<string, number>(),
    );

    expect(rankFeedItems.execute).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    );
    expect(selection.selectedEvidence).toHaveLength(150);
    expect(Object.fromEntries(counts)).toEqual({
      "x-twitter": 30,
      reddit: 30,
      "hacker-news": 30,
      rss: 30,
      "github-trending-page": 30,
    });
  });

  it("preserves X engagement metrics from ranked feed metadata", async () => {
    const rankedItems = [
      rankedItem({
        feedItemId: "feed-x-rollout",
        providerKey: "x-twitter",
        rank: 1,
        score: 3.2,
        providerMetadata: {
          kind: "x_post",
          authorHandle: "OpenAIDevs",
          searchQuery: "AI developer tools",
          public_metrics: {
            like_count: 1280,
            retweet_count: 240,
            reply_count: 91,
            quote_count: 34,
            impression_count: 95000,
          },
        },
      }),
    ];
    const rankFeedItems = {
      execute: jest.fn(async (command: RankFeedItemsCommand) =>
        ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          items: rankedItems.slice(0, command.limit),
        }),
      ),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      {
        list: jest.fn(),
        findById: jest.fn(async () => null),
      },
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-x-metrics"),
      workspaceId: workspaceId("workspace-x-metrics"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 3,
    });

    expect(selection.selectedEvidence[0]).toEqual(
      expect.objectContaining({
        providerKey: "x-twitter",
        providerMetricSummary: "1,280 likes, 240 reposts, 91 replies",
        providerMetricLabels: expect.arrayContaining([
          { label: "Likes", value: "1,280" },
          { label: "Reposts", value: "240" },
          { label: "Replies", value: "91" },
          { label: "Impressions", value: "95,000" },
        ]),
      }),
    );
  });

  it("expands duplicate feed items into reader evidence so cross-source story clusters stay visible", async () => {
    const tenant = tenantId("tenant-cross-source");
    const workspace = workspaceId("workspace-cross-source");
    const rankedItems = [
      rankedItem({
        feedItemId: "feed-github-codex",
        providerKey: "github-repo-radar",
        rank: 1,
        score: 3.0,
        canonicalUrl: "https://github.com/openai/codex",
        title: "openai/codex gains attention",
        duplicateFeedItemIds: ["feed-reddit-codex"],
      }),
    ];
    const rankFeedItems = {
      execute: jest.fn(async (command: RankFeedItemsCommand) =>
        ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: true,
          items: rankedItems.slice(0, command.limit),
        }),
      ),
    } as unknown as RankFeedItemsUseCase;
    const feedItems: FeedItemReadRepositoryPort = {
      list: jest.fn(),
      findById: jest.fn(async () =>
        FeedItem.publish({
          id: "feed-reddit-codex",
          tenantId: tenant,
          workspaceId: workspace,
          interestId: "interest-ai",
          sourceItemId: "source-reddit-codex",
          sourceBindingId: "binding-reddit",
          providerKey: "reddit",
          canonicalUrl: "https://reddit.example/r/codex/comments/1",
          title: "Reddit discusses openai/codex adoption",
          bodyPreview:
            "Operators compare https://github.com/openai/codex with other coding agents.",
          publishedAt: new Date("2026-06-23T10:05:00.000Z"),
          observedAt: new Date("2026-06-23T10:06:00.000Z"),
        }),
      ),
    };
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 3,
    });

    expect(feedItems.findById).toHaveBeenCalledWith({
      tenantId: tenant,
      workspaceId: workspace,
      feedItemId: "feed-reddit-codex",
    });
    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "feed-reddit-codex",
      "feed-github-codex",
    ]);
    expect(selection.clusters).toHaveLength(1);
    expect(selection.clusters[0]).toEqual(
      expect.objectContaining({
        representativeFeedItemId: "feed-github-codex",
        duplicateFeedItemIds: ["feed-reddit-codex"],
        providerKeys: expect.arrayContaining(["github-repo-radar", "reddit"]),
      }),
    );
  });

  it("asks relevance ranking for the reader summary period and keeps exact window boundaries", async () => {
    const rankedItems = [
      rankedItem({
        feedItemId: "feed-at-start",
        providerKey: "reddit",
        rank: 1,
        score: 2.5,
        observedAt: "2026-06-23T00:00:00.000Z",
      }),
      rankedItem({
        feedItemId: "feed-inside",
        providerKey: "hacker-news",
        rank: 2,
        score: 2.4,
        observedAt: "2026-06-23T23:59:59.999Z",
      }),
      rankedItem({
        feedItemId: "feed-at-end",
        providerKey: "rss",
        rank: 3,
        score: 2.3,
        observedAt: "2026-06-24T00:00:00.000Z",
      }),
    ];
    const rankFeedItems = {
      execute: jest.fn(async (command: RankFeedItemsCommand) =>
        ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          items: rankedItems.slice(0, command.limit),
        }),
      ),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      {
        list: jest.fn(),
        findById: jest.fn(async () => null),
      },
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-period-window"),
      workspaceId: workspaceId("workspace-period-window"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 5,
    });

    expect(rankFeedItems.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        observedAfter: new Date("2026-06-22T23:59:59.999Z"),
        observedBefore: new Date("2026-06-24T00:00:00.000Z"),
      }),
    );
    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "feed-at-start",
      "feed-inside",
    ]);
  });

  it("does not select low-quality X evidence just to satisfy provider diversity", async () => {
    const rankedItems = [
      rankedItem({
        feedItemId: "feed-github",
        providerKey: "github-trending-page",
        rank: 1,
        score: 3,
      }),
      rankedItem({
        feedItemId: "feed-x-url-only",
        providerKey: "x-twitter",
        rank: 2,
        score: 2.9,
        title: "https://t.co/yQHkkbmVeR",
        bodyPreview: "https://t.co/yQHkkbmVeR",
        contentQuality: {
          qualityScore: 0.2,
          interestRelevanceScore: 0.2,
          engagementIntegrityScore: 0.4,
          eligibleForSummary: false,
          eligibleForTopRead: false,
          needsLlmReview: true,
          decision: "needs_context",
          flags: ["url_only", "tco_only", "needs_link_context"],
          reason: "needs_context because url_only",
        },
      }),
      rankedItem({
        feedItemId: "feed-reddit",
        providerKey: "reddit",
        rank: 3,
        score: 2.5,
      }),
    ];
    const rankFeedItems = {
      execute: jest.fn(async (command: RankFeedItemsCommand) =>
        ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          items: rankedItems.slice(0, command.limit),
        }),
      ),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      {
        list: jest.fn(),
        findById: jest.fn(async () => null),
      },
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-low-quality-x"),
      workspaceId: workspaceId("workspace-low-quality-x"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 3,
    });

    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "feed-reddit",
      "feed-github",
    ]);
  });
});

class FakeStoryRankingMetrics implements StoryRankingMetricsPort {
  readonly recorded: SummaryEvidenceSelection[] = [];

  recordStoryRanking(selection: SummaryEvidenceSelection): void {
    this.recorded.push(selection);
  }
}
