import { FeedItem } from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsCommand } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.command";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";
import {
  githubTrendingMetadataFixture,
  readerSummaryEvidenceTestClock as clock,
  readerSummaryEvidenceTestPeriod as readerSummaryPeriod,
} from "./relevance-reader-summary-evidence-test-fixtures";
import type { SummaryEvidenceSelection } from "../../domain";
import type { StoryRankingMetricsPort } from "../../ports";

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
  it("keeps workspace reader summary evidence in relevance ranking order", async () => {
    const rankedItems = [
      rankedItem({
        feedItemId: "feed-trending",
        providerKey: "github-trending-page",
        rank: 1,
        score: 2.5,
        providerMetadata: githubTrendingMetadataFixture(2_500),
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
        providerMetadata: githubTrendingMetadataFixture(1_500),
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
      list: jest.fn(async ({ cursor }) =>
        cursor === undefined
          ? { items: [], nextCursor: "github-page-2" }
          : { items: [] },
      ),
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
        publishedAtOrAfter: readerSummaryPeriod.startedAt,
        publishedBefore: readerSummaryPeriod.endedAt,
        limit: 200,
      }),
    );
    expect(feedItems.list).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: "github-trending-page",
        cursor: "github-page-2",
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
      "hacker-news",
      "reddit",
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
      "story_ranking_v7",
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

  it("includes GitHub Trending while excluding technical issue events", async () => {
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
        feedItemId: "feed-github-trending",
        providerKey: "github-trending-page",
        rank: 81,
        score: 1.6,
        providerMetadata: githubTrendingMetadataFixture(1_500),
      }),
      rankedItem({
        feedItemId: "feed-github-deep",
        providerKey: "github-issues",
        rank: 82,
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
        list: jest.fn(async () => ({ items: [] })),
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
      "feed-github-trending",
    );
    expect(
      selection.selectedEvidence.map((item) => item.feedItemId),
    ).not.toContain("feed-github-deep");
  });

  it("preserves GitHub trend and repo providers while excluding technical-only providers", async () => {
    const rankedItems = [
      rankedItem({
        feedItemId: "feed-github-trending",
        providerKey: "github-trending-page",
        rank: 1,
        score: 3.0,
        providerMetadata: githubTrendingMetadataFixture(1_500),
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
      list: jest.fn(async () => ({ items: [] })),
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

    expect(selection.selectedEvidence.map((item) => item.providerKey)).toEqual([
      "github-repo-radar",
      "reddit",
      "hacker-news",
      "rss",
      "github-trending-page",
    ]);
  });

  it("keeps top ranked evidence from each provider in daily reader summaries", async () => {
    const rankedItems = [
      ...Array.from({ length: 160 }, (_, index) =>
        rankedItem({
          feedItemId: `feed-reddit-${index + 1}`,
          providerKey: "reddit",
          rank: index + 1,
          score: 3 - index / 100,
        }),
      ),
      ...Array.from({ length: 35 }, (_, index) =>
        rankedItem({
          feedItemId: `feed-rss-${index + 1}`,
          providerKey: "rss",
          rank: 161 + index,
          score: 1 - index / 100,
        }),
      ),
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
        list: jest.fn(async () => ({ items: [] })),
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

    expect(rankFeedItems.execute).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    );
    expect(selection.selectedEvidence).toHaveLength(150);
    expect(
      selection.selectedEvidence.filter((item) => item.providerKey === "rss"),
    ).toHaveLength(35);
    expect(selection.selectedEvidence[0]?.providerKey).toBe("reddit");
  });

  it("supplements reader summary evidence from feed repository when a provider is absent from top relevance ranks", async () => {
    const tenant = tenantId("tenant-provider-supplement");
    const workspace = workspaceId("workspace-provider-supplement");
    const rankedItems = Array.from({ length: 20 }, (_, index) =>
      rankedItem({
        feedItemId: `feed-hn-${index + 1}`,
        providerKey: "hacker-news",
        rank: index + 1,
        score: 3 - index / 100,
      }),
    );
    const redditFeedItems = ["feed-reddit-1", "feed-reddit-2"].map(
      (feedItemId, index) =>
        FeedItem.publish({
          id: feedItemId,
          tenantId: tenant,
          workspaceId: workspace,
          interestId: "interest-ai",
          sourceItemId: `source-${feedItemId}`,
          sourceBindingId: "binding-reddit",
          providerKey: "reddit",
          canonicalUrl: `https://reddit.example/r/artificial/comments/${index + 1}`,
          title: `Reddit AI discussion ${index + 1}`,
          bodyPreview:
            "Reddit users discuss practical AI coding workflows and developer tooling.",
          publishedAt: new Date("2026-06-23T09:00:00.000Z"),
          observedAt: new Date("2026-06-23T09:05:00.000Z"),
          providerMetadata: {
            kind: "reddit_post",
            score: 727 - index,
            comments: 140 - index,
            upvoteRatio: 0.95,
            subreddit: "ClaudeAI",
          },
        }),
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
    const feedItems: FeedItemReadRepositoryPort = {
      list: jest.fn(async (query) => ({
        items: query.providerKey === "reddit" ? redditFeedItems : [],
      })),
      findById: jest.fn(async () => null),
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
      maxItems: 20,
    });

    expect(feedItems.list).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: "reddit",
        limit: 10,
        publishedAtOrAfter: readerSummaryPeriod.startedAt,
        publishedBefore: readerSummaryPeriod.endedAt,
      }),
    );
    expect(
      selection.selectedEvidence.filter(
        (item) => item.providerKey === "reddit",
      ),
    ).toHaveLength(2);
    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual(
      expect.arrayContaining(["feed-reddit-1", "feed-reddit-2"]),
    );
    expect(
      selection.selectedEvidence.find(
        (item) => item.feedItemId === "feed-reddit-1",
      )?.score,
    ).toBeGreaterThan(1.35);
  });

  it("reserves top-read eligible Reddit evidence even when weak Reddit already appears in ranked results", async () => {
    const tenant = tenantId("tenant-top-read-reddit-reserve");
    const workspace = workspaceId("workspace-top-read-reddit-reserve");
    const rankedItems = [
      ...Array.from({ length: 10 }, (_, index) =>
        rankedItem({
          feedItemId: `feed-x-${index + 1}`,
          providerKey: "x-twitter",
          rank: index + 1,
          score: 3 - index / 100,
          providerMetadata: {
            kind: "x_post",
            public_metrics: {
              like_count: 100 - index,
              retweet_count: 20,
              reply_count: 10,
            },
          },
        }),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        rankedItem({
          feedItemId: `feed-weak-reddit-${index + 1}`,
          providerKey: "reddit",
          rank: 11 + index,
          score: 2 - index / 100,
          providerMetadata: {
            kind: "reddit_post",
            score: 0,
            comments: 0,
            upvoteRatio: 0.46,
          },
        }),
      ),
    ];
    const strongRedditFeedItems = Array.from({ length: 4 }, (_, index) =>
      FeedItem.publish({
        id: `feed-strong-reddit-${index + 1}`,
        tenantId: tenant,
        workspaceId: workspace,
        interestId: "interest-ai",
        sourceItemId: `source-strong-reddit-${index + 1}`,
        sourceBindingId: "binding-reddit",
        providerKey: "reddit",
        canonicalUrl: `https://reddit.example/r/artificial/comments/strong-${index + 1}`,
        title: `Strong Reddit AI discussion ${index + 1}`,
        bodyPreview:
          "Reddit users compare concrete AI coding workflows and reliability tradeoffs.",
        publishedAt: new Date("2026-06-23T09:00:00.000Z"),
        observedAt: new Date("2026-06-23T09:05:00.000Z"),
        providerMetadata: {
          kind: "reddit_post",
          score: 500 - index * 20,
          comments: 90 - index * 5,
          upvoteRatio: 0.91,
          subreddit: "ClaudeAI",
        },
      }),
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
    const feedItems: FeedItemReadRepositoryPort = {
      list: jest.fn(async (query) => ({
        items: query.providerKey === "reddit" ? strongRedditFeedItems : [],
      })),
      findById: jest.fn(async () => null),
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
      maxItems: 10,
    });

    expect(feedItems.list).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: "reddit",
        limit: 12,
      }),
    );
    const selectedRedditIds = selection.selectedEvidence
      .filter((item) => item.providerKey === "reddit")
      .map((item) => item.feedItemId);
    expect(selectedRedditIds).toEqual(
      expect.arrayContaining([
        "feed-strong-reddit-1",
        "feed-strong-reddit-2",
        "feed-strong-reddit-3",
      ]),
    );
    expect(selectedRedditIds).toHaveLength(5);
  });

  it("supplements up to forty items per provider for 120-item reader summaries", async () => {
    const tenant = tenantId("tenant-provider-supplement-120");
    const workspace = workspaceId("workspace-provider-supplement-120");
    const rankedItems = Array.from({ length: 120 }, (_, index) =>
      rankedItem({
        feedItemId: `feed-hn-wide-${index + 1}`,
        providerKey: "hacker-news",
        rank: index + 1,
        score: 3 - index / 100,
      }),
    );
    const rssFeedItems = Array.from({ length: 45 }, (_, index) =>
      FeedItem.publish({
        id: `feed-rss-wide-${index + 1}`,
        tenantId: tenant,
        workspaceId: workspace,
        interestId: "interest-ai",
        sourceItemId: `source-rss-wide-${index + 1}`,
        sourceBindingId: "binding-rss",
        providerKey: "rss",
        canonicalUrl: `https://rss.example/items/${index + 1}`,
        title: `RSS AI tooling story ${index + 1}`,
        bodyPreview:
          "RSS coverage reports practical AI tooling, infrastructure and developer workflow updates.",
        publishedAt: new Date("2026-06-23T09:00:00.000Z"),
        observedAt: new Date("2026-06-23T09:05:00.000Z"),
      }),
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
    const feedItems: FeedItemReadRepositoryPort = {
      list: jest.fn(async (query) => ({
        items: query.providerKey === "rss" ? rssFeedItems : [],
      })),
      findById: jest.fn(async () => null),
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
      maxItems: 120,
    });

    expect(feedItems.list).toHaveBeenCalledWith(
      expect.objectContaining({
        providerKey: "rss",
        limit: 80,
      }),
    );
    expect(
      selection.selectedEvidence.filter((item) => item.providerKey === "rss"),
    ).toHaveLength(40);
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
        list: jest.fn(async () => ({ items: [] })),
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

  it("expands eligible duplicates while dropping unrelated hard-blocked items", async () => {
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
        duplicateFeedItemIds: ["feed-reddit-codex", "feed-generic-hn"],
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
      list: jest.fn(async () => ({ items: [] })),
      findById: jest.fn(async ({ feedItemId }) => {
        const isGeneric = feedItemId === "feed-generic-hn";

        return FeedItem.publish({
          id: feedItemId,
          tenantId: tenant,
          workspaceId: workspace,
          interestId: "interest-ai",
          sourceItemId: `source-${feedItemId}`,
          sourceBindingId: isGeneric ? "binding-hn" : "binding-reddit",
          providerKey: isGeneric ? "hacker-news" : "reddit",
          canonicalUrl: `https://example.test/${feedItemId}`,
          title: isGeneric
            ? "Every new car sold in the European Union must include a driver monitoring camera"
            : "Reddit discusses openai/codex adoption",
          bodyPreview: isGeneric
            ? ""
            : "Operators compare https://github.com/openai/codex with other coding agents.",
          publishedAt: new Date("2026-06-23T10:05:00.000Z"),
          observedAt: new Date("2026-06-23T10:06:00.000Z"),
          providerMetadata: {
            kind: isGeneric ? "hacker_news_story" : "reddit_post",
            interestQuerySnapshot: {
              query: "Claude Codex OpenAI coding agents AI developer tools",
            },
          },
        });
      }),
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
      "feed-github-codex",
      "feed-reddit-codex",
    ]);
    expect(
      selection.selectedEvidence.find(
        (item) => item.feedItemId === "feed-generic-hn",
      )?.contentQuality?.eligibleForTopRead,
    ).toBeUndefined();
    expect(selection.clusters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          representativeFeedItemId: "feed-github-codex",
          duplicateFeedItemIds: ["feed-reddit-codex"],
          providerKeys: expect.arrayContaining(["github-repo-radar", "reddit"]),
        }),
      ]),
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
        publishedAt: "2026-06-23T00:00:00.000Z",
      }),
      rankedItem({
        feedItemId: "feed-inside",
        providerKey: "hacker-news",
        rank: 2,
        score: 2.4,
        observedAt: "2026-06-23T23:59:59.999Z",
        publishedAt: "2026-06-23T23:59:59.999Z",
      }),
      rankedItem({
        feedItemId: "feed-at-end",
        providerKey: "rss",
        rank: 3,
        score: 2.3,
        observedAt: "2026-06-23T12:00:00.000Z",
        publishedAt: "2026-06-24T00:00:00.000Z",
      }),
      rankedItem({
        feedItemId: "feed-observed-inside-published-before",
        providerKey: "x-twitter",
        rank: 4,
        score: 2.2,
        observedAt: "2026-06-23T12:00:00.000Z",
        publishedAt: "2026-06-22T23:59:59.999Z",
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
        list: jest.fn(async () => ({ items: [] })),
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
        publishedAtOrAfter: new Date("2026-06-23T00:00:00.000Z"),
        publishedBefore: new Date("2026-06-24T00:00:00.000Z"),
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
        providerMetadata: githubTrendingMetadataFixture(1_500),
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
        list: jest.fn(async () => ({ items: [] })),
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
