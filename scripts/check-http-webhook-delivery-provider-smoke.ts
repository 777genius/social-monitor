import { WebhookEndpoint } from '@social-monitor/delivery/domain';
import {
  HttpWebhookDeliveryProvider,
  type WebhookHttpClientPort,
  type WebhookHttpRequest,
  type WebhookHttpResponse,
} from '@social-monitor/delivery/adapters/notification/http-webhook-delivery.provider';
import { InMemoryWebhookEndpointRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-webhook-endpoint.repository';
import { InMemoryWebhookSecretVault } from '@social-monitor/delivery/adapters/secrets/in-memory-webhook-secret.vault';
import { SignWebhookPayloadUseCase } from '@social-monitor/delivery/features/sign-webhook-payload/sign-webhook-payload.use-case';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

class FakeWebhookHttpClient implements WebhookHttpClientPort {
  readonly requests: WebhookHttpRequest[] = [];

  constructor(private readonly response: WebhookHttpResponse) {}

  async post(request: WebhookHttpRequest): Promise<WebhookHttpResponse> {
    this.requests.push(request);

    return this.response;
  }
}

async function main(): Promise<void> {
  const tenant = tenantId('tenant-http-webhook-provider-smoke');
  const workspace = workspaceId('workspace-http-webhook-provider-smoke');
  const endpointId = 'webhook-endpoint-http-provider-smoke';
  const endpoints = new InMemoryWebhookEndpointRepository();
  const secrets = new InMemoryWebhookSecretVault();
  const http = new FakeWebhookHttpClient({ status: 202, providerMessageId: 'provider-message-http-smoke' });
  const clock = new FixedClock(new Date('2026-06-16T04:20:00.000Z'));

  await secrets.put({ secretKeyId: 'whsec_key_', secret: 'whsec_secret' });
  await endpoints.save(WebhookEndpoint.create({
    id: endpointId,
    tenantId: tenant,
    workspaceId: workspace,
    url: 'https://example.com/social-monitor/webhook',
    eventTypes: ['digest.ready.v1'],
    status: 'enabled',
    secretKeyId: 'whsec_key_',
    secretPreview: 'e_secret',
    createdAt: new Date('2026-06-16T04:19:00.000Z'),
  }));

  const provider = new HttpWebhookDeliveryProvider(
    endpoints,
    new SignWebhookPayloadUseCase(endpoints, secrets),
    http,
    clock,
    {
      timeoutMs: 5_000,
      maxPayloadBytes: 64_000,
      userAgent: 'social-monitor-delivery-smoke/0.1',
    },
  );

  const result = await provider.send({
    attempt: {
      id: 'delivery-attempt-http-provider-smoke',
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'delivery-attempt-http-provider-smoke:digest-1',
      channel: 'webhook',
      recipientKey: endpointId,
      resourceType: 'digest',
      resourceId: 'digest-http-provider-smoke',
      state: 'sending',
      queuedAt: new Date('2026-06-16T04:18:00.000Z'),
      sendingAt: new Date('2026-06-16T04:20:00.000Z'),
      retryCount: 0,
      maxRetries: 2,
    },
    content: {
      subject: 'Daily digest ready',
      body: 'Digest body for the HTTP webhook provider smoke.',
    },
  });

  assert(result.accepted, 'HTTP webhook provider must accept 2xx responses');
  assert(
    result.accepted && result.providerMessageId === 'provider-message-http-smoke',
    'HTTP webhook provider must surface provider message id',
  );
  assert(http.requests.length === 1, 'HTTP webhook provider must issue exactly one request');

  const request = http.requests[0];
  assert(request !== undefined, 'HTTP webhook request must be recorded');
  assert(request.url === 'https://example.com/social-monitor/webhook', 'HTTP webhook provider must post to endpoint URL');
  assert(request.timeoutMs === 5_000, 'HTTP webhook provider must pass timeout');
  assert(request.headers['content-type'] === 'application/json', 'HTTP webhook request must use JSON content type');
  assert(
    request.headers['user-agent'] === 'social-monitor-delivery-smoke/0.1',
    'HTTP webhook provider must pass configured user agent',
  );
  assert(
    request.headers['x-social-monitor-signature']?.startsWith('v1='),
    'HTTP webhook provider must include HMAC signature',
  );
  assert(
    request.headers['x-social-monitor-key-id'] === 'whsec_key_',
    'HTTP webhook provider must include signing key id',
  );

  const payload = JSON.parse(request.body) as Readonly<Record<string, unknown>>;
  assert(payload.eventType === 'digest.ready.v1', 'HTTP webhook payload must use digest.ready.v1');
  assert(payload.deliveryId === 'delivery-attempt-http-provider-smoke', 'HTTP webhook payload must include delivery id');
  assert(payload.resourceId === 'digest-http-provider-smoke', 'HTTP webhook payload must include resource id');

  const rejected = await provider.send({
    attempt: {
      id: 'delivery-attempt-http-provider-summary-smoke',
      tenantId: tenant,
      workspaceId: workspace,
      idempotencyKey: 'delivery-attempt-http-provider-summary-smoke:summary-1',
      channel: 'webhook',
      recipientKey: endpointId,
      resourceType: 'summary',
      resourceId: 'summary-http-provider-smoke',
      state: 'sending',
      queuedAt: new Date('2026-06-16T04:18:00.000Z'),
      sendingAt: new Date('2026-06-16T04:20:00.000Z'),
      retryCount: 0,
      maxRetries: 2,
    },
    content: {
      body: 'Unsupported summary webhook resource.',
    },
  });

  assert(!rejected.accepted, 'HTTP webhook provider must reject unsupported webhook resource types');
  assert(!rejected.accepted && !rejected.retryable, 'unsupported webhook resource type must not retry');

  console.log('HTTP webhook delivery provider smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
