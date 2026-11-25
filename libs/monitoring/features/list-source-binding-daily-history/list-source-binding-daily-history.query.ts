import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListSourceBindingDailyHistoryQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
  readonly days: number;
};
