import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetDeliveryAttemptQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly deliveryAttemptId: string;
};
