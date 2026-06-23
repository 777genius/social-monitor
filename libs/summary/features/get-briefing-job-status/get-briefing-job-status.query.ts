import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetBriefingJobStatusQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly briefingJobId: string;
};
