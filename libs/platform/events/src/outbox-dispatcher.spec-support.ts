import { causationId, correlationId, eventId, tenantId, workspaceId, type Clock } from '@social-monitor/shared-kernel';

import { InMemoryOutboxStore } from './adapters/in-memory';
import { OutboxDispatcher, type EventPublisherPort, type OutboxDispatcherOptions, type OutboxRecord } from './outbox-dispatcher';

export function outboxFixture() {
  let time = new Date('2026-11-27T00:00:00.000Z').getTime();
  let sequence = 0;
  const clock: Clock = { now: () => new Date(time) };
  const ids = { generate: () => `relay-owner-${++sequence}` };
  const store = new InMemoryOutboxStore(clock);
  const record = (id = 'event-1'): OutboxRecord => ({
    id,
    event: {
      eventId: eventId(id), eventType: 'reader_summary.ready', schemaVersion: 1,
      occurredAt: clock.now(), tenantId: tenantId('tenant-fixture'), workspaceId: workspaceId('workspace-fixture'),
      correlationId: correlationId('correlation-fixture'), causationId: causationId('causation-fixture'),
      payload: { readerSummaryId: 'summary-fixture', synthetic: true },
    },
  });
  return {
    clock, ids, store, record,
    advance: (milliseconds: number) => { time += milliseconds; },
    dispatcher: (publisher: EventPublisherPort, options: OutboxDispatcherOptions = {}) =>
      new OutboxDispatcher(store, publisher, ids, clock, options),
  };
}

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}
