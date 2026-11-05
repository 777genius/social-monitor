import type { PrismaCommandOutboxClient } from './prisma-command-outbox-client';
import { PrismaCommandOutboxStoreAdapter } from './prisma-command-outbox-store.adapter';

const record = {
  id: '00000000-0000-7000-8000-000000000001',
  eventType: 'ingestion.scan.execute',
  schemaVersion: 1,
  payload: {
    tenantId: 'tenant-1',
    workspaceId: 'workspace-1',
    scanJobId: '00000000-0000-7000-8000-000000000001',
  },
  correlationId: 'correlation-1',
  causationId: 'causation-1',
  publishAttempts: 1,
};
const at = new Date('2026-10-31T00:00:00Z');

const fixture = (records: typeof record[] = []) => {
  const findMany = jest.fn().mockResolvedValue(records);
  const updateMany = jest.fn().mockResolvedValue({ count: records.length });
  const scanJobUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
  const executeRaw = jest.fn().mockResolvedValue(1);
  let transactionCount = 0;
  const transaction: PrismaCommandOutboxClient['$transaction'] = async (work, options) => {
    transactionCount += 1;
    expect(options).toEqual({ isolationLevel: 'Serializable' });
    return work({
      $executeRaw: executeRaw,
      outboxEvent: { findMany, updateMany },
      scanJob: { updateMany: scanJobUpdateMany },
    });
  };
  const adapter = new PrismaCommandOutboxStoreAdapter({
    $transaction: transaction,
    $executeRaw: executeRaw,
    outboxEvent: { findMany, updateMany },
    scanJob: { updateMany: scanJobUpdateMany },
  });
  const sqlCall = (index = 0) => {
    const [strings, ...values] = executeRaw.mock.calls[index] as unknown as [TemplateStringsArray, ...unknown[]];
    return { sql: strings.join('?'), values };
  };
  return { adapter, findMany, updateMany, executeRaw, scanJobUpdateMany, sqlCall,
    transactionCount: () => transactionCount };
};

describe('PrismaCommandOutboxStoreAdapter', () => {
  it('claims commands in one Serializable transaction and increments attempts', async () => {
    const f = fixture([record]);
    await expect(f.adapter.claimPending({
      limit: 10, now: at, leaseOwner: 'relay-1',
      leasedUntil: new Date(at.getTime() + 30_000),
    })).resolves.toEqual([{
      id: record.id,
      command: { commandId: record.id, commandType: record.eventType,
        schemaVersion: record.schemaVersion, correlationId: record.correlationId,
        causationId: record.causationId, payload: record.payload },
      publishAttempt: 2,
    }]);
    expect(f.transactionCount()).toBe(1);
    expect(f.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ leaseOwner: 'relay-1', publishAttempts: { increment: 1 } }),
    }));
    expect(f.executeRaw).not.toHaveBeenCalled();
  });

  it('renews only a complete owned batch using the database clock', async () => {
    const f = fixture();
    f.executeRaw.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    const ids = [record.id, '00000000-0000-7000-8000-000000000002'];
    const expires = new Date(at.getTime() + 30_000);
    await expect(f.adapter.renewClaims({
      ids, leaseOwner: 'relay-A', now: at, leasedUntil: expires,
    })).resolves.toBe(true);
    expect(f.sqlCall().sql).toContain('clock_timestamp()');
    expect(f.sqlCall().sql).toContain('ANY(');
    expect(f.sqlCall().values).toEqual([expires, ids, 'relay-A']);
    await expect(f.adapter.renewClaims({
      ids, leaseOwner: 'relay-A', now: at, leasedUntil: expires,
    })).resolves.toBe(false);
    await expect(f.adapter.renewClaims({
      ids: [ids[0]!, ids[0]!], leaseOwner: 'relay-A', now: at, leasedUntil: expires,
    })).rejects.toThrow('Invalid');
    expect(f.executeRaw).toHaveBeenCalledTimes(2);
  });

  it('uses PostgreSQL time to prevent an expired owner from acknowledging publication', async () => {
    const f = fixture();
    await f.adapter.markPublished({ id: record.id, leaseOwner: 'relay-A', publishedAt: at });
    expect(f.sqlCall().sql).toContain('clock_timestamp()');
    expect(f.sqlCall().sql).toContain('"message_kind" = \'COMMAND\'');
    expect(f.sqlCall().values).toEqual([at, record.id, 'relay-A']);
    f.executeRaw.mockResolvedValueOnce(0);
    await expect(f.adapter.markPublished({
      id: record.id, leaseOwner: 'stale-relay', publishedAt: at,
    })).rejects.toThrow('lease ownership was lost');
  });

  it('atomically terminal-fails the linked enqueued scan job with a DB-time fence', async () => {
    const f = fixture();
    await f.adapter.markFailed({
      id: record.id, leaseOwner: 'relay-A', commandType: 'ingestion.scan.execute',
      availableAt: at, failedAt: at, lastError: 'broker unavailable', terminal: true,
    });
    expect(f.transactionCount()).toBe(1);
    expect(f.sqlCall().sql).toContain('clock_timestamp()');
    expect(f.sqlCall().sql).toContain('UPDATE public."outbox_events"');
    expect(f.sqlCall().values).toEqual([true, at, 'broker unavailable', record.id, 'relay-A']);
    expect(f.scanJobUpdateMany).toHaveBeenCalledWith({
      where: { id: record.id, status: 'ENQUEUED' },
      data: { status: 'FAILED', completedAt: at,
        failureReason: 'Scan command publication exhausted retries: broker unavailable' },
    });
  });

  it('does not fail a scan job on retryable broker errors', async () => {
    const f = fixture();
    await f.adapter.markFailed({
      id: record.id, leaseOwner: 'relay-A', commandType: 'ingestion.scan.execute',
      availableAt: at, failedAt: at, lastError: 'broker unavailable', terminal: false,
    });
    expect(f.sqlCall().values[0]).toBe(false);
    expect(f.scanJobUpdateMany).not.toHaveBeenCalled();
  });

  it('never settles a scan job when database-time lease fencing loses ownership', async () => {
    const f = fixture();
    f.executeRaw.mockResolvedValue(0);
    await expect(f.adapter.markFailed({
      id: record.id, leaseOwner: 'stale', commandType: 'ingestion.scan.execute',
      availableAt: at, failedAt: at, lastError: 'stale', terminal: true,
    })).rejects.toThrow('lease ownership was lost');
    expect(f.scanJobUpdateMany).not.toHaveBeenCalled();
  });
});
