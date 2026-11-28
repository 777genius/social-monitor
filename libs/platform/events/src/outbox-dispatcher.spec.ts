import { REDACTED_VALUE } from '@social-monitor/shared-kernel';

import { InMemoryEventPublisher } from './adapters/in-memory';
import { outboxFixture } from './outbox-dispatcher.spec-support';

const nothing = { published: 0, retrying: 0, failed: 0 };

describe('OutboxDispatcher recovery', () => {
  it('publishes the original scoped envelope and clears its live ownership', async () => {
    const f = outboxFixture();
    const publisher = new InMemoryEventPublisher();
    const record = f.record();
    f.store.add(record);
    const dispatcher = f.dispatcher(publisher);

    expect(await dispatcher.dispatchBatch(10)).toEqual({ published: 1, retrying: 0, failed: 0 });
    expect(publisher.published).toEqual([record.event]);
    expect(f.store.snapshot(record.id)).toMatchObject({
      status: 'PUBLISHED', publishAttempts: 1, lastError: null,
      publishedAt: f.clock.now(), leaseOwner: null, leasedUntil: null,
    });
    expect(await dispatcher.dispatchBatch(10)).toEqual(nothing);
    expect(publisher.published).toHaveLength(1);
  });

  it('recovers a temporary broker failure on a later tick without spinning before the retry time', async () => {
    const f = outboxFixture();
    const record = f.record();
    f.store.add(record);
    const publish = jest.fn().mockRejectedValueOnce(new Error('broker temporarily unavailable')).mockResolvedValue(undefined);
    const dispatcher = f.dispatcher({ publish });

    expect(await dispatcher.dispatchBatch(1)).toEqual({ published: 0, retrying: 1, failed: 0 });
    expect(f.store.snapshot(record.id)).toMatchObject({ status: 'PENDING', publishAttempts: 1, leaseOwner: null });
    expect(await dispatcher.dispatchBatch(1)).toEqual(nothing);
    f.advance(999);
    expect(await dispatcher.dispatchBatch(1)).toEqual(nothing);
    expect(publish).toHaveBeenCalledTimes(1);
    f.advance(1);
    expect(await dispatcher.dispatchBatch(1)).toEqual({ published: 1, retrying: 0, failed: 0 });
    expect(publish.mock.calls).toEqual([[record.event], [record.event]]);
    expect(f.store.snapshot(record.id)?.publishAttempts).toBe(2);
  });

  it('counts dispatch starts before the send, caps backoff and eventually makes permanent errors terminal', async () => {
    const f = outboxFixture();
    f.store.add(f.record());
    let starts = 0;
    const publish = jest.fn(async () => {
      starts += 1;
      expect(f.store.snapshot('event-1')?.publishAttempts).toBe(starts);
      throw new Error('NO_ROUTE access_token=fixture-token\n' + 'x'.repeat(800));
    });
    const dispatcher = f.dispatcher({ publish }, { maxAttempts: 4, retryBaseMs: 10, retryMaxMs: 25 });
    for (const delay of [10, 20, 25]) {
      expect(await dispatcher.dispatchBatch(1)).toEqual({ published: 0, retrying: 1, failed: 0 });
      expect(f.store.snapshot('event-1')?.availableAt.getTime()).toBe(f.clock.now().getTime() + delay);
      f.advance(delay);
    }
    expect(await dispatcher.dispatchBatch(1)).toEqual({ published: 0, retrying: 0, failed: 1 });
    const row = f.store.snapshot('event-1');
    expect(row).toMatchObject({ status: 'FAILED', publishAttempts: 4, leaseOwner: null, publishedAt: null });
    expect(row?.lastError).toContain(`NO_ROUTE access_token=${REDACTED_VALUE}`);
    expect(row?.lastError).not.toMatch(/fixture-token|[\r\n\t]/);
    expect(row?.lastError?.length).toBeLessThanOrEqual(500);
    f.advance(100_000);
    expect(await dispatcher.dispatchBatch(1)).toEqual(nothing);
    expect(publish).toHaveBeenCalledTimes(4);
  });

  it('settles independent healthy siblings after a publication failure', async () => {
    const f = outboxFixture();
    f.store.add(f.record('event-1'));
    f.store.add(f.record('event-2'));
    const publish = jest.fn().mockRejectedValueOnce(new Error('unroutable event')).mockResolvedValue(undefined);
    expect(await f.dispatcher({ publish }).dispatchBatch(2)).toEqual({ published: 1, retrying: 1, failed: 0 });
    expect(f.store.snapshot('event-1')?.status).toBe('PENDING');
    expect(f.store.snapshot('event-2')?.status).toBe('PUBLISHED');
  });

  it('terminalizes an exhausted interrupted attempt on reclaim without spending another send', async () => {
    const f = outboxFixture();
    f.store.add(f.record('event-1'), { publishAttempts: 10 });
    f.store.add(f.record('event-2'));
    const publish = jest.fn().mockResolvedValue(undefined);
    expect(await f.dispatcher({ publish }).dispatchBatch(2)).toEqual({ published: 1, retrying: 0, failed: 1 });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[0].eventId).toBe('event-2');
    expect(f.store.snapshot('event-1')).toMatchObject({ status: 'FAILED', publishAttempts: 10 });
    expect(f.store.snapshot('event-1')?.lastError).toContain('last outcome may be unknown');
  });

  it('never automatically replays a historical FAILED row, even with unused retry budget', async () => {
    const f = outboxFixture();
    f.store.add(f.record(), { status: 'FAILED', publishAttempts: 1 });
    const before = f.store.snapshot('event-1');
    const publish = jest.fn();
    expect(await f.dispatcher({ publish }).dispatchBatch(1)).toEqual(nothing);
    expect(publish).not.toHaveBeenCalled();
    expect(f.store.snapshot('event-1')).toEqual(before);
  });

  it('does not acquire work after stop and leaves unstarted siblings outside the attempt count', async () => {
    const f = outboxFixture();
    f.store.add(f.record('event-1'));
    f.store.add(f.record('event-2'));
    let running = true;
    const publish = jest.fn(async () => { running = false; });
    const dispatcher = f.dispatcher({ publish });
    expect(await dispatcher.dispatchBatch(2, () => running)).toEqual({ published: 1, retrying: 0, failed: 0 });
    expect(f.store.snapshot('event-2')).toMatchObject({ status: 'PENDING', publishAttempts: 0 });
    expect(await dispatcher.dispatchBatch(2, () => running)).toEqual(nothing);
    f.advance(30_000);
    expect(await f.dispatcher(new InMemoryEventPublisher()).dispatchBatch(2))
      .toEqual({ published: 1, retrying: 0, failed: 0 });
    expect(f.store.snapshot('event-2')?.publishAttempts).toBe(1);
  });

  it('rejects an unbounded batch before calling the store', async () => {
    const f = outboxFixture();
    const claim = jest.spyOn(f.store, 'claimPending');
    const dispatcher = f.dispatcher(new InMemoryEventPublisher());
    await expect(dispatcher.dispatchBatch(501)).rejects.toThrow('batch limit');
    await expect(dispatcher.dispatchBatch(-1)).rejects.toThrow('batch limit');
    expect(await dispatcher.dispatchBatch(0)).toEqual(nothing);
    expect(claim).not.toHaveBeenCalled();
  });
});
