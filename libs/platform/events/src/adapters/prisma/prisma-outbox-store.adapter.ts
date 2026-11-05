import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from '@social-monitor/platform-persistence';
import {
  causationId,
  redactSensitiveResponseText,
  correlationId,
  eventId,
  tenantId,
  workspaceId,
  type Clock,
  type EventEnvelope,
} from '@social-monitor/shared-kernel';

import type { OutboxRecord, OutboxStorePort } from '../../outbox-dispatcher';
import type { PrismaEventOutboxRecord, PrismaEventStoreClient } from './prisma-event-store-client';

export class PrismaOutboxStoreAdapter implements OutboxStorePort {
  constructor(
    private readonly prisma: PrismaEventStoreClient,
    private readonly clock: Clock,
    // FAILED is only for the manifest-pinned one-shot recovery adapter,
    // which compares xmin under a row lock; the ordinary relay remains PENDING.
    private readonly expectedStatus: 'PENDING' | 'FAILED' = 'PENDING',
  ) {}

  async pending(limit: number): Promise<readonly OutboxRecord[]> {
    const records = await runWithSystemDatabaseAccess(
      'event outbox pending read',
      () =>
        this.prisma.outboxEvent.findMany({
          where: { messageKind: 'EVENT', status: 'PENDING' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: Math.max(0, limit),
        }),
    );

    return records.map((record) => ({
      id: record.id,
      event: eventEnvelopeFromPrisma(record),
    }));
  }

  async recordAttempt(id: string): Promise<void> {
    const result = await runWithSystemDatabaseAccess('event outbox dispatch start', () =>
      withPrismaWriteRetry(() => this.prisma.outboxEvent.updateMany({
        where: pendingEvent(id, this.expectedStatus),
        data: {
          publishAttempts: { increment: 1 },
          lastError: 'Dispatch started; outcome unknown. Earlier uninstrumented attempts unknown.',
        },
      })),
    );
    assertPendingEventUpdated(result.count);
  }

  async markPublished(id: string): Promise<void> {
    const result = await runWithSystemDatabaseAccess('event outbox publish acknowledgement', () =>
      withPrismaWriteRetry(() => this.prisma.outboxEvent.updateMany({
        where: pendingEvent(id, this.expectedStatus),
        data: {
          status: 'PUBLISHED',
          lastError: null,
          publishedAt: this.clock.now(),
        },
      })),
    );
    assertPendingEventUpdated(result.count);
  }

  async markFailed(id: string, reason: string): Promise<void> {
    const result = await runWithSystemDatabaseAccess('event outbox failure acknowledgement', () =>
      withPrismaWriteRetry(() => this.prisma.outboxEvent.updateMany({
        where: pendingEvent(id, this.expectedStatus),
        data: {
          status: 'FAILED',
          lastError: redactSensitiveResponseText(reason).replace(/[\r\n\t]/g, ' ').slice(0, 500),
          publishedAt: null,
        },
      })),
    );
    assertPendingEventUpdated(result.count);
  }
}

const eventEnvelopeFromPrisma = (
  record: PrismaEventOutboxRecord,
): EventEnvelope<Readonly<Record<string, unknown>>> => ({
  eventId: eventId(record.id),
  eventType: record.eventType,
  schemaVersion: record.schemaVersion,
  occurredAt: record.createdAt,
  tenantId: record.tenantId === null ? undefined : tenantId(record.tenantId),
  workspaceId: record.workspaceId === null ? undefined : workspaceId(record.workspaceId),
  correlationId: correlationId(record.correlationId),
  causationId: record.causationId === null ? undefined : causationId(record.causationId),
  payload: normalizePayload(record.payload),
});

const normalizePayload = (payload: unknown): Readonly<Record<string, unknown>> => {
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Readonly<Record<string, unknown>>;
  }

  return { value: payload };
};

/** A terminal EVENT (or COMMAND sharing the table) is never mutable by the relay. */
const pendingEvent = (id: string, status: 'PENDING' | 'FAILED') => ({ id, messageKind: 'EVENT' as const, status });

const assertPendingEventUpdated = (count: number): void => {
  if (count !== 1) throw new Error('Event outbox record is no longer pending');
};
