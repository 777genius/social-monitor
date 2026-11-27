import { outboxFixture } from '../../outbox-dispatcher.spec-support';

function claim(f: ReturnType<typeof outboxFixture>, owner: string, limit = 10) {
  return f.store.claimPending({
    limit, leaseOwner: owner, now: f.clock.now(),
    leasedUntil: new Date(f.clock.now().getTime() + 100),
  });
}

describe('InMemoryOutboxStore live lease contract', () => {
  it('orders a bounded eligible page and leaves future or terminal records untouched', async () => {
    const f = outboxFixture();
    f.store.add(f.record('event-b'));
    f.store.add(f.record('event-a'));
    f.store.add(f.record('future'), { availableAt: new Date(f.clock.now().getTime() + 1) });
    f.store.add(f.record('historical-failure'), { status: 'FAILED' });
    f.store.add(f.record('acknowledged'), { status: 'PUBLISHED' });
    expect((await claim(f, 'first', 1)).map(row => row.id)).toEqual(['event-a']);
    expect((await claim(f, 'second', 10)).map(row => row.id)).toEqual(['event-b']);
    expect(f.store.snapshot('event-a')?.publishAttempts).toBe(0);
    f.advance(1);
    expect((await claim(f, 'third')).map(row => row.id)).toEqual(['future']);
  });

  it('refuses every stale-owner write after expiry and after a replacement claim', async () => {
    const f = outboxFixture();
    f.store.add(f.record());
    await claim(f, 'old');
    await f.store.recordAttempt({ id: 'event-1', leaseOwner: 'old' });
    f.advance(100);
    const old = { id: 'event-1', leaseOwner: 'old' };
    const fail = { ...old, reason: 'late error', terminal: true, failedAt: f.clock.now(), availableAt: f.clock.now() };
    await expect(f.store.recordAttempt(old)).rejects.toThrow('ownership was lost');
    await expect(f.store.markPublished({ ...old, publishedAt: f.clock.now() })).rejects.toThrow('ownership was lost');
    await expect(f.store.markFailed(fail)).rejects.toThrow('ownership was lost');
    expect(await f.store.renewClaims({ ids: [old.id], leaseOwner: 'old', now: f.clock.now(),
      leasedUntil: new Date(f.clock.now().getTime() + 100) })).toBe(false);
    expect((await claim(f, 'replacement'))[0]?.publishAttempts).toBe(1);
    await expect(f.store.markFailed(fail)).rejects.toThrow('ownership was lost');
    expect(f.store.snapshot(old.id)).toMatchObject({ leaseOwner: 'replacement', status: 'PENDING', publishAttempts: 1 });
    await f.store.markPublished({ id: old.id, leaseOwner: 'replacement', publishedAt: f.clock.now() });
    await expect(f.store.recordAttempt({ id: old.id, leaseOwner: 'replacement' })).rejects.toThrow('ownership was lost');
  });

  it('a partial renewal is not permission to continue the whole batch', async () => {
    const f = outboxFixture();
    f.store.add(f.record('event-a'));
    f.store.add(f.record('event-b'));
    await claim(f, 'owner');
    await f.store.markPublished({ id: 'event-a', leaseOwner: 'owner', publishedAt: f.clock.now() });
    f.advance(10);
    expect(await f.store.renewClaims({ ids: ['event-a', 'event-b'], leaseOwner: 'owner',
      now: f.clock.now(), leasedUntil: new Date(f.clock.now().getTime() + 100) })).toBe(false);
    expect(f.store.snapshot('event-a')?.status).toBe('PUBLISHED');
  });

  it('uses the store clock for eligibility and expiry even when a caller captured a stale time', async () => {
    const f = outboxFixture();
    f.store.add(f.record());
    const staleNow = f.clock.now();
    f.advance(1_000);
    await f.store.claimPending({ limit: 1, leaseOwner: 'owner', now: staleNow,
      leasedUntil: new Date(staleNow.getTime() + 100) });
    expect(f.store.snapshot('event-1')?.leasedUntil).toEqual(new Date(f.clock.now().getTime() + 100));
    f.advance(100);
    expect(await f.store.renewClaims({ ids: ['event-1'], leaseOwner: 'owner', now: staleNow,
      leasedUntil: new Date(staleNow.getTime() + 100) })).toBe(false);
  });
});
