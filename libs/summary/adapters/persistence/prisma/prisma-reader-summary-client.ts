import type {
  PrismaReaderSummaryArtifactRecord,
  PrismaReaderSummaryJobRecord,
  PrismaReaderSummaryPeriodSummaryRecord,
  PrismaReaderSummaryPolicyRecord,
} from "./prisma-reader-summary-records";
import type { PrismaReaderSummaryTopicRecommendationDecisionRecord } from "./prisma-reader-summary-topic-recommendation-decision-records";
import type { PrismaSummaryStatus } from "./prisma-summary-records";

export type PrismaReaderSummaryArtifactMutation = {
  readonly status: PrismaSummaryStatus;
  readonly scopeType: string;
  readonly scopeKey: string;
  readonly interestId?: string | null;
  readonly cadence: string;
  readonly periodStartedAt: Date;
  readonly periodEndedAt: Date;
  readonly periodTimezone: string;
  readonly periodKey: string;
  readonly userId?: string | null;
  readonly subscriptionId?: string | null;
  readonly modelVersion: string;
  readonly promptVersion: string;
  readonly headline: string;
  readonly summaryText: string | null;
  readonly artifactPayload: Readonly<Record<string, unknown>>;
  readonly citations: unknown;
  readonly qualitySignals: Readonly<Record<string, unknown>>;
};

export type PrismaReaderSummaryArtifactCreate =
  PrismaReaderSummaryArtifactMutation & {
    readonly id: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly schemaVersion: number;
  };

type PrismaReaderSummaryArtifactWhere = {
  readonly id?: { readonly not: string };
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scopeKey?: string;
  readonly cadence?: string;
  readonly periodStartedAt?:
    | Date
    | {
        readonly equals?: Date;
        readonly gte?: Date;
        readonly lt?: Date;
      };
  readonly periodEndedAt?: Date;
  readonly periodTimezone?: string;
  readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
  readonly publication?: {
    readonly is: {
      readonly activeSlot: { readonly isNot: null };
    };
  };
};

type PrismaReaderSummaryArtifactOrderBy = readonly [
  { readonly periodStartedAt: "desc" },
  { readonly createdAt: "desc" },
  { readonly id: "desc" },
];

type PrismaReaderSummaryPeriodSummarySelect = {
  readonly id: true;
  readonly tenantId: true;
  readonly workspaceId: true;
  readonly scopeType: true;
  readonly scopeKey: true;
  readonly interestId: true;
  readonly cadence: true;
  readonly periodStartedAt: true;
  readonly periodEndedAt: true;
  readonly periodTimezone: true;
  readonly periodKey: true;
  readonly userId: true;
  readonly subscriptionId: true;
  readonly status: true;
  readonly headline: true;
};

export type PrismaReaderSummaryPolicyMutation = {
  readonly scopeType: string;
  readonly scopeKey: string;
  readonly interestId?: string | null;
  readonly language: string;
  readonly format: string;
  readonly tone: string;
  readonly maxStories: number;
  readonly includeRisks: boolean;
  readonly includeInterestHighlights: boolean;
  readonly includeRepeatedSignals: boolean;
  readonly dedupeStrategy: string;
  readonly customInstructions: string | null;
  readonly rulesVersion: string;
  readonly scheduleEnabled: boolean;
  readonly scheduleTimezone: string;
  readonly scheduleCadences: readonly string[];
  readonly updatedAt: Date;
};

export type PrismaReaderSummaryPolicyCreate =
  PrismaReaderSummaryPolicyMutation & {
    readonly id: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly createdAt: Date;
  };

export type PrismaReaderSummaryTopicRecommendationDecisionMutation = {
  readonly topicLabel: string;
  readonly status: string;
  readonly decidedBy: string;
  readonly note: string | null;
  readonly decidedAt: Date;
  readonly application: unknown | null;
};

export type PrismaReaderSummaryTopicRecommendationDecisionCreate =
  PrismaReaderSummaryTopicRecommendationDecisionMutation & {
    readonly id: string;
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly recommendationId: string;
  };

export type PrismaReaderSummaryClient = {
  readonly $queryRaw: <T = unknown>(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<T>;
  readonly readerSummaryJob: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly status: PrismaSummaryStatus;
        readonly scopeType: string;
        readonly scopeKey: string;
        readonly interestId?: string | null;
        readonly cadence: string;
        readonly periodStartedAt: Date;
        readonly periodEndedAt: Date;
        readonly periodTimezone: string;
        readonly periodKey: string;
        readonly idempotencyKey: string;
        readonly userId?: string | null;
        readonly subscriptionId?: string | null;
        readonly requestedAt: Date;
        readonly startedAt?: Date | null;
        readonly completedAt?: Date | null;
        readonly failedAt?: Date | null;
        readonly readerSummaryArtifactId?: string | null;
        readonly failureReason?: string | null;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scopeType: string;
        readonly scopeKey: string;
        readonly interestId?: string | null;
        readonly cadence: string;
        readonly periodStartedAt: Date;
        readonly periodEndedAt: Date;
        readonly periodTimezone: string;
        readonly periodKey: string;
        readonly userId?: string | null;
        readonly subscriptionId?: string | null;
        readonly status: PrismaSummaryStatus;
        readonly idempotencyKey: string;
        readonly requestedAt: Date;
        readonly startedAt?: Date | null;
        readonly completedAt?: Date | null;
        readonly failedAt?: Date | null;
        readonly readerSummaryArtifactId?: string | null;
        readonly failureReason?: string | null;
      };
    }): Promise<PrismaReaderSummaryJobRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id?: string;
        readonly idempotencyKey?: string;
        readonly status?:
          PrismaSummaryStatus | { readonly in: readonly PrismaSummaryStatus[] };
      };
    }): Promise<PrismaReaderSummaryJobRecord | null>;
    updateMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id: string;
        readonly status: PrismaSummaryStatus;
      };
      readonly data: {
        readonly status: PrismaSummaryStatus;
        readonly requestedAt: Date;
        readonly startedAt: Date;
        readonly completedAt: Date | null;
        readonly failedAt: Date | null;
        readonly readerSummaryArtifactId: string | null;
        readonly failureReason: string | null;
      };
    }): Promise<{ readonly count: number }>;
    findMany(args: {
      readonly where: {
        readonly tenantId?: string;
        readonly workspaceId?: string;
        readonly status: PrismaSummaryStatus;
      };
      readonly orderBy: readonly [
        { readonly requestedAt: "asc" },
        { readonly id: "asc" },
      ];
      readonly take: number;
    }): Promise<readonly PrismaReaderSummaryJobRecord[]>;
  };
  readonly readerSummaryArtifact: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaReaderSummaryArtifactMutation;
      readonly create: PrismaReaderSummaryArtifactCreate;
    }): Promise<PrismaReaderSummaryArtifactRecord>;
    updateMany(args: {
      readonly where: PrismaReaderSummaryArtifactWhere;
      readonly data: {
        readonly status: PrismaSummaryStatus;
      };
    }): Promise<{ readonly count: number }>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id: string;
        readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
        readonly publication?: {
          readonly is: {
            readonly activeSlot: { readonly isNot: null };
          };
        };
      };
    }): Promise<PrismaReaderSummaryArtifactRecord | null>;
    findMany(args: {
      readonly where: PrismaReaderSummaryArtifactWhere;
      readonly orderBy: PrismaReaderSummaryArtifactOrderBy;
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaReaderSummaryArtifactRecord[]>;
    findMany(args: {
      readonly where: PrismaReaderSummaryArtifactWhere;
      readonly select: PrismaReaderSummaryPeriodSummarySelect;
      readonly orderBy: PrismaReaderSummaryArtifactOrderBy;
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaReaderSummaryPeriodSummaryRecord[]>;
    count(args: {
      readonly where: PrismaReaderSummaryArtifactWhere;
    }): Promise<number>;
  };
  readonly readerSummaryPolicy: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_scopeKey: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly scopeKey: string;
        };
      };
      readonly update: PrismaReaderSummaryPolicyMutation;
      readonly create: PrismaReaderSummaryPolicyCreate;
    }): Promise<PrismaReaderSummaryPolicyRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly scopeKey: string;
      };
    }): Promise<PrismaReaderSummaryPolicyRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId?: string;
        readonly workspaceId?: string;
        readonly scheduleEnabled: boolean;
      };
      readonly orderBy: readonly [
        { readonly updatedAt: "desc" },
        { readonly id: "desc" },
      ];
      readonly take: number;
    }): Promise<readonly PrismaReaderSummaryPolicyRecord[]>;
  };
  readonly readerSummaryTopicRecommendationDecision: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_recommendationId: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly recommendationId: string;
        };
      };
      readonly update: PrismaReaderSummaryTopicRecommendationDecisionMutation;
      readonly create: PrismaReaderSummaryTopicRecommendationDecisionCreate;
    }): Promise<PrismaReaderSummaryTopicRecommendationDecisionRecord>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly recommendationId: { readonly in: readonly string[] };
      };
    }): Promise<
      readonly PrismaReaderSummaryTopicRecommendationDecisionRecord[]
    >;
    findUnique(args: {
      readonly where: {
        readonly tenantId_workspaceId_recommendationId: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly recommendationId: string;
        };
      };
    }): Promise<PrismaReaderSummaryTopicRecommendationDecisionRecord | null>;
    deleteMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly recommendationId: string;
      };
    }): Promise<{ readonly count: number }>;
  };
};
