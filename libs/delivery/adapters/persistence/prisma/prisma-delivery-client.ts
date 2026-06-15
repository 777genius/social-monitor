import type { PrismaDeliveryAttemptRecord, PrismaDeliveryAttemptState } from './prisma-delivery-records';

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
};
