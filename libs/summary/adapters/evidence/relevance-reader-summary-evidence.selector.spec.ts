import { FeedItem } from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsCommand } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.command";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import { ok, SystemClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";
import {
  FakeStoryRankingMetrics,
  emptyPromotionSnapshot,
  githubTrendingMetadataFixture,
  readerSummaryRankedItemFixture as rankedItem,
  readerSummaryEvidenceTestClock as clock,
  readerSummaryEvidenceTestPeriod as readerSummaryPeriod,
} from "./relevance-reader-summary-evidence-test-fixtures";

describe("RelevanceReaderSummaryEvidenceSelector", () => {
  it("keeps real-SystemClock evidence fresh against its single captured cutoff", async () => {
    const systemClock = new SystemClock();
    const observedAt = systemClock.now();
    const publishedAt = new Date(observedAt.getTime() - 60_000);
    const item = rankedItem({
      feedItemId: "real-clock-hn",
      providerKey: "hacker-news",
      rank: 1,
      score: 3,
      publishedAt: publishedAt.toISOString(),
      observedAt: observedAt.toISOString(),
      providerMetadata: {
        kind: "hacker_news_story",
        points: 50,
        comments: 2,
      },
    });
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      { execute: jest.fn(async () => ok({
        generatedAt: systemClock.now().toISOString(),
        profileApplied: false,
        items: [item],
      })) } as unknown as RankFeedItemsUseCase,
      {
        readPromotionSnapshot: emptyPromotionSnapshot,
        list: jest.fn(async () => ({ items: [] })),
        findById: jest.fn(async () => null),
      },
      systemClock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-real-system-clock"),
      workspaceId: workspaceId("workspace-real-system-clock"),
      scope: { type: "workspace" },
      period: {
        ...readerSummaryPeriod,
        startedAt: new Date(publishedAt.getTime() - 60_000),
        endedAt: new Date(observedAt.getTime() + 60_000),
      },
      maxItems: 5,
    });

    expect(selection.selectedEvidence[0]?.promotionFacts).toMatchObject({
      freshnessValid: true,
      freshnessProvenance: {
        status: "observed",
        observedAt,
        ingestionCutoff: selection.sourceWindow.ingestionCutoff,
      },
    });
  });

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
      readPromotionSnapshot: emptyPromotionSnapshot,
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
    const observedThrough = clock.now();

    const selection = await selector.select({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 5,
      observedThrough,
    });

    expect(rankFeedItems.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedAtOrAfter: readerSummaryPeriod.startedAt,
        publishedBefore: readerSummaryPeriod.endedAt,
        observedAtOrBefore: observedThrough,
        limit: 200,
      }),
    );
    expect(feedItems.list).not.toHaveBeenCalled();
    expect(
      selection.selectedEvidence.map((item) => item.providerKey).sort(),
    ).toEqual([
      "github-trending-page",
      "hacker-news",
      "reddit",
    ]);
    expect(selection.selectedEvidence.map((item) => item.providerKey)).toEqual([
      "hacker-news",
      "reddit",
      "github-trending-page",
    ]);
    expect(selection.sourceWindow.selectedFeedItemIds).toContain(
      "feed-trending",
    );
    expect(selection.sourceWindow.selectedFeedItemIds).not.toContain(
      "feed-trending-2",
    );
    expect(selection.sourceWindow.selectedFeedItemIds).not.toContain("feed-rss");
    expect(storyRankingMetrics.recorded[0]?.rankingPolicyVersion).toBe(
      "story_ranking_v10",
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
    let clockCalls = 0;
    const advancingClock = {
      now: () => new Date(
        Date.parse("2026-06-23T12:00:00.000Z") + clockCalls++ * 60_000,
      ),
    };
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
        readPromotionSnapshot: emptyPromotionSnapshot,
        list: jest.fn(async () => ({ items: [] })),
        findById: jest.fn(async () => null),
      },
      advancingClock,
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
    expect(clockCalls).toBe(1);
    expect(selection.sourceWindow.ingestionCutoff).toEqual(
      new Date("2026-06-23T12:00:00.000Z"),
    );
    expect(selection.selectedEvidence.every((item) =>
      item.promotionFacts?.freshnessProvenance?.status !== "observed" ||
      item.promotionFacts.freshnessProvenance.ingestionCutoff.getTime() ===
        Date.parse("2026-06-23T12:00:00.000Z")
    )).toBe(true);
  });

  it("keeps ranking telemetry invariant with zero versus N supplemental entries", async () => {
    const recordWithSupplementalCount = async (supplementalCount: number) => {
      const primary = rankedItem({
        feedItemId: "telemetry-primary",
        providerKey: "hacker-news",
        rank: 1,
        score: 3,
      });
      const supplemental = Array.from({ length: supplementalCount }, (_, index) =>
        rankedItem({
          feedItemId: `telemetry-trending-${index}`,
          providerKey: "github-trending-page",
          rank: index + 2,
          score: 2 - index / 10,
          providerMetadata: githubTrendingMetadataFixture(2_500 - index),
        }));
      const metrics = new FakeStoryRankingMetrics();
      const selector = new RelevanceReaderSummaryEvidenceSelector(
        { execute: jest.fn(async () => ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          items: [primary, ...supplemental],
        })) } as unknown as RankFeedItemsUseCase,
        {
          readPromotionSnapshot: emptyPromotionSnapshot,
          list: jest.fn(async () => ({ items: [] })),
          findById: jest.fn(async () => null),
        },
        clock,
        metrics,
      );
      await selector.select({
        tenantId: tenantId("tenant-telemetry-invariance"),
        workspaceId: workspaceId("workspace-telemetry-invariance"),
        scope: { type: "workspace" },
        period: readerSummaryPeriod,
        maxItems: 5,
        observedThrough: clock.now(),
      });
      return metrics.recorded[0]!;
    };

    const withoutSupplemental = await recordWithSupplementalCount(0);
    const withSupplemental = await recordWithSupplementalCount(3);
    expect(withSupplemental.selectedEvidence).toEqual(
      withoutSupplemental.selectedEvidence,
    );
    expect(withSupplemental.sourceWindow.selectedFeedItemIds).toEqual(
      withoutSupplemental.sourceWindow.selectedFeedItemIds,
    );
    expect(withSupplemental.clusters).toEqual(withoutSupplemental.clusters);
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
      readPromotionSnapshot: emptyPromotionSnapshot,
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
      "reddit",
      "hacker-news",
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
        readPromotionSnapshot: emptyPromotionSnapshot,
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
    expect(selection.selectedEvidence).toHaveLength(120);
    expect(
      selection.selectedEvidence.filter((item) => item.providerKey === "rss"),
    ).toHaveLength(0);
    expect(selection.selectedEvidence[0]?.providerKey).toBe("reddit");
  });

  it("does not refill ranked evidence from provider repository lanes", async () => {
    const rankFeedItems = {
      execute: jest.fn(async () => ok({
        generatedAt: clock.now().toISOString(),
        profileApplied: false,
        items: [rankedItem({
          feedItemId: "ranked-hn-only",
          providerKey: "hacker-news",
          rank: 1,
          score: 3,
        })],
      })),
    } as unknown as RankFeedItemsUseCase;
    const feedItems: FeedItemReadRepositoryPort = {
      readPromotionSnapshot: emptyPromotionSnapshot,
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
      tenantId: tenantId("tenant-no-refill"),
      workspaceId: workspaceId("workspace-no-refill"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 20,
    });

    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "ranked-hn-only",
    ]);
    expect(feedItems.list).not.toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "reddit",
    }));
    expect(feedItems.list).not.toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "rss",
    }));
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
          contentKind: "original_post",
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
        readPromotionSnapshot: emptyPromotionSnapshot,
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
        providerMetricSummary: "1,280 likes, 240 reposts",
        providerMetricLabels: expect.arrayContaining([
          { label: "Likes", value: "1,280" },
          { label: "Reposts", value: "240" },
        ]),
      }),
    );
  });

  it("filters forbidden conversation engagement before bounded candidate truncation", async () => {
    const rankedItems = [
      rankedItem({
        feedItemId: "noisy-reddit-comment",
        providerKey: "reddit",
        rank: 1,
        score: 99,
        providerMetadata: {
          kind: "reddit_comment",
          role: "top_level_comment",
          score: 1_000_000,
          replyCount: 100_000,
        },
      }),
      rankedItem({
        feedItemId: "noisy-hn-reply",
        providerKey: "hacker-news",
        rank: 2,
        score: 98,
        providerMetadata: {
          kind: "hacker_news_comment",
          role: "reply",
          score: 1_000_000,
          replies: 100_000,
          depth: 2,
        },
      }),
      rankedItem({
        feedItemId: "noisy-x-quote",
        providerKey: "x-twitter",
        rank: 3,
        score: 97,
        providerMetadata: {
          kind: "x_post",
          contentKind: "quote",
          public_metrics: {
            like_count: 1_000_000,
            retweet_count: 500_000,
            reply_count: 250_000,
            quote_count: 125_000,
            bookmark_count: 60_000,
          },
        },
      }),
      rankedItem({
        feedItemId: "qualified-reddit-original",
        providerKey: "reddit",
        rank: 4,
        score: 2,
        providerMetadata: { kind: "reddit_post", score: 100 },
      }),
      rankedItem({
        feedItemId: "qualified-hn-story",
        providerKey: "hacker-news",
        rank: 5,
        score: 1,
        providerMetadata: {
          kind: "hacker_news_story",
          points: 200,
          comments: 0,
        },
      }),
    ];
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      {
        execute: jest.fn(async () => ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          items: rankedItems,
        })),
      } as unknown as RankFeedItemsUseCase,
      {
        readPromotionSnapshot: emptyPromotionSnapshot,
        list: jest.fn(async () => ({ items: [] })),
        findById: jest.fn(async () => null),
      },
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-forbidden-engagement"),
      workspaceId: workspaceId("workspace-forbidden-engagement"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 2,
    });

    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "qualified-reddit-original",
      "qualified-hn-story",
    ]);
  });

  it("never hydrates duplicate bodies after the authoritative snapshot", async () => {
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
      readPromotionSnapshot: emptyPromotionSnapshot,
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
            ...(isGeneric
              ? { points: 10, comments: 0 }
              : { score: 10, comments: 0 }),
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
      observedThrough: clock.now(),
    });

    expect(feedItems.findById).not.toHaveBeenCalled();
    expect(selection.selectedEvidence).toEqual([]);
    expect(
      selection.selectedEvidence.find(
        (item) => item.feedItemId === "feed-generic-hn",
      )?.contentQuality?.eligibleForTopRead,
    ).toBeUndefined();
    expect(selection.clusters).toEqual([]);
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
        readPromotionSnapshot: emptyPromotionSnapshot,
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
    ]);
  });

  it("keeps observed-window evidence published outside the day", async () => {
    const rankedItems = [
      rankedItem({
        feedItemId: "feed-observed-old-publication",
        providerKey: "reddit",
        rank: 1,
        score: 2.5,
        publishedAt: "2026-06-01T10:00:00.000Z",
        observedAt: "2026-06-23T10:00:00.000Z",
      }),
      rankedItem({
        feedItemId: "feed-observed-future-publication",
        providerKey: "hacker-news",
        rank: 2,
        score: 2.4,
        publishedAt: "2026-06-25T10:00:00.000Z",
        observedAt: "2026-06-23T11:00:00.000Z",
      }),
      rankedItem({
        feedItemId: "feed-observed-at-end",
        providerKey: "rss",
        rank: 3,
        score: 2.3,
        publishedAt: "2026-06-23T11:00:00.000Z",
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
        readPromotionSnapshot: emptyPromotionSnapshot,
        list: jest.fn(async () => ({ items: [] })),
        findById: jest.fn(async () => null),
      },
      clock,
      new FakeStoryRankingMetrics(),
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-observed-window"),
      workspaceId: workspaceId("workspace-observed-window"),
      scope: { type: "workspace" },
      period: readerSummaryPeriod,
      maxItems: 5,
      timestampPolicy: "observed_at",
    });

    expect(rankFeedItems.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        observedAtOrAfter: readerSummaryPeriod.startedAt,
        observedBefore: readerSummaryPeriod.endedAt,
      }),
    );
    const rankingCommand = (rankFeedItems.execute as jest.MockedFunction<
      RankFeedItemsUseCase["execute"]
    >).mock.calls[0]?.[0];
    expect(rankingCommand?.publishedAtOrAfter).toBeUndefined();
    expect(rankingCommand?.publishedBefore).toBeUndefined();
    expect(selection.selectedEvidence).toEqual([]);
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
        readPromotionSnapshot: emptyPromotionSnapshot,
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
