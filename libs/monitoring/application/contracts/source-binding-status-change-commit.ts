import type { DomainError, Result } from '@social-monitor/shared-kernel';

import type { ChangeSourceBindingStatusCommand } from '../../features/change-source-binding-status/change-source-binding-status.command';
import type { ChangeSourceBindingStatusResult } from '../../features/change-source-binding-status/change-source-binding-status.result';

export const SOURCE_BINDING_STATUS_CHANGE_SCOPE = 'monitoring.change-source-binding-status';

export type SourceBindingStatusChange = {
  readonly command: ChangeSourceBindingStatusCommand;
  readonly receiptId: string;
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly maxEnabledSourcesPerInterest?: number;
};

export interface SourceBindingStatusChangeCommitPort {
  /** One scoped commit for status, optional event and immutable receipt. */
  change(params: SourceBindingStatusChange): Promise<Result<ChangeSourceBindingStatusResult, DomainError | Error>>;
}
