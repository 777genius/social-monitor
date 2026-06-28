import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetWorkspaceSettingsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
};
