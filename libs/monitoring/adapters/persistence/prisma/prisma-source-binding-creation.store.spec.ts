import { causationId, correlationId, eventId, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { SourceBindingCreationCommit } from '../../../application/contracts/source-binding-creation-commit';
import { SourceBinding } from '../../../domain';
import {
  PrismaSourceBindingCreationStore,
  type PrismaSourceBindingCreationClient,
  type SourceBindingCreationTx,
} from './prisma-source-binding-creation.store';

const scope = { tenantId: tenantId('tenant-test'), workspaceId: workspaceId('workspace-test') };
const at = new Date('2026-10-31T00:00:00Z');
const prepared = (id = 'source-binding-1', key = 'bind-1'): SourceBindingCreationCommit => ({
  binding: SourceBinding.create({
    ...scope, id, interestId: 'interest-1', providerKey: 'telegram',
    capabilityProfileVersion: 1, config: { channel: 'first_channel' }, createdAt: at,
  }),
  event: {
    ...scope, eventId: eventId('source-binding-event-1'), eventType: 'monitoring.source-binding.enabled',
    schemaVersion: 1, occurredAt: at,
    correlationId: correlationId('source-binding-correlation'), causationId: causationId(key),
    payload: { ...scope, sourceBindingId: id, interestId: 'interest-1',
      providerKey: 'telegram', capabilityProfileVersion: 1 },
  },
  idempotencyKey: key, receiptId: 'receipt-1',
  configIdentity: { field: 'channel', value: 'first_channel' },
});

const fixture = () => {
  const unused = async (): Promise<never> => { throw new Error('Unexpected Prisma delegate'); };
  const createBinding = jest.fn(async ({ data }: Parameters<SourceBindingCreationTx['sourceBinding']['create']>[0]) =>
    ({ ...data, createdAt: at }));
  const catalog = jest.fn(async () => ({ id: 'catalog-telegram', providerKey: 'telegram' }));
  const outbox = jest.fn(async ({ data }: Parameters<SourceBindingCreationTx['outboxEvent']['create']>[0]) => ({
    ...data, createdAt: data.createdAt ?? at, status: 'PENDING' as const, publishedAt: null,
    tenantId: data.tenantId ?? null, workspaceId: data.workspaceId ?? null, causationId: data.causationId ?? null,
  }));
  const tx: SourceBindingCreationTx = {
    interest: {
      findFirst: jest.fn(async () => ({
        ...scope, id: 'interest-1', name: 'Monitoring', query: 'Monitoring query', createdAt: at,
        status: 'ENABLED' as const, deletedAt: null,
      })),
      create: unused, count: unused, upsert: unused, updateMany: unused, findMany: unused,
    },
    sourceCatalogEntry: { findUnique: catalog },
    sourceBinding: {
      create: createBinding, findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0), upsert: unused, findMany: unused,
    },
    outboxEvent: { create: outbox },
    idempotencyKey: {
      findFirst: unused,
      upsert: jest.fn(async ({ create, update }: Parameters<SourceBindingCreationTx['idempotencyKey']['upsert']>[0]) => ({
        ...create, id: 'persisted-receipt', createdAt: at,
        responsePayload: update.responsePayload ?? null,
        responseStatus: update.responseStatus ?? null,
      })),
    },
  };
  let finished = false;
  const client: PrismaSourceBindingCreationClient = {
    $transaction: async (work, options) => {
      expect(options).toEqual({ isolationLevel: 'Serializable' });
      const result = await work(tx);
      finished = true;
      return result;
    },
  };
  jest.spyOn(client, '$transaction');
  return { tx, client, createBinding, catalog, outbox,
    store: new PrismaSourceBindingCreationStore(client), finished: () => finished };
};

describe('Prisma source-binding creation transaction', () => {
  it('commits aggregate, enabled event and immutable scoped receipt together', async () => {
    const f = fixture();
    const input = prepared();
    expect(await f.store.commit(input)).toEqual({ ok: true,
      value: { sourceBindingId: 'source-binding-1', created: true } });
    expect(f.tx.sourceBinding.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'source-binding-1', ...scope, sourceCatalogEntryId: 'catalog-telegram',
        config: { channel: 'first_channel' }, status: 'ENABLED',
      }),
    });
    expect(f.tx.sourceBinding.findFirst).toHaveBeenCalledWith({ where: {
      ...scope, interestId: 'interest-1', sourceCatalogEntryId: 'catalog-telegram',
      deletedAt: null, config: { path: ['channel'], equals: 'first_channel' },
    } });
    expect(f.outbox).toHaveBeenCalledWith({ data: expect.objectContaining({
      id: input.event.eventId, eventType: 'monitoring.source-binding.enabled', ...scope, createdAt: at,
    }) });
    const receipt = jest.mocked(f.tx.idempotencyKey.upsert);
    expect(receipt).toHaveBeenNthCalledWith(1, expect.objectContaining({
      update: { expiresAt: null }, create: expect.objectContaining({ responsePayload: null }),
    }));
    expect(receipt).toHaveBeenNthCalledWith(2, expect.objectContaining({
      update: expect.objectContaining({
        responsePayload: { sourceBindingId: 'source-binding-1', created: true },
      }),
    }));
    expect(f.finished()).toBe(true);
  });

  it('replays the stored first-key receipt without changing the binding or event', async () => {
    const f = fixture();
    jest.mocked(f.tx.idempotencyKey.upsert).mockResolvedValue({
      id: 'receipt-1', ...scope, key: 'bind-1', scope: 'monitoring.bind-source',
      responsePayload: { sourceBindingId: 'original-binding', created: true },
      responseStatus: 200, requestHash: null, expiresAt: null, createdAt: at,
    });
    expect(await f.store.commit(prepared('new-id'))).toEqual({
      ok: true, value: { sourceBindingId: 'original-binding', created: false },
    });
    expect(f.createBinding).not.toHaveBeenCalled();
    expect(f.outbox).not.toHaveBeenCalled();
  });

  it('reuses canonical matching source bindings with a new receipt, before checking quota', async () => {
    const f = fixture();
    jest.mocked(f.tx.sourceBinding.findFirst).mockResolvedValue({
      id: 'existing-binding', ...scope, interestId: 'interest-1', sourceCatalogEntryId: 'catalog-telegram',
      capabilityProfileVersion: 1, status: 'ENABLED',
      config: { channel: 'first_channel' }, createdAt: at,
    });
    expect(await f.store.commit({ ...prepared(), maxEnabledSourcesPerInterest: 1 })).toEqual({
      ok: true, value: { sourceBindingId: 'existing-binding', created: false },
    });
    expect(f.tx.sourceBinding.count).not.toHaveBeenCalled();
    expect(f.createBinding).not.toHaveBeenCalled();
    expect(f.outbox).not.toHaveBeenCalled();
  });

  it('counts every active binding rather than the first hundred and rolls back a rejected receipt', async () => {
    const f = fixture();
    jest.mocked(f.tx.sourceBinding.count).mockResolvedValue(150);
    expect(await f.store.commit({ ...prepared(), maxEnabledSourcesPerInterest: 100 })).toMatchObject({
      ok: false, error: { code: 'operation.quota_exceeded' },
    });
    expect(f.tx.sourceBinding.count).toHaveBeenCalledWith({
      where: { ...scope, interestId: 'interest-1', deletedAt: null, status: 'ENABLED' },
    });
    expect(f.finished()).toBe(false);
    expect(f.createBinding).not.toHaveBeenCalled();
    expect(f.outbox).not.toHaveBeenCalled();
  });

  it('rejects missing interest and missing canonical catalog without any writes', async () => {
    const missingInterest = fixture();
    jest.mocked(missingInterest.tx.interest.findFirst).mockResolvedValue(null);
    expect(await missingInterest.store.commit(prepared())).toMatchObject({
      ok: false, error: { code: 'resource.not_found' },
    });
    expect(missingInterest.finished()).toBe(false);
    const missingCatalog = fixture();
    jest.mocked(missingCatalog.tx.sourceCatalogEntry.findUnique).mockResolvedValue(null);
    expect(await missingCatalog.store.commit(prepared())).toMatchObject({
      ok: false, error: { code: 'validation.failed' },
    });
    expect(missingCatalog.finished()).toBe(false);
    expect(missingCatalog.outbox).not.toHaveBeenCalled();
  });

  it('does not acknowledge success when outbox insert fails after binding insert', async () => {
    const f = fixture();
    f.outbox.mockRejectedValue(new Error('Disk unavailable'));
    expect(await f.store.commit(prepared())).toMatchObject({
      ok: false, error: { message: 'Disk unavailable' },
    });
    expect(f.createBinding).toHaveBeenCalledTimes(1);
    expect(f.finished()).toBe(false);
  });

  it('retries only scoped receipt uniqueness conflicts, not arbitrary identity collisions', async () => {
    const f = fixture();
    jest.mocked(f.client.$transaction).mockRejectedValueOnce(Object.assign(new Error('Receipt race'), {
      code: 'P2002', meta: { target: ['tenant_id', 'workspace_id', 'scope', 'key'] },
    }));
    expect((await f.store.commit(prepared())).ok).toBe(true);
    expect(f.client.$transaction).toHaveBeenCalledTimes(2);
    const collision = fixture();
    const failure = Object.assign(new Error('Event id collision'), {
      code: 'P2002', meta: { target: ['id'] },
    });
    jest.mocked(collision.client.$transaction).mockRejectedValue(failure);
    expect(await collision.store.commit(prepared())).toEqual({ ok: false, error: failure });
    expect(collision.client.$transaction).toHaveBeenCalledTimes(1);
  });
});
