import { InMemoryInboxStore } from './adapters/in-memory';
import { InboxDeduplicator } from './inbox-deduplicator';

describe('InboxDeduplicator', () => {
  it('runs handler only once for the same consumer and event', async () => {
    const deduplicator = new InboxDeduplicator(new InMemoryInboxStore());
    let calls = 0;

    const params = {
      consumerName: 'test-consumer',
      eventId: 'event-1',
      schemaVersion: 1,
      handler: async () => {
        calls += 1;
      },
    };

    const first = await deduplicator.runOnce(params);
    const second = await deduplicator.runOnce(params);

    expect(first.processed).toBe(true);
    expect(second.processed).toBe(false);
    expect(calls).toBe(1);
  });
});
