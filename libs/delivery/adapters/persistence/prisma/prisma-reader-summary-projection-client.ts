import type { PrismaEventStoreClient } from '@social-monitor/platform-events/adapters/prisma';
import type { PrismaDeliveryClient } from './prisma-delivery-client';
import type { PrismaRealtimeEventRecord } from './prisma-delivery-records';

export type PrismaReaderSummaryProjectionTransaction = {
  readonly inboxRecord: PrismaEventStoreClient['inboxRecord'];
  readonly realtimeEvent: PrismaDeliveryClient['realtimeEvent'] & {
    findUnique(args: { readonly where: { readonly id: string } }): Promise<PrismaRealtimeEventRecord | null>;
  };
};
export type PrismaReaderSummaryProjectionClient = {
  $transaction<T>(
    operation: (tx: PrismaReaderSummaryProjectionTransaction) => Promise<T>,
    options: { readonly isolationLevel: 'Serializable' },
  ): Promise<T>;
};
