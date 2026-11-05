import type { DomainError, Result } from '@social-monitor/shared-kernel';

import type { Interest, InterestCreatedEvent } from '../../domain';

export const INTEREST_CREATION_SCOPE = 'monitoring.create-interest';

export type InterestCreationResult = {
  readonly interestId: string;
  readonly created: boolean;
};

export type InterestCreationCommit = {
  readonly interest: Interest;
  readonly event: InterestCreatedEvent;
  readonly idempotencyKey: string;
  readonly receiptId: string;
  readonly maxInterestsPerWorkspace?: number;
};

/** Commit the aggregate, its creation event and the immutable scoped receipt together. */
export interface InterestCreationCommitPort {
  commit(params: InterestCreationCommit): Promise<Result<InterestCreationResult, DomainError | Error>>;
}
