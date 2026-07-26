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

describe('PrismaCommandOutboxStoreAdapter', () => {
  it('claims commands in a Serializable transaction and increments attempts', async () => {
    const findMany = jest.fn().mockResolvedValue([record]);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const scanJobUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    let transactionCount = 0;
    const transaction: PrismaCommandOutboxClient['$transaction'] = async (
      work,
      options,
    ) => {
      transactionCount += 1;
      expect(options).toEqual({ isolationLevel: 'Serializable' });
      return work({
        outboxEvent: { findMany, updateMany },
        scanJob: { updateMany: scanJobUpdateMany },
      });
    };
    const adapter = new PrismaCommandOutboxStoreAdapter({
      $transaction: transaction,
      outboxEvent: { findMany, updateMany },
      scanJob: { updateMany: scanJobUpdateMany },
    });
    const now = new Date('2026-07-23T12:00:00.000Z');

    await expect(
      adapter.claimPending({
        limit: 10,
        now,
        leaseOwner: 'relay-1',
        leasedUntil: new Date('2026-07-23T12:00:30.000Z'),
      }),
    ).resolves.toEqual([
      {
        id: record.id,
        command: {
          commandId: record.id,
          commandType: record.eventType,
          schemaVersion: 1,
          correlationId: record.correlationId,
          causationId: record.causationId,
          payload: record.payload,
        },
        publishAttempt: 2,
      },
    ]);

    expect(transactionCount).toBe(1);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leaseOwner: 'relay-1',
          publishAttempts: { increment: 1 },
        }),
      }),
    );
  });

  it('rejects a stale worker that no longer owns the lease', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const updateMany = jest.fn().mockResolvedValue({ count: 0 });
    const scanJobUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const adapter = new PrismaCommandOutboxStoreAdapter({
      $transaction: async (work) =>
        work({
          outboxEvent: { findMany, updateMany },
          scanJob: { updateMany: scanJobUpdateMany },
        }),
      outboxEvent: { findMany, updateMany },
      scanJob: { updateMany: scanJobUpdateMany },
    });

    await expect(
      adapter.markPublished({
        id: record.id,
        leaseOwner: 'stale-relay',
        publishedAt: new Date('2026-07-23T12:01:00.000Z'),
      }),
    ).rejects.toThrow('lease ownership was lost');
  });

  it('atomically terminal-fails the linked enqueued scan job', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const outboxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const scanJobUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    let transactionCount = 0;
    const adapter = new PrismaCommandOutboxStoreAdapter({
      $transaction: async (work, options) => {
        transactionCount += 1;
        expect(options).toEqual({ isolationLevel: 'Serializable' });
        return work({
          outboxEvent: {
            findMany,
            updateMany: outboxUpdateMany,
          },
          scanJob: { updateMany: scanJobUpdateMany },
        });
      },
      outboxEvent: { findMany, updateMany: outboxUpdateMany },
      scanJob: { updateMany: scanJobUpdateMany },
    });
    const failedAt = new Date('2026-07-23T12:05:00.000Z');

    await adapter.markFailed({
      id: record.id,
      leaseOwner: 'relay-1',
      commandType: 'ingestion.scan.execute',
      availableAt: failedAt,
      failedAt,
      lastError: 'broker unavailable',
      terminal: true,
    });

    expect(transactionCount).toBe(1);
    expect(outboxUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: record.id,
          leaseOwner: 'relay-1',
        }),
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    );
    expect(scanJobUpdateMany).toHaveBeenCalledWith({
      where: {
        id: record.id,
        status: 'ENQUEUED',
      },
      data: {
        status: 'FAILED',
        completedAt: failedAt,
        failureReason:
          'Scan command publication exhausted retries: broker unavailable',
      },
    });
  });

  it('does not terminal-fail a scan job while command publication can retry', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const outboxUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const scanJobUpdateMany = jest.fn().mockResolvedValue({ count: 0 });
    const adapter = new PrismaCommandOutboxStoreAdapter({
      $transaction: async (work) =>
        work({
          outboxEvent: {
            findMany,
            updateMany: outboxUpdateMany,
          },
          scanJob: { updateMany: scanJobUpdateMany },
        }),
      outboxEvent: { findMany, updateMany: outboxUpdateMany },
      scanJob: { updateMany: scanJobUpdateMany },
    });
    const failedAt = new Date('2026-07-23T12:05:00.000Z');

    await adapter.markFailed({
      id: record.id,
      leaseOwner: 'relay-1',
      commandType: 'ingestion.scan.execute',
      availableAt: failedAt,
      failedAt,
      lastError: 'broker unavailable',
      terminal: false,
    });

    expect(scanJobUpdateMany).not.toHaveBeenCalled();
    expect(outboxUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }),
      }),
    );
  });
});
