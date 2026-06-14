import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { IdGenerator, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  FailedScanCommand,
  RetryScanCommand,
  ScanFailureInspectionPort,
  ScanFailureQueuePort,
} from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { failedScanCommandFromPrisma } from './prisma-ingestion-records';

export class PrismaScanFailureQueueAdapter implements ScanFailureQueuePort, ScanFailureInspectionPort {
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
        sourceBindingId: command.sourceBindingId,
        scanPolicyId: command.scanPolicyId,
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
