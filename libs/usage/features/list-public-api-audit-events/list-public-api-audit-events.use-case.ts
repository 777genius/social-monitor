import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { PublicApiAuditLogPort } from '../../ports';
import { presentPublicApiAuditEvent } from '../shared/public-api-audit-presenter';
import type { ListPublicApiAuditEventsQuery } from './list-public-api-audit-events.query';
import type { ListPublicApiAuditEventsResult } from './list-public-api-audit-events.result';

type ListPublicApiAuditEventsFailure = DomainError;

const MAX_LIMIT = 100;

export class ListPublicApiAuditEventsUseCase {
  constructor(private readonly auditLog: PublicApiAuditLogPort) {}

  async execute(
    query: ListPublicApiAuditEventsQuery,
  ): Promise<Result<ListPublicApiAuditEventsResult, ListPublicApiAuditEventsFailure>> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_LIMIT) {
      return err(new DomainError('validation.failed', 'Public API audit event page limit must be between 1 and 100', {
        limit: query.limit,
      }));
    }

    const normalizedActorId = normalizeOptionalFilter(query.actorId, 'Audit actor filter must be non-empty');
    if (!normalizedActorId.ok) {
      return err(normalizedActorId.error);
    }

    const normalizedAction = normalizeOptionalFilter(query.action, 'Audit action filter must be non-empty');
    if (!normalizedAction.ok) {
      return err(normalizedAction.error);
    }

    const normalizedResourceType = normalizeOptionalFilter(
      query.resourceType,
      'Audit resource type filter must be non-empty',
    );
    if (!normalizedResourceType.ok) {
      return err(normalizedResourceType.error);
    }

    const result = await this.auditLog.list({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      actorType: query.actorType,
      actorId: normalizedActorId.value,
      action: normalizedAction.value,
      outcome: query.outcome,
      resourceType: normalizedResourceType.value,
      limit: query.limit,
      cursor: query.cursor,
    });

    return ok({
      auditEvents: result.records.map(presentPublicApiAuditEvent),
      nextCursor: result.nextCursor,
    });
  }
}

const normalizeOptionalFilter = (
  value: string | undefined,
  errorMessage: string,
): Result<string | undefined, DomainError> => {
  if (value === undefined) {
    return ok(undefined);
  }

  const trimmed = value.trim();

  return trimmed.length === 0
    ? err(new DomainError('validation.failed', errorMessage))
    : ok(trimmed);
};
