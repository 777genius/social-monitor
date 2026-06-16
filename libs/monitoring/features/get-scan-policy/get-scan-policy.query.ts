import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetScanPolicyQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
};
