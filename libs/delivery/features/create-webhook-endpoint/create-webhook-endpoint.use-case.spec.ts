import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { WebhookEndpoint } from '../../domain';
import type { WebhookEndpointRepositoryPort, WebhookEventCatalogPort, WebhookSecretVaultPort } from '../../ports';
import { CreateWebhookEndpointUseCase } from './create-webhook-endpoint.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `id-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeWebhookEndpoints implements WebhookEndpointRepositoryPort {
  async save(): Promise<void> {}

  async findById(): Promise<WebhookEndpoint | null> {
    return null;
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

describe('CreateWebhookEndpointUseCase', () => {
  it('rejects private webhook endpoint URLs as validation failures', async () => {
    const result = await new CreateWebhookEndpointUseCase(
      new FakeWebhookEndpoints(),
      new FakeSecrets(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
      fakeWebhookEventCatalog,
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      url: 'https://127.0.0.1/webhooks/social-monitor',
      eventTypes: ['digest.ready.v1'],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        message: 'Webhook endpoint URL must not target private or local networks.',
      }),
    });
  });

  it('rejects subscriptions to event types outside the webhook catalog', async () => {
    const result = await new CreateWebhookEndpointUseCase(
      new FakeWebhookEndpoints(),
      new FakeSecrets(),
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T00:00:00.000Z')),
      fakeWebhookEventCatalog,
    ).execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      url: 'https://example.com/webhooks/social-monitor',
      eventTypes: ['digest.unknown.v1'],
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'validation.failed',
        details: {
          unsupportedEventTypes: ['digest.unknown.v1'],
        },
      }),
    });
  });
});
