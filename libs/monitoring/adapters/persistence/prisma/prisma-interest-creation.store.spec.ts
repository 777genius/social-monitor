import { causationId, correlationId, eventId, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { InterestCreationCommit } from '../../../application/contracts/interest-creation-commit';
import { Interest } from '../../../domain';
import { PrismaInterestCreationStore, type PrismaInterestCreationClient, type PrismaInterestCreationTransaction } from './prisma-interest-creation.store';

const scope = { tenantId: tenantId('tenant-creation'), workspaceId: workspaceId('workspace-creation') };
const occurredAt = new Date('2026-10-30T12:00:00Z');
const prepared = (): InterestCreationCommit => ({
  interest: Interest.create({ ...scope, id: 'interest-creation', name: 'Monitoring', query: 'Monitoring query', createdAt: occurredAt }),
  event: { ...scope, eventId: eventId('event-creation'), eventType: 'monitoring.interest.created', schemaVersion: 1,
    occurredAt, correlationId: correlationId('correlation-creation'), causationId: causationId('request-creation'),
    payload: { ...scope, interestId: 'interest-creation', name: 'Monitoring', query: 'Monitoring query' } },
  receiptId: 'receipt-candidate', idempotencyKey: 'request-creation',
});

const fixture = () => {
  const unused = async (): Promise<never> => { throw new Error('Unexpected fixture delegate'); };
  const transaction: PrismaInterestCreationTransaction = {
    interest: {
      create: jest.fn(async ({ data }: Parameters<PrismaInterestCreationTransaction['interest']['create']>[0]) =>
        ({ ...data, status: 'ENABLED' as const, deletedAt: null })),
      count: jest.fn(async () => 0), findFirst: jest.fn(async () => null),
      upsert: unused, updateMany: unused, findMany: unused,
    },
    outboxEvent: { create: jest.fn(async ({ data }: Parameters<PrismaInterestCreationTransaction['outboxEvent']['create']>[0]) => ({ ...data,
      tenantId: data.tenantId ?? null, workspaceId: data.workspaceId ?? null, causationId: data.causationId ?? null,
      status: 'PENDING' as const, createdAt: data.createdAt ?? occurredAt, publishedAt: null,
    })) },
    idempotencyKey: {
      findFirst: unused,
      upsert: jest.fn(async ({ create, update }: Parameters<PrismaInterestCreationTransaction['idempotencyKey']['upsert']>[0]) => ({ ...create,
        id: 'receipt-existing', responsePayload: update.responsePayload ?? null,
        responseStatus: update.responseStatus ?? null, createdAt: occurredAt,
      })),
    },
  };
  let callbackCompleted = false;
  const client: PrismaInterestCreationClient = {
    $transaction: async (work, options) => {
      expect(options).toEqual({ isolationLevel: 'Serializable' });
      const result = await work(transaction);
      callbackCompleted = true;
      return result;
    },
  };
  jest.spyOn(client, '$transaction');
  return { transaction, client, store: new PrismaInterestCreationStore(client), completed: () => callbackCompleted };
};

describe('Prisma atomic interest creation', () => {
  it('reserves first and writes aggregate, event and final receipt inside one transaction', async () => {
    const context = fixture();
    const input = prepared();
    expect(await context.store.commit(input)).toEqual({ ok: true, value: { interestId: 'interest-creation', created: true } });
    const receipt = jest.mocked(context.transaction.idempotencyKey.upsert);
    expect(receipt).toHaveBeenNthCalledWith(1, expect.objectContaining({
      update: { expiresAt: null }, create: expect.objectContaining({ responsePayload: null }),
    }));
    expect(receipt).toHaveBeenNthCalledWith(2, expect.objectContaining({
      create: expect.objectContaining({ id: 'receipt-existing' }),
      update: expect.objectContaining({ responsePayload: { interestId: 'interest-creation', created: true } }),
    }));
    expect(context.transaction.outboxEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ id: input.event.eventId, createdAt: occurredAt, ...scope }),
    }));
    expect(context.client.$transaction).toHaveBeenCalledTimes(1);
  });

  it('aborts the transaction callback on quota rejection instead of returning a committable null reservation', async () => {
    const context = fixture();
    jest.mocked(context.transaction.interest.count).mockResolvedValue(1);
    expect(await context.store.commit({ ...prepared(), maxInterestsPerWorkspace: 1 })).toMatchObject({
      ok: false, error: { code: 'operation.quota_exceeded' },
    });
    expect(context.completed()).toBe(false);
    expect(context.transaction.interest.create).not.toHaveBeenCalled();
    expect(context.transaction.outboxEvent.create).not.toHaveBeenCalled();
    expect(context.transaction.idempotencyKey.upsert).toHaveBeenCalledTimes(1);
  });

  it('bounds resolution of expected scoped uniqueness conflicts and returns a typed conflict', async () => {
    const context = fixture();
    jest.mocked(context.client.$transaction).mockRejectedValue(Object.assign(new Error('Unique name conflict'), {
      code: 'P2002', meta: { target: ['tenant_id', 'workspace_id', 'name'] },
    }));
    expect(await context.store.commit(prepared())).toMatchObject({ ok: false, error: { code: 'operation.conflict' } });
    expect(context.client.$transaction).toHaveBeenCalledTimes(3);
  });

  it('resolves a scoped uniqueness race in a fresh transaction', async () => {
    const context = fixture();
    jest.mocked(context.client.$transaction).mockRejectedValueOnce(Object.assign(new Error('Concurrent name winner'), {
      code: 'P2002', meta: { target: ['tenant_id', 'workspace_id', 'name'] },
    }));
    expect(await context.store.commit(prepared())).toEqual({ ok: true, value: { interestId: 'interest-creation', created: true } });
    expect(context.client.$transaction).toHaveBeenCalledTimes(2);
    expect(context.transaction.outboxEvent.create).toHaveBeenCalledTimes(1);
  });

  it('does not reinterpret an arbitrary identity collision as a scoped name replay', async () => {
    const context = fixture();
    const failure = Object.assign(new Error('Duplicate identity'), { code: 'P2002', meta: { target: ['id'] } });
    jest.mocked(context.client.$transaction).mockRejectedValue(failure);
    expect(await context.store.commit(prepared())).toEqual({ ok: false, error: failure });
    expect(context.client.$transaction).toHaveBeenCalledTimes(1);
  });
});
