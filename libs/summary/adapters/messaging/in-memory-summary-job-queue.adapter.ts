import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { InMemoryQueuePublisher, QueueCommandEnvelope } from '@social-monitor/platform-queue';

import type { EnqueueSummaryJobCommand, SummaryJobQueuePort } from '../../ports';

export class InMemorySummaryJobQueueAdapter implements SummaryJobQueuePort {
  constructor(
    private readonly publisher: InMemoryQueuePublisher,
    private readonly metrics: MetricsRecorderPort,
    private readonly maxDepth = 1000,
  ) {}

  async canAccept(): Promise<boolean> {
    return this.publisher.all().length < this.maxDepth;
  }

  async enqueue(command: EnqueueSummaryJobCommand): Promise<void> {
    if (!(await this.canAccept())) {
      this.metrics.incrementCounter({
        name: 'queue_commands_enqueued_total',
        labels: {
          command_type: 'summary.job.execute',
          job_type: 'summary',
          status: 'rejected',
        },
      });
      this.recordBacklog();

      throw new Error('Summary job queue backpressure limit reached');
    }

    await this.publisher.publish({
      commandId: command.summaryJobId,
      commandType: 'summary.job.execute',
      schemaVersion: 1,
      correlationId: command.correlationId,
      causationId: command.causationId,
      payload: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        summaryJobId: command.summaryJobId,
      },
    });
    this.metrics.incrementCounter({
      name: 'queue_commands_enqueued_total',
      labels: {
        command_type: 'summary.job.execute',
        job_type: 'summary',
        status: 'enqueued',
      },
    });
    this.recordBacklog();
  }

  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] {
    return this.publisher.all();
  }

  private recordBacklog(): void {
    this.metrics.recordGauge({
      name: 'queue_commands_backlog',
      value: this.publisher.all().length,
      labels: {
        command_type: 'summary.job.execute',
        queue: 'summary',
      },
    });
  }
}
