import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type UpdateInterestCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly name: string;
  readonly query: string;
};
