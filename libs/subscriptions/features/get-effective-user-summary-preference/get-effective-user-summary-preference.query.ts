import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetEffectiveUserSummaryPreferenceQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly interestId: string;
  readonly subscriptionId?: string;
};
