import { SourceItem } from "@social-monitor/ingestion/domain";
import type { ProjectFeedItemsCommand } from "@social-monitor/ingestion/ports";
import type { IdGenerator, JsonObject } from "@social-monitor/shared-kernel";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

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
});

const sourceItem = (params: {
  readonly title: string;
  readonly body: string;
  readonly authorHandle: string;
  readonly publishedAt: Date;
  readonly ingestedAt: Date;
  readonly metadata: JsonObject;
}): SourceItem =>
  SourceItem.ingest({
    id: "source-coverage-item",
    tenantId: tenantId("tenant-1"),
    workspaceId: workspaceId("workspace-1"),
    sourceBindingId: "binding-1",
    externalId: "reddit-coverage-item",
    canonicalUrl: "https://example.test/reddit-coverage-item",
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
