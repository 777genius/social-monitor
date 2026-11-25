import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type UpdateWorkspaceDigestPreferenceCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly frequency: string;
};
