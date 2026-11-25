import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type GetWebhookEndpointQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly webhookEndpointId: string;
};
