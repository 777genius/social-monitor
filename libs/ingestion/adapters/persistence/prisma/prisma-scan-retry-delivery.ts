import { runWithTenantDatabaseAccess, withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type { ScanRetryDelivery } from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { failedScanCommandFromPrisma, type PrismaScanFailureQueueEntryRecord } from './prisma-ingestion-records';

export const prismaScanRetryDelivery = (params: {
  readonly prisma: Pick<PrismaIngestionClient, 'scanFailureQueueEntry'>;
  readonly record: PrismaScanFailureQueueEntryRecord;
  readonly claimToken: string;
  readonly visibilityTimeoutSeconds: number;
  readonly settled: () => Promise<void>;
}): ScanRetryDelivery => {
  const { record, prisma } = params;
  const where = {
    id: record.id, tenantId: record.tenantId, workspaceId: record.workspaceId,
    status: 'RETRY_ENQUEUED' as const, claimToken: params.claimToken,
  };
  const scoped = <T>(operation: () => Promise<T>) => runWithTenantDatabaseAccess(record, operation);
  return {
    command: {
      ...failedScanCommandFromPrisma(record),
      nextAttemptNumber: record.nextAttemptNumber ?? record.attemptNumber + 1,
    },
    renew: (now) => scoped(async () => {
      const result = await withPrismaWriteRetry(() => prisma.scanFailureQueueEntry.updateMany({
        where: { ...where, claimedUntil: { gt: now } },
        data: { claimedUntil: new Date(now.getTime() + params.visibilityTimeoutSeconds * 1000) },
      }));
      return result.count === 1;
    }),
    ack: () => scoped(async () => {
      await withPrismaWriteRetry(() => prisma.scanFailureQueueEntry.deleteMany({ where }));
      await params.settled();
    }),
    nack: ({ requeue }) => scoped(async () => {
      await withPrismaWriteRetry(() => prisma.scanFailureQueueEntry.updateMany({
        where,
        data: {
          claimToken: null, claimedUntil: null,
          ...(requeue ? {} : { status: 'DEAD_LETTERED' as const }),
        },
      }));
      await params.settled();
    }),
  };
};
