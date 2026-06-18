import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { WebhookEndpoint, type WebhookEndpointProps } from '../../domain';
import type { WebhookEndpointRepositoryPort } from '../../ports';
import { GetWebhookEndpointUseCase } from './get-webhook-endpoint.use-case';

class FakeWebhookEndpoints implements WebhookEndpointRepositoryPort {
  private readonly endpoints = new Map<string, WebhookEndpoint>();

  async save(endpoint: WebhookEndpoint): Promise<void> {
    const snapshot = endpoint.toSnapshot();
    this.endpoints.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, endpoint);
  }

  async findById(params: Parameters<WebhookEndpointRepositoryPort['findById']>[0]): Promise<WebhookEndpoint | null> {
    return this.endpoints.get(`${params.tenantId}:${params.workspaceId}:${params.webhookEndpointId}`) ?? null;
  }

  async list(): Promise<{ readonly endpoints: readonly WebhookEndpoint[] }> {
    return {
      endpoints: [...this.endpoints.values()],
    };
  }
}

describe('GetWebhookEndpointUseCase', () => {
  it('returns webhook endpoint metadata without signing secret material', async () => {
    const endpoints = new FakeWebhookEndpoints();
    await endpoints.save(makeWebhookEndpoint({ id: 'webhook-1' }));

    const result = await new GetWebhookEndpointUseCase(endpoints).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      webhookEndpointId: 'webhook-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'webhook-1',
        secretKeyId: 'secret-key-1',
        secretPreview: 'whsec_...1234',
        createdAt: '2026-06-06T00:00:00.000Z',
      }),
    });
    expect(result.ok && result.value).not.toHaveProperty('signingSecret');
  });

  it('does not return endpoints outside the requested tenant', async () => {
    const endpoints = new FakeWebhookEndpoints();
    await endpoints.save(makeWebhookEndpoint({ id: 'webhook-1', tenantId: tenantId('tenant-2') }));

    await expect(new GetWebhookEndpointUseCase(endpoints).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      webhookEndpointId: 'webhook-1',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'resource.not_found',
      }),
    });
  });

  it('rejects blank webhook endpoint ids before repository lookup', async () => {
    await expect(new GetWebhookEndpointUseCase(new FakeWebhookEndpoints()).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      webhookEndpointId: ' ',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
      }),
    });
  });
});

const makeWebhookEndpoint = (overrides: Partial<WebhookEndpointProps> = {}): WebhookEndpoint => WebhookEndpoint.create({
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
