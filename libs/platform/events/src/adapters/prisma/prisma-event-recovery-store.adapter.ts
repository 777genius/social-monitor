import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from '@social-monitor/platform-persistence';
import { redactSensitiveResponseText, type Clock } from '@social-monitor/shared-kernel';

import type { PrismaEventStoreClient } from './prisma-event-store-client';

/**
 * Explicit terminal recovery capability for the reviewed manifest/xmin workflow.
 * Its caller must pin identity and row version under a row lock. Ordinary EVENT
 * relays cannot select FAILED rows or opt into this behavior with a status flag.
 */
export class PrismaEventRecoveryStoreAdapter {
  constructor(
    private readonly prisma: {
      readonly outboxEvent: Pick<PrismaEventStoreClient['outboxEvent'], 'updateMany'>;
    },
    private readonly clock: Clock,
  ) {}

  async recordAttempt(id: string): Promise<void> {
    await this.update(id, {
      publishAttempts: { increment: 1 },
      lastError: 'Dispatch started; outcome unknown. Earlier uninstrumented attempts unknown.',
    });
  }

  async markPublished(id: string): Promise<void> {
    await this.update(id, {
      status: 'PUBLISHED', lastError: null, publishedAt: this.clock.now(),
    });
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await this.update(id, {
      status: 'FAILED', publishedAt: null,
      lastError: redactSensitiveResponseText(reason).replace(/[\r\n\t]/g, ' ').slice(0, 500),
    });
  }

  private async update(
    id: string,
    data: Parameters<PrismaEventStoreClient['outboxEvent']['updateMany']>[0]['data'],
  ): Promise<void> {
    const result = await runWithSystemDatabaseAccess('manifest-pinned event outbox recovery', () =>
      withPrismaWriteRetry(() => this.prisma.outboxEvent.updateMany({
        where: { id, messageKind: 'EVENT', status: 'FAILED' }, data,
      })),
    );
    if (result.count !== 1) throw new Error('Event outbox recovery record is no longer failed');
  }
}
