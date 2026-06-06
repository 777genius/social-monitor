import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetDigestQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly digestId: string;
};
