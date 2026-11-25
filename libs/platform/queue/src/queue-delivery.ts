import type { QueueCommandEnvelope } from './queue-command';
import type { QueueCommandDeliveryDiagnostics } from './queue-delivery-diagnostics';

/** A delivery is one acquisition, not the logical command id. */
export interface QueueDelivery {
  readonly diagnostics: QueueCommandDeliveryDiagnostics;
  ack(): Promise<void>;
  nack(params: { readonly requeue: boolean }): Promise<void>;
  /** Idempotent abort cleanup. Broker adapters may recover the original channel
   * when requeue is uncertain; they must retain ownership if recovery fails. */
  release?(): Promise<void>;
}

export type QueueCommandDelivery = QueueDelivery & {
  readonly command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>;
};

export interface QueueCommandReader {
  drain(params: {
    readonly commandType: string;
    readonly limit: number;
  }): Promise<readonly QueueCommandDelivery[]>;
}

export const assertQueueDrainLimit = (limit: number): void => {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Queue drain limit must be a positive integer');
  }
};
