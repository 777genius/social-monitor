import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { OutboxPort } from '../../../ports';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';

export class PrismaMonitoringOutboxAdapter implements OutboxPort {
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async append(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        id: event.eventId,
        tenantId: event.tenantId ?? null,
        workspaceId: event.workspaceId ?? null,
        eventType: event.eventType,
        schemaVersion: event.schemaVersion,
        payload: event.payload,
        correlationId: event.correlationId,
        causationId: event.causationId ?? null,
      },
    });
  }
}
