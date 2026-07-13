import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type {
  XDailyCollectorClientPort,
  XDailyCollectorRequest,
} from "./x-daily-collector-client.port";
import { XTwitterSourceProvider } from "./x-twitter-experimental-daily-source.provider";

describe("XTwitterSourceProvider output budget", () => {
  it("preserves the adaptive target instead of truncating to the first-page plan", async () => {
    const collector = new FortyPostCollector();
    const provider = new XTwitterSourceProvider(collector, {
      now: () => new Date("2026-07-12T23:55:00.000Z"),
    });
    const context = {
      tenantId: tenantId("tenant-x-output-budget"),
      workspaceId: workspaceId("workspace-x-output-budget"),
      sourceBindingId: "binding-x-output-budget",
      scanJobId: "scan-x-output-budget",
      correlationId: "correlation-x-output-budget",
      config: {
        maxItems: 25,
        maxItemsPerQuery: 40,
        searchQueries: ["ai coding"],
        adaptivePagination: {
          enabled: true,
          targetItems: 40,
          maxPages: 1,
          minNewItemsPerPage: 1,
          maxDuplicateRate: 0.9,
        },
      },
    };

    const plan = provider.planScan(
      { mode: "search", query: "coding agents" },
      context,
    );
    const result = await provider.scan(plan, context);

    expect(plan.maxItems).toBe(25);
    expect(result.items).toHaveLength(40);
    expect(new Set(result.items.map((item) => item.externalId)).size).toBe(40);
  });
});

class FortyPostCollector implements XDailyCollectorClientPort {
  async collectDailySearch(
    request: XDailyCollectorRequest,
  ): Promise<
    Awaited<ReturnType<XDailyCollectorClientPort["collectDailySearch"]>>
  > {
    return {
      posts: Array.from({ length: 40 }, (_, index) => ({
        tweetId: `tweet-${index + 1}`,
        canonicalUrl: `https://x.com/test/status/${index + 1}`,
        text: `${request.query} signal ${index + 1}`,
        authorHandle: "test",
        publishedAt: new Date("2026-07-12T12:00:00.000Z"),
        metrics: {
          likes: 100 - index,
          retweets: 10,
          replies: 4,
        },
        mediaUrls: [],
        sourceProduct: "top" as const,
        trendScore: 200 - index,
      })),
      warnings: [],
    };
  }
}
