import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';

import type {
  ListPublicApiAuditRecordsQuery,
  ListPublicApiAuditRecordsResult,
  PublicApiAuditLogPort,
  PublicApiAuditRecord,
} from '../../../ports';
import type { PrismaUsageClient } from './prisma-usage-client';
import { publicApiAuditRecordFromPrisma } from './prisma-usage-records';

export class PrismaPublicApiAuditLog implements PublicApiAuditLogPort {
  constructor(private readonly prisma: PrismaUsageClient) {}

  async append(record: PublicApiAuditRecord): Promise<void> {
    await withPrismaWriteRetry(() => this.prisma.publicApiAuditEvent.create({
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
    }));
  }

  async list(query: ListPublicApiAuditRecordsQuery): Promise<ListPublicApiAuditRecordsResult> {
    const offset = parseCursor(query.cursor);
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      actorType: query.actorType,
      actorId: query.actorId,
      action: query.action,
      outcome: query.outcome,
      resourceType: query.resourceType,
    };
    const [records, total] = await Promise.all([
      this.prisma.publicApiAuditEvent.findMany({
        where,
        orderBy: [
          { occurredAt: 'desc' },
          { id: 'desc' },
        ],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.publicApiAuditEvent.count({ where }),
    ]);
    const nextOffset = offset + records.length;

    return {
      records: records.map(publicApiAuditRecordFromPrisma),
      nextCursor: nextOffset < total ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
