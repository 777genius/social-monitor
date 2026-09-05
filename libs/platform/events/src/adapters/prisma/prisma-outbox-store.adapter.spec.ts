import { FixedClock, REDACTED_VALUE, eventId, correlationId } from '@social-monitor/shared-kernel';
import { OutboxDispatcher } from '../../outbox-dispatcher';
import { PrismaOutboxStoreAdapter } from './prisma-outbox-store.adapter';
import type { PrismaEventStoreClient, PrismaEventOutboxRecord } from './prisma-event-store-client';

function fixture() {
  let row: PrismaEventOutboxRecord = { id: 'fixture-event', tenantId: null, workspaceId: null,
    messageKind: 'EVENT', eventType: 'reader_summary.ready', schemaVersion: 1, payload: {}, status: 'PENDING',
    correlationId: 'fixture-correlation', causationId: null, createdAt: new Date('2026-09-04T00:00:00.000Z'),
    publishedAt: null, publishAttempts: 0, lastError: null };
  const update = jest.fn(async ({ data }: Parameters<PrismaEventStoreClient['outboxEvent']['update']>[0]) => {
    row = { ...row, status: data.status ?? row.status,
      publishedAt: data.publishedAt === undefined ? row.publishedAt : data.publishedAt,
      lastError: data.lastError === undefined ? row.lastError : data.lastError,
      publishAttempts: row.publishAttempts + (data.publishAttempts?.increment ?? 0) };
    return row;
  });
  const client: PrismaEventStoreClient = { outboxEvent: { update, findMany: async () => [row] },
    inboxRecord: { findUnique: async () => null, create: jest.fn() } };
  return { row: () => row, update, store: new PrismaOutboxStoreAdapter(client, new FixedClock(row.createdAt)) };
}

describe('event outbox diagnostics and recorded dispatch starts', () => {
  it('retains sanitized bounded broker failure and records attempt before invoking the publisher', async () => {
    const f = fixture();
    const publish = jest.fn(async () => {
      expect(f.row().publishAttempts).toBe(1);
      throw new Error('NO_ROUTE access_token=fixture-token\n' + 'x'.repeat(800));
    });
    expect(await new OutboxDispatcher(f.store, { publish }).dispatchBatch(1)).toEqual({ published: 0, failed: 1 });
    expect(f.row()).toMatchObject({ status: 'FAILED', publishAttempts: 1, publishedAt: null });
    expect(f.row().lastError).toContain(`NO_ROUTE access_token=${REDACTED_VALUE}`);
    expect(f.row().lastError?.length).toBeLessThanOrEqual(500);
    expect(f.row().lastError).not.toMatch(/fixture-token|\n/);
  });

  it('counts a successful start once and clears the failure on acknowledgement', async () => {
    const f = fixture();
    await new OutboxDispatcher(f.store, { publish: async () => undefined }).dispatchBatch(1);
    expect(f.row()).toMatchObject({ publishAttempts: 1, status: 'PUBLISHED', lastError: null });
    expect(f.row().publishedAt).toBeInstanceOf(Date);
  });

  it('does not send when attempt persistence fails, and leaves an interrupted start explicitly uncertain', async () => {
    const f = fixture();
    f.update.mockRejectedValueOnce(new Error('fixture persistence failure'));
    const publish = jest.fn();
    await expect(new OutboxDispatcher(f.store, { publish }).dispatchBatch(1)).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
    await f.store.recordAttempt('fixture-event');
    expect(f.row()).toMatchObject({ publishAttempts: 1, status: 'PENDING' });
    expect(f.row().lastError).toContain('Earlier uninstrumented attempts unknown');
  });

  it('does not double count when broker confirmation succeeded but acknowledgement storage failed', async () => {
    const recordAttempt = jest.fn(async () => undefined);
    const markFailed = jest.fn(async () => undefined);
    const dispatcher = new OutboxDispatcher({ recordAttempt, markFailed,
      pending: async () => [{ id: 'fixture', event: { eventId: eventId('fixture'), eventType: 'reader_summary.ready',
        schemaVersion: 1, occurredAt: new Date('2026-09-04T00:00:00.000Z'), correlationId: correlationId('fixture'), payload: {} } }],
      markPublished: async () => { throw new Error('fixture acknowledgement storage failed'); },
    }, { publish: async () => undefined });
    expect(await dispatcher.dispatchBatch(1)).toEqual({ published: 0, failed: 1 });
    expect(recordAttempt).toHaveBeenCalledTimes(1);
    expect(markFailed).toHaveBeenCalledWith('fixture', 'fixture acknowledgement storage failed');
  });
});
