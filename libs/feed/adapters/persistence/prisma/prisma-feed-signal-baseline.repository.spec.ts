import type { IdGenerator, JsonObject } from "@social-monitor/shared-kernel";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { SourceItem } from "@social-monitor/ingestion/domain";

import type {
  PrismaFeedClient,
  PrismaFeedSignalBaselineSampleRecord,
} from "./prisma-feed-client";
import type { PrismaFeedItemRecord } from "./prisma-feed-records";
import { PrismaFeedProjectionAdapter } from "./prisma-feed-projection.adapter";
import { PrismaFeedSignalBaselineRepository } from "./prisma-feed-signal-baseline.repository";

const now = new Date("2026-06-23T12:00:00.000Z");

describe("Prisma feed signal baseline materialization", () => {
  it("preserves a hidden feed item when source metrics are refreshed", async () => {
    const prisma = new FakePrismaFeedClient();
    const projection = new PrismaFeedProjectionAdapter(
      prisma,
      new SequenceIdGenerator([
        "feed-hidden",
        "sample-1",
        "unused",
        "sample-2",
      ]),
    );
    const command = {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      interestId: "topic-1",
      sourceBindingId: "binding-1",
      providerKey: "reddit",
      snapshots: projectionSnapshots(),
      sourceItems: [sourceItem({ id: "source-1", externalId: "reddit-1" })],
    };

    await projection.project(command);
    prisma.setFirstFeedStatus("HIDDEN");
    await projection.project(command);

    expect(prisma.feedItemRecords()[0]?.status).toBe("HIDDEN");
  });

  it("writes lightweight baseline samples during feed projection and reads them without feed item payloads", async () => {
    const prisma = new FakePrismaFeedClient();
    const ids = new SequenceIdGenerator(["feed-1", "sample-1"]);
    const projection = new PrismaFeedProjectionAdapter(prisma, ids);
    const baseline = new PrismaFeedSignalBaselineRepository(prisma);

    await projection.project({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      interestId: "topic-1",
      sourceBindingId: "binding-1",
      providerKey: "reddit",
      snapshots: projectionSnapshots(),
      sourceItems: [
        sourceItem({
          id: "source-1",
          externalId: "reddit-1",
          metadata: {
            subreddit: "startups",
            score: 55,
            numComments: 18,
            upvoteRatio: 0.91,
          },
        }),
      ],
    });

    expect(prisma.feedItemRecords()[0]?.providerMetadata).toMatchObject({
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
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
      },
    });

    await expect(
      baseline.listSamples({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        interestId: "topic-1",
        observedAfter: new Date("2026-06-22T12:00:00.000Z"),
        limit: 10,
      }),
    ).resolves.toEqual([
      {
        feedItemId: "feed-1",
        interestId: "topic-1",
        providerKey: "reddit",
        sourceKey: "r/startups",
        contentType: "post",
        strength: expect.any(Number),
        publishedAt: new Date("2026-06-23T10:00:00.000Z"),
        observedAt: now,
      },
    ]);
  });

  it("filters lightweight baseline samples by exact cohort when reading materialized samples", async () => {
    const prisma = new FakePrismaFeedClient();
    const ids = new SequenceIdGenerator([
      "feed-startups",
      "sample-startups",
      "feed-programming",
      "sample-programming",
    ]);
    const projection = new PrismaFeedProjectionAdapter(prisma, ids);
    const baseline = new PrismaFeedSignalBaselineRepository(prisma);

    await projection.project({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      interestId: "topic-1",
      sourceBindingId: "binding-1",
      providerKey: "reddit",
      snapshots: projectionSnapshots(),
      sourceItems: [
        sourceItem({
          id: "source-startups",
          externalId: "reddit-startups",
          metadata: {
            subreddit: "startups",
            score: 55,
            numComments: 18,
          },
        }),
        sourceItem({
          id: "source-programming",
          externalId: "reddit-programming",
          metadata: {
            subreddit: "programming",
            score: 550,
            numComments: 75,
          },
        }),
      ],
    });

    await expect(
      baseline.listSamples({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        interestId: "topic-1",
        observedAfter: new Date("2026-06-22T12:00:00.000Z"),
        limit: 10,
        cohortFilters: [
          {
            providerKey: "reddit",
            sourceKey: "r/startups",
            contentType: "post",
          },
        ],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        feedItemId: "feed-startups",
        interestId: "topic-1",
        providerKey: "reddit",
        sourceKey: "r/startups",
        contentType: "post",
      }),
    ]);
  });

  it("rejects feed projection when source item binding does not match the command snapshot", async () => {
    const prisma = new FakePrismaFeedClient();
    const projection = new PrismaFeedProjectionAdapter(
      prisma,
      new SequenceIdGenerator(["feed-1"]),
    );

    await expect(
      projection.project({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        interestId: "topic-1",
        sourceBindingId: "binding-1",
        providerKey: "reddit",
        snapshots: projectionSnapshots(),
        sourceItems: [
          SourceItem.ingest({
            id: "source-other-binding",
            tenantId: tenantId("tenant-1"),
            workspaceId: workspaceId("workspace-1"),
            sourceBindingId: "binding-other",
            externalId: "reddit-other-binding",
            canonicalUrl: "https://example.test/reddit-other-binding",
            title: "Wrong binding",
            body: "",
            publishedAt: new Date("2026-06-23T10:00:00.000Z"),
            ingestedAt: now,
          }),
        ],
      }),
    ).rejects.toThrow("source item binding does not match");
  });

  it("removes stale samples when a same-provider projected item no longer has comparable provider metrics", async () => {
    const prisma = new FakePrismaFeedClient();
    const ids = new SequenceIdGenerator([
      "feed-1",
      "sample-1",
      "unused-feed-id",
    ]);
    const projection = new PrismaFeedProjectionAdapter(prisma, ids);
    const baseline = new PrismaFeedSignalBaselineRepository(prisma);

    await projection.project({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      interestId: "topic-1",
      sourceBindingId: "binding-1",
      providerKey: "reddit",
      snapshots: projectionSnapshots(),
      sourceItems: [
        sourceItem({
          id: "source-1",
          externalId: "same",
          metadata: {
            subreddit: "startups",
            score: 55,
            numComments: 18,
          },
        }),
      ],
    });
    await projection.project({
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      interestId: "topic-1",
      sourceBindingId: "binding-1",
      providerKey: "reddit",
      snapshots: projectionSnapshots(),
      sourceItems: [
        sourceItem({
          id: "source-2",
          externalId: "same",
          metadata: undefined,
        }),
      ],
    });

    await expect(
      baseline.listSamples({
        tenantId: tenantId("tenant-1"),
        workspaceId: workspaceId("workspace-1"),
        interestId: "topic-1",
        observedAfter: new Date("2026-06-22T12:00:00.000Z"),
        limit: 10,
      }),
    ).resolves.toEqual([]);
  });
});

const sourceItem = (params: {
  readonly id: string;
  readonly externalId: string;
  readonly metadata?: JsonObject;
}): SourceItem =>
  SourceItem.ingest({
    id: params.id,
    tenantId: tenantId("tenant-1"),
    workspaceId: workspaceId("workspace-1"),
    sourceBindingId: "binding-1",
    externalId: params.externalId,
    canonicalUrl: `https://example.test/${params.externalId}`,
    title: `Story ${params.externalId}`,
    body: "",
    publishedAt: new Date("2026-06-23T10:00:00.000Z"),
    ingestedAt: now,
    metadata: params.metadata,
  });

const projectionSnapshots = () => ({
  interestQuerySnapshot: {
    interestId: "topic-1",
    query: "AI developer tools",
  },
  sourceBindingSnapshot: {
    sourceBindingId: "binding-1",
    providerKey: "reddit",
    sourceQuery: {
      mode: "listing" as const,
      query: "startups:hot",
    },
  },
  workspaceScopeSnapshot: {
    tenantId: tenantId("tenant-1"),
    workspaceId: workspaceId("workspace-1"),
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
  private readonly feedItems = new Map<string, PrismaFeedItemRecord>();
  private readonly samples = new Map<
    string,
    PrismaFeedSignalBaselineSampleRecord
  >();

  feedItemRecords(): readonly PrismaFeedItemRecord[] {
    return [...this.feedItems.values()];
  }

  setFirstFeedStatus(status: PrismaFeedItemRecord["status"]): void {
    const entry = this.feedItems.entries().next().value;
    if (entry !== undefined)
      this.feedItems.set(entry[0], { ...entry[1], status });
  }

  readonly feedItem: PrismaFeedClient["feedItem"] = {
    upsert: async (args) => {
      const key = [
        args.where.tenantId_interestId_dedupeKey.tenantId,
        args.where.tenantId_interestId_dedupeKey.interestId,
        args.where.tenantId_interestId_dedupeKey.dedupeKey,
      ].join(":");
      const existing = this.feedItems.get(key);
      const record: PrismaFeedItemRecord =
        existing === undefined
          ? {
              id: args.create.id,
              tenantId: args.create.tenantId,
              workspaceId: args.create.workspaceId,
              interestId: args.create.interestId,
              sourceItemId: args.create.sourceItemId,
              sourceBindingId: args.create.sourceBindingId,
              providerKey: args.create.providerKey,
              dedupeKey: args.create.dedupeKey,
              canonicalUrl: args.create.canonicalUrl,
              title: args.create.title,
              bodyPreview: args.create.bodyPreview,
              authorHandle: args.create.authorHandle ?? null,
              publishedAt: args.create.publishedAt,
              observedAt: args.create.observedAt,
              providerMetadata: args.create.providerMetadata ?? null,
              status: args.create.status,
              createdAt: now,
            }
          : {
              ...existing,
              sourceItemId: args.update.sourceItemId,
              sourceBindingId: args.update.sourceBindingId,
              providerKey: args.update.providerKey,
              canonicalUrl: args.update.canonicalUrl,
              title: args.update.title,
              bodyPreview: args.update.bodyPreview,
              authorHandle: args.update.authorHandle ?? null,
              publishedAt: args.update.publishedAt,
              observedAt: existing.observedAt,
              providerMetadata:
                args.update.providerMetadata === undefined
                  ? existing.providerMetadata
                  : (args.update.providerMetadata ?? null),
              status: existing.status,
            };
      this.feedItems.set(key, record);

      return record;
    },
    findMany: async () => [],
    count: async () => 0,
    findFirst: async () => null,
  };

  readonly feedSignalBaselineSample: PrismaFeedClient["feedSignalBaselineSample"] =
    {
      upsert: async (args) => {
        const key = [
          args.where.tenantId_workspaceId_feedItemId.tenantId,
          args.where.tenantId_workspaceId_feedItemId.workspaceId,
          args.where.tenantId_workspaceId_feedItemId.feedItemId,
        ].join(":");
        const existing = this.samples.get(key);
        const record: PrismaFeedSignalBaselineSampleRecord = {
          id: existing?.id ?? args.create.id,
          tenantId: existing?.tenantId ?? args.create.tenantId,
          workspaceId: existing?.workspaceId ?? args.create.workspaceId,
          interestId: args.update.interestId,
          feedItemId: existing?.feedItemId ?? args.create.feedItemId,
          providerKey: args.update.providerKey,
          sourceKey: args.update.sourceKey,
          contentType: args.update.contentType,
          strength: args.update.strength,
          publishedAt: args.update.publishedAt,
          observedAt: args.update.observedAt,
        };
        this.samples.set(key, record);

        return record;
      },
      findMany: async (args) =>
        [...this.samples.values()]
          .filter(
            (record) =>
              record.tenantId === args.where.tenantId &&
              record.workspaceId === args.where.workspaceId &&
              (args.where.interestId === undefined ||
                record.interestId === args.where.interestId) &&
              record.observedAt.getTime() >
                args.where.observedAt.gt.getTime() &&
              matchesSampleCohortFilters(record, args.where.OR ?? []),
          )
          .sort(
            (left, right) =>
              right.observedAt.getTime() - left.observedAt.getTime() ||
              right.feedItemId.localeCompare(left.feedItemId),
          )
          .slice(0, args.take),
      deleteMany: async (args) => {
        const key = [
          args.where.tenantId,
          args.where.workspaceId,
          args.where.feedItemId,
        ].join(":");
        const existed = this.samples.delete(key);

        return { count: existed ? 1 : 0 };
      },
    };
}

const matchesSampleCohortFilters = (
  record: PrismaFeedSignalBaselineSampleRecord,
  filters: NonNullable<
    Parameters<
      PrismaFeedClient["feedSignalBaselineSample"]["findMany"]
    >[0]["where"]["OR"]
  >,
): boolean =>
  filters.length === 0 ||
  filters.some(
    (filter) =>
      record.providerKey === filter.providerKey &&
      record.sourceKey === filter.sourceKey &&
      record.contentType === filter.contentType,
  );
