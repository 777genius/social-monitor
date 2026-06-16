import type {
  PrismaSummaryArtifactRecord,
  PrismaSummaryFeedbackRecord,
  PrismaSummaryStatus,
  PrismaSummaryJobRecord,
  PrismaSummaryPolicyRecord,
} from './prisma-summary-records';

export type PrismaSummaryArtifactMutation = {
  readonly status: PrismaSummaryStatus;
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
  readonly topicId: string;
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
  readonly topicId: string;
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
  readonly topicId: string;
  readonly createdAt: Date;
};

export type PrismaSummaryClient = {
  readonly summaryJob: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: {
        readonly status: PrismaSummaryStatus;
        readonly idempotencyKey: string;
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
        readonly topicId: string;
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
        readonly topicId?: string;
        readonly status?: { readonly in: readonly PrismaSummaryStatus[] };
      };
      readonly orderBy: readonly [{ readonly createdAt: 'desc' }, { readonly id: 'desc' }];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaSummaryArtifactRecord[]>;
    count(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly topicId?: string;
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
        readonly summaryArtifactId: string;
      };
      readonly orderBy: readonly [{ readonly createdAt: 'desc' }, { readonly id: 'desc' }];
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
        readonly tenantId_workspaceId_topicId: {
          readonly tenantId: string;
          readonly workspaceId: string;
          readonly topicId: string;
        };
      };
      readonly update: PrismaSummaryPolicyMutation;
      readonly create: PrismaSummaryPolicyCreate;
    }): Promise<PrismaSummaryPolicyRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly topicId: string;
      };
    }): Promise<PrismaSummaryPolicyRecord | null>;
  };
};
