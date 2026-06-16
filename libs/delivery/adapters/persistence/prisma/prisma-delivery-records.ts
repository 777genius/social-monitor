import { correlationId, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import {
  Digest,
  DigestSchedule,
  type DigestProvenanceItem,
  type DigestProps,
  type DigestScheduleProps,
  type DigestScheduleStatus,
  DeliveryAttempt,
  type DeliveryAttemptProps,
  type DeliveryAttemptState,
  type DeliveryChannel,
  RealtimeEvent,
  type RealtimeEventProps,
  type RealtimeResourceType,
  WebhookEndpoint,
  type WebhookEndpointProps,
  type WebhookEndpointStatus,
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

export type PrismaDeliveryDigestStatus = 'ASSEMBLED' | 'EMPTY';
export type PrismaDigestScheduleStatus = 'ENABLED' | 'DISABLED';
export type PrismaWebhookEndpointStatus = 'ENABLED' | 'DISABLED' | 'QUARANTINED';

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

export type PrismaDigestRecord = {
  readonly id: string;
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

export type PrismaDigestScheduleRecord = {
  readonly id: string;
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

export type PrismaRealtimeEventRecord = {
  readonly id: string;
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

export type PrismaWebhookEndpointRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly url: string;
  readonly eventTypes: readonly string[];
  readonly status: PrismaWebhookEndpointStatus;
  readonly secretKeyId: string;
  readonly secretPreview: string;
  readonly createdAt: Date;
  readonly disabledAt: Date | null;
  readonly quarantinedAt: Date | null;
  readonly quarantineReason: string | null;
};

export type PrismaWebhookSecretRecord = {
  readonly id: string;
  readonly algorithm: string;
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
};

export type PrismaWebhookReplayDeliveryRecord = {
  readonly webhookEndpointId: string;
  readonly deliveryId: string;
  readonly rememberedAt: Date;
  readonly expiresAt: Date;
};

export type PrismaNotificationPreferenceRecord = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recipientKey: string;
  readonly channel: string;
  readonly allowed: boolean;
  readonly reason: string | null;
};

const deliveryChannels = ['in_app', 'email', 'webhook'] as const satisfies readonly DeliveryChannel[];
const resourceTypes = ['summary', 'digest', 'scan', 'feed'] as const satisfies readonly DeliveryAttemptProps['resourceType'][];
const realtimeResourceTypes = [
  'workspace',
  'topic',
  'source_binding',
  'summary',
  'scan',
] as const satisfies readonly RealtimeResourceType[];
const digestProvenanceResourceTypes = ['summary', 'feed_item'] as const satisfies readonly DigestProvenanceItem['resourceType'][];
const digestProvenanceReasons = [
  'within_window',
  'high_signal',
  'user_selected_topic',
] as const satisfies readonly DigestProvenanceItem['includedReason'][];

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

const digestStatusToPrismaMap: Record<DigestProps['status'], PrismaDeliveryDigestStatus> = {
  assembled: 'ASSEMBLED',
  empty: 'EMPTY',
};

const digestStatusFromPrismaMap: Record<PrismaDeliveryDigestStatus, DigestProps['status']> = {
  ASSEMBLED: 'assembled',
  EMPTY: 'empty',
};

const digestScheduleStatusToPrismaMap: Record<DigestScheduleStatus, PrismaDigestScheduleStatus> = {
  enabled: 'ENABLED',
  disabled: 'DISABLED',
};

const digestScheduleStatusFromPrismaMap: Record<PrismaDigestScheduleStatus, DigestScheduleStatus> = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
};

const webhookEndpointStatusToPrismaMap: Record<WebhookEndpointStatus, PrismaWebhookEndpointStatus> = {
  enabled: 'ENABLED',
  disabled: 'DISABLED',
  quarantined: 'QUARANTINED',
};

const webhookEndpointStatusFromPrismaMap: Record<PrismaWebhookEndpointStatus, WebhookEndpointStatus> = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  QUARANTINED: 'quarantined',
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

export const digestFromPrisma = (record: PrismaDigestRecord): Digest =>
  Digest.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    recipientKey: record.recipientKey,
    channel: deliveryChannelFromPrisma(record.channel),
    window: {
      windowId: record.windowId,
      startedAt: record.windowStartedAt,
      endedAt: record.windowEndedAt,
    },
    status: digestStatusFromPrisma(record.status),
    summaryIds: record.summaryIds,
    feedItemIds: record.feedItemIds,
    provenance: digestProvenanceFromPrisma(record.provenance),
    contentHash: record.contentHash,
    assembledAt: record.assembledAt,
  } satisfies DigestProps);

export const digestStatusToPrisma = (status: DigestProps['status']): PrismaDeliveryDigestStatus =>
  digestStatusToPrismaMap[status];

export const digestScheduleFromPrisma = (record: PrismaDigestScheduleRecord): DigestSchedule =>
  DigestSchedule.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    recipientKey: record.recipientKey,
    channel: deliveryChannelFromPrisma(record.channel),
    topicIds: record.topicIds,
    intervalSeconds: record.intervalSeconds,
    includeNoSignal: record.includeNoSignal,
    nextRunAt: record.nextRunAt,
    createdAt: record.createdAt,
    status: digestScheduleStatusFromPrisma(record.status),
  } satisfies DigestScheduleProps);

export const digestScheduleStatusToPrisma = (status: DigestScheduleStatus): PrismaDigestScheduleStatus =>
  digestScheduleStatusToPrismaMap[status];

export const realtimeEventFromPrisma = (record: PrismaRealtimeEventRecord): RealtimeEvent =>
  RealtimeEvent.rehydrate({
    id: record.id,
    protocolVersion: realtimeProtocolVersionFromPrisma(record.protocolVersion),
    eventType: record.eventType,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    channel: record.channel,
    resourceType: realtimeResourceTypeFromPrisma(record.resourceType),
    resourceId: record.resourceId,
    sequence: record.sequence,
    replayCursor: record.replayCursor,
    occurredAt: record.occurredAt,
    correlationId: correlationId(record.correlationId),
    payload: realtimePayloadFromPrisma(record.payload),
  } satisfies RealtimeEventProps);

export const webhookEndpointFromPrisma = (record: PrismaWebhookEndpointRecord): WebhookEndpoint =>
  WebhookEndpoint.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    url: record.url,
    eventTypes: record.eventTypes,
    status: webhookEndpointStatusFromPrisma(record.status),
    secretKeyId: record.secretKeyId,
    secretPreview: record.secretPreview,
    createdAt: record.createdAt,
    disabledAt: record.disabledAt ?? undefined,
    quarantinedAt: record.quarantinedAt ?? undefined,
    quarantineReason: record.quarantineReason ?? undefined,
  } satisfies WebhookEndpointProps);

export const webhookEndpointStatusToPrisma = (status: WebhookEndpointStatus): PrismaWebhookEndpointStatus =>
  webhookEndpointStatusToPrismaMap[status];

const deliveryAttemptStateFromPrisma = (state: PrismaDeliveryAttemptState): DeliveryAttemptState => {
  const mapped = deliveryAttemptStateFromPrismaMap[state];

  if (mapped === undefined) {
    throw new Error(`Unknown delivery attempt state from Prisma: ${state}`);
  }

  return mapped;
};

const digestStatusFromPrisma = (status: PrismaDeliveryDigestStatus): DigestProps['status'] => {
  const mapped = digestStatusFromPrismaMap[status];

  if (mapped === undefined) {
    throw new Error(`Unknown digest status from Prisma: ${status}`);
  }

  return mapped;
};

const digestScheduleStatusFromPrisma = (status: PrismaDigestScheduleStatus): DigestScheduleStatus => {
  const mapped = digestScheduleStatusFromPrismaMap[status];

  if (mapped === undefined) {
    throw new Error(`Unknown digest schedule status from Prisma: ${status}`);
  }

  return mapped;
};

const webhookEndpointStatusFromPrisma = (status: PrismaWebhookEndpointStatus): WebhookEndpointStatus => {
  const mapped = webhookEndpointStatusFromPrismaMap[status];

  if (mapped === undefined) {
    throw new Error(`Unknown webhook endpoint status from Prisma: ${status}`);
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

const realtimeProtocolVersionFromPrisma = (version: number): 1 => {
  if (version === 1) {
    return 1;
  }

  throw new Error(`Unknown realtime protocol version from Prisma: ${version}`);
};

const realtimeResourceTypeFromPrisma = (resourceType: string): RealtimeResourceType => {
  if ((realtimeResourceTypes as readonly string[]).includes(resourceType)) {
    return resourceType as RealtimeResourceType;
  }

  throw new Error(`Unknown realtime resource type from Prisma: ${resourceType}`);
};

const realtimePayloadFromPrisma = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }

  throw new Error('Realtime payload from Prisma must be an object');
};

const digestProvenanceFromPrisma = (value: unknown): readonly DigestProvenanceItem[] => {
  if (!Array.isArray(value)) {
    throw new Error('Digest provenance from Prisma must be an array');
  }

  return value.map((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Digest provenance item from Prisma must be an object');
    }

    const record = item as Readonly<Record<string, unknown>>;
    const resourceType = digestProvenanceResourceTypeFromPrisma(record.resourceType);
    const includedReason = digestProvenanceReasonFromPrisma(record.includedReason);

    if (typeof record.resourceId !== 'string' || record.resourceId.trim().length === 0) {
      throw new Error('Digest provenance resource id from Prisma must be non-empty');
    }

    if (typeof record.topicId !== 'string' || record.topicId.trim().length === 0) {
      throw new Error('Digest provenance topic id from Prisma must be non-empty');
    }

    return {
      resourceType,
      resourceId: record.resourceId,
      topicId: record.topicId,
      includedReason,
    };
  });
};

const digestProvenanceResourceTypeFromPrisma = (value: unknown): DigestProvenanceItem['resourceType'] => {
  if (typeof value === 'string' && (digestProvenanceResourceTypes as readonly string[]).includes(value)) {
    return value as DigestProvenanceItem['resourceType'];
  }

  throw new Error(`Unknown digest provenance resource type from Prisma: ${String(value)}`);
};

const digestProvenanceReasonFromPrisma = (value: unknown): DigestProvenanceItem['includedReason'] => {
  if (typeof value === 'string' && (digestProvenanceReasons as readonly string[]).includes(value)) {
    return value as DigestProvenanceItem['includedReason'];
  }

  throw new Error(`Unknown digest provenance reason from Prisma: ${String(value)}`);
};
