import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanJob, type ScanJobStatus } from '../../domain';
import type { ScanJobHistoryReadPort } from '../../ports';
import { InMemoryScanJobRepository } from './in-memory-scan-job.repository';
import { PrismaScanJobRepository } from './prisma/prisma-scan-job.repository';
import type { PrismaMonitoringClient } from './prisma/prisma-monitoring-client';
import {
  scanJobStatusToPrisma,
  type PrismaScanJobRecord,
} from './prisma/prisma-monitoring-records';

const scope = {
  tenantId: tenantId('tenant-pagination'),
  workspaceId: workspaceId('workspace-pagination'),
  sourceBindingId: 'binding-pagination',
};

const job = (id: string, overrides: Partial<typeof scope> = {}) => ScanJob.request({
  ...scope, ...overrides, id, scanPolicyId: 'policy-pagination', idempotencyKey: id,
  requestedAt: new Date('2026-10-30T12:00:00.000Z'),
});

const fixtures = () => [
  ...Array.from({ length: 5 }, (_, index) => job(`scan-${index + 1}`)),
  job('scan-other-tenant', { tenantId: tenantId('other-tenant') }),
  job('scan-other-workspace', { workspaceId: workspaceId('other-workspace') }),
  job('scan-other-binding', { sourceBindingId: 'other-binding' }),
  job('scan-completed').markEnqueued({ enqueuedAt: new Date('2026-10-30T12:00:01Z') })
    .markSucceeded({ completedAt: new Date('2026-10-30T12:00:02Z') }),
];

const prismaRecord = (entity: ScanJob): PrismaScanJobRecord => {
  const snapshot = entity.toSnapshot();
  return {
    ...snapshot, status: scanJobStatusToPrisma(snapshot.status),
    enqueuedAt: snapshot.enqueuedAt ?? null, completedAt: snapshot.completedAt ?? null,
    failureReason: snapshot.failureReason ?? null,
    failureMetadata: snapshot.failureMetadata ?? null,
    executionMetadata: snapshot.executionMetadata ?? null,
  };
};

const factories: Record<string, () => Promise<ScanJobHistoryReadPort>> = {
  'in-memory': async () => {
    const repository = new InMemoryScanJobRepository();
    for (const entity of fixtures()) await repository.save(entity);
    return repository;
  },
  prisma: async () => {
    const records = fixtures().map(prismaRecord);
    const client: Pick<PrismaMonitoringClient, 'scanJob'> = {
      scanJob: {
        upsert: async () => { throw new Error('Read-only contract fixture'); },
        findFirst: async () => null,
        findMany: async (query) => {
          const statuses = (query.where as { status?: { in: readonly string[] } }).status?.in;
          const scoped = records.filter((record) =>
            record.tenantId === query.where.tenantId &&
            record.workspaceId === query.where.workspaceId &&
            record.sourceBindingId === query.where.sourceBindingId &&
            (statuses === undefined || statuses.includes(record.status)),
          ).sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime() ||
            right.id.localeCompare(left.id));
          const start = query.cursor === undefined ? 0 :
            scoped.findIndex((record) => record.id === query.cursor?.id) + (query.skip ?? 0);
          return scoped.slice(start, start + query.take);
        },
      },
    };
    return new PrismaScanJobRepository(client);
  },
};

describe.each(Object.entries(factories))('%s scan history pagination contract', (_, create) => {
  it.each([1, 2, 5, 6])('visits every scoped row once with page size %i', async (limit) => {
    const repository = await create();
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await repository.listBySourceBinding({ ...scope, limit, cursor });
      ids.push(...page.scanJobs.map((entity) => entity.toSnapshot().id));
      cursor = page.nextCursor;
      expect(ids.length).toBeLessThanOrEqual(6);
    } while (cursor !== undefined);
    expect(ids).toEqual(['scan-completed', 'scan-5', 'scan-4', 'scan-3', 'scan-2', 'scan-1']);
  });

  it('paginates the filtered collection with the same boundary semantics', async () => {
    const repository = await create();
    const statuses: readonly ScanJobStatus[] = ['requested'];
    const first = await repository.listBySourceBinding({ ...scope, limit: 2, statuses });
    const second = await repository.listBySourceBinding({ ...scope, limit: 2, statuses, cursor: first.nextCursor });
    const third = await repository.listBySourceBinding({ ...scope, limit: 2, statuses, cursor: second.nextCursor });
    expect([...first.scanJobs, ...second.scanJobs, ...third.scanJobs]
      .map((entity) => entity.toSnapshot().id)).toEqual(['scan-5', 'scan-4', 'scan-3', 'scan-2', 'scan-1']);
    expect(third.nextCursor).toBeUndefined();
  });
});
