import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryFeedback } from '../domain';

export type FindSummaryFeedbackByIdempotencyKeyQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: string;
};

export type ListSummaryFeedbackQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryId: string;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListSummaryFeedbackResult = {
  readonly items: readonly SummaryFeedback[];
  readonly nextCursor?: string;
};

export interface SummaryFeedbackRepositoryPort {
  save(feedback: SummaryFeedback): Promise<void>;
  findByIdempotencyKey(query: FindSummaryFeedbackByIdempotencyKeyQuery): Promise<SummaryFeedback | null>;
  list(query: ListSummaryFeedbackQuery): Promise<ListSummaryFeedbackResult>;
}
