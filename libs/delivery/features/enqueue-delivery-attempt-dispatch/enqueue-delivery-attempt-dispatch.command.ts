import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type EnqueueDeliveryAttemptDispatchCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly deliveryAttemptId: string;
  readonly correlationId: string;
  readonly causationId?: string;
};
