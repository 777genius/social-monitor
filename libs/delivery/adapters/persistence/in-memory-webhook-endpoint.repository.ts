import type { WebhookEndpoint } from '../../domain';
import type { WebhookEndpointRepositoryPort } from '../../ports';

export class InMemoryWebhookEndpointRepository implements WebhookEndpointRepositoryPort {
  private readonly endpointsById = new Map<string, WebhookEndpoint>();

  async save(endpoint: WebhookEndpoint): Promise<void> {
    const snapshot = endpoint.toSnapshot();

    this.endpointsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, endpoint);
  }

  async findById(params: Parameters<WebhookEndpointRepositoryPort['findById']>[0]): Promise<WebhookEndpoint | null> {
    return this.endpointsById.get(`${params.tenantId}:${params.workspaceId}:${params.webhookEndpointId}`) ?? null;
  }
}
