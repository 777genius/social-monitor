import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ListRealtimeEventsUseCaseQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly channel: string;
  readonly limit: number;
  readonly cursor?: string;
};
