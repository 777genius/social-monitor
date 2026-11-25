import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ScheduleAutoSummariesCommand = {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly latestFeedItemObservedBefore: Date;
  readonly limit: number;
  readonly correlationId: string;
};
