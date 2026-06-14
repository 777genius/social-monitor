import type { PublicApiAuditLogPort, PublicApiAuditRecord } from '../../../ports';
import type { PrismaUsageClient } from './prisma-usage-client';
import { publicApiAuditRecordFromPrisma } from './prisma-usage-records';

export class PrismaPublicApiAuditLog implements PublicApiAuditLogPort {
  constructor(private readonly prisma: PrismaUsageClient) {}

  async append(record: PublicApiAuditRecord): Promise<void> {
    await this.prisma.publicApiAuditEvent.create({
      data: {
        id: record.id,
        tenantId: record.tenantId,
        workspaceId: record.workspaceId,
        actorType: record.actorType,
        actorId: record.actorId,
        action: record.action,
        outcome: record.outcome,
        reasonCode: record.reasonCode ?? null,
        resourceType: record.resourceType,
        resourceId: record.resourceId ?? null,
        metadata: record.metadata,
        occurredAt: record.occurredAt,
      },
    });
  }

  async list(params: Parameters<PublicApiAuditLogPort['list']>[0]): Promise<readonly PublicApiAuditRecord[]> {
    const records = await this.prisma.publicApiAuditEvent.findMany({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
      },
      orderBy: { occurredAt: 'desc' },
    });

    return records.map(publicApiAuditRecordFromPrisma);
  }
}
