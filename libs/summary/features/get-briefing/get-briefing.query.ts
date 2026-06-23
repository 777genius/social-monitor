import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetBriefingQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly briefingId: string;
};
