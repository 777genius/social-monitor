import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ProjectRelevanceMemoryBatchCommand = {
  readonly limit: number;
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
};
