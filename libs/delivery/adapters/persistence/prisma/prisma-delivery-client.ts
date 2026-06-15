import type {
  PrismaDeliveryAttemptRecord,
  PrismaDeliveryAttemptState,
  PrismaDeliveryDigestStatus,
  PrismaDigestRecord,
  PrismaDigestScheduleRecord,
  PrismaDigestScheduleStatus,
  PrismaRealtimeEventRecord,
} from './prisma-delivery-records';

export type PrismaDeliveryAttemptWriteData = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly idempotencyKey: string;
  readonly channel: string;
  readonly recipientKey: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly state: PrismaDeliveryAttemptState;
  readonly queuedAt: Date;
  readonly assemblingAt?: Date | null;
  readonly suppressedAt?: Date | null;
  readonly sendingAt?: Date | null;
  readonly deliveredAt?: Date | null;
  readonly failedAt?: Date | null;
  readonly deadLetteredAt?: Date | null;
  readonly cancelledAt?: Date | null;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly failureReason?: string | null;
  readonly suppressionReason?: string | null;
};

export type PrismaDigestWriteData = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recipientKey: string;
  readonly channel: string;
  readonly windowId: string;
  readonly windowStartedAt: Date;
  readonly windowEndedAt: Date;
  readonly status: PrismaDeliveryDigestStatus;
  readonly summaryIds: readonly string[];
  readonly feedItemIds: readonly string[];
  readonly provenance: unknown;
  readonly contentHash: string;
  readonly assembledAt: Date;
};

export type PrismaDigestScheduleWriteData = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recipientKey: string;
  readonly channel: string;
  readonly topicIds: readonly string[];
  readonly intervalSeconds: number;
  readonly includeNoSignal: boolean;
  readonly nextRunAt: Date;
  readonly createdAt: Date;
  readonly status: PrismaDigestScheduleStatus;
};

export type PrismaRealtimeEventWriteData = {
  readonly protocolVersion: number;
  readonly eventType: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly channel: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly sequence: number;
  readonly replayCursor: string;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly payload: unknown;
};

export type PrismaDeliveryClient = {
  readonly deliveryAttempt: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaDeliveryAttemptWriteData;
      readonly create: PrismaDeliveryAttemptWriteData & { readonly id: string };
    }): Promise<PrismaDeliveryAttemptRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id?: string;
        readonly idempotencyKey?: string;
      };
    }): Promise<PrismaDeliveryAttemptRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
      };
      readonly orderBy: readonly [
        { readonly queuedAt: 'desc' },
        { readonly id: 'desc' },
      ];
      readonly skip: number;
      readonly take: number;
    }): Promise<readonly PrismaDeliveryAttemptRecord[]>;
    count(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
      };
    }): Promise<number>;
  };
  readonly digest: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaDigestWriteData;
      readonly create: PrismaDigestWriteData & { readonly id: string };
    }): Promise<PrismaDigestRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id?: string;
        readonly recipientKey?: string;
        readonly channel?: string;
        readonly windowId?: string;
      };
    }): Promise<PrismaDigestRecord | null>;
  };
  readonly digestSchedule: {
    upsert(args: {
      readonly where: { readonly id: string };
      readonly update: PrismaDigestScheduleWriteData;
      readonly create: PrismaDigestScheduleWriteData & { readonly id: string };
    }): Promise<PrismaDigestScheduleRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly id: string;
      };
    }): Promise<PrismaDigestScheduleRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId?: string;
        readonly workspaceId?: string;
        readonly status: PrismaDigestScheduleStatus;
        readonly nextRunAt: { readonly lte: Date };
      };
      readonly orderBy: readonly [
        { readonly nextRunAt: 'asc' },
        { readonly id: 'asc' },
      ];
      readonly take: number;
    }): Promise<readonly PrismaDigestScheduleRecord[]>;
  };
  readonly realtimeEvent: {
    create(args: {
      readonly data: PrismaRealtimeEventWriteData & { readonly id: string };
    }): Promise<PrismaRealtimeEventRecord>;
    findFirst(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly channel: string;
      };
      readonly orderBy: { readonly sequence: 'desc' };
    }): Promise<PrismaRealtimeEventRecord | null>;
    findMany(args: {
      readonly where: {
        readonly tenantId: string;
        readonly workspaceId: string;
        readonly channel: string;
        readonly sequence?: { readonly gt: number };
      };
      readonly orderBy: readonly [
        { readonly sequence: 'asc' },
        { readonly id: 'asc' },
      ];
      readonly take: number;
    }): Promise<readonly PrismaRealtimeEventRecord[]>;
  };
};
