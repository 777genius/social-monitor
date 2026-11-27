import { redactSensitiveResponseText, type Clock, type EventEnvelope } from '@social-monitor/shared-kernel';

import { assertEventOutboxBatchLimit, eventOutboxLeaseDuration } from '../../event-outbox-dispatch-policy';
import { EventOutboxOwnershipError, type EventOutboxOwner } from '../../event-outbox-store';
import type { InboxStorePort } from '../../inbox-deduplicator';
import type { ClaimedOutboxRecord, EventPublisherPort, OutboxRecord, OutboxStorePort } from '../../outbox-dispatcher';

export type InMemoryEventOutboxState = OutboxRecord & {
  readonly status: 'PENDING' | 'PUBLISHED' | 'FAILED';
  readonly availableAt: Date;
  readonly leaseOwner: string | null;
  readonly leasedUntil: Date | null;
  readonly publishAttempts: number;
  readonly lastError: string | null;
  readonly publishedAt: Date | null;
};

export class InMemoryOutboxStore implements OutboxStorePort {
  private readonly records = new Map<string, InMemoryEventOutboxState>();

  constructor(private readonly clock: Clock) {}

  add(record: OutboxRecord, initial: Partial<Pick<InMemoryEventOutboxState,
    'status' | 'availableAt' | 'publishAttempts'>> = {}): void {
    this.records.set(record.id, {
      ...record, status: 'PENDING', availableAt: record.event.occurredAt,
      leaseOwner: null, leasedUntil: null, publishAttempts: 0,
      lastError: null, publishedAt: null, ...initial,
    });
  }

  snapshot(id: string): InMemoryEventOutboxState | undefined {
    const record = this.records.get(id);
    return record === undefined ? undefined : { ...record };
  }

  async claimPending(params: Parameters<OutboxStorePort['claimPending']>[0]): Promise<readonly ClaimedOutboxRecord[]> {
    assertEventOutboxBatchLimit(params.limit);
    if (params.limit === 0) return [];
    const leaseMs = eventOutboxLeaseDuration(params);
    const now = this.clock.now();
    const records = [...this.records.values()]
      .filter((record) => record.status === 'PENDING' && record.availableAt <= now &&
        (record.leasedUntil === null || record.leasedUntil <= now))
      .sort((left, right) => left.availableAt.getTime() - right.availableAt.getTime() ||
        left.event.occurredAt.getTime() - right.event.occurredAt.getTime() || left.id.localeCompare(right.id))
      .slice(0, params.limit);
    for (const record of records) {
      this.records.set(record.id, {
        ...record, leaseOwner: params.leaseOwner, leasedUntil: new Date(now.getTime() + leaseMs),
      });
    }
    return records.map(({ id, event, publishAttempts }) => ({ id, event, publishAttempts }));
  }

  async renewClaims(params: Parameters<OutboxStorePort['renewClaims']>[0]): Promise<boolean> {
    if (params.ids.length === 0) return true;
    const leaseMs = eventOutboxLeaseDuration(params);
    if (new Set(params.ids).size !== params.ids.length) {
      throw new Error('Event outbox lease renewal contains duplicate identities');
    }
    const now = this.clock.now();
    let renewed = 0;
    for (const id of params.ids) {
      const record = this.records.get(id);
      if (record !== undefined && this.isOwned(record, params.leaseOwner, now)) {
        this.records.set(id, { ...record, leasedUntil: new Date(now.getTime() + leaseMs) });
        renewed += 1;
      }
    }
    return renewed === params.ids.length;
  }

  async recordAttempt(params: EventOutboxOwner): Promise<number> {
    const record = this.owned(params);
    const publishAttempts = record.publishAttempts + 1;
    this.records.set(record.id, {
      ...record, publishAttempts,
      lastError: 'Dispatch started; outcome unknown. Earlier uninstrumented attempts unknown.',
    });
    return publishAttempts;
  }

  async markPublished(params: Parameters<OutboxStorePort['markPublished']>[0]): Promise<void> {
    const record = this.owned(params);
    this.records.set(record.id, {
      ...record, status: 'PUBLISHED', lastError: null,
      publishedAt: params.publishedAt, leaseOwner: null, leasedUntil: null,
    });
  }

  async markFailed(params: Parameters<OutboxStorePort['markFailed']>[0]): Promise<void> {
    const delayMs = params.availableAt.getTime() - params.failedAt.getTime();
    if (!Number.isSafeInteger(delayMs) || delayMs < 0) throw new Error('Invalid event outbox retry delay');
    const record = this.owned(params);
    this.records.set(record.id, {
      ...record, status: params.terminal ? 'FAILED' : 'PENDING',
      availableAt: new Date(this.clock.now().getTime() + delayMs),
      lastError: redactSensitiveResponseText(params.reason).replace(/[\r\n\t]/g, ' ').slice(0, 500),
      publishedAt: null, leaseOwner: null, leasedUntil: null,
    });
  }

  private owned(params: EventOutboxOwner): InMemoryEventOutboxState {
    const record = this.records.get(params.id);
    if (record === undefined || !this.isOwned(record, params.leaseOwner, this.clock.now())) {
      throw new EventOutboxOwnershipError();
    }
    return record;
  }

  private isOwned(record: InMemoryEventOutboxState, owner: string, now: Date): boolean {
    return record.status === 'PENDING' && record.leaseOwner === owner &&
      record.leasedUntil !== null && record.leasedUntil > now;
  }
}

export class InMemoryEventPublisher implements EventPublisherPort {
  readonly published: EventEnvelope<Readonly<Record<string, unknown>>>[] = [];

  async publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    this.published.push(event);
  }
}

export class InMemoryInboxStore implements InboxStorePort {
  private readonly processed = new Set<string>();

  async hasProcessed(params: { consumerName: string; eventId: string }): Promise<boolean> {
    return this.processed.has(this.key(params.consumerName, params.eventId));
  }

  async markProcessed(params: { consumerName: string; eventId: string }): Promise<void> {
    this.processed.add(this.key(params.consumerName, params.eventId));
  }

  private key(consumerName: string, eventId: string): string {
    return `${consumerName}:${eventId}`;
  }
}
