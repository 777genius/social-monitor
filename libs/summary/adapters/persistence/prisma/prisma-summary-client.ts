import type { PrismaConversationClient } from '@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-client';

import type {
  PrismaSummaryArtifactRecord,
  PrismaSummaryFeedbackRecord,
  PrismaSummaryOutboxEventRecord,
  PrismaSummaryStatus,
  PrismaSummaryJobRecord,
  PrismaSummaryPolicyRecord,
} from "./prisma-summary-records";
import type {
  PrismaReaderSummaryArtifactRecord,
  PrismaReaderSummaryJobRecord,
  PrismaReaderSummaryPolicyRecord,
} from "./prisma-reader-summary-records";

export type PrismaSummaryArtifactMutation = {
  readonly status: PrismaSummaryStatus;
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

export type PrismaSummaryArtifactCreate = PrismaSummaryArtifactMutation & {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly userId?: string | null;
  readonly subscriptionId?: string | null;
  readonly schemaVersion: number;
};

export type PrismaSummaryFeedbackMutation = {
  readonly submittedBy: string;
  readonly rating: number;
  readonly category: string;
  readonly triageOwner: string;
  readonly eligibleForEvalFixture: boolean;
  readonly note: string | null;
  readonly evidence: Readonly<Record<string, unknown>>;
};

export type PrismaSummaryFeedbackCreate = PrismaSummaryFeedbackMutation & {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly summaryArtifactId: string;
  readonly interestId: string;
  readonly idempotencyKey: string;
  readonly createdAt: Date;
};

export type PrismaSummaryPolicyMutation = {
  readonly language: string;
  readonly format: string;
  readonly tone: string;
  readonly maxKeyPoints: number;
  readonly includeRisks: boolean;
  readonly includeSourceHighlights: boolean;
  readonly customInstructions: string | null;
  readonly rulesVersion: string;
  readonly updatedAt: Date;
};

export type PrismaSummaryPolicyCreate = PrismaSummaryPolicyMutation & {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
  readonly createdAt: Date;
};

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

export type PrismaSummaryClient = PrismaConversationClient & {
  readonly $queryRaw: <T = unknown>(
    query: TemplateStringsArray,
    ...values: readonly unknown[]
  ) => Promise<T>;
  readonly summaryJob: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly status: PrismaSummaryStatus;
        readonly idempotencyKey: string;
        readonly userId?: string | null;
        readonly subscriptionId?: string | null;
        readonly requestedAt: Date;
        readonly startedAt?: Date | null;
        readonly completedAt?: Date | null;
        readonly failedAt?: Date | null;
        readonly summaryArtifactId?: string | null;
        readonly failureReason?: string | null;
      };
      readonly create: {
        readonly id: string;
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly interestId: string;
        readonly userId?: string | null;
        readonly subscriptionId?: string | null;
        readonly status: PrismaSummaryStatus;
        readonly idempotencyKey: string;
        readonly requestedAt: Date;
        readonly startedAt?: Date | null;
        readonly completedAt?: Date | null;
        readonly failedAt?: Date | null;
        readonly summaryArtifactId?: string | null;
        readonly failureReason?: string | null;
      };
    }): Promise<PrismaSummaryJobRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id?: string;
        readonly idempotencyKey?: string;
      };
    }): Promise<PrismaSummaryJobRecord | null>;
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
    }): Promise<readonly PrismaSummaryJobRecord[]>;
  };
  readonly summaryArtifact: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaSummaryArtifactMutation;
      readonly create: PrismaSummaryArtifactCreate;
    }): Promise<PrismaSummaryArtifactRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id: string;
      };
    }): Promise<PrismaSummaryArtifactRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly interestId?: string;
        readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
      };
      readonly orderBy: readonly [
        { readonly createdAt: "desc" },
        { readonly id: "desc" },
      ];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaSummaryArtifactRecord[]>;
    count(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly interestId?: string;
        readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
      };
    }): Promise<number>;
  };
  readonly summaryFeedback: {
    upsert(args: {
      readonly where: {
        readonly tenantId_idempotencyKey: {
          readonly tenantId: string;
          readonly idempotencyKey: string;
        };
      };
      readonly update: PrismaSummaryFeedbackMutation;
      readonly create: PrismaSummaryFeedbackCreate;
    }): Promise<PrismaSummaryFeedbackRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly idempotencyKey: string;
      };
    }): Promise<PrismaSummaryFeedbackRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly summaryArtifactId?: string;
        readonly createdAt?: {
          readonly gte?: Date;
          readonly lte?: Date;
        };
      };
      readonly orderBy: readonly [
        { readonly createdAt: "desc" },
        { readonly id: "desc" },
      ];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaSummaryFeedbackRecord[]>;
    count(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly summaryArtifactId: string;
      };
    }): Promise<number>;
  };
  readonly summaryPolicy: {
    upsert(args: {
      readonly where: {
        readonly tenantId_workspaceId_interestId: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly interestId: string;
        };
      };
      readonly update: PrismaSummaryPolicyMutation;
      readonly create: PrismaSummaryPolicyCreate;
    }): Promise<PrismaSummaryPolicyRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly interestId: string;
      };
    }): Promise<PrismaSummaryPolicyRecord | null>;
  };
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
          | PrismaSummaryStatus
          | { readonly in: readonly PrismaSummaryStatus[] };
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
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id: string;
      };
    }): Promise<PrismaReaderSummaryArtifactRecord | null>;
    findMany(args: {
      readonly where: {
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
      };
      readonly orderBy: readonly [
        { readonly periodStartedAt: "desc" },
        { readonly createdAt: "desc" },
        { readonly id: "desc" },
      ];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaReaderSummaryArtifactRecord[]>;
    count(args: {
      readonly where: {
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
      };
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
  readonly outboxEvent: {
    create(args: {
      readonly data: {
        readonly id: string;
        readonly tenantId?: string | null;
        readonly workspaceId?: string | null;
        readonly eventType: string;
        readonly schemaVersion: number;
        readonly payload: Readonly<Record<string, unknown>>;
        readonly correlationId: string;
        readonly causationId?: string | null;
      };
    }): Promise<PrismaSummaryOutboxEventRecord>;
  };
};
