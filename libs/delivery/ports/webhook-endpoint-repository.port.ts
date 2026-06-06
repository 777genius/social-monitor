import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { WebhookEndpoint } from '../domain';

export interface WebhookEndpointRepositoryPort {
  save(endpoint: WebhookEndpoint): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly webhookEndpointId: string;
  }): Promise<WebhookEndpoint | null>;
}
