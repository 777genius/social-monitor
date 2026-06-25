import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListSourceBindingOverviewQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly limit: number;
  readonly cursor?: string;
};
