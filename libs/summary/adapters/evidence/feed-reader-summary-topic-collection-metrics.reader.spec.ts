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

import { FeedReaderSummaryTopicCollectionMetricsReader } from "./feed-reader-summary-topic-collection-metrics.reader";

describe("FeedReaderSummaryTopicCollectionMetricsReader", () => {
  it("counts collected posts for topic interest ids and topic text", async () => {
    const feedItems = new FakeFeedItems();
    const reader = new FeedReaderSummaryTopicCollectionMetricsReader(feedItems);

    const result = await reader.readTopicCollectionMetrics({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
      topicLabel: "AI security",
      interestIds: ["interest-ai-security"],
    });

    expect(result).toEqual({
      collectedPostCount: 2,
      lowRelevancePostCount: 1,
      mutedPostCount: 0,
      userRatedPostCount: 0,
    });
    expect(feedItems.queries).toEqual([
      expect.objectContaining({
        interestId: "interest-ai-security",
        searchQuery: "AI security",
        publishedAtOrAfter: period.startedAt,
        publishedBefore: period.endedAt,
      }),
    ]);
  });

  it("does not count the whole interest when a topic search is available", async () => {
    const feedItems = new FakeFeedItems();
    const reader = new FeedReaderSummaryTopicCollectionMetricsReader(feedItems);

    const result = await reader.readTopicCollectionMetrics({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
      topicLabel: "Open source repos",
      interestIds: ["interest-ai-security"],
    });

    expect(result).toEqual({
      collectedPostCount: 1,
      lowRelevancePostCount: 0,
      mutedPostCount: 0,
      userRatedPostCount: 0,
    });
    expect(feedItems.queries).toEqual([
      expect.objectContaining({
        interestId: "interest-ai-security",
        searchQuery: "Open source repos",
      }),
    ]);
  });

  it("falls back to topic search when there are no interest ids", async () => {
    const feedItems = new FakeFeedItems();
    const reader = new FeedReaderSummaryTopicCollectionMetricsReader(feedItems);

    await reader.readTopicCollectionMetrics({
      tenantId: tenant,
      workspaceId: workspace,
      scope: { type: "workspace" },
      period,
      topicLabel: "AI security",
      interestIds: [],
    });

    expect(feedItems.queries).toEqual([
      expect.objectContaining({ searchQuery: "AI security" }),
    ]);
  });
});

const tenant = tenantId("tenant-reader-summary-topic-metrics");
const workspace = workspaceId("workspace-reader-summary-topic-metrics");
const period = {
  cadence: "custom" as const,
  startedAt: new Date("2026-07-02T00:00:00.000Z"),
  endedAt: new Date("2026-07-05T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "custom:2026-07-02T00:00:00.000Z:2026-07-05T00:00:00.000Z:UTC",
};

class FakeFeedItems implements FeedItemReadRepositoryPort {
  readonly queries: ListFeedItemsQuery[] = [];

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    this.queries.push(query);
    const normalizedSearch = query.searchQuery?.toLowerCase();

    if (normalizedSearch?.includes("open source") === true) {
      return { items: [item("feed-4", "rss", "Open source repos signal")] };
    }

    if (query.searchQuery === undefined) {
      return {
        items: [
          item("feed-1", "reddit", "AI security signal", {
            normalizedSignal: { score: 12 },
          }),
          item("feed-2", "github-issues", "Excluded provider"),
          item("feed-3", "github-trending-page", "Supplemental board"),
          item("feed-4", "rss", "Open source repos signal"),
        ],
      };
    }

    return {
      items: [
        item("feed-1", "reddit", "AI security signal", {
          normalizedSignal: { score: 12 },
        }),
        item("feed-3", "rss", "AI security RSS signal"),
      ],
    };
  }

  async findById(): Promise<FeedItem | null> {
    return null;
  }
}

const item = (
  id: string,
  providerKey: string,
  title: string,
  providerMetadata: JsonObject | undefined = undefined,
): FeedItem =>
  FeedItem.publish({
    id,
    tenantId: tenant,
    workspaceId: workspace,
    interestId: "interest-ai-security",
    sourceItemId: `source-${id}`,
    sourceBindingId: `binding-${providerKey}`,
    providerKey,
    canonicalUrl: `https://example.test/${id}`,
    title,
    bodyPreview: "Topic collection metrics test item.",
    publishedAt: period.startedAt,
    observedAt: period.startedAt,
    providerMetadata,
  });
