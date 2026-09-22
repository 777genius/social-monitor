import { FeedItem } from "@social-monitor/feed/domain";
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

  it("loads the supplemental projection at the caller's frozen cutoff", async () => {
    const cutoff = new Date("2026-06-23T12:34:56.789Z");
    const rankFeedItems = {
      execute: jest.fn(),
    } as unknown as RankFeedItemsUseCase;
    const list = jest.fn(async () => ({
      items: Array.from({ length: 12 }, (_, index) =>
        githubTrendingFeedItem(index + 1)),
    }));
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      {
        list,
        findById: jest.fn(async () => null),
      },
      clock,
    );

    const supplemental = await selector.selectSupplemental({
      tenantId: tenantId("tenant-github-display"),
      workspaceId: workspaceId("workspace-github-display"),
      scope: { type: "interest", interestId: "interest-ai" },
      period, maxItems: 200, observedThrough: cutoff,
    });

    expect(supplemental.map((item) => item.feedItemId)).toEqual(Array.from(
      { length: 10 }, (_, index) => `feed-github-${index + 1}`,
    ));
    expect(supplemental[0]).toMatchObject({
      sourceItemId: "source-github-1",
      sourceBindingId: "binding-github-trending-overall",
      interestId: "interest-ai",
      providerKey: "github-trending-page",
      providerName: "GitHub Trending",
      canonicalUrl: "https://github.com/owner/repository-1",
      readerActionKind: "watch_repository",
      contentQuality: {
        eligibleForSummary: true,
      },
      providerMetricLabels: expect.arrayContaining([
        { label: "GitHub Trending today", value: "#1, +101 stars today" },
      ]),
    });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-github-display",
      workspaceId: "workspace-github-display",
      interestId: "interest-ai",
      publishedAtOrAfter: period.startedAt,
      publishedBefore: period.endedAt,
      observedAtOrBefore: cutoff,
      providerKey: "github-trending-page",
    }));
    expect(rankFeedItems.execute).not.toHaveBeenCalled();
  });

  it("does not invoke the legacy model reviewer when the scope has no GitHub evidence", async () => {
    const legacyModelReviewer = { reviewBatch: jest.fn() };
    const rankFeedItems = {
      execute: jest.fn(async () => {
        await legacyModelReviewer.reviewBatch([]);
        return ok({
          generatedAt: clock.now().toISOString(),
          profileApplied: false,
          items: [],
        });
      }),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      {
        list: jest.fn(async () => ({ items: [] })),
        findById: jest.fn(async () => null),
      },
      clock,
    );

    await expect(selector.selectSupplemental({
      tenantId: tenantId("tenant-without-github"),
      workspaceId: workspaceId("workspace-without-github"),
      scope: { type: "workspace" },
      period,
      maxItems: 200,
    })).resolves.toEqual([]);

    expect(rankFeedItems.execute).not.toHaveBeenCalled();
    expect(legacyModelReviewer.reviewBatch).not.toHaveBeenCalled();
  });
});

const githubTrendingFeedItem = (rank: number): FeedItem => FeedItem.publish({
  id: `feed-github-${rank}`,
  tenantId: tenantId("tenant-github-display"),
  workspaceId: workspaceId("workspace-github-display"),
  sourceItemId: `source-github-${rank}`,
  sourceBindingId: "binding-github-trending-overall",
  interestId: "interest-ai",
  providerKey: "github-trending-page",
  canonicalUrl: `https://github.com/owner/repository-${rank}`,
  title: `owner/repository-${rank} is #${rank} on GitHub Trending`,
  bodyPreview: "Repository listed on the overall daily Trending page.",
  publishedAt: new Date("2026-06-23T10:00:00.000Z"),
  observedAt: new Date("2026-06-23T10:05:00.000Z"),
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
