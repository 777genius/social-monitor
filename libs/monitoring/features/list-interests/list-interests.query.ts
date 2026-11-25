import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListInterestsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
};
