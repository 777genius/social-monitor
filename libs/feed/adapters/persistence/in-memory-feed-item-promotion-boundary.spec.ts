import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { FeedItem } from "../../domain";
import { InMemoryFeedItemReadRepository } from
  "./in-memory-feed-item-read.repository";

describe("in-memory promotion repository exact physical ceiling", () => {
  it("matches the 99,999/100,000/100,001 production boundaries", async () => {
    const repository = new InMemoryFeedItemReadRepository();
    const startedAt = new Date("2026-08-18T00:00:00.000Z");
    for (let ordinal = 1; ordinal <= 100_001; ordinal += 1) {
      const timestamp = new Date(startedAt.getTime() + ordinal);
      repository.upsert(FeedItem.publish({
        id: `physical-${String(ordinal).padStart(6, "0")}`,
        tenantId: tenantId("tenant-physical-boundary"),
        workspaceId: workspaceId("workspace-physical-boundary"),
        interestId: "interest-physical-boundary",
        sourceItemId: `source-${ordinal}`,
        sourceBindingId: "rss-boundary",
        providerKey: "rss",
        canonicalUrl: `https://rss.test/physical/${ordinal}`,
        title: `Physical source row ${ordinal}`,
        bodyPreview: "An ineligible but unique source row.",
        publishedAt: timestamp,
        observedAt: timestamp,
      }));
    }
    const read = (count: number) => repository.readPromotionSnapshot({
      tenantId: tenantId("tenant-physical-boundary"),
      workspaceId: workspaceId("workspace-physical-boundary"),
      interestId: "interest-physical-boundary",
      timestampPolicy: "published_at",
      windowStartedAt: startedAt,
      windowEndedAt: new Date(startedAt.getTime() + count + 1),
      observedThrough: new Date(startedAt.getTime() + 100_002),
    });

    await expect(read(99_999)).resolves.toMatchObject({
      ok: true, physicalRowsRead: 99_999, exhausted: true,
    });
    await expect(read(100_000)).resolves.toMatchObject({
      ok: true, physicalRowsRead: 100_000, exhausted: true,
    });
    await expect(read(100_001)).resolves.toMatchObject({
      ok: false,
      reason: "physical_row_ceiling_exceeded",
      physicalRowsRead: 100_001,
      exhausted: false,
    });
  }, 60_000);
});
