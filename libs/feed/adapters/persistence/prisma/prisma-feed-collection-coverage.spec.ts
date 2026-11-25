import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { PrismaFeedClient } from "./prisma-feed-client";
import { readPrismaFeedCollectionCoverage } from "./prisma-feed-collection-coverage";

const query = {
  tenantId: tenantId("11111111-1111-4111-8111-111111111111"),
  workspaceId: workspaceId("22222222-2222-4222-8222-222222222222"),
  interestId: "33333333-3333-4333-8333-333333333333",
  publishedAtOrAfter: new Date("2026-11-03T00:00:00Z"),
  publishedBefore: new Date("2026-11-04T00:00:00Z"),
  observedAtOrBefore: new Date("2026-11-04T12:00:00Z"),
  excludedProviderKeys: ["github-issues", "github-trending-page"],
};

describe("complete feed collection coverage", () => {
  it("binds the full scope and preserves counts beyond the ranking ceiling", async () => {
    const raw = jest.fn().mockResolvedValue([
      { dimension: "total", key: "", label: null, collectedFeedItemCount: 1220,
        lowRelevanceFeedItemCount: 3, mutedFeedItemCount: 2, userRatedFeedItemCount: 1 },
    ]);
    const result = await readPrismaFeedCollectionCoverage({
      $queryRawUnsafe: raw,
    } as unknown as PrismaFeedClient, query);
    expect(result).toEqual([
      { dimension: "total", key: "", collectedFeedItemCount: 1220,
        lowRelevanceFeedItemCount: 3, mutedFeedItemCount: 2, userRatedFeedItemCount: 1 },
    ]);
    expect(raw).toHaveBeenCalledWith(expect.not.stringMatching(/\bLIMIT\b/i),
      query.tenantId, query.workspaceId, query.interestId,
      query.publishedAtOrAfter, query.publishedBefore, query.observedAtOrBefore,
      query.excludedProviderKeys);
  });

  it("refuses adapters without a complete database aggregate capability", async () => {
    await expect(readPrismaFeedCollectionCoverage({} as PrismaFeedClient, query))
      .rejects.toThrow("requires database aggregates");
  });
});
