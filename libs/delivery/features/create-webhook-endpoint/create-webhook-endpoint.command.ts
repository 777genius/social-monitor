import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type CreateWebhookEndpointCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly url: string;
  readonly eventTypes: readonly string[];
};
