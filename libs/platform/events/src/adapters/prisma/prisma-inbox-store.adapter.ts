import { randomUUID } from 'node:crypto';

import type { InboxStorePort } from '../../inbox-deduplicator';
import type { PrismaEventStoreClient } from './prisma-event-store-client';

export class PrismaInboxStoreAdapter implements InboxStorePort {
  constructor(private readonly prisma: PrismaEventStoreClient) {}

  async hasProcessed(params: { consumerName: string; eventId: string }): Promise<boolean> {
    const record = await this.prisma.inboxRecord.findUnique({
      where: {
        consumerName_eventId: {
          consumerName: params.consumerName,
          eventId: params.eventId,
        },
      },
    });

    return record !== null;
  }

  async markProcessed(params: {
    consumerName: string;
    eventId: string;
    schemaVersion: number;
  }): Promise<void> {
    try {
      await this.prisma.inboxRecord.create({
        data: {
          id: randomUUID(),
          consumerName: params.consumerName,
          eventId: params.eventId,
          tenantId: null,
          schemaVersion: params.schemaVersion,
        },
      });
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
