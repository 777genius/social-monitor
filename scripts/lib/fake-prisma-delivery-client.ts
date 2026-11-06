import type { IdGenerator } from '@social-monitor/shared-kernel';
import type {
  PrismaDeliveryAttemptWriteData,
  PrismaDeliveryClient,
  PrismaDigestScheduleWriteData,
  PrismaDigestWriteData,
  PrismaRealtimeEventWriteData,
  PrismaWebhookEndpointWriteData,
  PrismaWebhookReplayDeliveryWriteData,
} from '../../libs/delivery/adapters/persistence/prisma/prisma-delivery-client';
import type {
  PrismaDeliveryAttemptRecord,
  PrismaDigestSourceFeedItemRecord,
  PrismaDigestSourceSummaryRecord,
  PrismaDigestRecord,
  PrismaDigestScheduleRecord,
  PrismaNotificationPreferenceRecord,
  PrismaRealtimeEventRecord,
  PrismaWebhookEndpointRecord,
  PrismaWebhookReplayDeliveryRecord,
} from '../../libs/delivery/adapters/persistence/prisma/prisma-delivery-records';
import { createFakePrismaWebhookSecretDelegate } from './fake-prisma-webhook-secret-delegate';

export class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.index];

    if (value === undefined) {
      throw new Error('SequenceIdGenerator exhausted');
    }

    this.index += 1;

    return value;
  }
}

export class FakePrismaDeliveryClient implements PrismaDeliveryClient {
  private readonly attempts = new Map<string, PrismaDeliveryAttemptRecord>();
  private readonly digests = new Map<string, PrismaDigestRecord>();
  private readonly feedItems = new Map<string, PrismaDigestSourceFeedItemRecord>();
  private readonly notificationPreferences = new Map<string, PrismaNotificationPreferenceRecord>();
  private readonly realtimeEvents = new Map<string, PrismaRealtimeEventRecord>();
  private readonly schedules = new Map<string, PrismaDigestScheduleRecord>();
  private readonly summaryArtifacts = new Map<string, PrismaDigestSourceSummaryRecord>();
  private readonly webhookEndpoints = new Map<string, PrismaWebhookEndpointRecord>();
  private readonly webhookReplayDeliveries = new Map<string, PrismaWebhookReplayDeliveryRecord>();

  seedDigestSourceSummary(record: PrismaDigestSourceSummaryRecord): void {
    this.summaryArtifacts.set(record.id, record);
  }

  seedDigestSourceFeedItem(record: PrismaDigestSourceFeedItemRecord): void {
    this.feedItems.set(record.id, record);
  }

  readonly deliveryAttempt: PrismaDeliveryClient['deliveryAttempt'] = {
    upsert: async (args) => {
      const existing = this.attempts.get(args.where.id);
      const record: PrismaDeliveryAttemptRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeWriteData(args.update),
      };
      this.attempts.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.attempts.values()].find((record) => matchesDeliveryAttemptWhere(record, args.where)) ?? null,
    findMany: async (args) =>
      [...this.attempts.values()]
        .filter((record) => matchesDeliveryAttemptWhere(record, args.where))
        .sort(isDeliveryAttemptAscendingOrder(args.orderBy)
          ? compareDeliveryAttemptRecordsAsc
          : compareDeliveryAttemptRecordsDesc)
        .slice(args.skip ?? 0, (args.skip ?? 0) + args.take),
    count: async (args) =>
      [...this.attempts.values()].filter((record) => matchesDeliveryAttemptWhere(record, args.where)).length,
  };

  readonly digest: PrismaDeliveryClient['digest'] = {
    upsert: async (args) => {
      const existing = this.digests.get(args.where.id);
      const record: PrismaDigestRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeDigestWriteData(args.update),
      };
      this.digests.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.digests.values()].find((record) => matchesDigestWhere(record, args.where)) ?? null,
  };

  readonly summaryArtifact: PrismaDeliveryClient['summaryArtifact'] = {
    findMany: async (args) =>
      [...this.summaryArtifacts.values()]
        .filter((record) => matchesDigestSourceSummaryWhere(record, args.where))
        .sort(compareDigestSourceSummaryRecords)
        .slice(0, args.take),
  };

  readonly feedItem: PrismaDeliveryClient['feedItem'] = {
    findMany: async (args) =>
      [...this.feedItems.values()]
        .filter((record) => matchesDigestSourceFeedItemWhere(record, args.where))
        .sort(compareDigestSourceFeedItemRecords)
        .slice(0, args.take),
  };

  readonly digestSchedule: PrismaDeliveryClient['digestSchedule'] = {
    upsert: async (args) => {
      const existing = this.schedules.get(args.where.id);
      const record: PrismaDigestScheduleRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeDigestScheduleWriteData(args.update),
      };
      this.schedules.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.schedules.values()].find((record) => matchesDigestScheduleWhere(record, args.where)) ?? null,
    findMany: async (args) =>
      [...this.schedules.values()]
        .filter((record) => matchesDigestScheduleWhere(record, args.where))
        .sort(isDigestScheduleCreatedOrder(args.orderBy)
          ? compareDigestScheduleRecordsByCreation
          : compareDigestScheduleRecordsByNextRun)
        .slice(args.skip ?? 0, (args.skip ?? 0) + args.take),
  };

  readonly realtimeEvent: PrismaDeliveryClient['realtimeEvent'] = {
    create: async (args) => {
      if ([...this.realtimeEvents.values()].some((record) => isRealtimeEventUniqueConflict(record, args.data))) {
        throw Object.assign(new Error('Unique realtime event constraint violation'), { code: 'P2002' });
      }

      const record: PrismaRealtimeEventRecord = {
        id: args.data.id,
        ...normalizeRealtimeEventWriteData(args.data),
      };
      this.realtimeEvents.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.realtimeEvents.values()]
        .filter((record) => matchesRealtimeEventWhere(record, args.where))
        .sort(compareRealtimeEventRecordsDesc)
        .at(0) ?? null,
    findMany: async (args) =>
      [...this.realtimeEvents.values()]
        .filter((record) => matchesRealtimeEventWhere(record, args.where))
        .sort(compareRealtimeEventRecordsAsc)
        .slice(0, args.take),
  };

  readonly webhookEndpoint: PrismaDeliveryClient['webhookEndpoint'] = {
    upsert: async (args) => {
      const existing = this.webhookEndpoints.get(args.where.id);
      const record: PrismaWebhookEndpointRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeWebhookEndpointWriteData(args.update),
      };
      this.webhookEndpoints.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.webhookEndpoints.values()].find((record) => matchesWebhookEndpointWhere(record, args.where)) ?? null,
    findMany: async (args) =>
      [...this.webhookEndpoints.values()]
        .filter((record) => matchesWebhookEndpointWhere(record, args.where))
        .sort(compareWebhookEndpointRecords)
        .slice(args.skip, args.skip + args.take),
    count: async (args) =>
      [...this.webhookEndpoints.values()].filter((record) => matchesWebhookEndpointWhere(record, args.where)).length,
  };

  readonly webhookSecret = createFakePrismaWebhookSecretDelegate();

  readonly webhookReplayDelivery: PrismaDeliveryClient['webhookReplayDelivery'] = {
    findUnique: async (args) =>
      this.webhookReplayDeliveries.get(webhookReplayDeliveryKey(args.where.webhookEndpointId_deliveryId)) ?? null,
    create: async (args) => {
      const key = webhookReplayDeliveryKey(args.data);

      if (this.webhookReplayDeliveries.has(key)) {
        throw Object.assign(new Error('Unique webhook replay delivery constraint violation'), { code: 'P2002' });
      }

      const record: PrismaWebhookReplayDeliveryRecord = normalizeWebhookReplayDeliveryWriteData(args.data);
      this.webhookReplayDeliveries.set(key, record);

      return record;
    },
    update: async (args) => {
      const key = webhookReplayDeliveryKey(args.where.webhookEndpointId_deliveryId);
      const existing = this.webhookReplayDeliveries.get(key);

      if (existing === undefined) {
        throw new Error('Webhook replay delivery not found');
      }

      const record: PrismaWebhookReplayDeliveryRecord = {
        ...existing,
        rememberedAt: args.data.rememberedAt,
        expiresAt: args.data.expiresAt,
      };
      this.webhookReplayDeliveries.set(key, record);

      return record;
    },
  };

  readonly notificationPreference: PrismaDeliveryClient['notificationPreference'] = {
    upsert: async (args) => {
      const key = notificationPreferenceKey(args.create);
      const existing = this.notificationPreferences.get(key);
      const record: PrismaNotificationPreferenceRecord = {
        ...(existing ?? {
          tenantId: args.create.tenantId,
          workspaceId: args.create.workspaceId,
          recipientKey: args.create.recipientKey,
          channel: args.create.channel,
        }),
        allowed: args.update.allowed,
        reason: args.update.reason ?? null,
      };
      this.notificationPreferences.set(key, record);

      return record;
    },
    findUnique: async (args) =>
      this.notificationPreferences.get(
        notificationPreferenceKey(args.where.tenantId_workspaceId_recipientKey_channel),
      ) ?? null,
  };
}

const normalizeWriteData = (data: PrismaDeliveryAttemptWriteData): Omit<PrismaDeliveryAttemptRecord, 'id'> => ({
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  idempotencyKey: data.idempotencyKey,
  channel: data.channel,
  recipientKey: data.recipientKey,
  resourceType: data.resourceType,
  resourceId: data.resourceId,
  state: data.state,
  queuedAt: data.queuedAt,
  assemblingAt: data.assemblingAt ?? null,
  suppressedAt: data.suppressedAt ?? null,
  sendingAt: data.sendingAt ?? null,
  deliveredAt: data.deliveredAt ?? null,
  failedAt: data.failedAt ?? null,
  deadLetteredAt: data.deadLetteredAt ?? null,
  cancelledAt: data.cancelledAt ?? null,
  retryCount: data.retryCount,
  maxRetries: data.maxRetries,
  failureReason: data.failureReason ?? null,
  suppressionReason: data.suppressionReason ?? null,
});

const normalizeDigestWriteData = (data: PrismaDigestWriteData): Omit<PrismaDigestRecord, 'id'> => ({
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  recipientKey: data.recipientKey,
  channel: data.channel,
  windowId: data.windowId,
  windowStartedAt: data.windowStartedAt,
  windowEndedAt: data.windowEndedAt,
  status: data.status,
  summaryIds: data.summaryIds,
  feedItemIds: data.feedItemIds,
  provenance: data.provenance,
  contentHash: data.contentHash,
  assembledAt: data.assembledAt,
});

const normalizeDigestScheduleWriteData = (
  data: PrismaDigestScheduleWriteData,
): Omit<PrismaDigestScheduleRecord, 'id'> => ({
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  recipientKey: data.recipientKey,
  channel: data.channel,
  interestIds: data.interestIds,
  intervalSeconds: data.intervalSeconds,
  includeNoSignal: data.includeNoSignal,
  nextRunAt: data.nextRunAt,
  createdAt: data.createdAt,
  status: data.status,
});

const normalizeRealtimeEventWriteData = (
  data: PrismaRealtimeEventWriteData,
): Omit<PrismaRealtimeEventRecord, 'id'> => ({
  protocolVersion: data.protocolVersion,
  eventType: data.eventType,
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  channel: data.channel,
  resourceType: data.resourceType,
  resourceId: data.resourceId,
  sequence: data.sequence,
  replayCursor: data.replayCursor,
  occurredAt: data.occurredAt,
  correlationId: data.correlationId,
  payload: data.payload,
});

const normalizeWebhookEndpointWriteData = (
  data: PrismaWebhookEndpointWriteData,
): Omit<PrismaWebhookEndpointRecord, 'id'> => ({
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  url: data.url,
  eventTypes: data.eventTypes,
  status: data.status,
  secretKeyId: data.secretKeyId,
  secretPreview: data.secretPreview,
  createdAt: data.createdAt,
  disabledAt: data.disabledAt ?? null,
  quarantinedAt: data.quarantinedAt ?? null,
  quarantineReason: data.quarantineReason ?? null,
});

const normalizeWebhookReplayDeliveryWriteData = (
  data: PrismaWebhookReplayDeliveryWriteData,
): PrismaWebhookReplayDeliveryRecord => ({
  webhookEndpointId: data.webhookEndpointId,
  deliveryId: data.deliveryId,
  rememberedAt: data.rememberedAt,
  expiresAt: data.expiresAt,
});

const notificationPreferenceKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recipientKey: string;
  readonly channel: string;
}): string => [params.tenantId, params.workspaceId, params.recipientKey, params.channel].join(':');

const matchesDeliveryAttemptWhere = (
  record: PrismaDeliveryAttemptRecord,
  where: {
    readonly tenantId?: string;
    readonly workspaceId?: string;
    readonly id?: string;
    readonly idempotencyKey?: string;
    readonly state?: PrismaDeliveryAttemptRecord['state'] | { readonly in: readonly PrismaDeliveryAttemptRecord['state'][] };
  },
): boolean =>
  (where.tenantId === undefined || record.tenantId === where.tenantId) &&
  (where.workspaceId === undefined || record.workspaceId === where.workspaceId) &&
  (where.id === undefined || record.id === where.id) &&
  (where.idempotencyKey === undefined || record.idempotencyKey === where.idempotencyKey) &&
  matchesDeliveryAttemptState(record.state, where.state);

const matchesDeliveryAttemptState = (
  state: PrismaDeliveryAttemptRecord['state'],
  filter: PrismaDeliveryAttemptRecord['state'] | { readonly in: readonly PrismaDeliveryAttemptRecord['state'][] } | undefined,
): boolean => {
  if (filter === undefined) {
    return true;
  }

  if (typeof filter === 'string') {
    return state === filter;
  }

  return filter.in.includes(state);
};

const isDeliveryAttemptAscendingOrder = (
  orderBy: Parameters<PrismaDeliveryClient['deliveryAttempt']['findMany']>[0]['orderBy'],
): boolean => orderBy[0].queuedAt === 'asc';

const compareDeliveryAttemptRecordsDesc = (
  left: PrismaDeliveryAttemptRecord,
  right: PrismaDeliveryAttemptRecord,
): number => {
  const queuedDiff = right.queuedAt.getTime() - left.queuedAt.getTime();

  if (queuedDiff !== 0) {
    return queuedDiff;
  }

  return right.id.localeCompare(left.id);
};

const compareDeliveryAttemptRecordsAsc = (
  left: PrismaDeliveryAttemptRecord,
  right: PrismaDeliveryAttemptRecord,
): number => {
  const queuedDiff = left.queuedAt.getTime() - right.queuedAt.getTime();

  if (queuedDiff !== 0) {
    return queuedDiff;
  }

  return left.id.localeCompare(right.id);
};

const matchesDigestWhere = (
  record: PrismaDigestRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly id?: string;
    readonly recipientKey?: string;
    readonly channel?: string;
    readonly windowId?: string;
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  (where.id === undefined || record.id === where.id) &&
  (where.recipientKey === undefined || record.recipientKey === where.recipientKey) &&
  (where.channel === undefined || record.channel === where.channel) &&
  (where.windowId === undefined || record.windowId === where.windowId);

const matchesDigestSourceSummaryWhere = (
  record: PrismaDigestSourceSummaryRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId: { readonly in: readonly string[] };
    readonly status: { readonly in: readonly PrismaDigestSourceSummaryRecord['status'][] };
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  where.interestId.in.includes(record.interestId) &&
  where.status.in.includes(record.status);

const compareDigestSourceSummaryRecords = (
  left: PrismaDigestSourceSummaryRecord,
  right: PrismaDigestSourceSummaryRecord,
): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

const matchesDigestSourceFeedItemWhere = (
  record: PrismaDigestSourceFeedItemRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly interestId: { readonly in: readonly string[] };
    readonly status: PrismaDigestSourceFeedItemRecord['status'];
    readonly observedAt: {
      readonly gte: Date;
      readonly lt: Date;
    };
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  where.interestId.in.includes(record.interestId) &&
  record.status === where.status &&
  record.observedAt.getTime() >= where.observedAt.gte.getTime() &&
  record.observedAt.getTime() < where.observedAt.lt.getTime();

const compareDigestSourceFeedItemRecords = (
  left: PrismaDigestSourceFeedItemRecord,
  right: PrismaDigestSourceFeedItemRecord,
): number => {
  const observedDiff = left.observedAt.getTime() - right.observedAt.getTime();

  if (observedDiff !== 0) {
    return observedDiff;
  }

  return left.id.localeCompare(right.id);
};

const matchesDigestScheduleWhere = (
  record: PrismaDigestScheduleRecord,
  where: {
    readonly tenantId?: string;
    readonly workspaceId?: string;
    readonly id?: string;
    readonly status?: string;
    readonly nextRunAt?: { readonly lte: Date };
  },
): boolean =>
  (where.tenantId === undefined || record.tenantId === where.tenantId) &&
  (where.workspaceId === undefined || record.workspaceId === where.workspaceId) &&
  (where.id === undefined || record.id === where.id) &&
  (where.status === undefined || record.status === where.status) &&
  (where.nextRunAt === undefined || record.nextRunAt.getTime() <= where.nextRunAt.lte.getTime());

const compareDigestScheduleRecordsByNextRun = (
  left: PrismaDigestScheduleRecord,
  right: PrismaDigestScheduleRecord,
): number => {
  const nextRunDiff = left.nextRunAt.getTime() - right.nextRunAt.getTime();

  if (nextRunDiff !== 0) {
    return nextRunDiff;
  }

  return left.id.localeCompare(right.id);
};

const compareDigestScheduleRecordsByCreation = (
  left: PrismaDigestScheduleRecord,
  right: PrismaDigestScheduleRecord,
): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

const isDigestScheduleCreatedOrder = (
  orderBy: Parameters<PrismaDeliveryClient['digestSchedule']['findMany']>[0]['orderBy'],
): boolean => 'createdAt' in orderBy[0];

const matchesRealtimeEventWhere = (
  record: PrismaRealtimeEventRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly channel: string;
    readonly sequence?: { readonly gt: number };
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  record.channel === where.channel &&
  (where.sequence === undefined || record.sequence > where.sequence.gt);

const isRealtimeEventUniqueConflict = (
  existing: PrismaRealtimeEventRecord,
  incoming: PrismaRealtimeEventWriteData & { readonly id: string },
): boolean =>
  existing.id === incoming.id ||
  (
    existing.tenantId === incoming.tenantId &&
    existing.workspaceId === incoming.workspaceId &&
    existing.channel === incoming.channel &&
    existing.sequence === incoming.sequence
  );

const compareRealtimeEventRecordsAsc = (
  left: PrismaRealtimeEventRecord,
  right: PrismaRealtimeEventRecord,
): number => {
  const sequenceDiff = left.sequence - right.sequence;

  if (sequenceDiff !== 0) {
    return sequenceDiff;
  }

  return left.id.localeCompare(right.id);
};

const compareRealtimeEventRecordsDesc = (
  left: PrismaRealtimeEventRecord,
  right: PrismaRealtimeEventRecord,
): number => {
  const sequenceDiff = right.sequence - left.sequence;

  if (sequenceDiff !== 0) {
    return sequenceDiff;
  }

  return right.id.localeCompare(left.id);
};

const matchesWebhookEndpointWhere = (
  record: PrismaWebhookEndpointRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly id?: string;
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  (where.id === undefined || record.id === where.id);

const compareWebhookEndpointRecords = (
  left: PrismaWebhookEndpointRecord,
  right: PrismaWebhookEndpointRecord,
): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

const webhookReplayDeliveryKey = (params: {
  readonly webhookEndpointId: string;
  readonly deliveryId: string;
}): string => `${params.webhookEndpointId}:${params.deliveryId}`;
