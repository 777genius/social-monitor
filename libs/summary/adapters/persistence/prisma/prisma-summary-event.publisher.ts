import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { SummaryEventPublisherPort } from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';

export class PrismaSummaryEventPublisher implements SummaryEventPublisherPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    await withPrismaWriteRetry(() => this.prisma.outboxEvent.create({
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
    }));
  }
}
