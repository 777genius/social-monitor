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
    const hydrated = new Map<string, PrismaFeedItemRecord>();
    const setReadOnly = jest.fn().mockResolvedValue(0);
    const queryRaw = jest.fn(async <Result>(query: string, ...values: unknown[]) => {
      if (query.includes('AS "hasPotentialCandidates"')) {
        return [{ hasPotentialCandidates: true }] as Result;
      }
      if (query.includes('AS "cursorTimestamp"')) {
        const page = await transactionFindMany(keysetPageArgs(query, values));
        for (const item of page) hydrated.set(item.id, item);
        return page.map((item) => keysetRow(item, query)) as Result;
      }
      const ids = values[0] as readonly string[];
      return ids.map(exactEvidence) as Result;
    });
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
        $queryRawUnsafe: queryRaw as PrismaFeedClient["$queryRawUnsafe"],
        feedItem: {
          findMany: async (
            args: Parameters<PrismaFeedClient["feedItem"]["findMany"]>[0],
          ) => (args.where.id?.in ?? []).flatMap((id: string) => {
            const item = hydrated.get(id); return item === undefined ? [] : [item];
          }),
          count: async () => 201,
        },
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
    expect(result.ok && result.candidates[0]?.metricAuthority).toEqual({
      observedAt: new Date("2026-08-19T10:30:00.000Z"),
      regressionState: "stable",
    });
    expect(result.ok && result.sourceContent?.[0]).toMatchObject({
      feedItemId: records[0]!.id,
      sourceItemId: records[0]!.sourceItemId,
      body: `Original source body for ${records[0]!.id}`,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(setReadOnly.mock.calls).toEqual([
      ["SET TRANSACTION READ ONLY"],
      ["SET LOCAL enable_seqscan = off"],
      ["SET LOCAL enable_sort = off"],
    ]);
    expect(transactionFindMany).toHaveBeenCalledTimes(2);
    expect(setReadOnly.mock.invocationCallOrder[2]).toBeLessThan(
      findManyMock.mock.invocationCallOrder[0] as number,
    );
    expect(findManyMock.mock.calls[0]?.[0].orderBy).toEqual([
      { publishedAt: "desc" }, { id: "desc" },
    ]);
    expect(findManyMock.mock.calls[0]?.[0].include).toBeUndefined();
    expect(findManyMock.mock.calls[1]?.[0]).toMatchObject({
      cursor: { id: records[199]!.id },
      skip: 1,
    });
    expect(findManyMock.mock.calls[1]?.[0].where.observedAt).toBeUndefined();
    const keysetCalls = queryRaw.mock.calls.filter(([sql]) =>
      sql.includes('AS "cursorTimestamp"'));
    expect(keysetCalls).toHaveLength(2);
    expect(keysetCalls[0]?.[0]).toContain(
      'feed."status" = \'VISIBLE\'::"FeedItemStatus"',
    );
    expect(keysetCalls[0]?.[9]).toBe(200);
    expect(keysetCalls[1]?.[8]).toBe(records[199]!.id);
    const exactCalls = queryRaw.mock.calls.filter(([sql]) =>
      sql.includes('AS "engagementObservedAt"'));
    expect(exactCalls).toHaveLength(2);
    expect(exactCalls[0]?.[0]).toContain(
      "source_item_engagement_snapshots engagement",
    );
    expect(exactCalls[0]?.[0]).toContain(
      "source_item_engagement_observations observation",
    );
  });

  it("fails closed when the transaction capability is unavailable", async () => {
    const repository = new PrismaFeedItemReadRepository({} as PrismaFeedClient);
    await expect(repository.readPromotionSnapshot(snapshotQuery()))
      .rejects.toThrow("Repeatable-read promotion snapshot is unavailable");
  });

  it("fails at the physical ceiling before paging candidate rows", async () => {
    const findMany = jest.fn();
    const queryRaw = jest.fn();
    const repository = preflightRepository({
      physicalRowsRead: 100_001,
      hasPotentialCandidates: true,
      findMany,
      queryRaw,
    });

    await expect(repository.readPromotionSnapshot(snapshotQuery()))
      .resolves.toMatchObject({
        ok: false,
        reason: "physical_row_ceiling_exceeded",
        physicalRowsRead: 100_001,
      });
    expect(findMany).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("does not hydrate an unsupported-provider-only window", async () => {
    const findMany = jest.fn();
    const repository = preflightRepository({
      physicalRowsRead: 99_999,
      hasPotentialCandidates: false,
      findMany,
    });

    await expect(repository.readPromotionSnapshot(snapshotQuery()))
      .resolves.toMatchObject({
        ok: true,
        candidates: [],
        sourceContent: [],
        physicalRowsRead: 99_999,
      });
    expect(findMany).not.toHaveBeenCalled();
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
  if (args.orderBy === undefined) {
    throw new Error("Semantic keyset fixture requires deterministic ordering");
  }
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
): PrismaFeedItemReadRepository => {
  const hydrated = new Map<string, PrismaFeedItemRecord>();
  return new PrismaFeedItemReadRepository({
    $transaction: async <Result>(
      operation: (transaction: PrismaFeedClient) => Promise<Result>,
    ) => operation({
      $executeRawUnsafe: async () => 0,
      $queryRawUnsafe: async <RawResult>(query: string, ...values: unknown[]) => {
        if (query.includes('AS "hasPotentialCandidates"')) {
          return [{ hasPotentialCandidates: true }] as RawResult;
        }
        if (query.includes('AS "cursorTimestamp"')) {
          const page = await findMany(keysetPageArgs(query, values));
          for (const item of page) hydrated.set(item.id, item);
          return page.map((item) => keysetRow(item, query)) as RawResult;
        }
        const ids = values[0] as readonly string[];
        return ids.map((id) => ({
          ...exactEvidence(id),
          observedThrough: !id.startsWith("future-") && !postCutoffIds.has(id),
        })) as RawResult;
      },
      feedItem: {
        findMany: async (
          args: Parameters<PrismaFeedClient["feedItem"]["findMany"]>[0],
        ) => (args.where.id?.in ?? []).flatMap((id: string) => {
          const item = hydrated.get(id); return item === undefined ? [] : [item];
        }),
        count: async () => 1,
      },
    } as unknown as PrismaFeedClient),
  } as unknown as PrismaFeedClient);
};

const preflightRepository = (params: {
  readonly physicalRowsRead: number;
  readonly hasPotentialCandidates: boolean;
  readonly findMany: jest.Mock;
  readonly queryRaw?: jest.Mock;
}): PrismaFeedItemReadRepository => new PrismaFeedItemReadRepository({
  $transaction: async <Result>(
    operation: (transaction: PrismaFeedClient) => Promise<Result>,
  ) => operation({
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: (params.queryRaw ?? jest.fn(async () => [{
      hasPotentialCandidates: params.hasPotentialCandidates,
    }])) as PrismaFeedClient["$queryRawUnsafe"],
    feedItem: {
      count: async () => params.physicalRowsRead,
      findMany: params.findMany as PrismaFeedClient["feedItem"]["findMany"],
    },
  } as unknown as PrismaFeedClient),
} as unknown as PrismaFeedClient);

const keysetPageArgs = (
  query: string,
  values: readonly unknown[],
): Parameters<PrismaFeedClient["feedItem"]["findMany"]>[0] => {
  const timestampPolicy = query.includes('ORDER BY feed."published_at"')
    ? "published_at" as const
    : "observed_at" as const;
  const timestampKey = timestampPolicy === "published_at"
    ? "publishedAt" as const
    : "observedAt" as const;
  const afterId = values[7] as string | null;
  return {
    where: {
      tenantId: values[0] as string,
      workspaceId: values[1] as string,
      status: "VISIBLE",
      interestId: (values[2] as string | null) ?? undefined,
      publishedAt: timestampPolicy === "published_at"
        ? { gte: values[3] as Date, lt: values[4] as Date }
        : undefined,
      observedAt: timestampPolicy === "observed_at"
        ? { gte: values[3] as Date, lt: values[4] as Date,
            lte: values[5] as Date }
        : undefined,
    },
    orderBy: timestampKey === "publishedAt"
      ? [{ publishedAt: "desc" }, { id: "desc" }]
      : [{ observedAt: "desc" }, { id: "desc" }],
    ...(afterId === null ? {} : { cursor: { id: afterId }, skip: 1 }),
    take: values[8] as number,
  };
};

const keysetRow = (item: PrismaFeedItemRecord, query: string) => ({
  id: item.id,
  cursorTimestamp: exactTimestamp(query.includes('ORDER BY feed."published_at"')
    ? item.publishedAt
    : item.observedAt),
});

const exactEvidence = (id: string) => ({
  id,
  sourceItemId: `source-${id}`,
  body: `Original source body for ${id}`,
  publishedAt: "2026-08-19T10:00:00.000000Z",
  observedAt: "2026-08-19T10:00:00.000000Z",
  observedThrough: true,
  engagementObservedAt: "2026-08-19T10:30:00.000000Z",
  engagementChangedAt: "2026-08-19T10:30:00.000000Z",
  engagementMetricsHash: `metrics-${id}`,
  currentHasRegressionFromLatest: false,
  latestObservationAt: "2026-08-19T10:30:00.000000Z",
  latestObservationMetricsHash: `metrics-${id}`,
  latestObservationHasRegression: false,
  previousObservationAt: null,
  previousObservationMetricsHash: null,
  previousObservationHasRegression: null,
});

const exactTimestamp = (value: Date): string =>
  value.toISOString().replace(".000Z", ".000000Z");

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
