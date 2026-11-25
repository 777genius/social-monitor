import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetScanStatusQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
};
