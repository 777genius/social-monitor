import type { MetricsRecorderPort } from '@social-monitor/platform-metrics';
import type { QueueCommandEnvelope, QueuePublisherPort } from '@social-monitor/platform-queue';

import type {
  DeliveryAttemptDispatchQueuePort,
  EnqueueDeliveryAttemptDispatchQueueCommand,
} from '../../ports';

type QueueBacklogReader = {
  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[];
};

export class DeliveryAttemptDispatchQueuePublisherAdapter implements DeliveryAttemptDispatchQueuePort {
  private readonly backlogReader: QueueBacklogReader | undefined;

  constructor(
    private readonly publisher: QueuePublisherPort,
    private readonly metrics: MetricsRecorderPort,
    private readonly maxDepth = 1000,
    backlogReader?: QueueBacklogReader,
  ) {
    this.backlogReader = backlogReader ?? (isQueueBacklogReader(publisher) ? publisher : undefined);
  }

  async canAccept(command: EnqueueDeliveryAttemptDispatchQueueCommand): Promise<boolean> {
    void command;

    return this.backlogReader === undefined || this.backlogReader.all().length < this.maxDepth;
  }

  async enqueue(command: EnqueueDeliveryAttemptDispatchQueueCommand): Promise<void> {
    if (!(await this.canAccept(command))) {
      this.metrics.incrementCounter({
        name: 'queue_commands_enqueued_total',
        labels: {
          command_type: 'delivery.attempt.send',
          job_type: 'delivery',
          status: 'rejected',
        },
      });
      this.recordBacklog();

      throw new Error('Delivery attempt dispatch queue backpressure limit reached');
    }

    await this.publisher.publish({
      commandId: command.commandId,
      commandType: 'delivery.attempt.send',
      schemaVersion: 1,
      correlationId: command.correlationId,
      causationId: command.causationId,
      payload: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        deliveryAttemptId: command.deliveryAttemptId,
        content: command.content,
      },
    });
    this.metrics.incrementCounter({
      name: 'queue_commands_enqueued_total',
      labels: {
        command_type: 'delivery.attempt.send',
        job_type: 'delivery',
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
        command_type: 'delivery.attempt.send',
        queue: 'delivery',
      },
    });
  }
}

export class InMemoryDeliveryAttemptDispatchQueueAdapter extends DeliveryAttemptDispatchQueuePublisherAdapter {}

const isQueueBacklogReader = (value: unknown): value is QueueBacklogReader =>
  typeof value === 'object' &&
  value !== null &&
  'all' in value &&
  typeof (value as { readonly all?: unknown }).all === 'function';
