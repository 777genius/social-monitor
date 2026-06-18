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
});
