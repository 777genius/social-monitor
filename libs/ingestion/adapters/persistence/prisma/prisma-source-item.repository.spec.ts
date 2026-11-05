import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  githubTrendingPageRepositoryMetadata,
  sourceItemProviderContentHash,
  SourceItem,
} from "../../../domain";
import { InMemorySourceItemRepository } from "../in-memory-source-item.repository";
import type { PrismaIngestionClient } from "./prisma-ingestion-client";
import type { PrismaSourceItemRecord } from "./prisma-ingestion-records";
import { PrismaSourceItemRepository } from "./prisma-source-item.repository";

describe("PrismaSourceItemRepository", () => {
  it("preloads existing items in one query and deduplicates repeats inside the batch", async () => {
    const existing = record("existing", "00000000-0000-7000-8000-000000000101");
    const records = new Map([[existing.providerItemId, existing]]);
    let findManyCalls = 0;
    let findFirstCalls = 0;
    let createCalls = 0;
    const sourceItem: PrismaIngestionClient["sourceItem"] = {
      findMany: async (args) => {
        findManyCalls += 1;
        return [...records.values()].filter((item) =>
          args.where.providerItemId.in.includes(item.providerItemId),
        );
      },
      findFirst: async (args) => {
        findFirstCalls += 1;
        return records.get(args.where.providerItemId) ?? null;
      },
      create: async (args) => {
        createCalls += 1;
        const created: PrismaSourceItemRecord = {
          ...args.data,
          authorHandle: args.data.authorHandle ?? null,
          createdAt: new Date("2026-07-11T00:00:00.000Z"),
        };
        records.set(created.providerItemId, created);
        return created;
      },
      update: async (args) => {
        const existingRecord = records.get(
          [...records.values()].find((entry) => entry.id === args.where.id)
            ?.providerItemId ?? "",
        );
        if (existingRecord === undefined) {
          throw new Error("missing source record");
        }
        const updated = { ...existingRecord, ...args.data };
        records.set(updated.providerItemId, updated);
        return updated;
      },
    };
    const repository = new PrismaSourceItemRepository({
      sourceItem,
    } as unknown as PrismaIngestionClient);

    const result = await repository.saveBatch({
      tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
      providerKey: "x-twitter",
      items: [
        source("existing", "00000000-0000-7000-8000-000000000201"),
        source("new", "00000000-0000-7000-8000-000000000202"),
        source("new", "00000000-0000-7000-8000-000000000203"),
      ],
    });

    expect(result).toMatchObject({
      inserted: 1,
      contentUpdated: 1,
      skippedDuplicates: 1,
    });
    expect(findManyCalls).toBe(1);
    expect(findFirstCalls).toBe(0);
    expect(createCalls).toBe(1);
  });

  it("rolls back pending rows before exact P2002 replay of a multi-item batch", async () => {
    const prisma = new RacingTransactionalSourceItemClient();
    const repository = new PrismaSourceItemRepository(
      prisma as unknown as PrismaIngestionClient,
    );

    const result = await repository.saveBatch({
      tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
      providerKey: "x-twitter",
      items: [
        source("race-1", "00000000-0000-7000-8000-000000000211"),
        source("race-2", "00000000-0000-7000-8000-000000000212"),
        source("race-3", "00000000-0000-7000-8000-000000000213"),
      ],
    });

    expect(prisma.isolationLevels).toEqual(["Serializable", "Serializable"]);
    expect(prisma.afterFirstRollback.map((entry) => entry.providerItemId)).toEqual([
      "race-2",
    ]);
    expect(prisma.afterFirstRollback).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ providerItemId: "race-1" }),
      ]),
    );
    expect(result).toMatchObject({
      inserted: 2,
      contentUpdated: 0,
      skippedDuplicates: 1,
    });
    expect(result.items.map((item) => item.externalId)).toEqual([
      "race-1",
      "race-2",
      "race-3",
    ]);
    expect(
      new Set(
        prisma.records.map((entry) => entry.observedAt.toISOString()),
      ),
    ).toEqual(new Set(["2026-07-11T00:00:00.000Z"]));
  });

  it("fails a cross-observation P2002 replay atomically with memory parity", async () => {
    const incomingObservedAt = new Date("2026-07-11T08:00:00.000Z");
    const competingObservedAt = new Date("2026-07-11T09:00:00.000Z");
    const checkedAt = new Date("2026-07-10T12:00:00.000Z");
    const incomingItems = [1, 2, 3].map((rank) =>
      githubSnapshotSourceItem({
        id: `00000000-0000-7000-8000-00000000031${rank}`,
        ingestedAt: incomingObservedAt,
        checkedAt,
        rank,
      }),
    );
    const competingItems = [1, 2, 3].map((rank) =>
      githubSnapshotSourceItem({
        id: `00000000-0000-7000-8000-00000000032${rank}`,
        ingestedAt: competingObservedAt,
        checkedAt,
        rank,
      }),
    );
    const command = (items: readonly SourceItem[]) => ({
      tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
      providerKey: "github-trending-page",
      items,
    });
    const conflictedExternalId =
      incomingItems[1]!.toSnapshot().externalId;
    const prismaClient = new RacingTransactionalSourceItemClient(
      conflictedExternalId,
      competingObservedAt,
    );
    const prisma = new PrismaSourceItemRepository(
      prismaClient as unknown as PrismaIngestionClient,
    );
    const memory = new InMemorySourceItemRepository();
    await memory.saveBatch(command(competingItems));

    await expect(prisma.saveBatch(command(incomingItems))).rejects.toThrow(
      "GitHub Trending snapshot conflicts with a durable row from a different observation envelope",
    );
    await expect(memory.saveBatch(command(incomingItems))).rejects.toThrow(
      "GitHub Trending snapshot conflicts with a durable row from a different observation envelope",
    );

    expect(prismaClient.isolationLevels).toEqual([
      "Serializable",
      "Serializable",
    ]);
    expect(
      prismaClient.records.map((entry) => ({
        externalId: entry.providerItemId,
        observedAt: entry.observedAt.toISOString(),
      })),
    ).toEqual([
      {
        externalId: conflictedExternalId,
        observedAt: competingObservedAt.toISOString(),
      },
    ]);
    expect(
      new Set(
        memory
          .all()
          .map((item) => item.toSnapshot().ingestedAt.toISOString()),
      ),
    ).toEqual(new Set([competingObservedAt.toISOString()]));
  });

  it("keeps memory and Prisma exact replay identity and observation envelopes identical", async () => {
    const prismaClient = new ParityPrismaSourceItemClient();
    const prisma = new PrismaSourceItemRepository(
      prismaClient as unknown as PrismaIngestionClient,
    );
    const memory = new InMemorySourceItemRepository();
    const first = githubSnapshotSourceItem({
      id: "00000000-0000-7000-8000-000000000301",
      ingestedAt: new Date("2026-07-11T08:00:00.000Z"),
      checkedAt: new Date("2026-07-10T12:00:00.000Z"),
    });
    const retry = githubSnapshotSourceItem({
      id: "00000000-0000-7000-8000-000000000302",
      ingestedAt: new Date("2026-07-11T08:00:00.000Z"),
      checkedAt: new Date("2026-07-10T12:00:00.000Z"),
    });
    const command = (item: SourceItem) => ({
      tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
      workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
      providerKey: "github-trending-page",
      items: [item],
    });

    await memory.saveBatch(command(first));
    await prisma.saveBatch(command(first));
    const memoryRetry = await memory.saveBatch(command(retry));
    const prismaRetry = await prisma.saveBatch(command(retry));
    const memorySnapshot = memoryRetry.items[0]!.persistedItem.toSnapshot();
    const prismaSnapshot = prismaRetry.items[0]!.persistedItem.toSnapshot();

    expect(
      sourceItemProviderContentHash({
        providerKey: "github-trending-page",
        snapshot: first.toSnapshot(),
      }),
    ).toBe("b".repeat(64));

    expect(memoryRetry).toMatchObject({
      inserted: 0,
      contentUpdated: 0,
      skippedDuplicates: 1,
      items: [{ mutationKind: "unchanged" }],
    });
    expect(prismaRetry).toMatchObject({
      inserted: 0,
      contentUpdated: 0,
      skippedDuplicates: 1,
      items: [{ mutationKind: "unchanged" }],
    });
    expect(prismaSnapshot).toEqual(memorySnapshot);
    expect(prismaSnapshot.id).toBe(
      "00000000-0000-7000-8000-000000000301",
    );
    expect(prismaSnapshot.ingestedAt).toEqual(
      new Date("2026-07-11T08:00:00.000Z"),
    );
    expect(prismaSnapshot.publishedAt).toEqual(
      new Date("2026-07-10T12:00:00.000Z"),
    );
  });
});

class ParityPrismaSourceItemClient {
  private readonly records = new Map<string, PrismaSourceItemRecord>();

  readonly sourceItem = {
    findMany: async (args: {
      readonly where: {
        readonly providerItemId: { readonly in: readonly string[] };
      };
    }) =>
      [...this.records.values()].filter((entry) =>
        args.where.providerItemId.in.includes(entry.providerItemId),
      ),
    findFirst: async (args: {
      readonly where: { readonly providerItemId: string };
    }) => this.records.get(args.where.providerItemId) ?? null,
    create: async (args: {
      readonly data: Omit<PrismaSourceItemRecord, "createdAt">;
    }) => {
      const created = {
        ...args.data,
        createdAt: args.data.observedAt,
      } satisfies PrismaSourceItemRecord;
      this.records.set(created.providerItemId, created);
      return created;
    },
    update: async (args: {
      readonly where: { readonly id: string };
      readonly data: Partial<PrismaSourceItemRecord>;
    }) => {
      const existing = [...this.records.values()].find(
        (entry) => entry.id === args.where.id,
      );
      if (existing === undefined) {
        throw new Error("missing parity source record");
      }
      const updated = { ...existing, ...args.data };
      this.records.set(updated.providerItemId, updated);
      return updated;
    },
  };
}

class RacingTransactionalSourceItemClient {
  private committed = new Map<string, PrismaSourceItemRecord>();
  private raced = false;
  readonly isolationLevels: string[] = [];
  afterFirstRollback: readonly PrismaSourceItemRecord[] = [];

  constructor(
    private readonly conflictedProviderItemId = "race-2",
    private readonly competingObservedAt?: Date,
  ) {}

  get records(): readonly PrismaSourceItemRecord[] {
    return [...this.committed.values()];
  }

  readonly $transaction = async <Result>(
    operation: (transaction: PrismaIngestionClient) => Promise<Result>,
    options: { readonly isolationLevel: string },
  ): Promise<Result> => {
    this.isolationLevels.push(options.isolationLevel);
    const staged = new Map(this.committed);
    const transaction = {
      sourceItem: {
        findMany: async (args: {
          readonly where: {
            readonly providerItemId: { readonly in: readonly string[] };
          };
        }) =>
          [...staged.values()].filter((entry) =>
            args.where.providerItemId.in.includes(entry.providerItemId),
          ),
        findFirst: async (args: {
          readonly where: { readonly providerItemId: string };
        }) => staged.get(args.where.providerItemId) ?? null,
        create: async (args: {
          readonly data: Omit<PrismaSourceItemRecord, "createdAt">;
        }) => {
          const created: PrismaSourceItemRecord = {
            ...args.data,
            createdAt: new Date("2026-07-11T00:00:00.000Z"),
          };
          if (
            created.providerItemId === this.conflictedProviderItemId &&
            !this.raced
          ) {
            this.raced = true;
            this.committed.set(created.providerItemId, {
              ...created,
              observedAt: this.competingObservedAt ?? created.observedAt,
            });
            throw { code: "P2002" };
          }
          staged.set(created.providerItemId, created);
          return created;
        },
        update: async (args: {
          readonly where: { readonly id: string };
          readonly data: Partial<PrismaSourceItemRecord>;
        }) => {
          const existing = [...staged.values()].find(
            (entry) => entry.id === args.where.id,
          );
          if (existing === undefined) {
            throw new Error("missing staged source record");
          }
          const updated = { ...existing, ...args.data };
          staged.set(updated.providerItemId, updated);
          return updated;
        },
      },
    } as unknown as PrismaIngestionClient;
    try {
      const result = await operation(transaction);
      this.committed = staged;
      return result;
    } catch (error) {
      if (this.afterFirstRollback.length === 0) {
        this.afterFirstRollback = [...this.committed.values()];
      }
      throw error;
    }
  };
}

const source = (externalId: string, id: string): SourceItem =>
  SourceItem.ingest({
    id,
    tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
    workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
    sourceBindingId: "00000000-0000-7000-8000-000000000004",
    externalId,
    canonicalUrl: `https://x.com/builder/status/${externalId}`,
    title: `Post ${externalId}`,
    body: `Body ${externalId}`,
    publishedAt: new Date("2026-07-10T12:00:00.000Z"),
    ingestedAt: new Date("2026-07-11T00:00:00.000Z"),
  });

const githubSnapshotSourceItem = (params: {
  readonly id: string;
  readonly ingestedAt: Date;
  readonly checkedAt: Date;
  readonly rank?: number;
}): SourceItem => {
  const rank = params.rank ?? 1;
  const repository =
    rank === 1 ? "owner/repository" : `owner/repository-${rank}`;
  const fetchStartedAt = new Date(params.checkedAt.getTime() - 60_000);
  return SourceItem.ingest({
    id: params.id,
    tenantId: tenantId("00000000-0000-7000-8000-000000000001"),
    workspaceId: workspaceId("00000000-0000-7000-8000-000000000002"),
    sourceBindingId: "00000000-0000-7000-8000-000000000004",
    externalId:
      `github-trending-page:daily:scan-github-parity:${repository}`,
    canonicalUrl: `https://github.com/${repository}`,
    title: `${repository} is #${rank} on GitHub Trending`,
    body: "Repository snapshot",
    publishedAt: params.checkedAt,
    ingestedAt: params.ingestedAt,
    metadata: githubTrendingPageRepositoryMetadata({
      repository: {
        fullName: repository,
        url: `https://github.com/${repository}`,
        totalStars: 20_000,
        forksCount: 500,
      },
      trending: {
        rank,
        starsGained: 1_500,
        window: "daily",
        scanJobId: "scan-github-parity",
        fetchStartedAt,
        checkedAt: params.checkedAt,
        snapshotContentHash: "b".repeat(64),
        source: "fixture_github_trending_html",
      },
    }),
  });
};

const record = (
  providerItemId: string,
  id: string,
): PrismaSourceItemRecord => ({
  id,
  tenantId: "00000000-0000-7000-8000-000000000001",
  workspaceId: "00000000-0000-7000-8000-000000000002",
  sourceBindingId: "00000000-0000-7000-8000-000000000004",
  providerKey: "x-twitter",
  providerItemId,
  canonicalUrl: `https://x.com/builder/status/${providerItemId}`,
  title: `Post ${providerItemId}`,
  body: `Body ${providerItemId}`,
  authorHandle: "builder",
  publishedAt: new Date("2026-07-10T12:00:00.000Z"),
  contentHash: "legacy-content-hash",
  providerContentHash: null,
  observedAt: new Date("2026-07-11T00:00:00.000Z"),
  lastObservedAt: null,
  contentUpdatedAt: null,
  createdAt: new Date("2026-07-11T00:00:00.000Z"),
  metadata: {},
});
