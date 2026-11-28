import { NestStructuredLogger } from '@social-monitor/platform-logging';
import { deferred, outboxFixture } from '@social-monitor/platform-events/outbox-dispatcher.spec-support';

import { OutboxRelayLoop } from './outbox-relay-loop';

const options = { enabled: true, intervalMs: 1_000, limit: 10, runOnStart: true };

describe('OutboxRelayLoop with the real dispatcher and leased store', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(NestStructuredLogger.prototype, 'info').mockImplementation(() => undefined);
    jest.spyOn(NestStructuredLogger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('survives a temporary broker outage and publishes on a later interval without restart', async () => {
    const f = outboxFixture();
    f.store.add(f.record());
    const publish = jest.fn().mockRejectedValueOnce(new Error('broker disconnected')).mockResolvedValue(undefined);
    const loop = new OutboxRelayLoop(f.dispatcher({ publish }), options);
    try {
      await loop.onModuleInit();
      expect(f.store.snapshot('event-1')).toMatchObject({ status: 'PENDING', publishAttempts: 1 });
      f.advance(1_000);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(f.store.snapshot('event-1')).toMatchObject({ status: 'PUBLISHED', publishAttempts: 2 });
      expect(publish).toHaveBeenCalledTimes(2);
      expect(NestStructuredLogger.prototype.info).toHaveBeenCalledWith('outbox relay loop tick completed',
        expect.objectContaining({ trigger: 'startup', published: 0, retrying: 1, failed: 0 }));
    } finally {
      await loop.onModuleDestroy();
    }
    expect(jest.getTimerCount()).toBe(0);
  });

  it('recovers from a failed database acquisition instead of leaving the tick permanently busy', async () => {
    const f = outboxFixture();
    f.store.add(f.record());
    jest.spyOn(f.store, 'claimPending').mockRejectedValueOnce(new Error('pool temporarily unavailable'));
    const publish = jest.fn().mockResolvedValue(undefined);
    const loop = new OutboxRelayLoop(f.dispatcher({ publish }), options);
    try {
      await loop.onModuleInit();
      expect(publish).not.toHaveBeenCalled();
      f.advance(1_000);
      await jest.advanceTimersByTimeAsync(1_000);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(f.store.snapshot('event-1')?.status).toBe('PUBLISHED');
    } finally {
      await loop.onModuleDestroy();
    }
  });

  it('drains an admitted startup send without starting siblings or resurrecting an interval', async () => {
    const f = outboxFixture();
    f.store.add(f.record('event-1'));
    f.store.add(f.record('event-2'));
    const entered = deferred();
    const finish = deferred();
    const publish = jest.fn(async () => { entered.resolve(); await finish.promise; });
    const loop = new OutboxRelayLoop(f.dispatcher({ publish }), options);
    const init = loop.onModuleInit();
    await entered.promise;
    const stop = loop.onModuleDestroy();
    finish.resolve();
    await Promise.all([init, stop]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(f.store.snapshot('event-1')?.status).toBe('PUBLISHED');
    expect(f.store.snapshot('event-2')?.publishAttempts).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
    f.advance(10_000);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('does not overlap interval batches while an existing publication is still in flight', async () => {
    const f = outboxFixture();
    f.store.add(f.record());
    const entered = deferred();
    const finish = deferred();
    const publish = jest.fn(async () => { entered.resolve(); await finish.promise; });
    const claim = jest.spyOn(f.store, 'claimPending');
    const loop = new OutboxRelayLoop(f.dispatcher({ publish }), { ...options, runOnStart: false });
    await loop.onModuleInit();
    try {
      f.advance(1_000);
      await jest.advanceTimersByTimeAsync(1_000);
      await entered.promise;
      f.advance(3_000);
      await jest.advanceTimersByTimeAsync(3_000);
      expect(claim).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalledTimes(1);
    } finally {
      finish.resolve();
      await loop.onModuleDestroy();
    }
    expect(f.store.snapshot('event-1')?.status).toBe('PUBLISHED');
    expect(jest.getTimerCount()).toBe(0);
  });
});
