import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ArchiveInterestCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
};
