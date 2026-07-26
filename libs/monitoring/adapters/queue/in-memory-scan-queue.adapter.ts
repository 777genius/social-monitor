import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { QueueCommandEnvelope, QueuePublisherPort } from '@social-monitor/platform-queue';

import type { EnqueueScanCommand, ScanQueuePort } from '../../ports';

type QueueBacklogReader = {
  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[];
};

type QueueBacklogRollback = {
  commandCheckpoint(commandId: string): number;
  rollbackToCheckpoint(commandId: string, checkpoint: number): void;
};

export class InMemoryScanQueueAdapter implements ScanQueuePort {
  private readonly backlogReader: QueueBacklogReader | undefined;

  constructor(
    private readonly publisher: QueuePublisherPort,
    private readonly metrics: MetricsRecorderPort,
    private readonly maxDepth = 1000,
    backlogReader?: QueueBacklogReader,
  ) {
    this.backlogReader = backlogReader ?? (isQueueBacklogReader(publisher) ? publisher : undefined);
  }

  async canAccept(): Promise<boolean> {
    return this.backlogReader === undefined || this.backlogReader.all().length < this.maxDepth;
  }

  async enqueue(command: EnqueueScanCommand): Promise<void> {
    if (!(await this.canAccept())) {
      this.metrics.incrementCounter({
        name: 'queue_commands_enqueued_total',
        labels: {
          command_type: 'ingestion.scan.execute',
          job_type: 'scan',
          status: 'rejected',
        },
      });
      this.recordBacklog();

      throw new Error('Scan queue backpressure limit reached');
    }

    await this.publisher.publish({
      commandId: command.scanJobId,
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: command.correlationId,
      causationId: command.causationId,
      payload: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scanJobId: command.scanJobId,
        interestId: command.interestId,
        sourceBindingId: command.sourceBindingId,
        scanPolicyId: command.scanPolicyId,
        providerKey: command.providerKey,
        sourceQuery: command.sourceQuery,
        retryBudget: command.retryBudget,
      },
    });
    this.metrics.incrementCounter({
      name: 'queue_commands_enqueued_total',
      labels: {
        command_type: 'ingestion.scan.execute',
        job_type: 'scan',
        status: 'enqueued',
      },
    });
    this.recordBacklog();
  }

  private recordBacklog(): void {
    if (this.backlogReader === undefined) {
      return;
    }

    this.metrics.recordGauge({
      name: 'queue_commands_backlog',
      value: this.backlogReader.all().length,
      labels: {
        command_type: 'ingestion.scan.execute',
        queue: 'scan',
      },
    });
  }

  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] {
    return this.backlogReader?.all() ?? [];
  }

  assertDirectDispatchRollbackSupported(): void {
    if (!isQueueBacklogRollback(this.publisher)) {
      throw new Error('Scan queue publisher does not support direct dispatch rollback');
    }
  }

  enqueueCheckpoint(scanJobId: string): number {
    this.assertDirectDispatchRollbackSupported();
    const publisher = this.publisher as QueuePublisherPort & QueueBacklogRollback;

    return publisher.commandCheckpoint(scanJobId);
  }

  async rollbackEnqueue(
    scanJobId: string,
    checkpoint: number,
  ): Promise<void> {
    this.assertDirectDispatchRollbackSupported();
    const publisher = this.publisher as QueuePublisherPort & QueueBacklogRollback;
    publisher.rollbackToCheckpoint(scanJobId, checkpoint);
    this.recordBacklog();
  }
}

const isQueueBacklogReader = (value: unknown): value is QueueBacklogReader =>
  typeof value === 'object' &&
  value !== null &&
  'all' in value &&
  typeof (value as { readonly all?: unknown }).all === 'function';

const isQueueBacklogRollback = (
  value: unknown,
): value is QueueBacklogRollback =>
  typeof value === 'object' &&
  value !== null &&
  'commandCheckpoint' in value &&
  typeof (value as { readonly commandCheckpoint?: unknown })
    .commandCheckpoint === 'function' &&
  'rollbackToCheckpoint' in value &&
  typeof (value as { readonly rollbackToCheckpoint?: unknown })
    .rollbackToCheckpoint === 'function';
