import type { PublicApiAuditRecord } from '../../ports';

export type PublicApiAuditEventView = Omit<PublicApiAuditRecord, 'occurredAt'> & {
  readonly occurredAt: string;
};

export const presentPublicApiAuditEvent = (
  record: PublicApiAuditRecord,
): PublicApiAuditEventView => ({
  ...record,
  occurredAt: record.occurredAt.toISOString(),
});
