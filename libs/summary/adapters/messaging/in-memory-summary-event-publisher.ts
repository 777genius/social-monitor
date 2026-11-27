import { DomainError, type EventEnvelope } from '@social-monitor/shared-kernel';

import type { SummaryEventPublisherPort } from '../../ports';

export class InMemorySummaryEventPublisher implements SummaryEventPublisherPort {
  private readonly events: EventEnvelope<Readonly<Record<string, unknown>>>[] = [];

  async publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    this.store(event);
  }

  /** Records the event intent without an asynchronous observer or external effect. */
  store(event: EventEnvelope<Readonly<Record<string, unknown>>>): void {
    this.events.push(event);
  }

  prepareCreate(event: EventEnvelope<Readonly<Record<string, unknown>>>): () => void {
    if (this.events.some((stored) => stored.eventId === event.eventId)) {
      throw new DomainError('operation.conflict', 'Summary event identity already exists');
    }
    return () => { this.events.push(event); };
  }

  all(): readonly EventEnvelope<Readonly<Record<string, unknown>>>[] {
    return [...this.events];
  }
}
