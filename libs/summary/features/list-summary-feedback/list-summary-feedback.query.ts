import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListSummaryFeedbackQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryId: string;
  readonly limit: number;
  readonly cursor?: string;
};
