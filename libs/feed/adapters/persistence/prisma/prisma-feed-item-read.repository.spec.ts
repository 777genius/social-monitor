import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { PrismaFeedClient } from "./prisma-feed-client";
import { PrismaFeedItemReadRepository } from "./prisma-feed-item-read.repository";
import type { PrismaFeedItemRecord } from "./prisma-feed-records";

describe("PrismaFeedItemReadRepository", () => {
  it("orders feed items by provider signal before recency", async () => {
    const prisma = new FakePrismaFeedClient([
      feedRecord({
        id: "00000000-0000-4000-8000-000000000001",
        providerKey: "rss",
        title: "Fresh low-signal RSS item",
        publishedAt: new Date("2026-07-02T11:59:00.000Z"),
      }),
      feedRecord({
        id: "00000000-0000-4000-8000-000000000002",
        providerKey: "reddit",
        title: "Older high-signal Reddit thread",
        publishedAt: new Date("2026-07-02T09:00:00.000Z"),
        providerMetadata: {
          subreddit: "MachineLearning",
          score: 2200,
          numComments: 430,
          upvoteRatio: 0.94,
        },
      }),
    ]);
    const repository = new PrismaFeedItemReadRepository(
      prisma as unknown as PrismaFeedClient,
    );

    const result = await repository.list({
      tenantId: tenantId("00000000-0000-7000-8000-000000000901"),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000902"),
      limit: 2,
    });

    expect(result.items.map((item) => item.toSnapshot().id)).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
    ]);
  });

  it("pushes publication window filters into the database query", async () => {
    const prisma = new FakePrismaFeedClient([]);
    const repository = new PrismaFeedItemReadRepository(
      prisma as unknown as PrismaFeedClient,
    );
    const publishedAtOrAfter = new Date("2026-07-04T00:00:00.000Z");
    const publishedBefore = new Date("2026-07-05T00:00:00.000Z");

    await repository.list({
      tenantId: tenantId("00000000-0000-7000-8000-000000000901"),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000902"),
      publishedAtOrAfter,
      publishedBefore,
      limit: 10,
    });

    expect(prisma.feedItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publishedAt: {
            gte: publishedAtOrAfter,
            lt: publishedBefore,
          },
        }),
      }),
    );
  });

  it("batch-loads original source content without exposing it in feed items", async () => {
    const record = feedRecord({
      id: "00000000-0000-4000-8000-000000000003",
      providerKey: "reddit",
      title: "Sol 5 Ultra usage report",
      publishedAt: new Date("2026-07-02T12:00:00.000Z"),
      sourceItem: {
        body: "Original long source body for adaptive evidence.",
      },
    });
    const prisma = new FakePrismaFeedClient([record]);
    const repository = new PrismaFeedItemReadRepository(
      prisma as unknown as PrismaFeedClient,
    );

    const result = await repository.readSourceContent({
      tenantId: tenantId("00000000-0000-7000-8000-000000000901"),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000902"),
      feedItemIds: [record.id],
    });

    expect(result).toEqual([
      {
        feedItemId: record.id,
        sourceItemId: record.sourceItemId,
        body: "Original long source body for adaptive evidence.",
      },
    ]);
    expect(prisma.feedItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: [record.id] } }),
        include: { sourceItem: { select: { body: true } } },
      }),
    );
  });
});

class FakePrismaFeedClient {
  constructor(private readonly records: readonly PrismaFeedItemRecord[]) {}

  readonly feedItem = {
    upsert: jest.fn(),
    findMany: jest.fn(async () => this.records),
    count: jest.fn(async () => this.records.length),
    findFirst: jest.fn(async () => null),
  };
}

const feedRecord = (
  overrides: Partial<PrismaFeedItemRecord> & {
    readonly id: string;
    readonly providerKey: string;
    readonly title: string;
    readonly publishedAt: Date;
  },
): PrismaFeedItemRecord => ({
  tenantId: "00000000-0000-7000-8000-000000000901",
  workspaceId: "00000000-0000-7000-8000-000000000902",
  interestId: "00000000-0000-7000-8000-000000000903",
  sourceItemId: `10000000-0000-4000-8000-${overrides.id.slice(-12)}`,
  sourceBindingId: `20000000-0000-4000-8000-${overrides.id.slice(-12)}`,
  dedupeKey: `dedupe:${overrides.id}`,
  canonicalUrl: `https://example.test/${overrides.id}`,
  bodyPreview: "Feed item read repository test item.",
  authorHandle: null,
  observedAt: new Date(overrides.publishedAt.getTime() + 60_000),
  status: "VISIBLE",
  createdAt: overrides.publishedAt,
  providerMetadata: null,
  ...overrides,
});
