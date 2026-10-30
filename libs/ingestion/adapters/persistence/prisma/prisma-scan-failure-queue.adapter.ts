import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import {
  runWithSystemDatabaseAccess,
  withPrismaWriteRetry,
} from '@social-monitor/platform-persistence';
import { tenantId, workspaceId, type IdGenerator, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import {
  assertValidScanRetryClaim,
  type ScanRetryDelivery,
  type FailedScanCommand,
  type RetryScanCommand,
  type ScanFailureInspectionPort,
  type ScanFailureQueuePort,
  type ScanRetryQueuePort,
} from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { failedScanCommandFromPrisma } from './prisma-ingestion-records';
import { prismaScanRetryDelivery } from './prisma-scan-retry-delivery';
import { scanFailureEntryKey } from '../scan-failure-entry-key';

export class PrismaScanFailureQueueAdapter implements ScanFailureQueuePort, ScanFailureInspectionPort, ScanRetryQueuePort {
  constructor(
    private readonly prisma: Pick<PrismaIngestionClient, 'scanFailureQueueEntry'>,
    private readonly metrics: MetricsRecorderPort,
    private readonly ids: IdGenerator,
  ) {}

  async enqueueRetry(command: RetryScanCommand): Promise<void> {
    await this.persist(command, 'RETRY_ENQUEUED', command.nextAttemptNumber);
    await this.recordBacklogMetric(command.tenantId, command.workspaceId, 'scan-retry', 'RETRY_ENQUEUED');
  }

  async deadLetter(command: FailedScanCommand): Promise<void> {
    await this.persist(command, 'DEAD_LETTERED', null);
    await this.recordBacklogMetric(command.tenantId, command.workspaceId, 'scan-dlq', 'DEAD_LETTERED');
  }

  async listDeadLetters(
    params: Parameters<ScanFailureInspectionPort['listDeadLetters']>[0],
  ): Promise<readonly FailedScanCommand[]> {
    const records = await this.prisma.scanFailureQueueEntry.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        status: 'DEAD_LETTERED',
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit,
    });

    return records.map((record) => failedScanCommandFromPrisma(record));
  }

  async claimRetries(params: Parameters<ScanRetryQueuePort['claimRetries']>[0]): Promise<readonly ScanRetryDelivery[]> {
    assertValidScanRetryClaim(params);
    return runWithSystemDatabaseAccess(
      'cross-tenant scan retry queue claim',
      async () => {
        const available = { OR: [{ claimedUntil: null }, { claimedUntil: { lte: params.now } }] } as const;
        const pending = await this.prisma.scanFailureQueueEntry.findMany({
          where: {
            status: 'RETRY_ENQUEUED',
            ...available,
          },
          orderBy: { createdAt: 'asc' },
          take: params.limit,
        });
        const deliveries: ScanRetryDelivery[] = [];
        for (const record of pending) {
          const claimToken = this.ids.generate();
          const claimed = await withPrismaWriteRetry(() => this.prisma.scanFailureQueueEntry.updateMany({
            where: { id: record.id, tenantId: record.tenantId, workspaceId: record.workspaceId,
              status: 'RETRY_ENQUEUED', ...available },
            data: { claimToken, claimedUntil: new Date(params.now.getTime() + params.visibilityTimeoutSeconds * 1000) },
          }));
          if (claimed.count === 0) continue;
          deliveries.push(prismaScanRetryDelivery({
            prisma: this.prisma, record, claimToken,
            visibilityTimeoutSeconds: params.visibilityTimeoutSeconds,
            settled: () => this.recordBacklogMetric(
              tenantId(record.tenantId), workspaceId(record.workspaceId), 'scan-retry', 'RETRY_ENQUEUED'),
          }));
        }
        return deliveries;
      },
    );
  }

  private async persist(
    command: FailedScanCommand,
    status: 'RETRY_ENQUEUED' | 'DEAD_LETTERED',
    nextAttemptNumber: number | null,
  ): Promise<void> {
    const id = scanFailureEntryKey(command, status, nextAttemptNumber);

    try {
      await withPrismaWriteRetry(() => this.prisma.scanFailureQueueEntry.create({
        data: {
          id,
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          scanJobId: command.scanJobId,
          interestId: command.interestId,
          sourceBindingId: command.sourceBindingId,
          scanPolicyId: command.scanPolicyId,
          providerKey: command.providerKey,
          sourceQuery: command.sourceQuery,
          correlationId: command.correlationId,
          causationId: command.causationId,
          attemptNumber: command.attemptNumber,
          retryBudget: command.retryBudget,
          nextAttemptNumber,
          failureReason: command.failureReason,
          status,
        },
      }));
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return;
      throw error;
    }

    this.metrics.incrementCounter({
      name: 'scan_failure_queue_events_total',
      labels: {
        queue: queueNameForStatus(status),
        status: status === 'DEAD_LETTERED' ? 'dead_lettered' : 'retry_enqueued',
      },
    });
  }

  private async recordBacklogMetric(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    queue: 'scan-retry' | 'scan-dlq',
    status: 'RETRY_ENQUEUED' | 'DEAD_LETTERED',
  ): Promise<void> {
    const backlog = await this.prisma.scanFailureQueueEntry.count({
      where: {
        tenantId,
        workspaceId,
        status,
      },
    });

    this.metrics.recordGauge({
      name: 'scan_failure_queue_backlog',
      value: backlog,
      labels: { queue },
    });
  }
}

const queueNameForStatus = (status: 'RETRY_ENQUEUED' | 'DEAD_LETTERED'): 'scan-retry' | 'scan-dlq' =>
  status === 'DEAD_LETTERED' ? 'scan-dlq' : 'scan-retry';
