import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { BindSourceResult } from '../features/bind-source/bind-source.result';
import type { SourceBindingCreationCommit } from './contracts/source-binding-creation-commit';

export const validateSourceBindingCreationCommit = (
  params: SourceBindingCreationCommit,
): DomainError | undefined => {
  const binding = params.binding.toSnapshot();
  const event = params.event;
  if (!params.idempotencyKey.trim() || !params.receiptId.trim() ||
    event.eventType !== 'monitoring.source-binding.enabled' ||
    event.tenantId !== binding.tenantId || event.workspaceId !== binding.workspaceId ||
    event.payload.sourceBindingId !== binding.id ||
    event.payload.tenantId !== binding.tenantId ||
    event.payload.workspaceId !== binding.workspaceId ||
    event.payload.interestId !== binding.interestId ||
    event.payload.providerKey !== binding.providerKey ||
    event.payload.capabilityProfileVersion !== binding.capabilityProfileVersion) {
    return new DomainError('validation.failed', 'Source binding creation scope and event must agree');
  }
  if (params.configIdentity !== undefined) {
    const { field, value } = params.configIdentity;
    if (!field.trim() || !value.trim() || binding.config[field] !== value) {
      return new DomainError('validation.failed', 'Source binding identity must agree with protected config');
    }
  }
  const limit = params.maxEnabledSourcesPerInterest;
  if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) {
    return new DomainError('validation.failed', 'Source binding capacity must be a positive integer');
  }
  return undefined;
};

export const replaySourceBindingReceipt = (value: unknown): Result<BindSourceResult, DomainError> => {
  if (value === null || typeof value !== 'object' ||
    !('sourceBindingId' in value) || typeof value.sourceBindingId !== 'string' ||
    !value.sourceBindingId.trim() ||
    !('created' in value) || typeof value.created !== 'boolean') {
    return err(new DomainError('operation.conflict', 'Source binding creation receipt is invalid'));
  }
  return ok({ sourceBindingId: value.sourceBindingId, created: false });
};

export const decideSourceBindingCreation = (params: {
  readonly candidateId: string;
  readonly existingId?: string;
  readonly enabledCount: number;
  readonly maximum?: number;
}): Result<BindSourceResult, DomainError> => {
  if (params.existingId !== undefined) return ok({ sourceBindingId: params.existingId, created: false });
  if (params.maximum !== undefined && params.enabledCount >= params.maximum) {
    return err(new DomainError('operation.quota_exceeded', 'Interest source binding capacity limit reached', {
      limit: String(params.maximum),
    }));
  }
  return ok({ sourceBindingId: params.candidateId, created: true });
};
