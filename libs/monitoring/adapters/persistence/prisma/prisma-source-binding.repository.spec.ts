import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { PrismaMonitoringClient } from './prisma-monitoring-client';
import type { PrismaSourceBindingRecord } from './prisma-monitoring-records';
import { PrismaSourceBindingRepository } from './prisma-source-binding.repository';

const scope = { tenantId: tenantId('tenant-1'), workspaceId: workspaceId('workspace-1'), interestId: 'interest-1' };
const query = { ...scope, providerKey: 'synthetic-stream' };
const record = (id: string, stream: string, overrides: Partial<PrismaSourceBindingRecord> = {}): PrismaSourceBindingRecord => ({
  ...scope, id, sourceCatalogEntryId: 'catalog-1', capabilityProfileVersion: 1, status: 'ENABLED',
  config: { stream }, createdAt: new Date('2026-10-18T00:00:00.000Z'), ...overrides,
});

describe('PrismaSourceBindingRepository config identity', () => {
  it('selects one source within full scope using top-level JSON string equality', async () => {
    const records = [
      record('wrong-tenant', 'second', { tenantId: 'tenant-2' }),
      record('wrong-workspace', 'second', { workspaceId: 'workspace-2' }),
      record('wrong-interest', 'second', { interestId: 'interest-2' }),
      record('wrong-provider', 'second', { sourceCatalogEntryId: 'catalog-2' }),
      record('first-binding', 'first'),
      record('second-binding', 'second'),
    ];
    const findFirst = jest.fn(async ({ where }: Parameters<PrismaMonitoringClient['sourceBinding']['findFirst']>[0]) => {
      return records.find((candidate) => candidate.tenantId === where.tenantId &&
        candidate.workspaceId === where.workspaceId && candidate.interestId === where.interestId &&
        candidate.sourceCatalogEntryId === where.sourceCatalogEntryId &&
        (where.config === undefined ||
          (candidate.config as Readonly<Record<string, unknown>>)[where.config.path[0] ?? ''] === where.config.equals)) ?? null;
    });
    const repository = new PrismaSourceBindingRepository({
      sourceCatalogEntry: { findUnique: async () => ({ id: 'catalog-1', providerKey: 'synthetic-stream' }) },
      sourceBinding: { findFirst },
    } as unknown as PrismaMonitoringClient);

    const selected = await repository.findByInterestAndProvider({
      ...query, configIdentity: { field: 'stream', value: 'second' },
    });
    expect(selected?.toSnapshot()).toMatchObject({ ...scope, id: 'second-binding', config: { stream: 'second' } });
    expect(findFirst).toHaveBeenLastCalledWith({ where: {
      ...scope, sourceCatalogEntryId: 'catalog-1', deletedAt: null,
      config: { path: ['stream'], equals: 'second' },
    } });

    await expect(repository.findByInterestAndProvider({
      ...query, configIdentity: { field: 'stream', value: 'missing' },
    })).resolves.toBeNull();
    const withoutIdentity = await repository.findByInterestAndProvider(query);
    expect(withoutIdentity?.toSnapshot().id).toBe('first-binding');
    expect(findFirst).toHaveBeenLastCalledWith({ where: {
      ...scope, sourceCatalogEntryId: 'catalog-1', deletedAt: null,
    } });
  });
});
