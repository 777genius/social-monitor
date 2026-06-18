import {
  causationId,
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
  ) {}

  async pending(limit: number): Promise<readonly OutboxRecord[]> {
    const records = await this.prisma.outboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: Math.max(0, limit),
    });

    return records.map((record) => ({
      id: record.id,
      event: eventEnvelopeFromPrisma(record),
    }));
  }

  async markPublished(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'PUBLISHED',
        publishedAt: this.clock.now(),
      },
    });
  }

  async markFailed(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: 'FAILED',
        publishedAt: null,
      },
    });
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
