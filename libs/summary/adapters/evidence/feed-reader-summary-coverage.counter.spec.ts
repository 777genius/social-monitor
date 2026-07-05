import { FeedItem } from "@social-monitor/feed/domain";
import type {
  FeedItemReadRepositoryPort,
  ListFeedItemsQuery,
  ListFeedItemsResult,
} from "@social-monitor/feed/ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

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
      providerBreakdown: [
        { providerKey: "reddit", collectedFeedItemCount: 2 },
        { providerKey: "rss", collectedFeedItemCount: 2 },
        { providerKey: "hacker-news", collectedFeedItemCount: 1 },
        { providerKey: "x-twitter", collectedFeedItemCount: 1 },
      ],
    });
  });
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
    private readonly pages: readonly (number | readonly string[])[],
  ) {}

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    this.queries.push(query);
    const pageIndex =
      query.cursor === undefined ? 0 : Number(query.cursor) / query.limit;
    const page = this.pages[pageIndex] ?? 0;
    const providerKeys =
      typeof page === "number"
        ? Array.from({ length: page }, () => "reddit")
        : page;

    return {
      items: providerKeys.map((providerKey, index) =>
        FeedItem.publish({
          id: `feed-${pageIndex}-${index}`,
          tenantId: tenant,
          workspaceId: workspace,
          interestId: "interest-ai",
          sourceItemId: `source-${pageIndex}-${index}`,
          sourceBindingId: `binding-${providerKey}`,
          providerKey,
          canonicalUrl: `https://example.test/${pageIndex}/${index}`,
          title: `${providerKey} story`,
          bodyPreview: "Summary coverage test item.",
          publishedAt: period.startedAt,
          observedAt: period.startedAt,
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
