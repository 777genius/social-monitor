import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { QueueCommandEnvelope, QueuePublisherPort } from '@social-monitor/platform-queue';

import type { EnqueueSummaryJobCommand, SummaryJobQueuePort } from '../../ports';

type QueueBacklogReader = {
  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[];
};

export class InMemorySummaryJobQueueAdapter implements SummaryJobQueuePort {
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
    return this.backlogReader?.all() ?? [];
  }

  private recordBacklog(): void {
    if (this.backlogReader === undefined) {
      return;
    }

    this.metrics.recordGauge({
      name: 'queue_commands_backlog',
      value: this.backlogReader.all().length,
      labels: {
        command_type: 'summary.job.execute',
        queue: 'summary',
      },
    });
  }
}

const isQueueBacklogReader = (value: unknown): value is QueueBacklogReader =>
  typeof value === 'object' &&
  value !== null &&
  'all' in value &&
  typeof (value as { readonly all?: unknown }).all === 'function';
