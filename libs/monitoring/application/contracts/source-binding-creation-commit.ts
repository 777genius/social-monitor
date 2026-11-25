import type { DomainError, Result } from '@social-monitor/shared-kernel';

import type { SourceBinding, SourceBindingEnabledEvent } from '../../domain';
import type { SourceBindingConfigIdentity } from '../../ports/source-binding-repository.port';
import type { BindSourceResult } from '../../features/bind-source/bind-source.result';

export const BIND_SOURCE_CREATION_SCOPE = 'monitoring.bind-source';

export type SourceBindingCreationCommit = {
  readonly binding: SourceBinding;
  readonly event: SourceBindingEnabledEvent;
  readonly configIdentity?: SourceBindingConfigIdentity;
  readonly idempotencyKey: string;
  readonly receiptId: string;
  readonly maxEnabledSourcesPerInterest?: number;
};

export interface SourceBindingCreationCommitPort {
  /** Atomically publish binding, event and immutable scoped receipt, or none. */
  commit(params: SourceBindingCreationCommit): Promise<Result<BindSourceResult, DomainError | Error>>;
}
