import type {
  PrismaRelevanceFeedbackSignalRecord,
  PrismaRelevanceMemoryProjectionRecord,
  PrismaUserRelevanceProfileRecord,
} from './prisma-relevance-records';

export type PrismaUserRelevanceProfileMutation = {
  readonly interestWeights: readonly unknown[];
  readonly sourceWeights: readonly unknown[];
  readonly keywordWeights: readonly unknown[];
  readonly mutedKeywords: readonly string[];
  readonly blockedProviderKeys: readonly string[];
  readonly rulesVersion: string;
  readonly updatedAt: Date;
};

export type PrismaUserRelevanceProfileCreate = PrismaUserRelevanceProfileMutation & {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly createdAt: Date;
};

export type PrismaRelevanceFeedbackSignalCreate = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly action: string;
  readonly rating: number | null;
  readonly target: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
};

export type PrismaRelevanceMemoryProjectionMutation = {
  readonly status: string;
  readonly retryCount: number;
  readonly nextAttemptAt: Date;
  readonly projectedAt: Date | null;
  readonly lastError: string | null;
  readonly updatedAt: Date;
};

export type PrismaRelevanceMemoryProjectionCreate = PrismaRelevanceMemoryProjectionMutation & {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly feedbackId: string;
  readonly userId: string;
  readonly idempotencyKey: string;
  readonly action: string;
  readonly rating: number | null;
  readonly target: Readonly<Record<string, unknown>>;
  readonly learningDirection: string;
  readonly createdAt: Date;
};

export type PrismaUserRelevanceProfileWhereUnique = {
  readonly tenantId_workspaceId_userId: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly userId: string;
  };
};

export type PrismaRelevanceFeedbackSignalWhereUnique = {
  readonly tenantId_workspaceId_idempotencyKey: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly idempotencyKey: string;
  };
};

export type PrismaRelevanceFeedbackSignalWhereMany = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId?: string;
  readonly action?: string;
};

export type PrismaRelevanceMemoryProjectionWhereUnique = {
  readonly tenantId_workspaceId_feedbackId: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly feedbackId: string;
  };
};

export type PrismaRelevanceTransactionOptions = {
  readonly isolationLevel?: 'Serializable';
  readonly maxWait?: number;
  readonly timeout?: number;
};

export type PrismaUserRelevanceProfileDelegate = {
  upsert(args: {
    readonly where: PrismaUserRelevanceProfileWhereUnique;
    readonly update: PrismaUserRelevanceProfileMutation;
    readonly create: PrismaUserRelevanceProfileCreate;
  }): Promise<PrismaUserRelevanceProfileRecord>;
  findFirst(args: {
    readonly where: {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly userId: string;
    };
  }): Promise<PrismaUserRelevanceProfileRecord | null>;
};

export type PrismaRelevanceFeedbackSignalDelegate = {
  upsert(args: {
    readonly where: PrismaRelevanceFeedbackSignalWhereUnique;
    readonly update: Record<string, never>;
    readonly create: PrismaRelevanceFeedbackSignalCreate;
  }): Promise<PrismaRelevanceFeedbackSignalRecord>;
  findFirst(args: {
    readonly where: {
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly idempotencyKey: string;
    };
  }): Promise<PrismaRelevanceFeedbackSignalRecord | null>;
  findMany(args: {
    readonly where: PrismaRelevanceFeedbackSignalWhereMany;
    readonly orderBy: readonly [
      { readonly createdAt: 'desc' },
      { readonly id: 'desc' },
    ];
    readonly take: number;
  }): Promise<readonly PrismaRelevanceFeedbackSignalRecord[]>;
};

export type PrismaRelevanceMemoryProjectionDelegate = {
  upsert(args: {
    readonly where: PrismaRelevanceMemoryProjectionWhereUnique;
    readonly update: PrismaRelevanceMemoryProjectionMutation | Record<string, never>;
    readonly create: PrismaRelevanceMemoryProjectionCreate;
  }): Promise<PrismaRelevanceMemoryProjectionRecord>;
  findMany(args: {
    readonly where: {
      readonly status: { readonly in: readonly string[] };
      readonly nextAttemptAt: { readonly lte: Date };
      readonly tenantId?: string;
      readonly workspaceId?: string;
    };
    readonly orderBy: readonly [
      { readonly nextAttemptAt: 'asc' },
      { readonly createdAt: 'asc' },
      { readonly id: 'asc' },
    ];
    readonly take: number;
  }): Promise<readonly PrismaRelevanceMemoryProjectionRecord[]>;
  update(args: {
    readonly where: { readonly id: string };
    readonly data: PrismaRelevanceMemoryProjectionMutation;
  }): Promise<PrismaRelevanceMemoryProjectionRecord>;
};

export type PrismaRelevanceTransactionClient = {
  readonly userRelevanceProfile: PrismaUserRelevanceProfileDelegate;
  readonly relevanceFeedbackSignal: PrismaRelevanceFeedbackSignalDelegate;
  readonly relevanceMemoryProjection: PrismaRelevanceMemoryProjectionDelegate;
};

export type PrismaRelevanceClient = {
  $transaction<TValue>(
    operation: (client: PrismaRelevanceTransactionClient) => Promise<TValue>,
    options?: PrismaRelevanceTransactionOptions,
  ): Promise<TValue>;
} & PrismaRelevanceTransactionClient;
