import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import { PrismaScanDispatchAdapter } from './prisma-scan-dispatch.adapter';
import { ScanJob } from '../../../domain';
import {
  causationId,
  correlationId,
  eventId,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

type Client = Pick<
  PrismaMonitoringClient,
  '$transaction' | 'scanJob' | 'outboxEvent'
>;

const tenant = tenantId('00000000-0000-7000-8000-000000000010');
const workspace = workspaceId('00000000-0000-7000-8000-000000000011');
const scanJobId = '00000000-0000-7000-8000-000000000012';
const requestedAt = new Date('2026-07-23T12:00:00.000Z');

const enqueuedJob = ScanJob.request({
  id: scanJobId,
  tenantId: tenant,
  workspaceId: workspace,
  sourceBindingId: '00000000-0000-7000-8000-000000000013',
  scanPolicyId: '00000000-0000-7000-8000-000000000014',
  idempotencyKey: 'request-1',
  requestedAt,
}).markEnqueued({ enqueuedAt: requestedAt });

const command = {
  tenantId: tenant,
  workspaceId: workspace,
  scanJobId,
  interestId: '00000000-0000-7000-8000-000000000015',
  sourceBindingId: '00000000-0000-7000-8000-000000000013',
  scanPolicyId: '00000000-0000-7000-8000-000000000014',
  providerKey: 'reddit',
  sourceQuery: { mode: 'search' as const, query: 'reliable systems' },
  retryBudget: 3,
  correlationId: 'correlation-1',
  causationId: 'request-1',
};

const event = {
  eventId: eventId('00000000-0000-7000-8000-000000000016'),
  eventType: 'monitoring.scan.requested',
  schemaVersion: 1,
  occurredAt: requestedAt,
  tenantId: tenant,
  workspaceId: workspace,
  correlationId: correlationId('correlation-1'),
  causationId: causationId('request-1'),
  payload: { scanJobId },
};

const client = () => {
  const scanJobUpsert = jest.fn().mockResolvedValue({});
  const outboxCreate = jest.fn().mockResolvedValue({});
  let transactionCount = 0;
  let rejectNextConflict = false;
  const transaction: Client['$transaction'] = async (work, options) => {
    transactionCount += 1;
    expect(options).toEqual({ isolationLevel: 'Serializable' });
    if (rejectNextConflict) {
      rejectNextConflict = false;
      throw { code: 'P2034' };
    }
    return work({
      scanJob: {
        upsert: scanJobUpsert,
      } as unknown as Client['scanJob'],
      outboxEvent: { create: outboxCreate },
    });
  };
  const value: Client = {
    $transaction: transaction,
    scanJob: {
      upsert: scanJobUpsert,
    } as unknown as Client['scanJob'],
    outboxEvent: { create: outboxCreate },
  };

  return {
    value,
    scanJobUpsert,
    outboxCreate,
    get transactionCount() {
      return transactionCount;
    },
    rejectNextConflict() {
      rejectNextConflict = true;
    },
  };
};

describe('PrismaScanDispatchAdapter', () => {
  it('stores the enqueued job, domain event and command intent atomically', async () => {
    const prisma = client();
    const adapter = new PrismaScanDispatchAdapter(prisma.value);

    await adapter.storeEnqueuedScan({ job: enqueuedJob, command, event });

    expect(prisma.transactionCount).toBe(1);
    expect(prisma.scanJobUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ status: 'ENQUEUED' }),
        create: expect.objectContaining({
          id: scanJobId,
          status: 'ENQUEUED',
        }),
      }),
    );
    expect(prisma.outboxCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          messageKind: 'EVENT',
          eventType: 'monitoring.scan.requested',
        }),
      }),
    );
    expect(prisma.outboxCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          id: scanJobId,
          messageKind: 'COMMAND',
          eventType: 'ingestion.scan.execute',
        }),
      }),
    );
  });

  it('retries the entire Serializable transaction after P2034', async () => {
    const prisma = client();
    prisma.rejectNextConflict();
    const adapter = new PrismaScanDispatchAdapter(prisma.value);

    await adapter.storeEnqueuedScan({ job: enqueuedJob, command });

    expect(prisma.transactionCount).toBe(2);
  });
});
