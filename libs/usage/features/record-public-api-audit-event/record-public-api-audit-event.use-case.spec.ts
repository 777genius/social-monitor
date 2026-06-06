import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { PublicApiAuditLogPort, PublicApiAuditRecord } from '../../ports';
import { RecordPublicApiAuditEventUseCase } from './record-public-api-audit-event.use-case';

class FixedIdGenerator implements IdGenerator {
  generate(): string {
    return 'audit-event-1';
  }
}

class FakeAuditLog implements PublicApiAuditLogPort {
  readonly records: PublicApiAuditRecord[] = [];

  async append(record: PublicApiAuditRecord): Promise<void> {
    this.records.push(record);
  }

  async list(): Promise<readonly PublicApiAuditRecord[]> {
    return this.records;
  }
}

describe('RecordPublicApiAuditEventUseCase', () => {
  it('records support-safe public API audit event metadata', async () => {
    const auditLog = new FakeAuditLog();
    const result = await new RecordPublicApiAuditEventUseCase(
      auditLog,
      new FixedIdGenerator(),
      new FixedClock(new Date('2026-06-06T13:00:00.000Z')),
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      actorType: 'api_key',
      actorId: 'api-key-1',
      action: 'webhook_endpoint.created',
      resourceType: 'webhook_endpoint',
      resourceId: 'webhook-1',
      metadata: {
        endpointStatus: 'enabled',
        eventTypes: ['digest.ready.v1'],
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        auditEventId: 'audit-event-1',
        occurredAt: '2026-06-06T13:00:00.000Z',
      },
    });
    expect(auditLog.records).toEqual([expect.objectContaining({
      id: 'audit-event-1',
      actorId: 'api-key-1',
      action: 'webhook_endpoint.created',
      metadata: {
        endpointStatus: 'enabled',
        eventTypes: ['digest.ready.v1'],
      },
    })]);
    expect(JSON.stringify(auditLog.records)).not.toContain('secret');
  });
});
