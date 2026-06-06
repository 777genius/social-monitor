import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type QuarantineWebhookEndpointCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly webhookEndpointId: string;
  readonly reason: string;
};
