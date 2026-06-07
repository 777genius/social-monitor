import { type Clock, DomainError, err, type IdGenerator, ok, type Result } from '@social-monitor/shared-kernel';

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
      metadata: redactAuditMetadata(command.metadata ?? {}),
      occurredAt,
    });

    return ok({
      auditEventId,
      occurredAt: occurredAt.toISOString(),
    });
  }
}

const REDACTED = '[REDACTED]';

const secretKeyPattern = /(?:secret|token|password|credential|authorization|api[_-]?key|refresh[_-]?token|access[_-]?token)/i;
const bearerPattern = /^bearer\s+\S+/i;
const generatedSecretPattern = /^(?:smk|whsec)_[A-Za-z0-9_-]+/;
const urlWithPasswordPattern = /^[a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:[^@\s]+@/i;

const normalizeReasonCode = (reasonCode: string | undefined): string | undefined => {
  if (reasonCode === undefined) {
    return undefined;
  }

  const trimmed = reasonCode.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const redactAuditMetadata = (
  metadata: Readonly<Record<string, string | number | boolean | readonly string[] | undefined>>,
): Readonly<Record<string, string | number | boolean | readonly string[] | undefined>> =>
  Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, redactAuditMetadataValue(key, value)]),
  );

const redactAuditMetadataValue = (
  key: string,
  value: string | number | boolean | readonly string[] | undefined,
): string | number | boolean | readonly string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (secretKeyPattern.test(key)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return shouldRedactString(value) ? REDACTED : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => shouldRedactString(item) ? REDACTED : item);
  }

  return value;
};

const shouldRedactString = (value: string): boolean =>
  bearerPattern.test(value) ||
  generatedSecretPattern.test(value) ||
  urlWithPasswordPattern.test(value);
