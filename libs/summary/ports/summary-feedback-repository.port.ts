import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryFeedback } from '../domain';

export type FindSummaryFeedbackByIdempotencyKeyQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: string;
};

export interface SummaryFeedbackRepositoryPort {
  save(feedback: SummaryFeedback): Promise<void>;
  findByIdempotencyKey(query: FindSummaryFeedbackByIdempotencyKeyQuery): Promise<SummaryFeedback | null>;
}
