import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListInterestSourceDailyHistoryQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly days: number;
  readonly providerKeys?: readonly string[];
};
