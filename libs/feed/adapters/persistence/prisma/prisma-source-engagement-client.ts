import type { PrismaFeedClient } from "./prisma-feed-client";

type PrismaEngagementSourceItemRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly providerKey: string;
  readonly providerItemId: string;
  readonly lastObservedAt: Date | null;
  readonly metadata: unknown;
};

type PrismaEngagementSourceItemClient = {
  readonly sourceItem: {
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly providerKey: string;
        readonly providerItemId: string;
      };
    }): Promise<PrismaEngagementSourceItemRecord | null>;
    update?(args: {
      readonly where: { readonly id: string };
      readonly data: {
        readonly lastObservedAt: Date;
        readonly metadata?: Readonly<Record<string, unknown>>;
      };
    }): Promise<PrismaEngagementSourceItemRecord>;
  };
};

type MetricColumns = {
  readonly score?: bigint | null;
  readonly comments?: bigint | null;
  readonly likes?: bigint | null;
  readonly reposts?: bigint | null;
  readonly replies?: bigint | null;
  readonly quotes?: bigint | null;
  readonly bookmarks?: bigint | null;
  readonly impressions?: bigint | null;
  readonly views?: bigint | null;
  readonly points?: bigint | null;
  readonly stars?: bigint | null;
  readonly forks?: bigint | null;
  readonly starsGained?: bigint | null;
  readonly providerRank?: number | null;
  readonly upvoteRatioBps?: number | null;
};

export type PrismaSourceEngagementSnapshotRecord = MetricColumns & {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly metricsHash: string;
  readonly firstObservedAt: Date;
  readonly lastObservedAt: Date;
  readonly lastChangedAt: Date;
  readonly lastObservationAt: Date;
  readonly nextObservationDueAt: Date;
};

export type PrismaSourceEngagementDailyRollupRecord = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly day: Date;
  readonly sampleCount: number;
  readonly changedSampleCount: number;
  readonly regressionCount: number;
  readonly firstObservedAt: Date;
  readonly lastObservedAt: Date;
  readonly compactedThroughAt: Date;
  readonly openingMetrics: unknown;
  readonly closingMetrics: unknown;
  readonly peakMetrics: unknown;
};

export type PrismaSourceEngagementTransactionClient =
  PrismaEngagementSourceItemClient &
  Pick<PrismaFeedClient, "feedItem" | "feedSignalBaselineSample"> & {
    readonly sourceItemEngagementSnapshot: {
      findUnique(args: {
        readonly where: {
          readonly tenantId_workspaceId_sourceItemId: {
            readonly tenantId: string;
            readonly workspaceId: string;
            readonly sourceItemId: string;
          };
        };
      }): Promise<PrismaSourceEngagementSnapshotRecord | null>;
      upsert(args: {
        readonly where: {
          readonly tenantId_workspaceId_sourceItemId: {
            readonly tenantId: string;
            readonly workspaceId: string;
            readonly sourceItemId: string;
          };
        };
        readonly update: MetricColumns & {
          readonly providerKey: string;
          readonly metricsHash: string;
          readonly lastObservedAt: Date;
          readonly lastChangedAt: Date;
          readonly lastObservationAt: Date;
          readonly nextObservationDueAt: Date;
        };
        readonly create: MetricColumns & {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly sourceItemId: string;
          readonly providerKey: string;
          readonly metricsHash: string;
          readonly firstObservedAt: Date;
          readonly lastObservedAt: Date;
          readonly lastChangedAt: Date;
          readonly lastObservationAt: Date;
          readonly nextObservationDueAt: Date;
        };
      }): Promise<PrismaSourceEngagementSnapshotRecord>;
      deleteMany(args: {
        readonly where: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly lastObservedAt: { readonly lt: Date };
        };
      }): Promise<{ readonly count: number }>;
    };
    readonly sourceItemEngagementObservation: {
      createMany(args: {
        readonly data: readonly (MetricColumns & {
          readonly id: string;
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly sourceItemId: string;
          readonly providerKey: string;
          readonly sourceBindingId: string;
          readonly scanJobId: string;
          readonly metricsHash: string;
          readonly observedAt: Date;
          readonly bucketStartedAt: Date;
          readonly reason: "INITIAL" | "CADENCE";
          readonly metricsChanged: boolean;
          readonly hasRegression: boolean;
        })[];
        readonly skipDuplicates: true;
      }): Promise<{ readonly count: number }>;
      deleteMany(args: {
        readonly where: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly observedAt: { readonly lt: Date };
        };
      }): Promise<{ readonly count: number }>;
    };
    readonly sourceItemEngagementDailyRollup: {
      findUnique(args: {
        readonly where: {
          readonly tenantId_workspaceId_sourceItemId_day: {
            readonly tenantId: string;
            readonly workspaceId: string;
            readonly sourceItemId: string;
            readonly day: Date;
          };
        };
      }): Promise<PrismaSourceEngagementDailyRollupRecord | null>;
      upsert(args: {
        readonly where: {
          readonly tenantId_workspaceId_sourceItemId_day: {
            readonly tenantId: string;
            readonly workspaceId: string;
            readonly sourceItemId: string;
            readonly day: Date;
          };
        };
        readonly update: {
          readonly sampleCount: number;
          readonly changedSampleCount: number;
          readonly regressionCount: number;
          readonly lastObservedAt: Date;
          readonly compactedThroughAt: Date;
          readonly closingMetrics: Readonly<Record<string, number>>;
          readonly peakMetrics: Readonly<Record<string, number>>;
        };
        readonly create: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly sourceItemId: string;
          readonly providerKey: string;
          readonly day: Date;
          readonly sampleCount: number;
          readonly changedSampleCount: number;
          readonly regressionCount: number;
          readonly firstObservedAt: Date;
          readonly lastObservedAt: Date;
          readonly compactedThroughAt: Date;
          readonly openingMetrics: Readonly<Record<string, number>>;
          readonly closingMetrics: Readonly<Record<string, number>>;
          readonly peakMetrics: Readonly<Record<string, number>>;
        };
      }): Promise<PrismaSourceEngagementDailyRollupRecord>;
      deleteMany(args: {
        readonly where: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly day: { readonly lt: Date };
        };
      }): Promise<{ readonly count: number }>;
    };
  };

export type PrismaSourceEngagementClient = PrismaSourceEngagementTransactionClient & {
  $transaction<T>(
    operation: (
      client: PrismaSourceEngagementTransactionClient,
    ) => Promise<T>,
    options?: {
      readonly maxWait?: number;
      readonly timeout?: number;
      readonly isolationLevel?: "ReadCommitted" | "Serializable";
    },
  ): Promise<T>;
};
