import {
  type Clock,
  DomainError,
  err,
  type IdGenerator,
  ok,
  redactSensitiveMetadataRecord,
  type Result,
} from '@social-monitor/shared-kernel';

import type { PublicApiAuditLogPort } from '../../ports';
import type { RecordPublicApiAuditEventCommand } from './record-public-api-audit-event.command';
import type { RecordPublicApiAuditEventResult } from './record-public-api-audit-event.result';

type RecordPublicApiAuditEventFailure = DomainError;

export class RecordPublicApiAuditEventUseCase {
  constructor(
    private readonly auditLog: PublicApiAuditLogPort,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: RecordPublicApiAuditEventCommand,
  ): Promise<Result<RecordPublicApiAuditEventResult, RecordPublicApiAuditEventFailure>> {
    if (
      command.actorId.trim().length === 0 ||
      command.action.trim().length === 0 ||
      command.resourceType.trim().length === 0
    ) {
      return err(new DomainError('validation.failed', 'Audit actor, action and resource type must be non-empty'));
    }

    const occurredAt = this.clock.now();
    const auditEventId = this.idGenerator.generate();

    await this.auditLog.append({
      id: auditEventId,
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      actorType: command.actorType,
      actorId: command.actorId,
      action: command.action,
      outcome: command.outcome,
      reasonCode: normalizeReasonCode(command.reasonCode),
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      metadata: redactSensitiveMetadataRecord(command.metadata ?? {}),
      occurredAt,
    });

    return ok({
      auditEventId,
      occurredAt: occurredAt.toISOString(),
    });
  }
}

const normalizeReasonCode = (reasonCode: string | undefined): string | undefined => {
  if (reasonCode === undefined) {
    return undefined;
  }

  const trimmed = reasonCode.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};
