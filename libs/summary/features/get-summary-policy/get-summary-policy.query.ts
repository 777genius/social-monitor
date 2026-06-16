import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetSummaryPolicyQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
};
