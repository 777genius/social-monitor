import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { WebhookEndpoint } from '../../domain';
import type { WebhookEndpointRepositoryPort } from '../../ports';
import { DisableWebhookEndpointUseCase } from './disable-webhook-endpoint.use-case';

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

describe('DisableWebhookEndpointUseCase', () => {
  it('soft-disables endpoint and keeps it readable for audit/support', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const endpoints = new FakeWebhookEndpoints();

    await endpoints.save(WebhookEndpoint.create({
      id: 'webhook-1',
      tenantId: tenant,
      workspaceId: workspace,
      url: 'https://example.com/webhooks/social-monitor',
      eventTypes: ['digest.ready.v1'],
      status: 'enabled',
      secretKeyId: 'secret-key-1',
      secretPreview: 'whsec_...1234',
      createdAt: new Date('2026-06-06T00:00:00.000Z'),
    }));

    const result = await new DisableWebhookEndpointUseCase(
      endpoints,
      new FixedClock(new Date('2026-06-06T02:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: 'webhook-1',
    });

    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({
        id: 'webhook-1',
        status: 'disabled',
        disabledAt: '2026-06-06T02:00:00.000Z',
      }),
    });
    await expect(endpoints.findById({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: 'webhook-1',
    })).resolves.toEqual(expect.objectContaining({
      toSnapshot: expect.any(Function),
    }));
  });
});
