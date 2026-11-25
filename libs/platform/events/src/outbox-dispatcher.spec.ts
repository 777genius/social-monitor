import { correlationId, eventId, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryEventPublisher, InMemoryOutboxStore } from './adapters/in-memory';
import { OutboxDispatcher } from './outbox-dispatcher';

describe('OutboxDispatcher', () => {
  it('publishes pending events and marks them published', async () => {
    const outbox = new InMemoryOutboxStore();
    const publisher = new InMemoryEventPublisher();
    outbox.add({
      id: 'outbox-1',
      event: {
        eventId: eventId('event-1'),
        eventType: 'test.event',
        schemaVersion: 1,
        occurredAt: new Date('2026-06-05T00:00:00.000Z'),
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        correlationId: correlationId('correlation-1'),
        payload: {},
      },
    });

    const result = await new OutboxDispatcher(outbox, publisher).dispatchBatch(10);

    expect(result).toEqual({ published: 1, failed: 0 });
    expect(publisher.published).toHaveLength(1);
    await expect(outbox.pending(10)).resolves.toHaveLength(0);
  });
  it('preserves a terminal published event against a stale failing relay', async () => {
    const outbox = new InMemoryOutboxStore();
    outbox.add({
      id: 'outbox-2',
      event: {
        eventId: eventId('event-2'),
        eventType: 'test.event',
        schemaVersion: 1,
        occurredAt: new Date('2026-06-05T00:01:00.000Z'),
        correlationId: correlationId('correlation-2'),
        payload: {},
      },
    });
    // Two workers have already read the same PENDING record. The second may
    // not move the acknowledged terminal row backwards.
    const pending = await outbox.pending(1);
    expect(pending).toHaveLength(1);
    await outbox.recordAttempt('outbox-2');
    await outbox.markPublished('outbox-2');
    await expect(outbox.markFailed('outbox-2', 'delayed broker failure')).rejects.toThrow('no longer pending');
    await expect(outbox.markPublished('outbox-2')).rejects.toThrow('no longer pending');
    await expect(outbox.recordAttempt('outbox-2')).rejects.toThrow('no longer pending');
    await expect(outbox.pending(10)).resolves.toHaveLength(0);
  });

  it('preserves a failed event from late success without automatically requeuing it', async () => {
    const outbox = new InMemoryOutboxStore();
    outbox.add({
      id: 'outbox-3',
      event: {
        eventId: eventId('event-3'),
        eventType: 'test.event',
        schemaVersion: 1,
        occurredAt: new Date('2026-06-05T00:02:00.000Z'),
        correlationId: correlationId('correlation-3'),
        payload: {},
      },
    });
    await outbox.recordAttempt('outbox-3');
    await outbox.markFailed('outbox-3', 'broker unavailable');
    await expect(outbox.markPublished('outbox-3')).rejects.toThrow('no longer pending');
    await expect(outbox.pending(10)).resolves.toHaveLength(0);
  });

});
