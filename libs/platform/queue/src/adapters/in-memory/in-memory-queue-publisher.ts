import type { QueueCommandEnvelope, QueuePublisherPort } from '../../queue-command';

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

  drain(params: {
    readonly commandType?: string;
    readonly limit: number;
  }): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] {
    if (!Number.isInteger(params.limit) || params.limit < 1) {
      throw new Error('Queue drain limit must be a positive integer');
    }

    const drained: QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] = [];
    const remaining: QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] = [];

    for (const command of this.commands) {
      const matchesType = params.commandType === undefined || command.commandType === params.commandType;

      if (matchesType && drained.length < params.limit) {
        drained.push(command);
        continue;
      }

      remaining.push(command);
    }

    this.commands.splice(0, this.commands.length, ...remaining);

    return drained;
  }
}
