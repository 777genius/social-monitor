import type {
  PrismaSourceTargetRecord,
  PrismaUserSubscriptionRecord,
  PrismaUserSubscriptionScheduleRecord,
  PrismaUserSubscriptionScheduleStatus,
  PrismaUserSubscriptionStatus,
  PrismaUserSummaryPreferenceRecord,
} from './prisma-subscriptions-records';

export type PrismaSourceTargetMutation = {
  readonly providerKey: string;
  readonly targetKind: string;
  readonly targetValue: string;
  readonly normalizedKey: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly updatedAt: Date;
};

export type PrismaSourceTargetCreate = PrismaSourceTargetMutation & {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly createdAt: Date;
};

export type PrismaUserSubscriptionMutation = {
  readonly userId: string;
  readonly sourceTargetId: string;
  readonly status: PrismaUserSubscriptionStatus;
  readonly updatedAt: Date;
};

export type PrismaUserSubscriptionCreate = PrismaUserSubscriptionMutation & {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly createdAt: Date;
};

export type PrismaUserSubscriptionScheduleMutation = {
  readonly recipientKey: string;
  readonly channel: string;
  readonly intervalSeconds: number;
  readonly includeNoSignal: boolean;
  readonly nextRunAt: Date;
  readonly status: PrismaUserSubscriptionScheduleStatus;
  readonly updatedAt: Date;
};

export type PrismaUserSubscriptionScheduleCreate = PrismaUserSubscriptionScheduleMutation & {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly subscriptionId: string;
  readonly createdAt: Date;
};

export type PrismaUserSummaryPreferenceMutation = {
  readonly language: string | null;
  readonly format: string | null;
  readonly tone: string | null;
  readonly maxKeyPoints: number | null;
  readonly includeRisks: boolean | null;
  readonly includeSourceHighlights: boolean | null;
  readonly customInstructions: string | null;
  readonly rulesVersion: string;
  readonly updatedAt: Date;
};

export type PrismaUserSummaryPreferenceCreate = PrismaUserSummaryPreferenceMutation & {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly subscriptionId: string | null;
  readonly topicId: string | null;
  readonly createdAt: Date;
};

export type PrismaSubscriptionsClient = {
  readonly sourceTarget: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaSourceTargetMutation;
      readonly create: PrismaSourceTargetCreate;
    }): Promise<PrismaSourceTargetRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id?: string;
        readonly providerKey?: string;
        readonly normalizedKey?: string;
      };
    }): Promise<PrismaSourceTargetRecord | null>;
  };
  readonly userSubscription: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaUserSubscriptionMutation;
      readonly create: PrismaUserSubscriptionCreate;
    }): Promise<PrismaUserSubscriptionRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id?: string;
        readonly userId?: string;
        readonly sourceTargetId?: string;
      };
    }): Promise<PrismaUserSubscriptionRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly userId: string;
      };
      readonly orderBy: readonly [{ readonly createdAt: 'desc' }, { readonly id: 'desc' }];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaUserSubscriptionRecord[]>;
    count(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly userId: string;
      };
    }): Promise<number>;
  };
  readonly userSubscriptionSchedule: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaUserSubscriptionScheduleMutation;
      readonly create: PrismaUserSubscriptionScheduleCreate;
    }): Promise<PrismaUserSubscriptionScheduleRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly subscriptionId: string;
      };
    }): Promise<PrismaUserSubscriptionScheduleRecord | null>;
  };
  readonly userSummaryPreference: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaUserSummaryPreferenceMutation;
      readonly create: PrismaUserSummaryPreferenceCreate;
    }): Promise<PrismaUserSummaryPreferenceRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly userId: string;
        readonly subscriptionId?: string | null;
        readonly topicId?: string | null;
      };
    }): Promise<PrismaUserSummaryPreferenceRecord | null>;
  };
};
