import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type {
  FindScanExecutionAttemptQuery,
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
  ScanExecutionAttemptStatus,
} from '../../../ports';
import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import type { PrismaScanAttemptRecord } from './prisma-monitoring-records';

export class PrismaScanExecutionAttemptReadModel implements ScanExecutionAttemptReadPort {
  constructor(private readonly prisma: PrismaMonitoringClient) {}

  async findLatestByScanJob(
    query: FindScanExecutionAttemptQuery,
  ): Promise<ScanExecutionAttemptSnapshot | null> {
    const record = await this.prisma.scanAttempt.findFirst({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        scanJobId: query.scanJobId,
      },
    });

    return record === null ? null : scanExecutionAttemptFromPrisma(record);
  }
}

const scanExecutionAttemptFromPrisma = (
  record: PrismaScanAttemptRecord,
): ScanExecutionAttemptSnapshot => ({
  tenantId: tenantId(record.tenantId),
  workspaceId: workspaceId(record.workspaceId),
  scanJobId: record.scanJobId,
  sourceBindingId: record.sourceBindingId,
  status: scanAttemptStatusFromPrisma(record.status),
  startedAt: record.startedAt,
  finishedAt: record.finishedAt ?? undefined,
  fetched: record.fetched,
  inserted: record.inserted,
  skippedDuplicates: record.skippedDuplicates,
  projected: record.projected,
  failureReason: record.failureReason ?? undefined,
});

const scanAttemptStatusFromPrisma = (
  status: PrismaScanAttemptRecord['status'],
): ScanExecutionAttemptStatus => {
  if (status === 'RUNNING') {
    return 'running';
  }

  if (status === 'SUCCEEDED') {
    return 'succeeded';
  }

  return 'failed';
};
