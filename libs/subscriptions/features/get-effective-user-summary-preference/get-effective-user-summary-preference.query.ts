import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetEffectiveUserSummaryPreferenceQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly topicId: string;
  readonly subscriptionId?: string;
};
