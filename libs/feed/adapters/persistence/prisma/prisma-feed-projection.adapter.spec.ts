import {
  githubTrendingPageRepositoryMetadata,
  SourceItem,
} from "@social-monitor/ingestion/domain";
import type { ProjectFeedItemsCommand } from "@social-monitor/ingestion/ports";
import type { IdGenerator, JsonObject } from "@social-monitor/shared-kernel";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { InMemoryFeedProjectionAdapter } from "../../../../../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter";
import { InMemoryFeedItemReadRepository } from "../in-memory-feed-item-read.repository";
import type {
  PrismaFeedClient,
  PrismaFeedSignalBaselineSampleRecord,
} from "./prisma-feed-client";
import type { PrismaFeedItemRecord } from "./prisma-feed-records";
import { PrismaFeedProjectionAdapter } from "./prisma-feed-projection.adapter";

const firstObservedAt = new Date("2026-07-16T00:01:33.681Z");
const reprojectedAt = new Date("2026-07-16T01:07:20.000Z");

type FeedItemUpsertArgs = Parameters<
  PrismaFeedClient["feedItem"]["upsert"]
>[0];
type FeedItemUpdateArgs = Parameters<
  NonNullable<PrismaFeedClient["feedItem"]["update"]>
>[0];
type FeedItemMutableData =
  | FeedItemUpsertArgs["update"]
  | FeedItemUpdateArgs["data"];
type BaselineUpsertArgs = Parameters<
  PrismaFeedClient["feedSignalBaselineSample"]["upsert"]
>[0];

describe("PrismaFeedProjectionAdapter", () => {
  it.each([
    ["explicit update", true],
    ["upsert update fallback", false],
  ])(
    "keeps feed observedAt create-only through %s and refreshes the current baseline",
    async (_path, supportsExplicitUpdate) => {
      const prisma = new FakePrismaFeedClient(supportsExplicitUpdate);
      const projection = new PrismaFeedProjectionAdapter(
        prisma,
        new SequenceIdGenerator([
          "feed-1",
          "sample-1",
          "unused-feed-2",
          "unused-sample-2",
        ]),
      );
      const command = projectionCommand();

      await projection.project({
        ...command,
        sourceItems: [
          sourceItem({
            title: "Initial title",
            body: "Initial body",
            authorHandle: "initial-author",
            publishedAt: new Date("2026-07-15T23:55:00.000Z"),
            ingestedAt: firstObservedAt,
            metadata: {
              subreddit: "startups",
              score: 4,
              numComments: 1,
              upvoteRatio: 0.6,
            },
          }),
        ],
      });
      await projection.project({
        ...command,
        sourceItems: [
          sourceItem({
            title: "Reprojected title",
            body: "Reprojected body",
            authorHandle: "updated-author",
            publishedAt: new Date("2026-07-16T00:05:00.000Z"),
            ingestedAt: reprojectedAt,
            metadata: {
              subreddit: "startups",
              score: 400,
              numComments: 20,
              upvoteRatio: 0.95,
            },
          }),
        ],
      });

      expect(prisma.feedCreateData).toHaveProperty(
        "observedAt",
        firstObservedAt,
      );
      expect(prisma.feedUpdateData).toMatchObject({
        title: "Reprojected title",
        bodyPreview: "Reprojected body",
        authorHandle: "updated-author",
        publishedAt: new Date("2026-07-16T00:05:00.000Z"),
        providerMetadata: expect.objectContaining({
          subreddit: "startups",
          score: 400,
          numComments: 20,
          upvoteRatio: 0.95,
        }),
      });
      expect(prisma.feedUpdateData).not.toHaveProperty("observedAt");
      expect(prisma.feedItemRecord).toMatchObject({
        title: "Reprojected title",
        bodyPreview: "Reprojected body",
        authorHandle: "updated-author",
        publishedAt: new Date("2026-07-16T00:05:00.000Z"),
        observedAt: firstObservedAt,
        providerMetadata: expect.objectContaining({
          score: 400,
          numComments: 20,
          upvoteRatio: 0.95,
        }),
      });
      expect(prisma.explicitUpdateCount).toBe(
        supportsExplicitUpdate ? 1 : 0,
      );
      expect(prisma.upsertUpdateCount).toBe(
        supportsExplicitUpdate ? 0 : 1,
      );

      const baselineCreateData = prisma.baselineCreateData;
      const baselineUpdateData = prisma.baselineUpdateData;
      if (baselineCreateData === undefined || baselineUpdateData === undefined) {
        throw new Error("Expected baseline create and update writes");
      }

      expect(baselineCreateData).toMatchObject({
        feedItemId: "feed-1",
        providerKey: "reddit",
        sourceKey: "r/startups",
        contentType: "post",
        observedAt: firstObservedAt,
      });
      expect(baselineUpdateData).toMatchObject({
        providerKey: "reddit",
        sourceKey: "r/startups",
        contentType: "post",
        observedAt: reprojectedAt,
      });
      expect(baselineUpdateData.strength).toBeGreaterThan(
        baselineCreateData.strength,
      );
      expect(prisma.baselineSampleRecord).toMatchObject({
        feedItemId: "feed-1",
        observedAt: reprojectedAt,
        strength: baselineUpdateData.strength,
      });
    },
  );

  it("rolls back pending feed rows before exact P2002 replay of the batch", async () => {
    const prisma = new RacingTransactionalFeedClient();
    const projection = new PrismaFeedProjectionAdapter(
      prisma as unknown as PrismaFeedClient,
      new SequenceIdGenerator([
        "feed-1",
        "feed-2",
        "feed-3",
      ]),
    );
    const sourceItems = [1, 2, 3].map((index) =>
      sourceItem({
        id: `source-${index}`,
        externalId: `external-${index}`,
        canonicalUrl: `https://example.test/item-${index}`,
        title: `Title ${index}`,
        body: `Body ${index}`,
        authorHandle: "author",
        publishedAt: new Date("2026-07-15T23:55:00.000Z"),
        ingestedAt: firstObservedAt,
        metadata: {},
      }),
    );

    const result = await projection.project({
      ...projectionCommand(),
      sourceItems,
    });

    expect(prisma.isolationLevels).toEqual(["Serializable", "Serializable"]);
    expect(prisma.afterFirstRollback.map((entry) => entry.sourceItemId)).toEqual([
      "source-2",
    ]);
    expect(prisma.afterFirstRollback).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceItemId: "source-1" }),
      ]),
    );
    expect(result).toEqual({
      projected: 3,
      projectedItems: [
        {
          sourceItemId: "source-1",
          sourceExternalId: "external-1",
          feedItemId: "feed-1",
        },
        {
          sourceItemId: "source-2",
          sourceExternalId: "external-2",
          feedItemId: "feed-2",
        },
        {
          sourceItemId: "source-3",
          sourceExternalId: "external-3",
          feedItemId: "feed-3",
        },
      ],
    });
    expect(
      new Set(prisma.records.map((entry) => entry.observedAt.toISOString())),
    ).toEqual(new Set([firstObservedAt.toISOString()]));
  });

  it("fails a cross-observation P2002 replay atomically with memory parity", async () => {
    const incomingObservedAt = new Date("2026-07-16T08:00:00.000Z");
    const competingObservedAt = new Date("2026-07-16T09:00:00.000Z");
    const incomingItems = [1, 2, 3].map((rank) =>
      githubProjectionSourceItem(rank, incomingObservedAt),
    );
    const prisma = new RacingTransactionalFeedClient(
      "source-github-2",
      competingObservedAt,
      "competing-source-github-2",
    );
    const prismaProjection = new PrismaFeedProjectionAdapter(
      prisma as unknown as PrismaFeedClient,
      new SequenceIdGenerator([
        "feed-github-1",
        "feed-github-2",
        "feed-github-3",
        "baseline-github-1",
      ]),
    );
    const memoryItems = new InMemoryFeedItemReadRepository();
    const memoryProjection = new InMemoryFeedProjectionAdapter(memoryItems);
    const command = (
      sourceItems: readonly SourceItem[],
    ): ProjectFeedItemsCommand => ({
      ...projectionCommand(),
      providerKey: "github-trending-page",
      sourceItems,
      snapshots: {
        ...projectionCommand().snapshots,
        sourceBindingSnapshot: {
          ...projectionCommand().snapshots.sourceBindingSnapshot,
          providerKey: "github-trending-page",
        },
      },
    });
    await memoryProjection.project(
      command([githubProjectionSourceItem(1, competingObservedAt)]),
    );

    await expect(
      prismaProjection.project(command(incomingItems)),
    ).rejects.toThrow(
      "GitHub Trending snapshot conflicts with a durable row from a different observation envelope",
    );
    await expect(
      memoryProjection.project(command(incomingItems)),
    ).rejects.toThrow(
      "GitHub Trending snapshot conflicts with a durable row from a different observation envelope",
    );

    expect(prisma.isolationLevels).toEqual(["Serializable", "Serializable"]);
    expect(
      prisma.records.map((entry) => ({
        sourceItemId: entry.sourceItemId,
        observedAt: entry.observedAt.toISOString(),
      })),
    ).toEqual([
      {
        sourceItemId: "competing-source-github-2",
        observedAt: competingObservedAt.toISOString(),
      },
    ]);
    expect(
      memoryItems.all().map((item) => ({
        sourceItemId: item.toSnapshot().sourceItemId,
        observedAt: item.toSnapshot().observedAt.toISOString(),
      })),
    ).toEqual([
      {
        sourceItemId: "source-github-1",
        observedAt: competingObservedAt.toISOString(),
      },
    ]);
  });
});

const sourceItem = (params: {
  readonly id?: string;
  readonly externalId?: string;
  readonly canonicalUrl?: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle: string;
  readonly publishedAt: Date;
  readonly ingestedAt: Date;
  readonly metadata: JsonObject;
}): SourceItem =>
  SourceItem.ingest({
    id: params.id ?? "source-coverage-item",
    tenantId: tenantId("tenant-1"),
    workspaceId: workspaceId("workspace-1"),
    sourceBindingId: "binding-1",
    externalId: params.externalId ?? "reddit-coverage-item",
    canonicalUrl:
      params.canonicalUrl ?? "https://example.test/reddit-coverage-item",
    ...params,
  });

const projectionCommand = (): Omit<
  ProjectFeedItemsCommand,
  "sourceItems"
> => ({
  tenantId: tenantId("tenant-1"),
  workspaceId: workspaceId("workspace-1"),
  interestId: "topic-1",
  sourceBindingId: "binding-1",
  providerKey: "reddit",
  snapshots: {
    interestQuerySnapshot: {
      interestId: "topic-1",
      query: "AI developer tools",
    },
    sourceBindingSnapshot: {
      sourceBindingId: "binding-1",
      providerKey: "reddit",
      sourceQuery: {
        mode: "listing",
        query: "startups:hot",
      },
    },
    workspaceScopeSnapshot: {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
    },
  },
});

const githubProjectionSourceItem = (
  rank: number,
  ingestedAt: Date,
): SourceItem => {
  const repository = `owner/repository-${rank}`;
  const checkedAt = new Date("2026-07-16T07:59:00.000Z");
  return sourceItem({
    id: `source-github-${rank}`,
    externalId:
      `github-trending-page:daily:scan-github-race:${repository}`,
    canonicalUrl: `https://github.com/${repository}`,
    title: `${repository} is #${rank} on GitHub Trending`,
    body: "Repository snapshot",
    authorHandle: "owner",
    publishedAt: checkedAt,
    ingestedAt,
    metadata: githubTrendingPageRepositoryMetadata({
      repository: {
        fullName: repository,
        url: `https://github.com/${repository}`,
        totalStars: 20_000 + rank,
        forksCount: 500 + rank,
      },
      trending: {
        rank,
        starsGained: 1_500 + rank,
        window: "daily",
        scanJobId: "scan-github-race",
        fetchStartedAt: new Date("2026-07-16T07:58:00.000Z"),
        checkedAt,
        source: "fixture_github_trending_html",
      },
    }),
  });
};

class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.index];
    if (value === undefined) {
      throw new Error("SequenceIdGenerator exhausted");
    }
    this.index += 1;

    return value;
  }
}

class FakePrismaFeedClient implements PrismaFeedClient {
  feedItemRecord: PrismaFeedItemRecord | undefined;
  baselineSampleRecord: PrismaFeedSignalBaselineSampleRecord | undefined;
  feedCreateData: FeedItemUpsertArgs["create"] | undefined;
  feedUpdateData: FeedItemMutableData | undefined;
  baselineCreateData: BaselineUpsertArgs["create"] | undefined;
  baselineUpdateData: BaselineUpsertArgs["update"] | undefined;
  explicitUpdateCount = 0;
  upsertUpdateCount = 0;

  readonly feedItem: PrismaFeedClient["feedItem"];

  constructor(supportsExplicitUpdate: boolean) {
    const feedItemWithoutUpdate: Omit<
      PrismaFeedClient["feedItem"],
      "update"
    > = {
      upsert: (args) => this.upsertFeedItem(args),
      findMany: async () => [],
      count: async () => 0,
      findFirst: async (args) => {
        const record = this.feedItemRecord;
        return record !== undefined &&
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.interestId === args.where.interestId &&
          record.sourceItemId === args.where.sourceItemId &&
          record.status === args.where.status
          ? record
          : null;
      },
    };
    this.feedItem = supportsExplicitUpdate
      ? {
          ...feedItemWithoutUpdate,
          update: (args) => this.updateFeedItem(args),
        }
      : feedItemWithoutUpdate;
  }

  readonly feedSignalBaselineSample: PrismaFeedClient["feedSignalBaselineSample"] =
    {
      upsert: async (args) => this.upsertBaselineSample(args),
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    };

  private async upsertFeedItem(
    args: FeedItemUpsertArgs,
  ): Promise<PrismaFeedItemRecord> {
    const existing = this.feedItemRecord;
    if (
      existing !== undefined &&
      existing.tenantId ===
        args.where.tenantId_interestId_dedupeKey.tenantId &&
      existing.interestId ===
        args.where.tenantId_interestId_dedupeKey.interestId &&
      existing.dedupeKey ===
        args.where.tenantId_interestId_dedupeKey.dedupeKey
    ) {
      this.upsertUpdateCount += 1;
      this.feedUpdateData = args.update;
      this.feedItemRecord = { ...existing, ...args.update };

      return this.feedItemRecord;
    }

    this.feedCreateData = args.create;
    this.feedItemRecord = {
      ...args.create,
      authorHandle: args.create.authorHandle ?? null,
      providerMetadata: args.create.providerMetadata ?? null,
      createdAt: firstObservedAt,
    };

    return this.feedItemRecord;
  }

  private async updateFeedItem(
    args: FeedItemUpdateArgs,
  ): Promise<PrismaFeedItemRecord> {
    const existing = this.feedItemRecord;
    if (existing === undefined || existing.id !== args.where.id) {
      throw new Error(`Feed item ${args.where.id} does not exist`);
    }

    this.explicitUpdateCount += 1;
    this.feedUpdateData = args.data;
    this.feedItemRecord = { ...existing, ...args.data };

    return this.feedItemRecord;
  }

  private async upsertBaselineSample(
    args: BaselineUpsertArgs,
  ): Promise<PrismaFeedSignalBaselineSampleRecord> {
    const existing = this.baselineSampleRecord;
    if (existing === undefined) {
      this.baselineCreateData = args.create;
      this.baselineSampleRecord = { ...args.create };
    } else {
      this.baselineUpdateData = args.update;
      this.baselineSampleRecord = { ...existing, ...args.update };
    }

    return this.baselineSampleRecord;
  }
}

class RacingTransactionalFeedClient {
  private committed = new Map<string, PrismaFeedItemRecord>();
  private raced = false;
  readonly isolationLevels: string[] = [];
  afterFirstRollback: readonly PrismaFeedItemRecord[] = [];

  constructor(
    private readonly conflictedSourceItemId = "source-2",
    private readonly competingObservedAt?: Date,
    private readonly competingSourceItemId?: string,
  ) {}

  get records(): readonly PrismaFeedItemRecord[] {
    return [...this.committed.values()];
  }

  readonly $transaction = async <Result>(
    operation: (transaction: PrismaFeedClient) => Promise<Result>,
    options: { readonly isolationLevel: string },
  ): Promise<Result> => {
    this.isolationLevels.push(options.isolationLevel);
    const staged = new Map(this.committed);
    const feedItem: PrismaFeedClient["feedItem"] = {
      findFirst: async (args) =>
        [...staged.values()].find(
          (entry) =>
            entry.tenantId === args.where.tenantId &&
            entry.workspaceId === args.where.workspaceId &&
            entry.interestId === args.where.interestId &&
            entry.sourceItemId === args.where.sourceItemId &&
            entry.status === args.where.status,
        ) ?? null,
      upsert: async (args) => {
        const existing = [...staged.values()].find(
          (entry) =>
            entry.tenantId ===
              args.where.tenantId_interestId_dedupeKey.tenantId &&
            entry.interestId ===
              args.where.tenantId_interestId_dedupeKey.interestId &&
            entry.dedupeKey ===
              args.where.tenantId_interestId_dedupeKey.dedupeKey,
        );
        if (existing !== undefined) {
          const updated = { ...existing, ...args.update };
          staged.set(updated.sourceItemId, updated);
          return updated;
        }
        const created: PrismaFeedItemRecord = {
          ...args.create,
          authorHandle: args.create.authorHandle ?? null,
          providerMetadata: args.create.providerMetadata ?? null,
          createdAt: firstObservedAt,
        };
        if (
          created.sourceItemId === this.conflictedSourceItemId &&
          !this.raced
        ) {
          this.raced = true;
          const competing = {
            ...created,
            sourceItemId:
              this.competingSourceItemId ?? created.sourceItemId,
            observedAt: this.competingObservedAt ?? created.observedAt,
          };
          this.committed.set(competing.sourceItemId, competing);
          throw { code: "P2002" };
        }
        staged.set(created.sourceItemId, created);
        return created;
      },
      update: async (args) => {
        const existing = [...staged.values()].find(
          (entry) => entry.id === args.where.id,
        );
        if (existing === undefined) {
          throw new Error("missing staged feed record");
        }
        const updated = { ...existing, ...args.data };
        staged.set(updated.sourceItemId, updated);
        return updated;
      },
      findMany: async () => [],
      count: async () => 0,
    };
    const transaction = {
      feedItem,
      feedSignalBaselineSample: {
        upsert: async (args: BaselineUpsertArgs) => ({ ...args.create }),
        findMany: async () => [],
        deleteMany: async () => ({ count: 0 }),
      },
    } as PrismaFeedClient;
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
