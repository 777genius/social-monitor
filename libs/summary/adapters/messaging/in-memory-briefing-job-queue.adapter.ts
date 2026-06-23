import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { QueueCommandEnvelope, QueuePublisherPort } from '@social-monitor/platform-queue';

import type { EnqueueBriefingJobCommand, BriefingJobQueuePort } from '../../ports';

type QueueBacklogReader = {
  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[];
};

export class BriefingJobQueuePublisherAdapter implements BriefingJobQueuePort {
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

  async enqueue(command: EnqueueBriefingJobCommand): Promise<void> {
    if (!(await this.canAccept())) {
      this.metrics.incrementCounter({
        name: 'queue_commands_enqueued_total',
        labels: {
          command_type: 'briefing.job.execute',
          job_type: 'briefing',
          status: 'rejected',
        },
      });
      this.recordBacklog();

      throw new Error('Briefing job queue backpressure limit reached');
    }

    await this.publisher.publish({
      commandId: command.briefingJobId,
      commandType: 'briefing.job.execute',
      schemaVersion: 1,
      correlationId: command.correlationId,
      causationId: command.causationId,
      payload: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        briefingJobId: command.briefingJobId,
      },
    });
    this.metrics.incrementCounter({
      name: 'queue_commands_enqueued_total',
      labels: {
        command_type: 'briefing.job.execute',
        job_type: 'briefing',
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
        command_type: 'briefing.job.execute',
        queue: 'briefing',
      },
    });
  }
}

export class InMemoryBriefingJobQueueAdapter implements BriefingJobQueuePort {
  private readonly commands: EnqueueBriefingJobCommand[] = [];

  constructor(private readonly maxDepth = 1000) {}

  async canAccept(_command?: EnqueueBriefingJobCommand): Promise<boolean> {
    return this.commands.length < this.maxDepth;
  }

  async enqueue(command: EnqueueBriefingJobCommand): Promise<void> {
    if (!(await this.canAccept(command))) {
      throw new Error('Briefing job queue backpressure limit reached');
    }

    this.commands.push(command);
  }

  all(): readonly EnqueueBriefingJobCommand[] {
    return [...this.commands];
  }
}

const isQueueBacklogReader = (value: unknown): value is QueueBacklogReader =>
  typeof value === 'object' &&
  value !== null &&
  'all' in value &&
  typeof (value as { readonly all?: unknown }).all === 'function';
