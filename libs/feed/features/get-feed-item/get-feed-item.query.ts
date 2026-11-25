import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetFeedItemQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly feedItemId: string;
};
