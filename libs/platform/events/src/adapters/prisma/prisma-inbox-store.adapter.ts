import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from '@social-monitor/platform-persistence';
import type { IdGenerator } from '@social-monitor/shared-kernel';

import type { InboxStorePort } from '../../inbox-deduplicator';
import type { PrismaEventStoreClient } from './prisma-event-store-client';

export class PrismaInboxStoreAdapter implements InboxStorePort {
  constructor(
    private readonly prisma: PrismaEventStoreClient,
    private readonly ids: IdGenerator,
  ) {}

  async hasProcessed(params: { consumerName: string; eventId: string }): Promise<boolean> {
    const record = await runWithSystemDatabaseAccess(
      'event inbox deduplication read',
      () =>
        this.prisma.inboxRecord.findUnique({
          where: {
            consumerName_eventId: {
              consumerName: params.consumerName,
              eventId: params.eventId,
            },
          },
        }),
    );

    return record !== null;
  }

  async markProcessed(params: {
    consumerName: string;
    eventId: string;
    schemaVersion: number;
  }): Promise<void> {
    const id = this.ids.generate();

    try {
      await runWithSystemDatabaseAccess(
        'event inbox deduplication write',
        () =>
          withPrismaWriteRetry(() => this.prisma.inboxRecord.create({
            data: {
              id,
              consumerName: params.consumerName,
              eventId: params.eventId,
              tenantId: null,
              schemaVersion: params.schemaVersion,
            },
          })),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return;
      }

      throw error;
    }
  }
}

const isUniqueConstraintError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { readonly code?: unknown }).code === 'P2002';
