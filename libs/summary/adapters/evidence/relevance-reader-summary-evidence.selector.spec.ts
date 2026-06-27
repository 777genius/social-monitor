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
    topicId: "topic-ai",
    providerKey,
    canonicalUrl: `https://example.test/${feedItemId}`,
    title: `${providerKey} story ${rank}`,
    bodyPreview: "Useful source evidence for an AI developer summary.",
    publishedAt: "2026-06-23T10:00:00.000Z",
    observedAt: `2026-06-23T10:${String(rank).padStart(2, "0")}:00.000Z`,
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
        limit: 15,
      }),
    );
    expect(
      selection.selectedEvidence.map((item) => item.providerKey).sort(),
    ).toEqual([
      "github-issues",
      "github-trending-page",
      "hacker-news",
      "reddit",
      "rss",
    ]);
    expect(selection.sourceWindow.selectedFeedItemIds).toContain("feed-issues");
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

  it("treats GitHub provider variants as one source family before adding lower-ranked sources", async () => {
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
      selection.selectedEvidence.map((item) => item.providerKey).sort(),
    ).toEqual(["github-trending-page", "hacker-news", "reddit", "rss"]);
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
          topicId: "topic-ai",
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
      "feed-github-codex",
      "feed-reddit-codex",
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
});

class FakeStoryRankingMetrics implements StoryRankingMetricsPort {
  readonly recorded: SummaryEvidenceSelection[] = [];

  recordStoryRanking(selection: SummaryEvidenceSelection): void {
    this.recorded.push(selection);
  }
}
