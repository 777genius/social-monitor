import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { WebhookEndpoint } from '../domain';

export type ListWebhookEndpointsQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly limit: number;
  readonly cursor?: string;
};

export type ListWebhookEndpointsResult = {
  readonly endpoints: readonly WebhookEndpoint[];
  readonly nextCursor?: string;
};

export interface WebhookEndpointRepositoryPort {
  save(endpoint: WebhookEndpoint): Promise<void>;
  findById(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly webhookEndpointId: string;
  }): Promise<WebhookEndpoint | null>;
  list(query: ListWebhookEndpointsQuery): Promise<ListWebhookEndpointsResult>;
}
