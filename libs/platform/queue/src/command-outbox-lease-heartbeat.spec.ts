import type { CommandOutboxStorePort } from './command-outbox-dispatcher';
import { CommandOutboxLeaseHeartbeat } from './command-outbox-lease-heartbeat';

const start = new Date('2026-10-31T00:00:00.000Z');
const clock = { now: () => new Date() };
const make = (renewClaims: CommandOutboxStorePort['renewClaims'], ids = ['one', 'two']) =>
  new CommandOutboxLeaseHeartbeat(
    { renewClaims }, ids, 'owner-A', clock, 300,
    new Date(start.getTime() + 300),
  );

describe('CommandOutboxLeaseHeartbeat', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(start);
  });
  afterEach(() => { jest.useRealTimers(); });

  it('renews the full queued batch and later renews only unsettled identities', async () => {
    const renew = jest.fn<ReturnType<CommandOutboxStorePort['renewClaims']>,
      Parameters<CommandOutboxStorePort['renewClaims']>>(async () => true);
    const heartbeat = make(renew);
    try {
      await jest.advanceTimersByTimeAsync(101);
      expect(renew).toHaveBeenCalledWith({
        ids: ['one', 'two'], leaseOwner: 'owner-A',
        now: new Date(start.getTime() + 100),
        leasedUntil: new Date(start.getTime() + 400),
      });
      await heartbeat.assertOwned();
      heartbeat.completed('one');
      await jest.advanceTimersByTimeAsync(101);
      expect(renew).toHaveBeenLastCalledWith(expect.objectContaining({
        ids: ['two'], leasedUntil: new Date(start.getTime() + 500),
      }));
      await heartbeat.assertOwned();
    } finally {
      await heartbeat.stop();
    }
    const calls = renew.mock.calls.length;
    await jest.advanceTimersByTimeAsync(500);
    expect(renew).toHaveBeenCalledTimes(calls);
  });

  it('fails closed when any batch renewal loses ownership', async () => {
    const heartbeat = make(async () => false);
    try {
      await jest.advanceTimersByTimeAsync(101);
      await expect(heartbeat.assertOwned()).rejects.toThrow('ownership was lost');
    } finally {
      await heartbeat.stop();
    }
  });

  it('fails closed on unavailable renewal storage', async () => {
    const heartbeat = make(async () => { throw new Error('postgres unavailable'); });
    try {
      await jest.advanceTimersByTimeAsync(101);
      await expect(heartbeat.assertOwned()).rejects.toThrow('ownership was lost');
    } finally {
      await heartbeat.stop();
    }
  });

  it('refuses sends after expiry even if interval callbacks were delayed', async () => {
    const heartbeat = make(async () => true);
    try {
      jest.setSystemTime(new Date(start.getTime() + 301));
      await expect(heartbeat.assertOwned()).rejects.toThrow('ownership was lost');
    } finally {
      await heartbeat.stop();
    }
  });

  it('refuses ambiguous or duplicate claim identities before starting renewal', () => {
    expect(() => make(async () => true, ['one', 'one'])).toThrow('duplicate');
    expect(() => make(async () => true, [''])).toThrow('blank');
    expect(jest.getTimerCount()).toBe(0);
  });
});
