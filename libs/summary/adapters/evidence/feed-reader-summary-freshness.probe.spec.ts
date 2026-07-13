import type {
  FeedItemReadRepositoryPort,
  ListFeedItemsQuery,
  ListFeedItemsResult,
} from "@social-monitor/feed/ports";
import {
  FixedClock,
  tenantId,
  workspaceId,
} from "@social-monitor/shared-kernel";

import { FeedReaderSummaryFreshnessProbe } from "./feed-reader-summary-freshness.probe";

describe("FeedReaderSummaryFreshnessProbe", () => {
  it("uses the artifact observation cutoff inside the summary period", async () => {
    const feedItems = new RecordingFeedItems();
    const observedThrough = new Date("2026-07-13T08:52:00.000Z");
    const period = {
      cadence: "daily" as const,
      startedAt: new Date("2026-07-12T00:00:00.000Z"),
      endedAt: new Date("2026-07-13T00:00:00.000Z"),
      timezone: "UTC",
      periodKey: "daily:2026-07-12T00:00:00.000Z:2026-07-13T00:00:00.000Z:UTC",
    };

    const result = await new FeedReaderSummaryFreshnessProbe(
      feedItems,
      new FixedClock(new Date("2026-07-13T09:30:00.000Z")),
    ).evaluate({
      tenantId: tenantId("tenant-reader-freshness"),
      workspaceId: workspaceId("workspace-reader-freshness"),
      scope: { type: "workspace" },
      period,
      observedThrough,
      sourceWindow: {
        windowId: "window-reader-freshness",
        startedAt: new Date("2026-07-12T00:10:00.000Z"),
        endedAt: new Date("2026-07-12T23:50:00.000Z"),
        selectedFeedItemIds: [],
        storyClusterIds: [],
      },
    });

    expect(result.status).toBe("fresh");
    expect(feedItems.queries).toEqual([
      expect.objectContaining({
        publishedAtOrAfter: period.startedAt,
        publishedBefore: period.endedAt,
        observedAfter: observedThrough,
        limit: 1,
      }),
    ]);
  });
});

class RecordingFeedItems implements FeedItemReadRepositoryPort {
  readonly queries: ListFeedItemsQuery[] = [];

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    this.queries.push(query);
    return { items: [], nextCursor: undefined };
  }

  async findById() {
    return null;
  }
}
