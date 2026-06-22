import type {
  PrismaRelevanceFeedbackSignalRecord,
  PrismaUserRelevanceProfileRecord,
} from './prisma-relevance-records';

export type PrismaUserRelevanceProfileMutation = {
  readonly topicWeights: readonly unknown[];
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

export type PrismaRelevanceClient = {
  readonly userRelevanceProfile: {
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
  readonly relevanceFeedbackSignal: {
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
  };
};
