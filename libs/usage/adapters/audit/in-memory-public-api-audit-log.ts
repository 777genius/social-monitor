import type { PublicApiAuditLogPort, PublicApiAuditRecord } from '../../ports';

export class InMemoryPublicApiAuditLog implements PublicApiAuditLogPort {
  private readonly records: PublicApiAuditRecord[] = [];

  async append(record: PublicApiAuditRecord): Promise<void> {
    this.records.push(record);
  }

  async list(params: Parameters<PublicApiAuditLogPort['list']>[0]): Promise<readonly PublicApiAuditRecord[]> {
    return this.records
      .filter((record) => record.tenantId === params.tenantId && record.workspaceId === params.workspaceId)
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
  }
}
