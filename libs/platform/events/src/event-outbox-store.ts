import type { OutboxLeaseStore } from '@social-monitor/platform-queue';
import type { EventEnvelope } from '@social-monitor/shared-kernel';

export type OutboxRecord = {
  readonly id: string;
  readonly event: EventEnvelope<Readonly<Record<string, unknown>>>;
};

export type ClaimedOutboxRecord = OutboxRecord & {
  /** Recorded dispatch starts; claiming an untouched sibling does not count. */
  readonly publishAttempts: number;
};

export type EventOutboxOwner = {
  readonly id: string;
  readonly leaseOwner: string;
};

export interface OutboxStorePort extends OutboxLeaseStore {
  claimPending(params: {
    readonly limit: number;
    readonly now: Date;
    readonly leaseOwner: string;
    readonly leasedUntil: Date;
  }): Promise<readonly ClaimedOutboxRecord[]>;
  /** Atomically record a dispatch start under the live owner and return its count. */
  recordAttempt(params: EventOutboxOwner): Promise<number>;
  markPublished(params: EventOutboxOwner & { readonly publishedAt: Date }): Promise<void>;
  markFailed(params: EventOutboxOwner & {
    readonly failedAt: Date;
    readonly availableAt: Date;
    readonly reason: string;
    readonly terminal: boolean;
  }): Promise<void>;
}

export class EventOutboxOwnershipError extends Error {
  constructor() {
    super('Event outbox lease ownership was lost');
    this.name = 'EventOutboxOwnershipError';
  }
}
