import type { PublicApiAuditEventView } from '../shared/public-api-audit-presenter';

export type ListPublicApiAuditEventsResult = {
  readonly auditEvents: readonly PublicApiAuditEventView[];
  readonly nextCursor?: string;
};
