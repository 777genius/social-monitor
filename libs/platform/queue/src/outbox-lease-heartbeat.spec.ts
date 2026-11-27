import type { Clock } from '@social-monitor/shared-kernel';

import { OutboxLeaseHeartbeat } from './outbox-lease-heartbeat';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

describe('OutboxLeaseHeartbeat remaining-claim proof', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-27T00:00:00.000Z'));
  });
  afterEach(() => { jest.useRealTimers(); });
  const clock: Clock = { now: () => new Date() };

  it('waits for an obsolete renewal and clears uncertainty only after proving the remaining subset', async () => {
    const oldRenewal = deferred<boolean>();
    const proof = deferred<boolean>();
    const renewClaims = jest.fn().mockReturnValueOnce(oldRenewal.promise).mockReturnValueOnce(proof.promise);
    const heartbeat = new OutboxLeaseHeartbeat({ renewClaims }, ['one', 'two'], 'owner', clock, 300,
      new Date(clock.now().getTime() + 300));
    try {
      await jest.advanceTimersByTimeAsync(100);
      heartbeat.completed('one');
      const verifying = heartbeat.verifyRemainingClaims();
      let proved = false;
      void verifying.then(() => { proved = true; }, () => undefined);
      oldRenewal.resolve(false);
      await jest.advanceTimersByTimeAsync(0);
      expect(renewClaims).toHaveBeenCalledTimes(2);
      expect(renewClaims).toHaveBeenLastCalledWith(expect.objectContaining({ ids: ['two'], leaseOwner: 'owner' }));
      expect(proved).toBe(false);
      proof.resolve(true);
      await verifying;
      await heartbeat.assertOwned();
    } finally {
      oldRenewal.resolve(false);
      proof.resolve(false);
      await heartbeat.stop();
    }
    expect(jest.getTimerCount()).toBe(0);
  });

  it('keeps uncertainty sticky if the remaining subset cannot be renewed', async () => {
    const renewClaims = jest.fn().mockResolvedValue(false);
    const heartbeat = new OutboxLeaseHeartbeat({ renewClaims }, ['one', 'two'], 'owner', clock, 300,
      new Date(clock.now().getTime() + 300));
    try {
      await jest.advanceTimersByTimeAsync(100);
      heartbeat.completed('one');
      await expect(heartbeat.verifyRemainingClaims()).rejects.toThrow('ownership was lost');
      await expect(heartbeat.assertOwned()).rejects.toThrow('ownership was lost');
      await jest.advanceTimersByTimeAsync(100);
      expect(renewClaims).toHaveBeenCalledTimes(2);
    } finally {
      await heartbeat.stop();
    }
  });

  it('requires no database proof once no remaining send is possible', async () => {
    const renewClaims = jest.fn();
    const heartbeat = new OutboxLeaseHeartbeat({ renewClaims }, ['one'], 'owner', clock, 300,
      new Date(clock.now().getTime() + 300));
    heartbeat.completed('one');
    try {
      await heartbeat.verifyRemainingClaims();
      expect(renewClaims).not.toHaveBeenCalled();
    } finally {
      await heartbeat.stop();
    }
  });
});
