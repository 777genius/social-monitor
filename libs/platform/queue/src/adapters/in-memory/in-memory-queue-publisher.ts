import type { QueueCommandEnvelope, QueuePublisherPort } from '../../queue-command';
import { assertQueueDrainLimit, type QueueCommandDelivery } from '../../queue-delivery';

type CommandEntry = {
  readonly command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>;
  redelivered: boolean;
};

export class InMemoryQueuePublisher implements QueuePublisherPort {
  private readonly commands: CommandEntry[] = [];

  async publish<TPayload extends Readonly<Record<string, unknown>>>(
    command: QueueCommandEnvelope<TPayload>,
  ): Promise<void> {
    this.commands.push({ command, redelivered: false });
  }

  all(): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] {
    return this.commands.map((entry) => entry.command);
  }

  commandCheckpoint(commandId: string): number {
    return this.commands.filter(
      (entry) => entry.command.commandId === commandId,
    ).length;
  }

  rollbackToCheckpoint(commandId: string, checkpoint: number): void {
    let currentCount = this.commandCheckpoint(commandId);

    for (
      let index = this.commands.length - 1;
      index >= 0 && currentCount > checkpoint;
      index -= 1
    ) {
      if (this.commands[index]?.command.commandId === commandId) {
        this.commands.splice(index, 1);
        currentCount -= 1;
      }
    }
  }

  drain(params: {
    readonly commandType?: string;
    readonly limit: number;
  }): readonly QueueCommandEnvelope<Readonly<Record<string, unknown>>>[] {
    return this.take(params).map((entry) => entry.command);
  }

  /** Reservation identity is the published occurrence, even when ids repeat. */
  reserve(params: { readonly commandType: string; readonly limit: number }): readonly QueueCommandDelivery[] {
    return this.take(params).map((entry) => {
      let settled = false;
      const settle = async (requeue: boolean): Promise<void> => {
        if (settled) throw new Error('In-memory queue delivery is already settled');
        settled = true;
        if (requeue) {
          entry.redelivered = true;
          this.commands.push(entry);
        }
      };
      return {
        command: entry.command,
        diagnostics: { redelivered: entry.redelivered, deadLetterCount: 0 },
        ack: () => settle(false),
        nack: ({ requeue }) => settle(requeue),
        release: async () => { if (!settled) await settle(true); },
      };
    });
  }

  private take(params: { readonly commandType?: string; readonly limit: number }): readonly CommandEntry[] {
    assertQueueDrainLimit(params.limit);
    const drained: CommandEntry[] = [];
    const remaining: CommandEntry[] = [];
    for (const entry of this.commands) {
      const matchesType = params.commandType === undefined || entry.command.commandType === params.commandType;
      if (matchesType && drained.length < params.limit) drained.push(entry);
      else remaining.push(entry);
    }
    this.commands.splice(0, this.commands.length, ...remaining);
    return drained;
  }
}
