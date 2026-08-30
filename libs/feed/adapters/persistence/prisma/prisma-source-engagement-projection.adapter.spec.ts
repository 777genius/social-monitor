import type { PrismaFeedItemRecord } from "./prisma-feed-records";
import type {
  PrismaSourceEngagementClient,
  PrismaSourceEngagementDailyRollupRecord,
  PrismaSourceEngagementSnapshotRecord,
  PrismaSourceEngagementTransactionClient,
} from "./prisma-source-engagement-client";
import { PrismaSourceEngagementProjectionAdapter } from "./prisma-source-engagement-projection.adapter";

describe("PrismaSourceEngagementProjectionAdapter", () => {
  it("updates current metrics cheaply and appends only cadence observations", async () => {
    const prisma = new FakeEngagementPrisma();
    const adapter = new PrismaSourceEngagementProjectionAdapter(prisma, {
      generate: () => `id-${prisma.nextId++}`,
    });

    const initial = await adapter.project(command("2026-07-10T12:00:00Z", 10, false));
    const metricOnly = await adapter.project(command("2026-07-10T12:10:00Z", 12, true));
    const cadence = await adapter.project(command("2026-07-10T12:30:00Z", 15, true));
    const regression = await adapter.project(command("2026-07-10T13:00:00Z", 14, true));

    expect(initial).toMatchObject({ observationsAppended: 1, metricChanges: 1 });
    expect(metricOnly).toMatchObject({
      observationsAppended: 0,
      metricChanges: 1,
    });
    expect(cadence).toMatchObject({ observationsAppended: 1, metricChanges: 1 });
    expect(regression).toMatchObject({
      observationsAppended: 1,
      regressionsObserved: 1,
    });
    expect(prisma.snapshot?.likes).toBe(14n);
    expect(prisma.observations).toHaveLength(3);
    expect(prisma.rollup?.sampleCount).toBe(3);
    expect(prisma.rollup?.regressionCount).toBe(1);
    expect(prisma.feedItemRecord.observedAt.toISOString()).toBe(
      "2026-07-10T11:00:00.000Z",
    );
    expect(prisma.feedItemRecord.providerMetadata).toMatchObject({
      kind: "x_post",
      likes: 14,
      provenance: { query: "agents" },
    });
    expect(prisma.feedItemRecord.providerMetadata).not.toHaveProperty(
      "impressions",
    );
    expect(prisma.baselineObservedAt?.toISOString()).toBe(
      "2026-07-10T13:00:00.000Z",
    );
    expect(prisma.retentionDeleteCalls).toBe(2);
  });

  it("fails closed for older and equal-time conflicting observations", async () => {
    const prisma = new FakeEngagementPrisma();
    const adapter = new PrismaSourceEngagementProjectionAdapter(prisma, {
      generate: () => `id-${prisma.nextId++}`,
    });

    await adapter.project(command("2026-07-10T12:00:00Z", 10, true));
    await adapter.project(command("2026-07-10T13:00:00Z", 20, true));
    const observationCount = prisma.observations.length;

    const equalConflict = await adapter.project(
      command("2026-07-10T13:00:00Z", 5, true),
    );
    const older = await adapter.project(
      command("2026-07-10T12:30:00Z", 4, true),
    );

    expect(equalConflict).toMatchObject({
      currentSnapshotsUpdated: 0,
      observationsAppended: 0,
      metricChanges: 0,
    });
    expect(older).toMatchObject({
      currentSnapshotsUpdated: 0,
      observationsAppended: 0,
      metricChanges: 0,
    });
    expect(prisma.snapshot).toMatchObject({
      likes: 20n,
      lastObservedAt: new Date("2026-07-10T13:00:00Z"),
    });
    expect(prisma.feedItemRecord.providerMetadata).toMatchObject({ likes: 20 });
    expect(prisma.baselineObservedAt).toEqual(
      new Date("2026-07-10T13:00:00Z"),
    );
    expect(prisma.observations).toHaveLength(observationCount);
  });
});

const command = (
  observedAt: string,
  likes: number,
  refreshReadModels: boolean,
) => ({
  tenantId: "tenant" as never,
  workspaceId: "workspace" as never,
  sourceBindingId: "00000000-0000-4000-8000-000000000004",
  scanJobId: "00000000-0000-4000-8000-000000000005",
  providerKey: "x-twitter",
  observedAt: new Date(observedAt),
  samples: [
    {
      externalId: "x-twitter:1",
      sourceItemId: "source-1",
      publishedAt: new Date("2026-07-10T11:00:00Z"),
      metrics: { likes },
      metricsFingerprint: `likes:${likes}`,
      providerMetadataPatch: { likes },
      refreshReadModels,
    },
  ],
});

class FakeEngagementPrisma implements PrismaSourceEngagementClient {
  nextId = 1;
  snapshot: PrismaSourceEngagementSnapshotRecord | null = null;
  observations: unknown[] = [];
  rollup: PrismaSourceEngagementDailyRollupRecord | null = null;
  baselineObservedAt: Date | null = null;
  retentionDeleteCalls = 0;
  sourceItemRecord: {
    id: string;
    tenantId: string;
    workspaceId: string;
    providerKey: string;
    providerItemId: string;
    lastObservedAt: Date | null;
    metadata: unknown;
  } = {
    id: "source-1",
    tenantId: "tenant",
    workspaceId: "workspace",
    providerKey: "x-twitter",
    providerItemId: "x-twitter:1",
    lastObservedAt: new Date("2026-07-10T11:00:00Z"),
    metadata: { kind: "x_post", likes: 10 },
  };
  feedItemRecord: PrismaFeedItemRecord = {
    id: "feed-1",
    tenantId: "tenant",
    workspaceId: "workspace",
    interestId: "interest",
    sourceItemId: "source-1",
    sourceBindingId: "00000000-0000-4000-8000-000000000004",
    providerKey: "x-twitter",
    dedupeKey: "x-twitter:1",
    canonicalUrl: "https://x.com/example/status/1",
    title: "Post",
    bodyPreview: "Body",
    authorHandle: "example",
    publishedAt: new Date("2026-07-10T11:00:00Z"),
    observedAt: new Date("2026-07-10T11:00:00Z"),
    status: "VISIBLE",
    createdAt: new Date("2026-07-10T11:00:00Z"),
    providerMetadata: {
      kind: "x_post",
      likes: 10,
      impressions: 100,
      provenance: { query: "agents" },
    },
  };

  readonly sourceItem: PrismaSourceEngagementClient["sourceItem"] = {
    findFirst: async () => this.sourceItemRecord,
    update: async (args) => {
      this.sourceItemRecord = {
        ...this.sourceItemRecord,
        ...args.data,
        metadata: args.data.metadata ?? this.sourceItemRecord.metadata,
      };
      return this.sourceItemRecord;
    },
  };

  readonly feedItem: PrismaSourceEngagementClient["feedItem"] = {
    upsert: async () => this.feedItemRecord,
    update: async (args) => {
      this.feedItemRecord = {
        ...this.feedItemRecord,
        ...args.data,
        providerMetadata:
          args.data.providerMetadata ?? this.feedItemRecord.providerMetadata,
      };
      return this.feedItemRecord;
    },
    findMany: async () => [this.feedItemRecord],
    count: async () => 1,
    findFirst: async () => this.feedItemRecord,
  };

  readonly feedSignalBaselineSample: PrismaSourceEngagementClient["feedSignalBaselineSample"] = {
    upsert: async (args) => {
      this.baselineObservedAt = args.update.observedAt;
      return {
        id: args.create.id,
        tenantId: args.create.tenantId,
        workspaceId: args.create.workspaceId,
        interestId: args.update.interestId,
        feedItemId: args.create.feedItemId,
        providerKey: args.update.providerKey,
        sourceKey: args.update.sourceKey,
        contentType: args.update.contentType,
        strength: args.update.strength,
        publishedAt: args.update.publishedAt,
        observedAt: args.update.observedAt,
      };
    },
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
  };

  readonly sourceItemEngagementSnapshot: PrismaSourceEngagementClient["sourceItemEngagementSnapshot"] = {
    findUnique: async () => this.snapshot,
    upsert: async (args) => {
      this.snapshot = this.snapshot === null
        ? { ...args.create }
        : { ...this.snapshot, ...args.update };
      return this.snapshot;
    },
    deleteMany: async () => ({ count: 0 }),
  };

  readonly sourceItemEngagementObservation: PrismaSourceEngagementClient["sourceItemEngagementObservation"] = {
    createMany: async (args) => {
      const sample = args.data[0];
      if (sample === undefined) return { count: 0 };
      const key = `${sample.sourceItemId}:${sample.bucketStartedAt.toISOString()}`;
      if (this.observations.some((entry) => (entry as { key: string }).key === key)) {
        return { count: 0 };
      }
      this.observations.push({ key, sample });
      return { count: 1 };
    },
    deleteMany: async () => {
      this.retentionDeleteCalls += 1;
      return { count: 0 };
    },
  };

  readonly sourceItemEngagementDailyRollup: PrismaSourceEngagementClient["sourceItemEngagementDailyRollup"] = {
    findUnique: async () => this.rollup,
    upsert: async (args) => {
      this.rollup = this.rollup === null
        ? { ...args.create }
        : { ...this.rollup, ...args.update };
      return this.rollup;
    },
    deleteMany: async () => {
      this.retentionDeleteCalls += 1;
      return { count: 0 };
    },
  };

  async $transaction<T>(
    operation: (client: PrismaSourceEngagementTransactionClient) => Promise<T>,
  ): Promise<T> {
    return operation(this);
  }
}
