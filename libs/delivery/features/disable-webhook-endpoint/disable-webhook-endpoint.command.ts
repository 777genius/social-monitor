import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type DisableWebhookEndpointCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly webhookEndpointId: string;
};
