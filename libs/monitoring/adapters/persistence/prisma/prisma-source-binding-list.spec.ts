import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import type { PrismaSourceBindingRecord, PrismaSourceCatalogEntryRecord } from './prisma-monitoring-records';
import { PrismaSourceBindingRepository } from './prisma-source-binding.repository';

const scope = { tenantId: tenantId('tenant-fixture'), workspaceId: workspaceId('workspace-fixture'), interestId: 'interest-fixture' };
type Binding = PrismaSourceBindingRecord & { deletedAt: Date | null };
const catalogs: readonly PrismaSourceCatalogEntryRecord[] = [
  { id: 'catalog-0', providerKey: 'synthetic-zero' },
  { id: 'catalog-1', providerKey: 'synthetic-one' },
  { id: 'catalog-2', providerKey: 'synthetic-two' },
];
const row = (index: number, overrides: Partial<Binding> = {}): Binding => ({
  ...scope, id: `binding-${String(index).padStart(4, '0')}`, sourceCatalogEntryId: `catalog-${index % 3}`,
  capabilityProfileVersion: 1, config: { synthetic: true }, status: index % 2 === 0 ? 'ENABLED' : 'PAUSED',
  createdAt: new Date('2026-11-27T00:00:00.000Z'), deletedAt: null, ...overrides,
});

function fixture(records: readonly Binding[], entries = catalogs) {
  const catalogRead = jest.fn(async ({ where }: Parameters<PrismaMonitoringClient['sourceCatalogEntry']['findMany']>[0]) =>
    [...entries].filter(entry => 'id' in where
      ? where.id.in.includes(entry.id) : where.providerKey.in.includes(entry.providerKey)).reverse());
  const singleRead = jest.fn(async () => { throw new Error('Listing must not perform per-row catalog reads'); });
  const bindingRead = jest.fn(async ({ where, skip, take }: Parameters<PrismaMonitoringClient['sourceBinding']['findMany']>[0]) =>
    records.filter(record => record.tenantId === where.tenantId && record.workspaceId === where.workspaceId &&
      record.interestId === where.interestId && record.deletedAt === where.deletedAt &&
      (where.sourceCatalogEntryId === undefined || where.sourceCatalogEntryId.in.includes(record.sourceCatalogEntryId)) &&
      (where.status === undefined || where.status.in.some(status => status === record.status)))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id))
      .slice(skip, skip + take));
  const client = {
    sourceCatalogEntry: { findUnique: singleRead, findMany: catalogRead },
    sourceBinding: { findMany: bindingRead },
  } as unknown as PrismaMonitoringClient;
  return { repository: new PrismaSourceBindingRepository(client), catalogRead, singleRead, bindingRead };
}

describe('PrismaSourceBindingRepository bounded catalog reads', () => {
  it('uses two round trips for a 100-row page and preserves scope, order and continuation', async () => {
    const valid = Array.from({ length: 102 }, (_, index) => row(index));
    const f = fixture([
      ...valid,
      row(900, { tenantId: 'foreign-tenant' }),
      row(901, { workspaceId: 'foreign-workspace' }),
      row(902, { interestId: 'foreign-interest' }),
      row(903, { deletedAt: new Date('2026-11-26T00:00:00.000Z') }),
    ]);
    const first = await f.repository.listByInterest({ ...scope, limit: 100 });
    expect(first.sourceBindings).toHaveLength(100);
    expect(first.sourceBindings.map(binding => binding.toSnapshot().id))
      .toEqual([...valid].reverse().slice(0, 100).map(binding => binding.id));
    for (const binding of first.sourceBindings) {
      const value = binding.toSnapshot();
      expect(value).toMatchObject(scope);
      const index = Number(value.id.split('-')[1]);
      expect(value.providerKey).toBe(catalogs[index % 3]?.providerKey);
      expect(value.status).toBe(index % 2 === 0 ? 'enabled' : 'paused');
    }
    expect(f.bindingRead).toHaveBeenCalledTimes(1);
    expect(f.catalogRead).toHaveBeenCalledTimes(1);
    expect(f.singleRead).not.toHaveBeenCalled();
    expect(f.catalogRead).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining(['catalog-0', 'catalog-1', 'catalog-2']) } },
      select: { id: true, providerKey: true },
    });
    const requested = f.catalogRead.mock.calls[0]?.[0].where;
    expect(requested && 'id' in requested ? requested.id.in.length : 0).toBe(3);
    expect(f.bindingRead).toHaveBeenCalledWith({
      where: { ...scope, deletedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: 0, take: 101,
    });
    expect(first.nextCursor).toBeDefined();
    const second = await f.repository.listByInterest({ ...scope, limit: 100, cursor: first.nextCursor });
    expect(second.sourceBindings.map(binding => binding.toSnapshot().id)).toEqual(['binding-0001', 'binding-0000']);
    expect(second.nextCursor).toBeUndefined();
    expect(f.bindingRead).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 100, take: 101 }));
    expect(f.catalogRead).toHaveBeenCalledTimes(2);
  });

  it('reuses a distinct provider-filter batch while retaining status and tenant predicates', async () => {
    const f = fixture(Array.from({ length: 20 }, (_, index) => row(index)));
    const result = await f.repository.listByInterest({
      ...scope, limit: 100, providerKeys: ['synthetic-one', 'missing', 'synthetic-one'], statuses: ['paused'],
    });
    expect(result.sourceBindings.map(binding => binding.toSnapshot().id))
      .toEqual(['binding-0019', 'binding-0013', 'binding-0007', 'binding-0001']);
    expect(f.catalogRead).toHaveBeenCalledTimes(1);
    expect(f.catalogRead).toHaveBeenCalledWith({
      where: { providerKey: { in: ['synthetic-one', 'missing'] } },
      select: { id: true, providerKey: true },
    });
    expect(f.bindingRead).toHaveBeenCalledWith(expect.objectContaining({ where: {
      ...scope, deletedAt: null, sourceCatalogEntryId: { in: ['catalog-1'] }, status: { in: ['PAUSED'] },
    } }));
    expect(f.singleRead).not.toHaveBeenCalled();
  });

  it('preserves an explicitly empty provider filter instead of broadening it to all providers', async () => {
    const f = fixture([row(1)]);
    const result = await f.repository.listByInterest({ ...scope, limit: 10, providerKeys: [] });
    expect(result).toEqual({ sourceBindings: [], nextCursor: undefined });
    expect(f.bindingRead).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...scope, deletedAt: null, sourceCatalogEntryId: { in: [] } },
    }));
    expect(f.catalogRead).toHaveBeenCalledTimes(1);
  });

  it('does not load the catalog for an empty unfiltered page', async () => {
    const f = fixture([]);
    expect(await f.repository.listByInterest({ ...scope, limit: 10 }))
      .toEqual({ sourceBindings: [], nextCursor: undefined });
    expect(f.bindingRead).toHaveBeenCalledTimes(1);
    expect(f.catalogRead).not.toHaveBeenCalled();
  });

  it('preserves the missing-reference error and does not hydrate the pagination lookahead', async () => {
    const f = fixture([row(2), row(1, { sourceCatalogEntryId: 'missing-catalog' })]);
    const first = await f.repository.listByInterest({ ...scope, limit: 1 });
    expect(first.sourceBindings.map(binding => binding.toSnapshot().id)).toEqual(['binding-0002']);
    expect(f.catalogRead).toHaveBeenCalledWith({
      where: { id: { in: ['catalog-2'] } }, select: { id: true, providerKey: true },
    });
    await expect(f.repository.listByInterest({ ...scope, limit: 1, cursor: first.nextCursor }))
      .rejects.toMatchObject({
        code: 'validation.failed',
        message: 'Source catalog entry is missing for persisted source binding',
        details: { sourceBindingId: 'binding-0001', sourceCatalogEntryId: 'missing-catalog' },
      });
  });

  it('retains the repository page cap when the caller asks for more than one hundred rows', async () => {
    const f = fixture(Array.from({ length: 120 }, (_, index) => row(index)));
    const result = await f.repository.listByInterest({ ...scope, limit: 10_000 });
    expect(result.sourceBindings).toHaveLength(100);
    expect(f.bindingRead).toHaveBeenCalledWith(expect.objectContaining({ take: 101 }));
    expect(f.catalogRead).toHaveBeenCalledTimes(1);
  });
});
