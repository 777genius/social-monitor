import type { Clock } from '@social-monitor/shared-kernel';
import type { PrismaIngestionClient, PrismaScanRetryWhere } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-client';
import type { PrismaScanFailureQueueEntryRecord } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-ingestion-records';

export const scanRetryRecordMatches = (record: PrismaScanFailureQueueEntryRecord, where: PrismaScanRetryWhere): boolean => {
  if (where.id !== undefined && (typeof where.id === 'string'
    ? record.id !== where.id : !where.id.in.includes(record.id))) return false;
  if (where.tenantId !== undefined && record.tenantId !== where.tenantId) return false;
  if (where.workspaceId !== undefined && record.workspaceId !== where.workspaceId) return false;
  if (where.status !== undefined && record.status !== where.status) return false;
  if (where.claimToken !== undefined && (record.claimToken ?? null) !== where.claimToken) return false;
  if (where.claimedUntil !== undefined && (record.claimedUntil === undefined || record.claimedUntil === null ||
      record.claimedUntil.getTime() <= where.claimedUntil.gt.getTime())) return false;
  return where.OR === undefined || where.OR.some((condition) => condition.claimedUntil === null
    ? record.claimedUntil == null
    : record.claimedUntil != null && record.claimedUntil.getTime() <= condition.claimedUntil.lte.getTime());
};

export const createScanFailureQueueFixture = (records: PrismaScanFailureQueueEntryRecord[], clock: Clock):
PrismaIngestionClient['scanFailureQueueEntry'] => ({
  create: async ({ data }) => {
    if (records.some((record) => record.id === data.id)) {
      throw Object.assign(new Error('Duplicate fixture failure command'), { code: 'P2002' });
    }
    const record = { ...data, nextAttemptNumber: data.nextAttemptNumber ?? null,
      claimToken: null, claimedUntil: null, createdAt: clock.now() };
    records.push(record);
    return record;
  },
  findMany: async (query) => records.filter((record) => scanRetryRecordMatches(record, query.where))
    .sort((left, right) => (left.createdAt.getTime() - right.createdAt.getTime()) *
      (query.orderBy.createdAt === 'asc' ? 1 : -1)).slice(0, query.take),
  updateMany: async ({ where, data }) => {
    let count = 0;
    for (let index = 0; index < records.length; index++) {
      const record = records[index]!;
      if (!scanRetryRecordMatches(record, where)) continue;
      records[index] = { ...record, ...data };
      count++;
    }
    return { count };
  },
  deleteMany: async ({ where }) => {
    let count = 0;
    for (let index = records.length - 1; index >= 0; index--) {
      if (!scanRetryRecordMatches(records[index]!, where)) continue;
      records.splice(index, 1);
      count++;
    }
    return { count };
  },
  count: async ({ where }) => records.filter((record) => scanRetryRecordMatches(record, where)).length,
});
