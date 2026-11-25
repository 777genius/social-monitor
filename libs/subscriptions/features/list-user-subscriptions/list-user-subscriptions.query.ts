import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListUserSubscriptionsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly limit: number;
  readonly cursor?: string;
};
