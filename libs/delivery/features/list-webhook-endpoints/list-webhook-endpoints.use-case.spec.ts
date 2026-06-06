import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { WebhookEndpoint, type WebhookEndpointProps } from '../../domain';
import type { ListWebhookEndpointsQuery, WebhookEndpointRepositoryPort } from '../../ports';
import { ListWebhookEndpointsUseCase } from './list-webhook-endpoints.use-case';

class FakeWebhookEndpoints implements WebhookEndpointRepositoryPort {
  readonly endpoints: WebhookEndpoint[] = [];

  async save(endpoint: WebhookEndpoint): Promise<void> {
    this.endpoints.push(endpoint);
  }

  async findById(): Promise<WebhookEndpoint | null> {
    return null;
  }

  async list(query: ListWebhookEndpointsQuery): Promise<{ readonly endpoints: readonly WebhookEndpoint[] }> {
    return {
      endpoints: this.endpoints.filter((endpoint) => {
        const snapshot = endpoint.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      }),
    };
  }
}

describe('ListWebhookEndpointsUseCase', () => {
  it('lists endpoints without exposing signing secrets', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const endpoints = new FakeWebhookEndpoints();
    const endpoint = webhookEndpoint({
      tenantId: tenant,
      workspaceId: workspace,
      id: 'webhook-1',
    });

    await endpoints.save(endpoint);

    const result = await new ListWebhookEndpointsUseCase(endpoints).execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 50,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        endpoints: [expect.objectContaining({
          id: 'webhook-1',
          tenantId: tenant,
          workspaceId: workspace,
          secretPreview: 'whsec_...1234',
        })],
      },
    });
    expect(result.ok && result.value.endpoints[0]).not.toHaveProperty('signingSecret');
  });

  it('rejects unsafe limits', async () => {
    await expect(new ListWebhookEndpointsUseCase(new FakeWebhookEndpoints()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 0,
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});

const webhookEndpoint = (overrides: Partial<WebhookEndpointProps> = {}): WebhookEndpoint => WebhookEndpoint.create({
  id: 'webhook-1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  url: 'https://example.com/webhooks/social-monitor',
  eventTypes: ['digest.ready.v1'],
  status: 'enabled',
  secretKeyId: 'secret-key-1',
  secretPreview: 'whsec_...1234',
  createdAt: new Date('2026-06-06T00:00:00.000Z'),
  ...overrides,
});
