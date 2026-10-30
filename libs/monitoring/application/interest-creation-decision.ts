import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { InterestCreationCommit, InterestCreationResult } from './contracts/interest-creation-commit';

export const validateInterestCreationCommit = (params: InterestCreationCommit): DomainError | undefined => {
  const snapshot = params.interest.toSnapshot();
  const event = params.event;
  if (!params.idempotencyKey.trim() || !params.receiptId.trim() ||
      event.tenantId !== snapshot.tenantId || event.workspaceId !== snapshot.workspaceId ||
      event.payload.interestId !== snapshot.id || event.payload.tenantId !== snapshot.tenantId ||
      event.payload.workspaceId !== snapshot.workspaceId || event.payload.name !== snapshot.name ||
      event.payload.query !== snapshot.query || event.eventType !== 'monitoring.interest.created') {
    return new DomainError('validation.failed', 'Interest creation scope and event must agree');
  }
  const maximum = params.maxInterestsPerWorkspace;
  if (maximum !== undefined && (!Number.isSafeInteger(maximum) || maximum < 1)) {
    return new DomainError('validation.failed', 'Interest capacity must be a positive integer');
  }
  return undefined;
};

export const replayInterestCreation = (receipt: unknown): Result<InterestCreationResult, DomainError> => {
  if (typeof receipt !== 'object' || receipt === null || !('interestId' in receipt) ||
      typeof receipt.interestId !== 'string' || !receipt.interestId.trim() ||
      !('created' in receipt) || typeof receipt.created !== 'boolean') {
    return err(new DomainError('operation.conflict', 'Interest creation receipt is invalid'));
  }
  return ok({ interestId: receipt.interestId, created: false });
};

export const decideInterestCreation = (params: {
  readonly candidateId: string;
  readonly existing?: { readonly id: string; readonly archived: boolean };
  readonly activeCount: number;
  readonly maximum?: number;
}): Result<InterestCreationResult, DomainError> => {
  if (params.existing?.archived) {
    return err(new DomainError('operation.conflict', 'Interest name is reserved by an archived interest'));
  }
  if (params.existing) return ok({ interestId: params.existing.id, created: false });
  if (params.maximum !== undefined && params.activeCount >= params.maximum) {
    return err(new DomainError('operation.quota_exceeded', 'Workspace interest capacity limit reached', {
      limit: String(params.maximum),
    }));
  }
  return ok({ interestId: params.candidateId, created: true });
};
