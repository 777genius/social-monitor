import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetSummaryQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryId: string;
};
