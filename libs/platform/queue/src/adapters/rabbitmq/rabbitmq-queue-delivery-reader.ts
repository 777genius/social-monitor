import type { GetMessage, Message } from 'amqplib';

import { assertQueueDrainLimit, type QueueDelivery } from '../../queue-delivery';
import { queueCommandDeliveryDiagnosticsFromRabbitMq } from '../../queue-delivery-diagnostics';

export interface RabbitMqDeliveryChannel {
  get(queue: string, options: { readonly noAck: boolean }): Promise<GetMessage | false>;
  ack(message: Message): Promise<void>;
  nack(message: Message, allUpTo: boolean, requeue: boolean): Promise<void>;
  /** Recover only this message's native origin; never close a replacement. */
  recoverDelivery?(message: Message): Promise<void>;
}

/** Owns raw deliveries before decoding, and keeps failed cleanup reachable.
 * No new acquisition starts while an earlier release remains uncertain. */
export class RabbitMqQueueDeliveryReader {
  private readonly recovery = new Set<RabbitMqOwnedDelivery>();
  private acquiring = false;

  constructor(private readonly channel: RabbitMqDeliveryChannel, private readonly queue: string) {}

  async drain<T>(limit: number, decode: (message: GetMessage) => T | null): Promise<readonly (QueueDelivery & { readonly value: T })[]> {
    assertQueueDrainLimit(limit);
    if (this.acquiring) throw new Error('RabbitMQ queue acquisition is already in progress');
    this.acquiring = true;
    const acquired: RabbitMqOwnedDelivery[] = [];
    try {
      await this.recoverPending();
      const deliveries: (QueueDelivery & { readonly value: T })[] = [];
      for (let index = 0; index < limit; index += 1) {
        const message = await this.channel.get(this.queue, { noAck: false });
        if (message === false) break;
        const owner = new RabbitMqOwnedDelivery(this.channel, message, this.recovery);
        acquired.push(owner);
        let value: T | null;
        try { value = decode(message); } catch { value = null; }
        if (value === null) {
          await owner.nack({ requeue: false });
          continue;
        }
        deliveries.push({
          value,
          diagnostics: queueCommandDeliveryDiagnosticsFromRabbitMq(message, this.queue),
          ack: () => owner.ack(),
          nack: (params) => owner.nack(params),
          release: () => owner.release(),
        });
      }
      return deliveries;
    } catch (error) {
      const cleanup = await releaseAll(acquired);
      if (cleanup.length > 0) {
        throw new AggregateError([error, ...cleanup], failureMessage(error), { cause: error });
      }
      throw error;
    } finally {
      this.acquiring = false;
    }
  }

  async recoverPending(): Promise<void> {
    const failures = await releaseAll([...this.recovery]);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'RabbitMQ delivery cleanup remains unresolved', { cause: failures[0] });
    }
  }
}

class RabbitMqOwnedDelivery {
  private state: 'pending' | 'settling' | 'settled' = 'pending';
  private operation: Promise<void> | undefined;
  private cleanup: Promise<void> | undefined;

  constructor(private readonly channel: RabbitMqDeliveryChannel, private readonly message: GetMessage,
    private readonly recovery: Set<RabbitMqOwnedDelivery>) {}

  ack(): Promise<void> {
    if (this.cleanup !== undefined) return Promise.reject(new Error('RabbitMQ delivery cleanup is in progress'));
    return this.settle(() => this.channel.ack(this.message));
  }

  nack(params: { readonly requeue: boolean }): Promise<void> {
    if (this.cleanup !== undefined) return Promise.reject(new Error('RabbitMQ delivery cleanup is in progress'));
    return this.settle(() => this.channel.nack(this.message, false, params.requeue));
  }

  release(): Promise<void> {
    if (this.cleanup !== undefined) return this.cleanup;
    const cleanup = this.releaseOwned().finally(() => { this.cleanup = undefined; });
    this.cleanup = cleanup;
    return cleanup;
  }

  private async releaseOwned(): Promise<void> {
    await this.operation?.catch(() => undefined);
    if (this.state === 'settled') return;
    try {
      await this.settle(() => this.channel.nack(this.message, false, true));
    } catch (releaseError) {
      if (this.channel.recoverDelivery === undefined) throw releaseError;
      // A successful close confirms broker recovery, including already-closed
      // origins. A failed open-origin close leaves this handle in recovery.
      this.state = 'settling';
      try {
        await this.channel.recoverDelivery(this.message);
        this.state = 'settled';
        this.recovery.delete(this);
      } catch (recoveryError) {
        this.state = 'pending';
        this.recovery.add(this);
        throw new AggregateError([releaseError, recoveryError], 'RabbitMQ delivery release and origin recovery failed', { cause: releaseError });
      }
    }
  }

  private settle(operation: () => Promise<void>): Promise<void> {
    if (this.state !== 'pending') return Promise.reject(new Error('RabbitMQ delivery is not pending'));
    this.state = 'settling';
    const pending = Promise.resolve().then(operation).then(() => {
      this.state = 'settled';
      this.recovery.delete(this);
    }, (error: unknown) => {
      this.state = 'pending';
      this.recovery.add(this);
      throw error;
    }).finally(() => { this.operation = undefined; });
    this.operation = pending;
    return pending;
  }
}

const releaseAll = async (deliveries: readonly RabbitMqOwnedDelivery[]): Promise<readonly unknown[]> => {
  const outcomes = await Promise.allSettled(deliveries.map((delivery) => delivery.release()));
  return outcomes.flatMap((outcome) => outcome.status === 'rejected' ? [outcome.reason] : []);
};

const failureMessage = (error: unknown): string => error instanceof Error ? error.message : 'RabbitMQ queue acquisition failed';
