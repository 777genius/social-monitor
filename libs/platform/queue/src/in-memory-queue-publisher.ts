import type { QueueCommandEnvelope, QueuePublisherPort } from './queue-command';

export class InMemoryQueuePublisher implements QueuePublisherPort {
  private readonly commands: QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] = [];

  async publish<TPayload extends Readonly<Record<string, unknown>>>(
    command: QueueCommandEnvelope<TPayload>,
  ): Promise<void> {
    this.commands.push(command);
  }

  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] {
    return [...this.commands];
  }
}
