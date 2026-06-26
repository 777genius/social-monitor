import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListTopicSourceDailyHistoryQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly days: number;
};
