import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { EventPublisherPort, OutboxRecord, OutboxStorePort } from './outbox-dispatcher';
import type { InboxStorePort } from './inbox-deduplicator';

export class InMemoryOutboxStore implements OutboxStorePort {
  private readonly records = new Map<string, OutboxRecord & { status: 'pending' | 'published' | 'failed' }>();

  add(record: OutboxRecord): void {
    this.records.set(record.id, { ...record, status: 'pending' });
  }

  async pending(limit: number): Promise<readonly OutboxRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.status === 'pending')
      .slice(0, limit)
      .map((record) => ({ id: record.id, event: record.event }));
  }

  async markPublished(id: string): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, status: 'published' });
    }
  }

  async markFailed(id: string): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, status: 'failed' });
    }
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
