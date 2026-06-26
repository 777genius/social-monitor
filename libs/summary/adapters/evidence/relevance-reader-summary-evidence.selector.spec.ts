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
import type { SummaryEvidenceSelection } from "../../domain";
import type { StoryRankingMetricsPort } from "../../ports";

const clock: Clock = {
  now: () => new Date("2026-06-23T12:00:00.000Z"),
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
      maxItems: 5,
    });

    expect(rankFeedItems.execute).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 15 }),
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
      maxItems: 4,
    });

    expect(
      selection.selectedEvidence.map((item) => item.providerKey).sort(),
    ).toEqual(["github-trending-page", "hacker-news", "reddit", "rss"]);
  });
});

class FakeStoryRankingMetrics implements StoryRankingMetricsPort {
  readonly recorded: SummaryEvidenceSelection[] = [];

  recordStoryRanking(selection: SummaryEvidenceSelection): void {
    this.recorded.push(selection);
  }
}
