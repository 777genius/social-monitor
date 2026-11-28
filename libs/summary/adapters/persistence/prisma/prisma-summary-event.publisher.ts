import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { SummaryEventPublisherPort } from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';
import { summaryEventWrite } from './prisma-summary-execution-writes';

export class PrismaSummaryEventPublisher implements SummaryEventPublisherPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    await withPrismaWriteRetry(() => this.prisma.outboxEvent.create(summaryEventWrite(event)));
  }
}
