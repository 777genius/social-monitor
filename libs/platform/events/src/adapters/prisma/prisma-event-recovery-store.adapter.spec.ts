import { FixedClock } from '@social-monitor/shared-kernel';

import { PrismaEventRecoveryStoreAdapter } from './prisma-event-recovery-store.adapter';
import type { PrismaEventStoreClient } from './prisma-event-store-client';

function fixture(initial: 'FAILED' | 'PENDING' = 'FAILED', kind: 'EVENT' | 'COMMAND' = 'EVENT') {
  let status: string = initial;
  let attempts = 1;
  let lastError: string | null = 'failed before upgrade';
  const updateMany = jest.fn(async ({ where, data }: Parameters<PrismaEventStoreClient['outboxEvent']['updateMany']>[0]) => {
    if (where.id !== 'event-fixture' || where.status !== status || where.messageKind !== kind) return { count: 0 };
    attempts += data.publishAttempts?.increment ?? 0;
    status = data.status ?? status;
    lastError = data.lastError === undefined ? lastError : data.lastError;
    return { count: 1 };
  });
  return {
    updateMany,
    state: () => ({ status, attempts, lastError }),
    store: new PrismaEventRecoveryStoreAdapter({ outboxEvent: { updateMany } },
      new FixedClock(new Date('2026-11-27T00:00:00.000Z'))),
  };
}

describe('PrismaEventRecoveryStoreAdapter explicit terminal capability', () => {
  it('records a reviewed recovery start and publication without accepting a late failure', async () => {
    const f = fixture();
    await f.store.recordAttempt('event-fixture');
    expect(f.state()).toMatchObject({ status: 'FAILED', attempts: 2 });
    expect(f.state().lastError).toContain('Earlier uninstrumented attempts unknown');
    await f.store.markPublished('event-fixture');
    expect(f.state()).toEqual({ status: 'PUBLISHED', attempts: 2, lastError: null });
    await expect(f.store.markFailed('event-fixture', 'late receipt')).rejects.toThrow('no longer failed');
    for (const [call] of f.updateMany.mock.calls) {
      expect(call.where).toEqual({ id: 'event-fixture', messageKind: 'EVENT', status: 'FAILED' });
    }
  });

  it('refuses normal pending rows and COMMAND rows', async () => {
    for (const f of [fixture('PENDING'), fixture('FAILED', 'COMMAND')]) {
      await expect(f.store.recordAttempt('event-fixture')).rejects.toThrow('no longer failed');
      await expect(f.store.markPublished('event-fixture')).rejects.toThrow('no longer failed');
      await expect(f.store.markFailed('event-fixture', 'spurious')).rejects.toThrow('no longer failed');
      expect(f.state().attempts).toBe(1);
    }
  });

  it('keeps uncertain explicit recovery terminal and sanitizes diagnostic details', async () => {
    const f = fixture();
    await f.store.markFailed('event-fixture', 'access_token=fixture-token\n' + 'x'.repeat(800));
    expect(f.state().status).toBe('FAILED');
    expect(f.state().lastError).not.toMatch(/fixture-token|[\r\n\t]/);
    expect(f.state().lastError?.length).toBeLessThanOrEqual(500);
  });
});
