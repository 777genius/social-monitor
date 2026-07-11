import { FeedItem } from "@social-monitor/feed/domain";
import type {
  FeedItemReadRepositoryPort,
  ListFeedItemsQuery,
  ListFeedItemsResult,
} from "@social-monitor/feed/ports";
import {
  type JsonObject,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { FeedReaderSummaryCoverageCounter } from "./feed-reader-summary-coverage.counter";

describe("FeedReaderSummaryCoverageCounter", () => {
  it("counts all collected feed items across pages for the summary period", async () => {
    const feedItems = new FakeFeedItems([100, 100, 55]);
    const counter = new FeedReaderSummaryCoverageCounter(feedItems);

    const result = await counter.countCollectedFeedItems({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
    });

    expect(result).toBe(255);
    expect(feedItems.queries).toEqual([
      expect.objectContaining({
        tenantId: tenant,
        workspaceId: workspace,
        publishedAtOrAfter: period.startedAt,
        publishedBefore: period.endedAt,
        interestId: undefined,
        limit: 100,
        cursor: undefined,
      }),
      expect.objectContaining({ cursor: "100" }),
      expect.objectContaining({ cursor: "200" }),
    ]);
    expect(feedItems.queries[0]?.observedAfter).toBeUndefined();
    expect(feedItems.queries[0]?.observedBefore).toBeUndefined();
  });

  it("scopes collected feed item counts to interest summaries", async () => {
    const feedItems = new FakeFeedItems([7]);
    const counter = new FeedReaderSummaryCoverageCounter(feedItems);

    await counter.countCollectedFeedItems({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "interest", interestId: "interest-ai" },
      period,
    });

    expect(feedItems.queries[0]).toEqual(
      expect.objectContaining({ interestId: "interest-ai" }),
    );
  });

  it("excludes GitHub technical providers from default reader summary coverage", async () => {
    const feedItems = new FakeFeedItems([
      ["reddit", "github-issues", "github-trending-page", "rss"],
      ["github-issues", "github-trending-page"],
    ]);
    const counter = new FeedReaderSummaryCoverageCounter(feedItems);

    const result = await counter.countCollectedFeedItems({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
    });

    expect(result).toBe(2);
  });

  it("returns collected feed item coverage grouped by provider", async () => {
    const feedItems = new FakeFeedItems([
      ["reddit", "rss", "reddit", "hacker-news"],
      ["rss", "x-twitter", "github-issues", "github-trending-page"],
    ]);
    const counter = new FeedReaderSummaryCoverageCounter(feedItems);

    const result = await counter.countCollectedFeedItemCoverage({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
    });

    expect(result).toEqual({
      collectedFeedItemCount: 6,
      lowRelevanceFeedItemCount: 0,
      mutedFeedItemCount: 0,
      userRatedFeedItemCount: 0,
      providerBreakdown: [
        providerCoverage("reddit", 2),
        providerCoverage("rss", 2),
        providerCoverage("hacker-news", 1),
        providerCoverage("x-twitter", 1),
      ],
      topicBreakdown: [topicCoverage("interest-ai", 6)],
      queryBreakdown: [],
    });
  });

  it("merges durable provider collection health and keeps unavailable providers visible", async () => {
    const feedItems = new FakeFeedItems([["reddit"]]);
    const counter = new FeedReaderSummaryCoverageCounter(feedItems, {
      async readProviderCollectionHealth() {
        return [
          {
            providerKey: "reddit",
            state: "partial" as const,
            scanCount: 1,
            targetItemCount: 80,
            collectedItemCount: 24,
            acceptedItemCount: 20,
            insertedItemCount: 18,
            outsideWindowItemCount: 4,
            paginationDuplicateItemCount: 2,
            storageDuplicateItemCount: 2,
            pageCount: 2,
            paginationStopReasons: ["max_pages"],
            failureKinds: [],
            rateLimitEventCount: 0,
          },
          {
            providerKey: "x-twitter",
            state: "unavailable" as const,
            scanCount: 1,
            collectedItemCount: 0,
            acceptedItemCount: 0,
            insertedItemCount: 0,
            outsideWindowItemCount: 0,
            paginationDuplicateItemCount: 0,
            storageDuplicateItemCount: 0,
            pageCount: 0,
            paginationStopReasons: ["failed"],
            failureKinds: ["rate_limited"],
            rateLimitEventCount: 1,
          },
        ];
      },
    });

    const result = await counter.countCollectedFeedItemCoverage({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
    });

    expect(result?.providerBreakdown).toEqual([
      expect.objectContaining({
        providerKey: "reddit",
        collectedFeedItemCount: 1,
        collectionHealth: expect.objectContaining({
          state: "partial",
          targetItemCount: 80,
          acceptedItemCount: 20,
        }),
      }),
      expect.objectContaining({
        providerKey: "x-twitter",
        collectedFeedItemCount: 0,
        collectionHealth: expect.objectContaining({
          state: "unavailable",
          rateLimitEventCount: 1,
        }),
      }),
    ]);
  });

  it("returns quality, topic and query coverage for collection diagnostics", async () => {
    const feedItems = new FakeFeedItems([
      [
        {
          providerKey: "reddit",
          interestId: "interest-ai",
          providerMetadata: {
            searchQuery: "AI agents",
            interestQuerySnapshot: { query: "AI coding" },
            sourceBindingSnapshot: {
              sourceQuery: { query: "AI agents" },
            },
            normalizedSignal: { score: 12 },
          },
        },
        {
          providerKey: "x-twitter",
          interestId: "interest-ai",
          providerMetadata: {
            searchQuery: "AI agents",
            interestQuerySnapshot: { query: "AI coding" },
            sourceBindingSnapshot: {
              sourceQuery: { query: "AI agents" },
            },
            relevance: { muted: true },
          },
        },
        {
          providerKey: "rss",
          interestId: "interest-security",
          providerMetadata: {
            searchQueries: ["cybersecurity", "AI agents"],
            interestQuerySnapshot: { query: "Security" },
            sourceBindingSnapshot: {
              sourceQuery: { query: "AI agents" },
            },
            rating: { userRated: true },
          },
        },
      ],
    ]);
    const counter = new FeedReaderSummaryCoverageCounter(feedItems);

    const result = await counter.countCollectedFeedItemCoverage({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
    });

    expect(result).toEqual({
      collectedFeedItemCount: 3,
      lowRelevanceFeedItemCount: 1,
      mutedFeedItemCount: 1,
      userRatedFeedItemCount: 1,
      providerBreakdown: [
        providerCoverage("reddit", 1, { lowRelevance: 1 }),
        providerCoverage("rss", 1, { userRated: 1 }),
        providerCoverage("x-twitter", 1, { muted: 1 }),
      ],
      topicBreakdown: [
        topicCoverage("interest-ai", "AI coding", 2, {
          lowRelevance: 1,
          muted: 1,
        }),
        topicCoverage("interest-security", "Security", 1, { userRated: 1 }),
      ],
      queryBreakdown: [
        queryCoverage("AI agents", 3, {
          lowRelevance: 1,
          muted: 1,
          userRated: 1,
        }),
        queryCoverage("cybersecurity", 1, { userRated: 1 }),
      ],
    });
  });
});

const providerCoverage = (
  providerKey: string,
  collectedFeedItemCount: number,
  stats: Partial<CoverageStats> = {},
) => ({
  providerKey,
  ...coverageStats(collectedFeedItemCount, stats),
});

const topicCoverage = (
  topicKey: string,
  topicLabelOrCount: string | number,
  collectedFeedItemCountOrStats?: number | Partial<CoverageStats>,
  maybeStats: Partial<CoverageStats> = {},
) => {
  const hasLabel = typeof topicLabelOrCount === "string";
  const collectedFeedItemCount = hasLabel
    ? (collectedFeedItemCountOrStats as number)
    : topicLabelOrCount;
  const stats = hasLabel
    ? maybeStats
    : ((collectedFeedItemCountOrStats as Partial<CoverageStats> | undefined) ??
      {});

  return {
    topicKey,
    ...(hasLabel ? { topicLabel: topicLabelOrCount } : {}),
    ...coverageStats(collectedFeedItemCount, stats),
  };
};

const queryCoverage = (
  query: string,
  collectedFeedItemCount: number,
  stats: Partial<CoverageStats> = {},
) => ({
  query,
  ...coverageStats(collectedFeedItemCount, stats),
});

type CoverageStats = {
  readonly lowRelevance: number;
  readonly muted: number;
  readonly userRated: number;
};

const coverageStats = (
  collectedFeedItemCount: number,
  stats: Partial<CoverageStats>,
) => ({
  collectedFeedItemCount,
  lowRelevanceFeedItemCount: stats.lowRelevance ?? 0,
  mutedFeedItemCount: stats.muted ?? 0,
  userRatedFeedItemCount: stats.userRated ?? 0,
});

const tenant = tenantId("tenant-reader-summary-coverage");
const workspace = workspaceId("workspace-reader-summary-coverage");
const period = {
  cadence: "daily" as const,
  startedAt: new Date("2026-07-02T00:00:00.000Z"),
  endedAt: new Date("2026-07-03T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-07-02T00:00:00.000Z:2026-07-03T00:00:00.000Z:UTC",
};

class FakeFeedItems implements FeedItemReadRepositoryPort {
  readonly queries: ListFeedItemsQuery[] = [];

  constructor(
    private readonly pages: readonly (
      number | readonly (string | FakeFeedItemInput)[]
    )[],
  ) {}

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    this.queries.push(query);
    const pageIndex =
      query.cursor === undefined ? 0 : Number(query.cursor) / query.limit;
    const page = this.pages[pageIndex] ?? 0;
    const inputs: readonly FakeFeedItemInput[] =
      typeof page === "number"
        ? Array.from({ length: page }, () => ({ providerKey: "reddit" }))
        : page.map((input) =>
            typeof input === "string" ? { providerKey: input } : input,
          );

    return {
      items: inputs.map((input, index) =>
        FeedItem.publish({
          id: `feed-${pageIndex}-${index}`,
          tenantId: tenant,
          workspaceId: workspace,
          interestId: input.interestId ?? "interest-ai",
          sourceItemId: `source-${pageIndex}-${index}`,
          sourceBindingId: `binding-${input.providerKey}`,
          providerKey: input.providerKey,
          canonicalUrl: `https://example.test/${pageIndex}/${index}`,
          title: `${input.providerKey} story`,
          bodyPreview: "Summary coverage test item.",
          publishedAt: period.startedAt,
          observedAt: period.startedAt,
          providerMetadata: input.providerMetadata,
        }),
      ),
      nextCursor:
        pageIndex + 1 < this.pages.length
          ? String((pageIndex + 1) * query.limit)
          : undefined,
    };
  }

  async findById(): Promise<FeedItem | null> {
    return null;
  }
}

type FakeFeedItemInput = {
  readonly providerKey: string;
  readonly interestId?: string;
  readonly providerMetadata?: JsonObject;
};
