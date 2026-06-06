import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetSummaryJobStatusQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly summaryJobId: string;
};
