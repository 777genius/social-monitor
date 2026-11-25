import type {
  ListPublicApiAuditRecordsQuery,
  ListPublicApiAuditRecordsResult,
  PublicApiAuditLogPort,
  PublicApiAuditRecord,
} from '../../ports';

export class InMemoryPublicApiAuditLog implements PublicApiAuditLogPort {
  private readonly records: PublicApiAuditRecord[] = [];

  async append(record: PublicApiAuditRecord): Promise<void> {
    this.records.push(record);
  }

  async list(query: ListPublicApiAuditRecordsQuery): Promise<ListPublicApiAuditRecordsResult> {
    const offset = parseCursor(query.cursor);
    const allRecords = this.records
      .filter((record) => matchesAuditQuery(record, query))
      .sort(compareAuditRecords);
    const records = allRecords.slice(offset, offset + query.limit);
    const nextOffset = offset + records.length;

    return {
      records,
      nextCursor: nextOffset < allRecords.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const matchesAuditQuery = (
  record: PublicApiAuditRecord,
  query: ListPublicApiAuditRecordsQuery,
): boolean =>
  record.tenantId === query.tenantId &&
  record.workspaceId === query.workspaceId &&
  (query.actorType === undefined || record.actorType === query.actorType) &&
  (query.actorId === undefined || record.actorId === query.actorId) &&
  (query.action === undefined || record.action === query.action) &&
  (query.outcome === undefined || record.outcome === query.outcome) &&
  (query.resourceType === undefined || record.resourceType === query.resourceType);

const compareAuditRecords = (left: PublicApiAuditRecord, right: PublicApiAuditRecord): number => {
  const occurredAtDiff = right.occurredAt.getTime() - left.occurredAt.getTime();

  if (occurredAtDiff !== 0) {
    return occurredAtDiff;
  }

  return right.id.localeCompare(left.id);
};

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
