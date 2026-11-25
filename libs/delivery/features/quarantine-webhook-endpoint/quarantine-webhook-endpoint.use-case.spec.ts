import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { WebhookEndpoint } from '../../domain';
import type { WebhookEndpointRepositoryPort, WebhookEventCatalogPort, WebhookSecretVaultPort } from '../../ports';
import { CreateWebhookEndpointUseCase } from '../create-webhook-endpoint/create-webhook-endpoint.use-case';
import { QuarantineWebhookEndpointUseCase } from './quarantine-webhook-endpoint.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeWebhookEndpoints implements WebhookEndpointRepositoryPort {
  private readonly endpointsById = new Map<string, WebhookEndpoint>();

  async save(endpoint: WebhookEndpoint): Promise<void> {
    const snapshot = endpoint.toSnapshot();

    this.endpointsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, endpoint);
  }

  async findById(params: Parameters<WebhookEndpointRepositoryPort['findById']>[0]): Promise<WebhookEndpoint | null> {
    return this.endpointsById.get(`${params.tenantId}:${params.workspaceId}:${params.webhookEndpointId}`) ?? null;
  }

  async list(): Promise<{ readonly endpoints: readonly WebhookEndpoint[] }> {
    return {
      endpoints: [],
    };
  }
}

class FakeSecrets implements WebhookSecretVaultPort {
  async put(): Promise<void> {}

  async get(): Promise<string | null> {
    return null;
  }
}

const fakeWebhookEventCatalog: WebhookEventCatalogPort = {
  payloadVersion: 1,
  isSupported: (eventType) => eventType === 'digest.ready.v1',
};

describe('QuarantineWebhookEndpointUseCase', () => {
  it('marks endpoint quarantined with support-visible reason', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const endpoints = new FakeWebhookEndpoints();
    const created = await new CreateWebhookEndpointUseCase(
      endpoints,
      new FakeSecrets(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
      fakeWebhookEventCatalog,
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      url: 'https://example.com/webhooks/social-monitor',
      eventTypes: ['digest.ready.v1'],
    });

    if (!created.ok) {
      throw created.error;
    }

    const result = await new QuarantineWebhookEndpointUseCase(
      endpoints,
      new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: created.value.endpoint.id,
      reason: 'Repeated terminal webhook failures',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: created.value.endpoint.id,
        status: 'quarantined',
        quarantinedAt: '2026-06-06T01:00:00.000Z',
        quarantineReason: 'Repeated terminal webhook failures',
      }),
    });
  });
});
