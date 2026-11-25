import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListScanDeadLettersQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit?: number;
};
