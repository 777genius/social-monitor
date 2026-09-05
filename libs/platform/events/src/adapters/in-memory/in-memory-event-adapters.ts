import { redactSensitiveResponseText, type EventEnvelope } from '@social-monitor/shared-kernel';

import type { InboxStorePort } from '../../inbox-deduplicator';
import type { EventPublisherPort, OutboxRecord, OutboxStorePort } from '../../outbox-dispatcher';

export class InMemoryOutboxStore implements OutboxStorePort {
  private readonly records = new Map<string, OutboxRecord & { status: 'pending' | 'published' | 'failed'; publishAttempts: number; lastError: string | null }>();

  add(record: OutboxRecord): void {
    this.records.set(record.id, { ...record, status: 'pending', publishAttempts: 0, lastError: null });
  }

  async pending(limit: number): Promise<readonly OutboxRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.status === 'pending')
      .slice(0, limit)
      .map((record) => ({ id: record.id, event: record.event }));
  }

  async recordAttempt(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) throw new Error('Outbox record is missing');
    this.records.set(id, { ...record, publishAttempts: record.publishAttempts + 1,
      lastError: 'Dispatch started; outcome unknown. Earlier uninstrumented attempts unknown.' });
  }

  async markPublished(id: string): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, status: 'published', lastError: null });
    }
  }

  async markFailed(id: string, reason: string): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      this.records.set(id, { ...record, status: 'failed', lastError: redactSensitiveResponseText(reason).replace(/[\r\n\t]/g, ' ') });
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
