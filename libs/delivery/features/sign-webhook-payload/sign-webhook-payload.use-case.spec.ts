import { createHmac } from 'node:crypto';

import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { WebhookEndpoint } from '../../domain';
import type { WebhookEndpointRepositoryPort, WebhookSecretVaultPort } from '../../ports';
import { CreateWebhookEndpointUseCase } from '../create-webhook-endpoint/create-webhook-endpoint.use-case';
import { SignWebhookPayloadUseCase } from './sign-webhook-payload.use-case';

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
}

class FakeSecrets implements WebhookSecretVaultPort {
  private readonly secretsByKeyId = new Map<string, string>();

  async put(params: { readonly secretKeyId: string; readonly secret: string }): Promise<void> {
    this.secretsByKeyId.set(params.secretKeyId, params.secret);
  }

  async get(params: { readonly secretKeyId: string }): Promise<string | null> {
    return this.secretsByKeyId.get(params.secretKeyId) ?? null;
  }
}

describe('SignWebhookPayloadUseCase', () => {
  it('signs timestamp, delivery id and raw body with endpoint secret', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const endpoints = new FakeWebhookEndpoints();
    const secrets = new FakeSecrets();
    const created = await new CreateWebhookEndpointUseCase(
      endpoints,
      secrets,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
    ).execute({
      tenantId: tenant,
      workspaceId: workspace,
      url: 'https://example.com/webhooks/social-monitor',
      eventTypes: ['digest.ready.v1'],
    });

    if (!created.ok) {
      throw created.error;
    }

    const signed = await new SignWebhookPayloadUseCase(endpoints, secrets).execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: created.value.endpoint.id,
      deliveryId: 'delivery-1',
      eventType: 'digest.ready.v1',
      occurredAt: new Date('2026-06-06T01:00:00.000Z'),
      resourceType: 'digest',
      resourceId: 'digest-1',
      idempotencyKey: 'digest:tenant-1:workspace-1:user-1:window-1:hash-1',
      correlationId: 'correlation-1',
      resourceLinks: {
        digest: '/delivery/digests/digest-1',
      },
      summary: {
        status: 'ready',
      },
    });

    if (!signed.ok) {
      throw signed.error;
    }

    const expectedSignature = createHmac('sha256', created.value.signingSecret)
      .update(`2026-06-06T01:00:00.000Z.delivery-1.${signed.value.rawBody}`)
      .digest('hex');

    expect(signed.value.headers).toEqual({
      'x-social-monitor-signature': `v1=${expectedSignature}`,
      'x-social-monitor-timestamp': '2026-06-06T01:00:00.000Z',
      'x-social-monitor-delivery-id': 'delivery-1',
      'x-social-monitor-key-id': created.value.endpoint.secretKeyId,
    });
    expect(JSON.parse(signed.value.rawBody)).toEqual({
      payloadVersion: 1,
      deliveryId: 'delivery-1',
      eventType: 'digest.ready.v1',
      occurredAt: '2026-06-06T01:00:00.000Z',
      tenantId: tenant,
      workspaceId: workspace,
      resourceType: 'digest',
      resourceId: 'digest-1',
      idempotencyKey: 'digest:tenant-1:workspace-1:user-1:window-1:hash-1',
      correlationId: 'correlation-1',
      resourceLinks: {
        digest: '/delivery/digests/digest-1',
      },
      summary: {
        status: 'ready',
      },
    });
  });
});
