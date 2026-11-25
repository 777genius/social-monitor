import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetSourceBindingHealthQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly sourceBindingId: string;
};
