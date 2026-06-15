import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  DeliveryAttempt,
  type DeliveryAttemptProps,
  type DeliveryAttemptState,
  type DeliveryChannel,
} from '../../../domain';

export type PrismaDeliveryAttemptState =
  | 'QUEUED'
  | 'ASSEMBLING'
  | 'SUPPRESSED'
  | 'SENDING'
  | 'DELIVERED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_TERMINAL'
  | 'DEAD_LETTERED'
  | 'CANCELLED';

export type PrismaDeliveryAttemptRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly idempotencyKey: string;
  readonly channel: string;
  readonly recipientKey: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly state: PrismaDeliveryAttemptState;
  readonly queuedAt: Date;
  readonly assemblingAt: Date | null;
  readonly suppressedAt: Date | null;
  readonly sendingAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly failedAt: Date | null;
  readonly deadLetteredAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly failureReason: string | null;
  readonly suppressionReason: string | null;
};

const deliveryChannels = ['in_app', 'email', 'webhook'] as const satisfies readonly DeliveryChannel[];
const resourceTypes = ['summary', 'digest', 'scan', 'feed'] as const satisfies readonly DeliveryAttemptProps['resourceType'][];

const deliveryAttemptStateToPrismaMap: Record<DeliveryAttemptState, PrismaDeliveryAttemptState> = {
  queued: 'QUEUED',
  assembling: 'ASSEMBLING',
  suppressed: 'SUPPRESSED',
  sending: 'SENDING',
  delivered: 'DELIVERED',
  failed_retryable: 'FAILED_RETRYABLE',
  failed_terminal: 'FAILED_TERMINAL',
  dead_lettered: 'DEAD_LETTERED',
  cancelled: 'CANCELLED',
};

const deliveryAttemptStateFromPrismaMap: Record<PrismaDeliveryAttemptState, DeliveryAttemptState> = {
  QUEUED: 'queued',
  ASSEMBLING: 'assembling',
  SUPPRESSED: 'suppressed',
  SENDING: 'sending',
  DELIVERED: 'delivered',
  FAILED_RETRYABLE: 'failed_retryable',
  FAILED_TERMINAL: 'failed_terminal',
  DEAD_LETTERED: 'dead_lettered',
  CANCELLED: 'cancelled',
};

export const deliveryAttemptFromPrisma = (record: PrismaDeliveryAttemptRecord): DeliveryAttempt =>
  DeliveryAttempt.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    idempotencyKey: record.idempotencyKey,
    channel: deliveryChannelFromPrisma(record.channel),
    recipientKey: record.recipientKey,
    resourceType: resourceTypeFromPrisma(record.resourceType),
    resourceId: record.resourceId,
    state: deliveryAttemptStateFromPrisma(record.state),
    queuedAt: record.queuedAt,
    assemblingAt: record.assemblingAt ?? undefined,
    suppressedAt: record.suppressedAt ?? undefined,
    sendingAt: record.sendingAt ?? undefined,
    deliveredAt: record.deliveredAt ?? undefined,
    failedAt: record.failedAt ?? undefined,
    deadLetteredAt: record.deadLetteredAt ?? undefined,
    cancelledAt: record.cancelledAt ?? undefined,
    retryCount: record.retryCount,
    maxRetries: record.maxRetries,
    failureReason: record.failureReason ?? undefined,
    suppressionReason: record.suppressionReason ?? undefined,
  } satisfies DeliveryAttemptProps);

export const deliveryAttemptStateToPrisma = (state: DeliveryAttemptState): PrismaDeliveryAttemptState =>
  deliveryAttemptStateToPrismaMap[state];

const deliveryAttemptStateFromPrisma = (state: PrismaDeliveryAttemptState): DeliveryAttemptState => {
  const mapped = deliveryAttemptStateFromPrismaMap[state];

  if (mapped === undefined) {
    throw new Error(`Unknown delivery attempt state from Prisma: ${state}`);
  }

  return mapped;
};

const deliveryChannelFromPrisma = (channel: string): DeliveryChannel => {
  if ((deliveryChannels as readonly string[]).includes(channel)) {
    return channel as DeliveryChannel;
  }

  throw new Error(`Unknown delivery channel from Prisma: ${channel}`);
};

const resourceTypeFromPrisma = (resourceType: string): DeliveryAttemptProps['resourceType'] => {
  if ((resourceTypes as readonly string[]).includes(resourceType)) {
    return resourceType as DeliveryAttemptProps['resourceType'];
  }

  throw new Error(`Unknown delivery resource type from Prisma: ${resourceType}`);
};
