import type { PrismaDeliveryAttemptRecord, PrismaDeliveryAttemptState } from './prisma-delivery-records';

export type PrismaDeliveryWorkflowRecord = PrismaDeliveryAttemptRecord & {
  readonly dispatchCommandId: string | null;
  readonly executionToken: string | null;
  readonly executionLeaseExpiresAt: Date | null;
};

export type PrismaDeliveryWorkflowWhere = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly state?: PrismaDeliveryAttemptState;
  readonly retryCount?: number;
  readonly dispatchCommandId?: string | null;
  readonly executionToken?: string | null;
  readonly executionLeaseExpiresAt?: { readonly gt: Date };
};

export type PrismaDeliveryWorkflowUpdate = {
  readonly state: PrismaDeliveryAttemptState;
  readonly assemblingAt: Date | null;
  readonly suppressedAt: Date | null;
  readonly sendingAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly failedAt: Date | null;
  readonly deadLetteredAt: Date | null;
  readonly retryCount: number;
  readonly failureReason: string | null;
  readonly suppressionReason: string | null;
  readonly dispatchCommandId: string | null;
  readonly executionToken: string | null;
  readonly executionLeaseExpiresAt: Date | null;
};

export type PrismaDeliveryWorkflowTransaction = {
  readonly deliveryAttempt: {
    findFirst(args: { readonly where: PrismaDeliveryWorkflowWhere }): Promise<PrismaDeliveryWorkflowRecord | null>;
    updateMany(args: {
      readonly where: PrismaDeliveryWorkflowWhere;
      readonly data: PrismaDeliveryWorkflowUpdate;
    }): Promise<{ readonly count: number }>;
  };
  readonly outboxEvent: {
    create(args: { readonly data: {
      readonly id: string;
      readonly tenantId: string;
      readonly workspaceId: string;
      readonly messageKind: 'COMMAND';
      readonly eventType: 'delivery.attempt.send';
      readonly schemaVersion: 1;
      readonly payload: unknown;
      readonly correlationId: string;
      readonly causationId: string | null;
      readonly availableAt: Date;
    } }): Promise<unknown>;
  };
};

export type PrismaDeliveryWorkflowClient = {
  $transaction<T>(
    operation: (transaction: PrismaDeliveryWorkflowTransaction) => Promise<T>,
    options: { readonly isolationLevel: 'Serializable' },
  ): Promise<T>;
};
