import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScheduleDueDigestsCommand = {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly limit: number;
};
