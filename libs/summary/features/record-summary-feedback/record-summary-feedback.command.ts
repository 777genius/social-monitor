import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryFeedbackCategory } from '../../domain';

export type RecordSummaryFeedbackCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryId: string;
  readonly idempotencyKey: string;
  readonly submittedBy: string;
  readonly rating: number;
  readonly category: SummaryFeedbackCategory | string;
  readonly comment?: string;
  readonly citationId?: string;
  readonly correlationId: string;
};
