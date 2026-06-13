import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { InMemoryQueuePublisher, QueueCommandEnvelope } from '@social-monitor/platform-queue';

import type { EnqueueScanCommand, ScanQueuePort } from '../../ports';

export class InMemoryScanQueueAdapter implements ScanQueuePort {
  constructor(
    private readonly publisher: InMemoryQueuePublisher,
    private readonly metrics: MetricsRecorderPort,
    private readonly maxDepth = 1000,
  ) {}

  async canAccept(): Promise<boolean> {
    return this.publisher.all().length < this.maxDepth;
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
        topicId: command.topicId,
        sourceBindingId: command.sourceBindingId,
        scanPolicyId: command.scanPolicyId,
        providerKey: command.providerKey,
        sourceQuery: command.sourceQuery,
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
    this.metrics.recordGauge({
      name: 'queue_commands_backlog',
      value: this.publisher.all().length,
      labels: {
        command_type: 'ingestion.scan.execute',
        queue: 'scan',
      },
    });
  }

  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] {
    return this.publisher.all();
  }
}
