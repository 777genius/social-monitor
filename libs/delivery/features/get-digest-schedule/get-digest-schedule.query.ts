import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetDigestScheduleQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly digestScheduleId: string;
};
