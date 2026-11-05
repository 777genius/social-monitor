import {
  DomainError, causationId, correlationId, eventId, err, ok, type Result,
} from '@social-monitor/shared-kernel';

import type { SourceBinding, SourceBindingStatus, SourceBindingStatusChangedEvent } from '../domain';
import type { ChangeSourceBindingStatusResult } from '../features/change-source-binding-status/change-source-binding-status.result';
import type { SourceBindingStatusChange } from './contracts/source-binding-status-change-commit';

export const validateSourceBindingStatusChange = (params: SourceBindingStatusChange): DomainError | undefined => {
  const { command } = params;
  if (!command.sourceBindingId.trim() || !command.interestId.trim() ||
      !command.idempotencyKey.trim() || !params.receiptId.trim() || !params.eventId.trim()) {
    return new DomainError('validation.failed', 'Source binding status change requires scoped identities');
  }
  if (command.status !== 'enabled' && command.status !== 'paused') {
    return new DomainError('validation.failed', 'Source binding status is not supported', { status: command.status });
  }
  const maximum = params.maxEnabledSourcesPerInterest;
  if (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 1)) {
    return new DomainError('validation.failed', 'Source binding capacity must be a positive integer');
  }
  return undefined;
};

export const replaySourceBindingStatusReceipt = (
  value: unknown,
): Result<ChangeSourceBindingStatusResult, DomainError> => {
  if (value === null || typeof value !== 'object' ||
      !('sourceBindingId' in value) || typeof value.sourceBindingId !== 'string' ||
      !value.sourceBindingId.trim() ||
      !('status' in value) || (value.status !== 'enabled' && value.status !== 'paused') ||
      !('changed' in value) || typeof value.changed !== 'boolean') {
    return err(new DomainError('operation.conflict', 'Source binding status receipt is invalid'));
  }
  return ok({ sourceBindingId: value.sourceBindingId, status: value.status, changed: false });
};

export const decideSourceBindingStatusChange = (params: {
  readonly binding: SourceBinding;
  readonly desired: SourceBindingStatus;
  readonly enabledCount: number;
  readonly maximum?: number;
}): Result<{ readonly updated: SourceBinding; readonly result: ChangeSourceBindingStatusResult }, DomainError> => {
  const before = params.binding.toSnapshot();
  if (before.status === params.desired) {
    return ok({ updated: params.binding, result: {
      sourceBindingId: before.id, status: before.status, changed: false,
    } });
  }
  if (params.desired === 'enabled' && params.maximum !== undefined &&
      params.enabledCount >= params.maximum) {
    return err(new DomainError('operation.quota_exceeded',
      'Interest source binding capacity limit reached', { limit: String(params.maximum) }));
  }
  const updated = params.desired === 'enabled' ? params.binding.resume() : params.binding.pause();
  return ok({ updated, result: {
    sourceBindingId: before.id, status: params.desired, changed: true,
  } });
};

export const sourceBindingStatusChangedEvent = (
  params: SourceBindingStatusChange,
  before: SourceBinding,
  after: SourceBinding,
): SourceBindingStatusChangedEvent => {
  const previous = before.toSnapshot();
  const current = after.toSnapshot();
  return {
    eventId: eventId(params.eventId),
    eventType: 'monitoring.source-binding.status-changed',
    schemaVersion: 1,
    occurredAt: params.occurredAt,
    tenantId: current.tenantId,
    workspaceId: current.workspaceId,
    correlationId: correlationId(params.command.correlationId),
    causationId: causationId(params.command.idempotencyKey),
    payload: {
      sourceBindingId: current.id,
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      interestId: current.interestId,
      providerKey: current.providerKey,
      previousStatus: previous.status,
      status: current.status,
    },
  };
};
