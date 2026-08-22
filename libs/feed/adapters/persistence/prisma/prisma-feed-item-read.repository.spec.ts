import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { InMemoryFeedItemReadRepository } from
  "../in-memory-feed-item-read.repository";
import type { PrismaFeedClient } from "./prisma-feed-client";
import { PrismaFeedItemReadRepository } from
  "./prisma-feed-item-read.repository";
import {
  feedItemFromPrisma,
  type PrismaFeedItemRecord,
} from "./prisma-feed-records";

describe("PrismaFeedItemReadRepository promotion snapshot", () => {
  it("uses one repeatable-read transaction for all physical pages", async () => {
    const records = Array.from({ length: 201 }, (_, index) =>
      record(`item-${String(201 - index).padStart(3, "0")}`, 201 - index));
    const findManyMock = jest
      .fn()
      .mockResolvedValueOnce(records.slice(0, 200))
      .mockResolvedValueOnce(records.slice(200));
    const transactionFindMany = findManyMock as unknown as
      PrismaFeedClient["feedItem"]["findMany"];
    const setReadOnly = jest.fn().mockResolvedValue(0);
    const transaction = jest.fn(async (
      operation: (client: PrismaFeedClient) => Promise<unknown>,
      options: { readonly isolationLevel: string },
    ) => {
      expect(options).toMatchObject({
        isolationLevel: "RepeatableRead",
        timeout: 30_000,
      });
      return operation({
        $executeRawUnsafe: setReadOnly,
        $queryRawUnsafe: async <Result>(query: string, ids: readonly string[]) =>
          ids.map((id) => ({ id,
            publishedAt: "2026-08-19T10:00:00.000000Z",
            observedAt: "2026-08-19T10:00:00.000000Z",
            observedThrough: true })) as Result,
        feedItem: { findMany: transactionFindMany },
      } as unknown as PrismaFeedClient);
    });
    const repository = new PrismaFeedItemReadRepository({
      $transaction: transaction,
    } as unknown as PrismaFeedClient);

    const result = await repository.readPromotionSnapshot(snapshotQuery());

    expect(result).toMatchObject({
      ok: true,
      physicalRowsRead: 201,
      exhausted: true,
    });
    expect(result.ok && result.candidates.map((candidate) =>
      candidate.item.toSnapshot().id)).toEqual(records.map((item) => item.id));
    expect(result.ok && result.candidates[0]?.exactTimestamps).toEqual({
      publishedAt: "2026-08-19T10:00:00.000000Z",
      observedAt: "2026-08-19T10:00:00.000000Z",
    });
    expect(result.ok && result.sourceContent?.[0]).toMatchObject({
      feedItemId: records[0]!.id,
      sourceItemId: records[0]!.sourceItemId,
      body: `Original source body for ${records[0]!.id}`,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(setReadOnly).toHaveBeenCalledWith("SET TRANSACTION READ ONLY");
    expect(transactionFindMany).toHaveBeenCalledTimes(2);
    expect(setReadOnly.mock.invocationCallOrder[0]).toBeLessThan(
      findManyMock.mock.invocationCallOrder[0] as number,
    );
    expect(findManyMock.mock.calls[0]?.[0].orderBy).toEqual([
      { publishedAt: "desc" }, { id: "desc" },
    ]);
    expect(findManyMock.mock.calls[0]?.[0].include).toEqual({
      sourceItem: { select: { body: true } },
    });
    expect(findManyMock.mock.calls[1]?.[0]).toMatchObject({
      cursor: { id: records[199]!.id },
      skip: 1,
    });
    expect(findManyMock.mock.calls[1]?.[0].where.observedAt).toBeUndefined();
  });

  it("fails closed when the transaction capability is unavailable", async () => {
    const repository = new PrismaFeedItemReadRepository({} as PrismaFeedClient);
    await expect(repository.readPromotionSnapshot(snapshotQuery()))
      .rejects.toThrow("Repeatable-read promotion snapshot is unavailable");
  });

  it.each([
    [99_999, true, 99_999],
    [100_000, true, 100_000],
    [100_001, false, 100_001],
  ] as const)(
    "enforces the exact %i-row physical boundary without repeated lookahead",
    async (total, expectedOk, expectedReads) => {
      const findMany = pagedRecords(total, "rss");
      const repository = transactionRepository(findMany);

      const result = await repository.readPromotionSnapshot(snapshotQuery());

      expect(result.ok).toBe(expectedOk);
      expect(result.physicalRowsRead).toBe(expectedReads);
      expect(result.exhausted).toBe(expectedOk);
      if (!expectedOk) {
        expect(result).toMatchObject({
          reason: "physical_row_ceiling_exceeded",
          eligibleItemCount: 0,
        });
      }
    },
    60_000,
  );

  it("fails closed after the 1,001st canonical eligible item", async () => {
    const repository = transactionRepository(pagedRecords(1_001, "reddit"));

    await expect(repository.readPromotionSnapshot(snapshotQuery()))
      .resolves.toMatchObject({
        ok: false,
        reason: "eligible_item_ceiling_exceeded",
        eligibleItemCount: 1_001,
      });
  });

  it("counts leading published-order post-cutoff noise as visited work", async () => {
    const future = Array.from({ length: 201 }, (_, index) => ({
      ...record(`future-${index}`, 400 - index),
      publishedAt: new Date(Date.parse("2026-08-19T11:00:00.000Z") - index),
      observedAt: new Date("2026-08-20T00:00:00.000001Z"),
    }));
    const eligible = {
      ...record("eligible", 1),
      publishedAt: new Date("2026-08-19T10:00:00.000Z"),
      observedAt: new Date("2026-08-19T10:00:00.000Z"),
    };
    const repository = transactionRepository(semanticFindMany([...future, eligible]));

    await expect(repository.readPromotionSnapshot(snapshotQuery()))
      .resolves.toMatchObject({
        ok: true,
        physicalRowsRead: 202,
        candidates: [{ item: expect.anything() }],
      });
  });

  it("returns GitHub trending context from the same exhausted snapshot", async () => {
    const trending = {
      ...record("trending-context", 1, "github-trending-page"),
      publishedAt: new Date("2026-08-19T10:00:00.000Z"),
      observedAt: new Date("2026-08-19T10:01:00.000Z"),
    };
    const findMany = semanticFindMany([trending]);
    const result = await transactionRepository(findMany)
      .readPromotionSnapshot(snapshotQuery());

    expect(result).toMatchObject({
      ok: true,
      physicalRowsRead: 1,
      candidates: [],
      supplementalItems: [expect.anything()],
    });
    expect(result.ok && result.supplementalItems?.[0]?.toSnapshot().id)
      .toBe("trending-context");
  });

  it("uses the one-row probe on post-cutoff noise at the physical ceiling", async () => {
    const result = await transactionRepository(
      pagedRecords(100_001, "reddit", true),
    ).readPromotionSnapshot(snapshotQuery());
    expect(result).toMatchObject({
      ok: false,
      reason: "physical_row_ceiling_exceeded",
      physicalRowsRead: 100_001,
      eligibleItemCount: 0,
    });
  }, 60_000);

  it.each(["published_at", "observed_at"] as const)(
    "matches the in-memory conformance result for %s ties and interest scope",
    async (timestampPolicy) => {
      const records = [
        conformanceRecord("tie-b", "interest-1", 10, 20),
        conformanceRecord("tie-a", "interest-1", 10, 30),
        conformanceRecord("other-interest", "interest-2", 40, 10),
      ];
      const inMemory = new InMemoryFeedItemReadRepository();
      for (const item of records.map(feedItemFromPrisma)) inMemory.upsert(item);
      const prisma = transactionRepository(semanticFindMany(records));
      const query = {
        ...snapshotQuery(),
        interestId: "interest-1",
        timestampPolicy,
      };

      const [actual, expected] = await Promise.all([
        prisma.readPromotionSnapshot(query),
        inMemory.readPromotionSnapshot(query),
      ]);

      expect(snapshotCandidateIds(actual)).toEqual(snapshotCandidateIds(expected));
      expect(actual.physicalRowsRead).toBe(expected.physicalRowsRead);
    },
  );
});

const snapshotCandidateIds = (
  result: Awaited<ReturnType<PrismaFeedItemReadRepository["readPromotionSnapshot"]>>,
): readonly string[] => result.ok
  ? result.candidates.map(({ item }) => item.toSnapshot().id)
  : [];

const semanticFindMany = (
  records: readonly PrismaFeedItemRecord[],
): PrismaFeedClient["feedItem"]["findMany"] => async (args) => {
  const timestampKey = "publishedAt" in args.orderBy[0]
    ? "publishedAt" as const
    : "observedAt" as const;
  const range = args.where[timestampKey];
  const sorted = records.filter((item) =>
    item.tenantId === args.where.tenantId &&
    item.workspaceId === args.where.workspaceId &&
    (args.where.interestId === undefined ||
      item.interestId === args.where.interestId) &&
    (range?.gte === undefined || item[timestampKey] >= range.gte) &&
    (range?.lt === undefined || item[timestampKey] < range.lt) &&
    (args.where.observedAt?.lte === undefined ||
      item.observedAt <= args.where.observedAt.lte) &&
    (args.where.observedAt?.lt === undefined ||
      item.observedAt < args.where.observedAt.lt)
  ).sort((left, right) =>
    right[timestampKey].getTime() - left[timestampKey].getTime() ||
    right.id.localeCompare(left.id));
  const cursorIndex = args.cursor === undefined
    ? -1
    : sorted.findIndex((item) => item.id === args.cursor?.id);
  const start = cursorIndex < 0 ? 0 : cursorIndex + (args.skip ?? 0);
  return sorted.slice(start, start + args.take);
};

const conformanceRecord = (
  id: string,
  interestId: string,
  publishedMinute: number,
  observedMinute: number,
): PrismaFeedItemRecord => ({
  ...record(id, 1),
  interestId,
  publishedAt: new Date(`2026-08-18T10:${String(publishedMinute).padStart(2, "0")}:00.000Z`),
  observedAt: new Date(`2026-08-18T11:${String(observedMinute).padStart(2, "0")}:00.000Z`),
});

const transactionRepository = (
  findMany: PrismaFeedClient["feedItem"]["findMany"],
): PrismaFeedItemReadRepository => new PrismaFeedItemReadRepository({
  $transaction: async <Result>(
    operation: (transaction: PrismaFeedClient) => Promise<Result>,
  ) => operation({
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async <Result>(query: string, ids: readonly string[]) =>
      ids.map((id) => ({ id,
        publishedAt: "2026-08-19T10:00:00.000000Z",
        observedAt: "2026-08-19T10:00:00.000000Z",
        observedThrough: !id.startsWith("future-") && !postCutoffIds.has(id),
      })) as Result,
    feedItem: { findMany },
  } as unknown as PrismaFeedClient),
} as unknown as PrismaFeedClient);

const postCutoffIds = new Set<string>();

const pagedRecords = (
  total: number,
  providerKey: "reddit" | "rss",
  postCutoff = false,
): PrismaFeedClient["feedItem"]["findMany"] => {
  let produced = 0;
  return async ({ take }) => {
    const count = Math.min(take, total - produced);
    const records = Array.from({ length: count }, (_, index) => {
      const ordinal = total - produced - index;
      const item = record(
        `item-${String(ordinal).padStart(6, "0")}`,
        ordinal,
        providerKey,
      );
      return postCutoff
        ? (postCutoffIds.add(item.id),
          { ...item, observedAt: new Date("2026-08-20T00:00:00.001Z") })
        : item;
    });
    produced += count;
    return records;
  };
};

const snapshotQuery = () => ({
  tenantId: tenantId("tenant-1"),
  workspaceId: workspaceId("workspace-1"),
  timestampPolicy: "published_at" as const,
  windowStartedAt: new Date("2026-08-18T00:00:00.000Z"),
  windowEndedAt: new Date("2026-08-20T00:00:00.000Z"),
  observedThrough: new Date("2026-08-19T23:59:59.999Z"),
});

const record = (
  id: string,
  minute: number,
  providerKey: "reddit" | "rss" | "github-trending-page" = "reddit",
): PrismaFeedItemRecord => ({
  id,
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  interestId: "interest-1",
  sourceItemId: `source-${id}`,
  sourceBindingId: "binding-1",
  providerKey,
  dedupeKey: id,
  canonicalUrl: `https://reddit.test/${id}`,
  title: id,
  bodyPreview: "Canonical promotion candidate",
  authorHandle: null,
  publishedAt: new Date(1_776_729_600_000 + minute * 1_000),
  observedAt: new Date(1_776_729_600_500 + minute * 1_000),
  status: "VISIBLE",
  createdAt: new Date("2026-08-19T01:00:00.000Z"),
  providerMetadata: providerKey === "reddit" ? {
    kind: "reddit_post", score: minute, comments: 1,
  } : null,
  sourceItem: { body: `Original source body for ${id}` },
});
