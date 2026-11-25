import type { QueueDelivery } from './queue-delivery';

type Ownership = { state: 'pending' | 'settling' | 'settled'; operation?: Promise<void> };

/** Owns abort cleanup without deciding whether a handler failure is retryable. */
export class QueueDeliveryBatch<TDelivery extends QueueDelivery> {
  private readonly ownership: Map<TDelivery, Ownership>;

  constructor(readonly deliveries: readonly TDelivery[]) {
    this.ownership = new Map(deliveries.map((delivery) => [delivery, { state: 'pending' }]));
  }

  ack(delivery: TDelivery): Promise<void> {
    return this.settle(delivery, () => delivery.ack());
  }

  nack(delivery: TDelivery, params: { readonly requeue: boolean }): Promise<void> {
    return this.settle(delivery, () => delivery.nack(params));
  }

  /** Never throws before every sibling has had a cleanup attempt. Callers keep
   * their primary failure and report these bounded, separately classified errors. */
  async releaseUnsettled(): Promise<readonly unknown[]> {
    const outcomes = await Promise.allSettled([...this.ownership].map(async ([delivery, owner]) => {
      await owner.operation?.catch(() => undefined);
      if (owner.state === 'settled') return;
      await this.settle(delivery, () => delivery.release === undefined
        ? delivery.nack({ requeue: true })
        : delivery.release());
    }));
    return outcomes.flatMap((outcome) => outcome.status === 'rejected' ? [outcome.reason] : []);
  }

  private settle(delivery: TDelivery, operation: () => Promise<void>): Promise<void> {
    const owner = this.ownership.get(delivery);
    if (owner === undefined || owner.state !== 'pending') {
      return Promise.reject(new Error('Queue delivery is not pending in this batch'));
    }
    owner.state = 'settling';
    const pending = Promise.resolve().then(operation).then(() => {
      owner.state = 'settled';
    }, (error: unknown) => {
      owner.state = 'pending';
      throw error;
    }).finally(() => { owner.operation = undefined; });
    owner.operation = pending;
    return pending;
  }
}
