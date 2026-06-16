import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import { tenantId, workspaceId, type IdGenerator, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  FailedScanCommand,
  RetryScanCommand,
  ScanFailureInspectionPort,
  ScanFailureQueuePort,
  ScanRetryQueuePort,
} from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { failedScanCommandFromPrisma } from './prisma-ingestion-records';

export class PrismaScanFailureQueueAdapter implements ScanFailureQueuePort, ScanFailureInspectionPort, ScanRetryQueuePort {
  constructor(
    private readonly prisma: PrismaIngestionClient,
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

  async drainRetries(params: Parameters<ScanRetryQueuePort['drainRetries']>[0]): Promise<readonly RetryScanCommand[]> {
    if (!Number.isInteger(params.limit) || params.limit < 1) {
      throw new Error('Scan retry drain limit must be a positive integer');
    }

    const records = await this.prisma.scanFailureQueueEntry.findMany({
      where: {
        status: 'RETRY_ENQUEUED',
      },
      orderBy: { createdAt: 'asc' },
      take: params.limit,
    });
    const ids = records.map((record) => record.id);

    if (ids.length > 0) {
      await this.prisma.scanFailureQueueEntry.deleteMany({
        where: {
          id: { in: ids },
        },
      });
    }

    for (const scope of uniqueScopes(records)) {
      await this.recordBacklogMetric(
        tenantId(scope.tenantId),
        workspaceId(scope.workspaceId),
        'scan-retry',
        'RETRY_ENQUEUED',
      );
    }

    return records.map((record) => ({
      ...failedScanCommandFromPrisma(record),
      nextAttemptNumber: record.nextAttemptNumber ?? record.attemptNumber + 1,
    }));
  }

  private async persist(
    command: FailedScanCommand,
    status: 'RETRY_ENQUEUED' | 'DEAD_LETTERED',
    nextAttemptNumber: number | null,
  ): Promise<void> {
    await this.prisma.scanFailureQueueEntry.create({
      data: {
        id: this.ids.generate(),
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scanJobId: command.scanJobId,
        topicId: command.topicId,
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
    });

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

const uniqueScopes = (
  records: readonly {
    readonly tenantId: string;
    readonly workspaceId: string;
  }[],
): readonly { readonly tenantId: string; readonly workspaceId: string }[] => {
  const scopes = new Map<string, { readonly tenantId: string; readonly workspaceId: string }>();

  for (const record of records) {
    scopes.set(`${record.tenantId}:${record.workspaceId}`, {
      tenantId: record.tenantId,
      workspaceId: record.workspaceId,
    });
  }

  return [...scopes.values()];
};
