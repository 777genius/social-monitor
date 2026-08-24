import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { RankFeedItemsCommand } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.command";
import type { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { ok, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { RelevanceReaderSummaryEvidenceSelector } from "./relevance-reader-summary-evidence.selector";
import {
  readerSummaryEvidenceTestClock as clock,
  readerSummaryEvidenceTestPeriod as period,
} from "./relevance-reader-summary-evidence-test-fixtures";

describe("RelevanceReaderSummaryEvidenceSelector GitHub display evidence", () => {
  it("carries exactly the GitHub top ten into selected evidence and source window", async () => {
    const rankedItems = Array.from({ length: 12 }, (_, index) =>
      githubTrendingRankedItem(index + 1),
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
      readPromotionSnapshot: jest.fn(async () => ({
        ok: true,
        candidates: [],
        sourceContent: [],
        physicalRowsRead: 0,
        exhausted: true,
      } as const)),
      list: jest.fn(async () => ({ items: [] })),
      findById: jest.fn(async () => null),
    };
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      feedItems,
      clock,
    );

    const selection = await selector.select({
      tenantId: tenantId("tenant-github-display"),
      workspaceId: workspaceId("workspace-github-display"),
      scope: { type: "workspace" },
      period,
      maxItems: 5,
    });
    const expectedIds = Array.from(
      { length: 10 },
      (_, index) => `feed-github-${index + 1}`,
    );

    expect(selection.selectedEvidence.map((item) => item.feedItemId)).toEqual(
      expectedIds,
    );
    expect(selection.sourceWindow.selectedFeedItemIds).toEqual(expectedIds);
  });
});

const githubTrendingRankedItem = (rank: number): RankedFeedItemView => ({
  feedItemId: `feed-github-${rank}`,
  sourceItemId: `source-github-${rank}`,
  sourceBindingId: "binding-github-trending-overall",
  interestId: "interest-ai",
  providerKey: "github-trending-page",
  canonicalUrl: `https://github.com/owner/repository-${rank}`,
  title: `owner/repository-${rank} is #${rank} on GitHub Trending`,
  bodyPreview: "Repository listed on the overall daily Trending page.",
  publishedAt: "2026-06-23T10:00:00.000Z",
  observedAt: "2026-06-23T10:05:00.000Z",
  score: 2 - rank / 100,
  rank,
  clusterId: `cluster-github-${rank}`,
  clusterSize: 1,
  duplicateFeedItemIds: [],
  whyImportant: ["GitHub daily trend"],
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
    reason: "Eligible GitHub Trending evidence.",
  },
  providerMetadata: {
    kind: "github_trending_page_repository",
    repository: {
      fullName: `owner/repository-${rank}`,
      totalStars: 20_000,
      forksCount: 500,
    },
    trending: { rank, starsGained: 100 + rank, window: "daily" },
  },
});
