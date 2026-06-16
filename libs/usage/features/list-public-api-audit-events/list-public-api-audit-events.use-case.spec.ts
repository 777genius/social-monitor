import { tenantId, type TenantId, workspaceId, type WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  ListPublicApiAuditRecordsQuery,
  ListPublicApiAuditRecordsResult,
  PublicApiAuditLogPort,
  PublicApiAuditRecord,
} from '../../ports';
import { ListPublicApiAuditEventsUseCase } from './list-public-api-audit-events.use-case';

class FakePublicApiAuditLog implements PublicApiAuditLogPort {
  private readonly records: PublicApiAuditRecord[] = [];

  async append(record: PublicApiAuditRecord): Promise<void> {
    this.records.push(record);
  }

  async list(query: ListPublicApiAuditRecordsQuery): Promise<ListPublicApiAuditRecordsResult> {
    const offset = decodeCursor(query.cursor);
    const allRecords = this.records
      .filter((record) => (
        record.tenantId === query.tenantId &&
        record.workspaceId === query.workspaceId &&
        (query.actorType === undefined || record.actorType === query.actorType) &&
        (query.actorId === undefined || record.actorId === query.actorId) &&
        (query.action === undefined || record.action === query.action) &&
        (query.outcome === undefined || record.outcome === query.outcome) &&
        (query.resourceType === undefined || record.resourceType === query.resourceType)
      ))
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
    const records = allRecords.slice(offset, offset + query.limit);
    const nextOffset = offset + records.length;

    return {
      records,
      nextCursor: nextOffset < allRecords.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

describe('ListPublicApiAuditEventsUseCase', () => {
  it('lists audit events in tenant/workspace scope with filters and cursor pagination', async () => {
    const tenant = tenantId('tenant-audit-list');
    const workspace = workspaceId('workspace-audit-list');
    const auditLog = new FakePublicApiAuditLog();
    await auditLog.append(makeAuditRecord({
      id: 'audit-older',
      tenantId: tenant,
      workspaceId: workspace,
      actorId: 'api-key-1',
      action: 'feed.list',
      occurredAt: new Date('2026-06-07T10:00:00.000Z'),
    }));
    await auditLog.append(makeAuditRecord({
      id: 'audit-newer',
      tenantId: tenant,
      workspaceId: workspace,
      actorId: 'api-key-1',
      action: 'feed.list',
      occurredAt: new Date('2026-06-07T11:00:00.000Z'),
    }));
    await auditLog.append(makeAuditRecord({
      id: 'audit-other-action',
      tenantId: tenant,
      workspaceId: workspace,
      actorId: 'api-key-1',
      action: 'summaries.read',
      occurredAt: new Date('2026-06-07T12:00:00.000Z'),
    }));
    await auditLog.append(makeAuditRecord({
      id: 'audit-other-tenant',
      tenantId: tenantId('tenant-audit-other'),
      workspaceId: workspace,
      actorId: 'api-key-1',
      action: 'feed.list',
      occurredAt: new Date('2026-06-07T13:00:00.000Z'),
    }));
    const useCase = new ListPublicApiAuditEventsUseCase(auditLog);

    const firstPage = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      actorId: 'api-key-1',
      action: 'feed.list',
      limit: 1,
    });

    expect(firstPage).toEqual({
      ok: true,
      value: {
        auditEvents: [
          expect.objectContaining({
            id: 'audit-newer',
            actorId: 'api-key-1',
            action: 'feed.list',
            occurredAt: '2026-06-07T11:00:00.000Z',
          }),
        ],
        nextCursor: expect.any(String),
      },
    });

    const secondPage = await useCase.execute({
      tenantId: tenant,
      workspaceId: workspace,
      actorType: 'api_key',
      actorId: 'api-key-1',
      action: 'feed.list',
      limit: 1,
      cursor: firstPage.ok ? firstPage.value.nextCursor : undefined,
    });

    expect(secondPage).toEqual({
      ok: true,
      value: {
        auditEvents: [
          expect.objectContaining({
            id: 'audit-older',
            occurredAt: '2026-06-07T10:00:00.000Z',
          }),
        ],
        nextCursor: undefined,
      },
    });
  });

  it('rejects invalid limits and blank string filters', async () => {
    const useCase = new ListPublicApiAuditEventsUseCase(new FakePublicApiAuditLog());

    await expect(useCase.execute({
      tenantId: tenantId('tenant-audit-validation'),
      workspaceId: workspaceId('workspace-audit-validation'),
      limit: 101,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'validation.failed' }),
    });

    await expect(useCase.execute({
      tenantId: tenantId('tenant-audit-validation'),
      workspaceId: workspaceId('workspace-audit-validation'),
      action: '   ',
      limit: 10,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'validation.failed' }),
    });
  });
});

const makeAuditRecord = (params: {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly actorId: string;
  readonly action: string;
  readonly occurredAt: Date;
}): PublicApiAuditRecord => ({
  id: params.id,
  tenantId: params.tenantId,
  workspaceId: params.workspaceId,
  actorType: 'api_key',
  actorId: params.actorId,
  action: params.action,
  outcome: 'succeeded',
  resourceType: 'feed',
  resourceId: 'feed-page',
  metadata: {
    source: 'test',
  },
  occurredAt: params.occurredAt,
});

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const decodeCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset: number };

  return parsed.offset;
};
