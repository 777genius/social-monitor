import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { WebhookEndpoint } from '../../domain';
import type {
  WebhookEndpointRepositoryPort,
  WebhookReplayStorePort,
  WebhookSecretVaultPort,
} from '../../ports';
import { CreateWebhookEndpointUseCase } from '../create-webhook-endpoint/create-webhook-endpoint.use-case';
import { SignWebhookPayloadUseCase } from '../sign-webhook-payload/sign-webhook-payload.use-case';
import { VerifyWebhookSignatureUseCase } from './verify-webhook-signature.use-case';

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
  private readonly secretsByKeyId = new Map<string, string>();

  async put(params: { readonly secretKeyId: string; readonly secret: string }): Promise<void> {
    this.secretsByKeyId.set(params.secretKeyId, params.secret);
  }

  async get(params: { readonly secretKeyId: string }): Promise<string | null> {
    return this.secretsByKeyId.get(params.secretKeyId) ?? null;
  }
}

class FakeReplayStore implements WebhookReplayStorePort {
  private readonly deliveries = new Set<string>();

  async rememberDelivery(params: {
    readonly webhookEndpointId: string;
    readonly deliveryId: string;
    readonly now: Date;
    readonly expiresAt: Date;
  }): Promise<boolean> {
    const key = `${params.webhookEndpointId}:${params.deliveryId}`;

    if (this.deliveries.has(key)) {
      return false;
    }

    this.deliveries.add(key);

    return true;
  }
}

describe('VerifyWebhookSignatureUseCase', () => {
  it('verifies first delivery and rejects replayed delivery id', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const endpoints = new FakeWebhookEndpoints();
    const secrets = new FakeSecrets();
    const replayStore = new FakeReplayStore();
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

    const verifier = new VerifyWebhookSignatureUseCase(
      endpoints,
      secrets,
      replayStore,
      new FixedClock(new Date('2026-06-06T01:00:10.000Z')),
    );
    const command = {
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: created.value.endpoint.id,
      deliveryId: signed.value.headers['x-social-monitor-delivery-id'],
      timestamp: signed.value.headers['x-social-monitor-timestamp'],
      rawBody: signed.value.rawBody,
      signatureHeader: signed.value.headers['x-social-monitor-signature'],
      keyId: signed.value.headers['x-social-monitor-key-id'],
      toleranceSeconds: 300,
    };

    await expect(verifier.execute(command)).resolves.toEqual({
      ok: true,
      value: {
        verified: true,
      },
    });
    await expect(verifier.execute(command)).resolves.toEqual({
      ok: true,
      value: {
        verified: false,
        reason: 'replay_detected',
      },
    });
  });

  it('rejects stale timestamps before recording replay state', async () => {
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

    const verifier = new VerifyWebhookSignatureUseCase(
      endpoints,
      secrets,
      new FakeReplayStore(),
      new FixedClock(new Date('2026-06-06T01:00:00.000Z')),
    );

    await expect(verifier.execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId: created.value.endpoint.id,
      deliveryId: 'delivery-1',
      timestamp: '2026-06-06T00:00:00.000Z',
      rawBody: '{}',
      signatureHeader: 'v1=signature',
      keyId: created.value.endpoint.secretKeyId,
      toleranceSeconds: 300,
    })).resolves.toEqual({
      ok: true,
      value: {
        verified: false,
        reason: 'invalid_timestamp',
      },
    });
  });
});
