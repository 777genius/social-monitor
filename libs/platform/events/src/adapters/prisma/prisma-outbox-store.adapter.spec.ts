import { REDACTED_VALUE } from '@social-monitor/shared-kernel';

import { EventOutboxOwnershipError } from '../../event-outbox-store';
import type { PrismaEventOutboxClient } from './prisma-event-outbox-client';
import type { PrismaEventOutboxRecord } from './prisma-event-store-client';
import { PrismaOutboxStoreAdapter } from './prisma-outbox-store.adapter';

const now = new Date('2026-11-27T00:00:00.000Z');
const lease = { limit: 2, now, leasedUntil: new Date(now.getTime() + 30_000), leaseOwner: 'fixture-owner' };
const owner = { id: '00000000-0000-7000-8000-000000000801', leaseOwner: lease.leaseOwner };
const row = (id: string, availableAt = now): PrismaEventOutboxRecord & { availableAt: Date } => ({
  id, tenantId: 'tenant-fixture', workspaceId: 'workspace-fixture', messageKind: 'EVENT',
  eventType: 'reader_summary.ready', schemaVersion: 1, payload: { synthetic: true },
  status: 'PENDING', correlationId: 'correlation-fixture', causationId: 'cause-fixture',
  createdAt: now, publishedAt: null, publishAttempts: 3, lastError: 'uncertain', availableAt,
});

function fixture() {
  const query = jest.fn(async (_sql: TemplateStringsArray, ..._values: unknown[]): Promise<unknown[]> => []);
  const execute = jest.fn(async (_sql: TemplateStringsArray, ..._values: unknown[]): Promise<number> => 1);
  const client: PrismaEventOutboxClient = {
    $queryRaw: async <T>(sql: TemplateStringsArray, ...values: unknown[]) => await query(sql, ...values) as unknown as T,
    $executeRaw: execute,
  };
  return { query, execute, store: new PrismaOutboxStoreAdapter(client) };
}

describe('PrismaOutboxStoreAdapter SQL boundary', () => {
  it('claims one bounded ordered EVENT page without counting dispatches and preserves the envelope', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([row('event-b'), row('event-a')]);
    const records = await f.store.claimPending(lease);
    expect(records.map(record => record.id)).toEqual(['event-a', 'event-b']);
    expect(records[0]).toEqual({
      id: 'event-a', publishAttempts: 3,
      event: { eventId: 'event-a', eventType: 'reader_summary.ready', schemaVersion: 1,
        occurredAt: now, tenantId: 'tenant-fixture', workspaceId: 'workspace-fixture',
        correlationId: 'correlation-fixture', causationId: 'cause-fixture', payload: { synthetic: true } },
    });
    const [sql, ...values] = f.query.mock.calls[0]!;
    expect(sql.join('?')).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql.join('?')).toContain('"message_kind" = \'EVENT\' AND "status" = \'PENDING\'');
    expect(sql.join('?')).not.toContain('"publish_attempts" + 1');
    expect(values).toEqual([2, lease.leaseOwner, 30_000]);
  });

  it('retains null optional scope and legacy scalar payload normalization', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ ...row(owner.id), tenantId: null, workspaceId: null, causationId: null, payload: 7 }]);
    const [record] = await f.store.claimPending(lease);
    expect(record?.event).toMatchObject({ eventId: owner.id, payload: { value: 7 } });
    expect(record?.event.tenantId).toBeUndefined();
    expect(record?.event.workspaceId).toBeUndefined();
    expect(record?.event.causationId).toBeUndefined();
  });

  it('increments the recorded start only under the locked live owner', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([{ publishAttempts: 4 }]);
    expect(await f.store.recordAttempt(owner)).toBe(4);
    const [sql, ...values] = f.query.mock.calls[0]!;
    expect(values).toEqual([owner.id, owner.leaseOwner]);
    expect(sql.join('?')).toContain('WITH owned AS MATERIALIZED');
    expect(sql.join('?')).toContain('owned."leased_until" > clock_timestamp()');
    f.query.mockResolvedValueOnce([]);
    await expect(f.store.recordAttempt(owner)).rejects.toBeInstanceOf(EventOutboxOwnershipError);
  });

  it('never credits stale or partial settlement as successful', async () => {
    const f = fixture();
    f.execute.mockResolvedValue(0);
    await expect(f.store.markPublished({ ...owner, publishedAt: now })).rejects.toBeInstanceOf(EventOutboxOwnershipError);
    await expect(f.store.markFailed({ ...owner, failedAt: now, availableAt: now, reason: 'failure', terminal: false }))
      .rejects.toBeInstanceOf(EventOutboxOwnershipError);
    expect(await f.store.renewClaims({ ...lease, ids: [owner.id] })).toBe(false);
    for (const [sql] of f.execute.mock.calls) {
      expect(sql.join('?')).toContain('"message_kind" = \'EVENT\' AND "status" = \'PENDING\'');
      expect(sql.join('?')).toContain('WITH owned AS MATERIALIZED');
      expect(sql.join('?')).toContain('owned."leased_until" > clock_timestamp()');
    }
  });

  it('uses a database-relative retry delay and strips secrets before persistence', async () => {
    const f = fixture();
    await f.store.markFailed({ ...owner, failedAt: now, availableAt: new Date(now.getTime() + 250),
      reason: 'NO_ROUTE access_token=fixture-token\n' + 'x'.repeat(800), terminal: false });
    const [sql, id, leaseOwner, terminal, delay, reason] = f.execute.mock.calls[0]!;
    expect([id, leaseOwner, terminal, delay]).toEqual([owner.id, owner.leaseOwner, false, 250]);
    expect(sql.join('?')).toContain('"available_at" = clock_timestamp()');
    expect(reason).toContain(`access_token=${REDACTED_VALUE}`);
    expect(String(reason)).not.toMatch(/fixture-token|[\r\n\t]/);
    expect(String(reason).length).toBeLessThanOrEqual(500);
  });

  it('retries a structured PostgreSQL write conflict without changing dispatch identity', async () => {
    const f = fixture();
    f.query.mockRejectedValueOnce({ code: 'P2010', meta: { code: '40001' } })
      .mockResolvedValueOnce([{ publishAttempts: 1 }]);
    expect(await f.store.recordAttempt(owner)).toBe(1);
    expect(f.query).toHaveBeenCalledTimes(2);
    expect(f.query.mock.calls[0]?.slice(1)).toEqual(f.query.mock.calls[1]?.slice(1));
  });
});
