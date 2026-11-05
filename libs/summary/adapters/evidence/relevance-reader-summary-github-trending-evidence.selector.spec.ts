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
      candidateWindowExhausted: true,
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

  it("follows cursors beyond 200 observations and selects the latest complete snapshot", async () => {
    const cutoff = new Date("2026-06-23T20:30:00.000Z");
    const observations = Array.from({ length: 21 }, (_, hour) =>
      Array.from({ length: 10 }, (_, index) =>
        githubTrendingFeedItem(index + 1, {
          snapshotHour: hour,
          starsGained: 10_000 - hour * 100 - index,
        }),
      ),
    ).flat();
    const list = jest.fn(
      async ({ cursor }: Parameters<FeedItemReadRepositoryPort["list"]>[0]) => {
        const offset = cursor === undefined ? 0 : Number(cursor);
        const items = observations.slice(offset, offset + 200);
        const nextOffset = offset + items.length;
        return {
          items,
          nextCursor:
            nextOffset < observations.length ? String(nextOffset) : undefined,
          candidateWindowExhausted: true,
        };
      },
    );
    const rankFeedItems = {
      execute: jest.fn(),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      { list, findById: jest.fn(async () => null) },
      clock,
    );

    const supplemental = await selector.selectSupplemental({
      tenantId: tenantId("tenant-github-display"),
      workspaceId: workspaceId("workspace-github-display"),
      scope: { type: "interest", interestId: "interest-ai" },
      period,
      maxItems: 200,
      observedThrough: cutoff,
    });

    expect(supplemental).toHaveLength(10);
    expect(supplemental.map((item) => item.feedItemId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `feed-github-20-${index + 1}`),
    );
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls.map(([query]) => query.cursor)).toEqual([
      undefined,
      "200",
    ]);
    for (const [query] of list.mock.calls) {
      expect(query).toEqual(
        expect.objectContaining({
          tenantId: "tenant-github-display",
          workspaceId: "workspace-github-display",
          interestId: "interest-ai",
          providerKey: "github-trending-page",
          publishedAtOrAfter: period.startedAt,
          publishedBefore: period.endedAt,
          observedAtOrBefore: cutoff,
          limit: 200,
        }),
      );
    }
    expect(rankFeedItems.execute).not.toHaveBeenCalled();
  });

  it("fails closed on the 1,009-row truncated snapshot reproduction", async () => {
    const newestSnapshotAt = new Date("2026-06-23T18:00:00.000Z");
    const observations = [
      ...Array.from({ length: 111 }, (_, snapshotIndex) =>
        Array.from({ length: 9 }, (_, rankIndex) =>
          githubTrendingFeedItem(rankIndex + 1, {
            snapshotKey: `incomplete-${snapshotIndex}`,
            snapshotTime: new Date(
              newestSnapshotAt.getTime() - snapshotIndex * 60_000,
            ),
          }),
        )).flat(),
      ...Array.from({ length: 10 }, (_, rankIndex) =>
        githubTrendingFeedItem(rankIndex + 1, {
          snapshotKey: "older-complete",
          snapshotTime: new Date("2026-06-23T15:00:00.000Z"),
        })),
    ];
    expect(observations).toHaveLength(1_009);
    const list = jest.fn(
      async ({ cursor }: Parameters<FeedItemReadRepositoryPort["list"]>[0]) => {
        const offset = cursor === undefined ? 0 : Number(cursor);
        const visible = observations.slice(0, 1_000);
        const items = visible.slice(offset, offset + 200);
        const nextOffset = offset + items.length;
        return {
          items,
          nextCursor: nextOffset < visible.length
            ? String(nextOffset)
            : undefined,
          candidateWindowExhausted: false,
        };
      },
    );
    const rankFeedItems = {
      execute: jest.fn(),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      { list, findById: jest.fn(async () => null) },
      clock,
    );

    await expect(selector.selectSupplemental({
      tenantId: tenantId("tenant-github-display"),
      workspaceId: workspaceId("workspace-github-display"),
      scope: { type: "workspace" },
      period,
      maxItems: 200,
      observedThrough: new Date("2026-06-23T20:30:00.000Z"),
    })).resolves.toEqual([]);

    expect(list).toHaveBeenCalledTimes(5);
    expect(rankFeedItems.execute).not.toHaveBeenCalled();
  });

  it("fails closed when repository exhaustion is not explicitly proved", async () => {
    const list = jest.fn(async () => ({
      items: Array.from({ length: 10 }, (_, index) =>
        githubTrendingFeedItem(index + 1)),
    }));
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      { execute: jest.fn() } as unknown as RankFeedItemsUseCase,
      { list, findById: jest.fn(async () => null) },
      clock,
    );

    await expect(selector.selectSupplemental({
      tenantId: tenantId("tenant-github-display"),
      workspaceId: workspaceId("workspace-github-display"),
      scope: { type: "workspace" },
      period,
      maxItems: 200,
    })).resolves.toEqual([]);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the bounded supplemental scan is not exhausted", async () => {
    const list = jest.fn(
      async ({ cursor }: Parameters<FeedItemReadRepositoryPort["list"]>[0]) => ({
        items:
          cursor === undefined
            ? Array.from({ length: 10 }, (_, index) =>
                githubTrendingFeedItem(index + 1),
              )
            : [],
        nextCursor: String((cursor === undefined ? 0 : Number(cursor)) + 200),
      }),
    );
    const rankFeedItems = {
      execute: jest.fn(),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      { list, findById: jest.fn(async () => null) },
      clock,
    );

    await expect(
      selector.selectSupplemental({
        tenantId: tenantId("tenant-github-display"),
        workspaceId: workspaceId("workspace-github-display"),
        scope: { type: "workspace" },
        period,
        maxItems: 200,
      }),
    ).resolves.toEqual([]);

    expect(list).toHaveBeenCalledTimes(25);
    expect(rankFeedItems.execute).not.toHaveBeenCalled();
  });

  it("fails closed when supplemental pagination repeats a cursor", async () => {
    const list = jest.fn(
      async ({ cursor }: Parameters<FeedItemReadRepositoryPort["list"]>[0]) => ({
        items: Array.from({ length: 10 }, (_, index) =>
          githubTrendingFeedItem(index + 1),
        ),
        nextCursor: cursor ?? "stuck",
      }),
    );
    const rankFeedItems = {
      execute: jest.fn(),
    } as unknown as RankFeedItemsUseCase;
    const selector = new RelevanceReaderSummaryEvidenceSelector(
      rankFeedItems,
      { list, findById: jest.fn(async () => null) },
      clock,
    );

    await expect(
      selector.selectSupplemental({
        tenantId: tenantId("tenant-github-display"),
        workspaceId: workspaceId("workspace-github-display"),
        scope: { type: "workspace" },
        period,
        maxItems: 200,
      }),
    ).resolves.toEqual([]);

    expect(list).toHaveBeenCalledTimes(2);
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

const githubTrendingFeedItem = (
  rank: number,
  overrides: {
    readonly snapshotHour?: number;
    readonly snapshotKey?: string;
    readonly snapshotTime?: Date;
    readonly starsGained?: number;
  } = {},
): FeedItem => {
  const snapshotHour = overrides.snapshotHour;
  const snapshotKey = overrides.snapshotKey ?? snapshotHour;
  const snapshotSuffix = snapshotKey === undefined ? "" : `${snapshotKey}-`;
  const snapshotTime = overrides.snapshotTime ?? new Date(
    Date.UTC(2026, 5, 23, snapshotHour ?? 10, 0, 0),
  );
  return FeedItem.publish({
    id: `feed-github-${snapshotSuffix}${rank}`,
    tenantId: tenantId("tenant-github-display"),
    workspaceId: workspaceId("workspace-github-display"),
    sourceItemId: `source-github-${snapshotSuffix}${rank}`,
    sourceBindingId: "binding-github-trending-overall",
    interestId: "interest-ai",
    providerKey: "github-trending-page",
    canonicalUrl: `https://github.com/owner/repository-${rank}`,
    title: `owner/repository-${rank} is #${rank} on GitHub Trending`,
    bodyPreview: "Repository listed on the overall daily Trending page.",
    publishedAt: snapshotTime,
    observedAt: new Date(snapshotTime.getTime() + 5 * 60_000),
    providerMetadata: {
      kind: "github_trending_page_repository",
      repository: {
        fullName: `owner/repository-${rank}`,
        totalStars: 20_000,
        forksCount: 500,
      },
      trending: {
        rank,
        starsGained: overrides.starsGained ?? 100 + rank,
        window: "daily",
      },
    },
  });
};

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
