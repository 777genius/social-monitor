import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListSourceBindingsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly limit: number;
  readonly cursor?: string;
};
