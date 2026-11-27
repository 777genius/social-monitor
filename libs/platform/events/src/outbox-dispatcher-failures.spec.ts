import { InMemoryEventPublisher } from './adapters/in-memory';
import { deferred, outboxFixture } from './outbox-dispatcher.spec-support';

const recovered = { published: 2, retrying: 0, failed: 0 };

function seeded() {
  const f = outboxFixture();
  f.store.add(f.record('event-1'));
  f.store.add(f.record('event-2'));
  return f;
}

describe('OutboxDispatcher interrupted persistence and lease ownership', () => {
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('does not send if recording the start fails and recovers untouched siblings after expiry', async () => {
    const f = seeded();
    jest.spyOn(f.store, 'recordAttempt').mockRejectedValueOnce(new Error('start storage unavailable'));
    const publish = jest.fn().mockResolvedValue(undefined);
    const dispatcher = f.dispatcher({ publish });
    await expect(dispatcher.dispatchBatch(2)).rejects.toThrow('start storage unavailable');
    expect(publish).not.toHaveBeenCalled();
    expect(f.store.snapshot('event-1')?.publishAttempts).toBe(0);
    expect(f.store.snapshot('event-2')?.publishAttempts).toBe(0);
    f.advance(30_000);
    expect(await dispatcher.dispatchBatch(2)).toEqual(recovered);
  });

  it('retains recovery of all siblings when saving the failed outcome also fails', async () => {
    const f = seeded();
    jest.spyOn(f.store, 'markFailed').mockRejectedValueOnce(new Error('failure storage unavailable'));
    const publish = jest.fn().mockRejectedValueOnce(new Error('broker failure')).mockResolvedValue(undefined);
    const dispatcher = f.dispatcher({ publish });
    await expect(dispatcher.dispatchBatch(2)).rejects.toThrow('failure storage unavailable');
    expect(publish).toHaveBeenCalledTimes(1);
    expect(f.store.snapshot('event-1')).toMatchObject({ status: 'PENDING', publishAttempts: 1 });
    expect(f.store.snapshot('event-2')).toMatchObject({ status: 'PENDING', publishAttempts: 0 });
    f.advance(30_000);
    expect(await dispatcher.dispatchBatch(2)).toEqual(recovered);
    expect(f.store.snapshot('event-1')?.publishAttempts).toBe(2);
    expect(f.store.snapshot('event-2')?.publishAttempts).toBe(1);
  });

  it('does not misclassify a broker ACK as failed when its durable settlement is lost', async () => {
    const f = outboxFixture();
    f.store.add(f.record());
    const failure = jest.spyOn(f.store, 'markFailed');
    jest.spyOn(f.store, 'markPublished').mockRejectedValueOnce(new Error('ACK storage unavailable'));
    const effective = new Set<string>();
    const publish = jest.fn(async (event: { eventId: string }) => { effective.add(event.eventId); });
    const dispatcher = f.dispatcher({ publish });
    await expect(dispatcher.dispatchBatch(1)).rejects.toThrow('ACK storage unavailable');
    expect(failure).not.toHaveBeenCalled();
    expect(f.store.snapshot('event-1')).toMatchObject({ status: 'PENDING', publishAttempts: 1 });
    expect(f.store.snapshot('event-1')?.lastError).toContain('outcome unknown');
    f.advance(30_000);
    expect(await dispatcher.dispatchBatch(1)).toEqual({ published: 1, retrying: 0, failed: 0 });
    expect(publish).toHaveBeenCalledTimes(2);
    expect(effective.size).toBe(1);
  });

  it('does not overwrite a committed publication when only the acknowledgement is lost', async () => {
    const f = outboxFixture();
    f.store.add(f.record());
    const markPublished = f.store.markPublished.bind(f.store);
    jest.spyOn(f.store, 'markPublished').mockImplementationOnce(async (params) => {
      await markPublished(params);
      throw new Error('commit reply lost');
    });
    const markFailed = jest.spyOn(f.store, 'markFailed');
    const publisher = new InMemoryEventPublisher();
    const dispatcher = f.dispatcher(publisher);
    await expect(dispatcher.dispatchBatch(1)).rejects.toThrow('commit reply lost');
    expect(markFailed).not.toHaveBeenCalled();
    f.advance(30_000);
    expect(await dispatcher.dispatchBatch(1)).toEqual({ published: 0, retrying: 0, failed: 0 });
    expect(publisher.published).toHaveLength(1);
    expect(f.store.snapshot('event-1')?.status).toBe('PUBLISHED');
  });

  it('keeps concurrent relays from starting the same row while its publish is pending', async () => {
    const f = seeded();
    const entered = deferred();
    const finish = deferred();
    const publish = jest.fn(async () => { entered.resolve(); await finish.promise; });
    const first = f.dispatcher({ publish }).dispatchBatch(2);
    await entered.promise;
    const second = new InMemoryEventPublisher();
    expect(await f.dispatcher(second).dispatchBatch(2)).toEqual({ published: 0, retrying: 0, failed: 0 });
    expect(second.published).toHaveLength(0);
    expect(f.store.snapshot('event-2')?.publishAttempts).toBe(0);
    finish.resolve();
    expect(await first).toEqual(recovered);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('stops sends and rejects a late ACK after a renewal becomes uncertain', async () => {
    jest.useFakeTimers();
    const f = seeded();
    const entered = deferred();
    const finish = deferred();
    jest.spyOn(f.store, 'renewClaims').mockResolvedValueOnce(false);
    const publish = jest.fn(async () => { entered.resolve(); await finish.promise; });
    const first = f.dispatcher({ publish }, { leaseMs: 30 }).dispatchBatch(2);
    const rejected = expect(first).rejects.toThrow('ownership was lost');
    await entered.promise;
    f.advance(10);
    await jest.advanceTimersByTimeAsync(10);
    finish.resolve();
    await rejected;
    expect(publish).toHaveBeenCalledTimes(1);
    expect(f.store.snapshot('event-1')?.status).toBe('PENDING');
    expect(f.store.snapshot('event-2')?.publishAttempts).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    f.advance(20);
    expect(await f.dispatcher(new InMemoryEventPublisher(), { leaseMs: 30 }).dispatchBatch(2)).toEqual(recovered);
  });

  it('cannot continue after the local deadline even when a timer was delayed', async () => {
    jest.useFakeTimers();
    const f = seeded();
    const publish = jest.fn(async () => { f.advance(30); });
    await expect(f.dispatcher({ publish }, { leaseMs: 30 }).dispatchBatch(2)).rejects.toThrow('ownership was lost');
    expect(publish).toHaveBeenCalledTimes(1);
    expect(f.store.snapshot('event-1')?.status).toBe('PENDING');
    expect(f.store.snapshot('event-2')?.publishAttempts).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});
