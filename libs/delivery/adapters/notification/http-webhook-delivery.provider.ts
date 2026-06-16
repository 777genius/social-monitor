import { WEBHOOK_EVENT_CATALOG, type WebhookEventType } from '@social-monitor/contracts/events/webhook-events';
import { type Clock, DomainError } from '@social-monitor/shared-kernel';

import type { SignWebhookPayloadUseCase } from '../../features/sign-webhook-payload/sign-webhook-payload.use-case';
import type {
  DeliveryProviderPort,
  SendDeliveryRequest,
  SendDeliveryResult,
  WebhookEndpointRepositoryPort,
} from '../../ports';

export type WebhookHttpRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly timeoutMs: number;
};

export type WebhookHttpResponse = {
  readonly status: number;
  readonly providerMessageId?: string;
  readonly body?: string;
};

export interface WebhookHttpClientPort {
  post(request: WebhookHttpRequest): Promise<WebhookHttpResponse>;
}

export type HttpWebhookDeliveryProviderOptions = {
  readonly timeoutMs: number;
  readonly maxPayloadBytes: number;
  readonly userAgent: string;
};

export class FetchWebhookHttpClient implements WebhookHttpClientPort {
  async post(request: WebhookHttpRequest): Promise<WebhookHttpResponse> {
    const response = await fetch(request.url, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(request.timeoutMs),
    });

    return {
      status: response.status,
      providerMessageId: response.headers.get('x-request-id') ?? response.headers.get('x-correlation-id') ?? undefined,
      body: await response.text().catch(() => undefined),
    };
  }
}

export class HttpWebhookDeliveryProvider implements DeliveryProviderPort {
  readonly channel = 'webhook' as const;

  constructor(
    private readonly endpoints: WebhookEndpointRepositoryPort,
    private readonly signer: SignWebhookPayloadUseCase,
    private readonly http: WebhookHttpClientPort,
    private readonly clock: Clock,
    private readonly options: HttpWebhookDeliveryProviderOptions,
  ) {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 100 || options.timeoutMs > 30_000) {
      throw new Error('Webhook delivery timeout must be between 100 and 30000 ms');
    }

    if (!Number.isInteger(options.maxPayloadBytes) || options.maxPayloadBytes < 1024) {
      throw new Error('Webhook delivery max payload bytes must be at least 1024');
    }

    if (options.userAgent.trim().length === 0) {
      throw new Error('Webhook delivery user agent must be non-empty');
    }
  }

  async send(request: SendDeliveryRequest): Promise<SendDeliveryResult> {
    const eventType = eventTypeForResource(request.attempt.resourceType);

    if (eventType === null) {
      return {
        accepted: false,
        retryable: false,
        reason: `Webhook delivery does not support resource type: ${request.attempt.resourceType}`,
      };
    }

    const endpoint = await this.endpoints.findById({
      tenantId: request.attempt.tenantId,
      workspaceId: request.attempt.workspaceId,
      webhookEndpointId: request.attempt.recipientKey,
    });

    if (endpoint === null) {
      return {
        accepted: false,
        retryable: false,
        reason: 'Webhook endpoint not found',
      };
    }

    const endpointSnapshot = endpoint.toSnapshot();
    const occurredAt = this.clock.now();
    const signed = await this.signer.execute({
      tenantId: request.attempt.tenantId,
      workspaceId: request.attempt.workspaceId,
      webhookEndpointId: endpointSnapshot.id,
      deliveryId: request.attempt.id,
      eventType,
      occurredAt,
      resourceType: request.attempt.resourceType,
      resourceId: request.attempt.resourceId,
      idempotencyKey: request.attempt.idempotencyKey,
      correlationId: `delivery-attempt:${request.attempt.id}`,
      resourceLinks: {},
      summary: {
        subject: request.content.subject ?? null,
        body: request.content.body,
        channel: request.attempt.channel,
        recipientKey: request.attempt.recipientKey,
      },
    });

    if (!signed.ok) {
      return {
        accepted: false,
        retryable: isRetryableSigningFailure(signed.error),
        reason: signed.error.message,
      };
    }

    const payloadBytes = Buffer.byteLength(signed.value.rawBody, 'utf8');
    if (payloadBytes > this.options.maxPayloadBytes) {
      return {
        accepted: false,
        retryable: false,
        reason: `Webhook payload exceeds max size: ${payloadBytes}`,
      };
    }

    try {
      const response = await this.http.post({
        url: endpointSnapshot.url,
        timeoutMs: this.options.timeoutMs,
        body: signed.value.rawBody,
        headers: {
          'content-type': 'application/json',
          'user-agent': this.options.userAgent,
          ...signed.value.headers,
        },
      });

      if (response.status >= 200 && response.status < 300) {
        return {
          accepted: true,
          providerMessageId: response.providerMessageId ?? `${endpointSnapshot.id}:${request.attempt.id}`,
        };
      }

      return {
        accepted: false,
        retryable: isRetryableHttpStatus(response.status),
        reason: `Webhook endpoint returned HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        accepted: false,
        retryable: true,
        reason: error instanceof Error ? error.message : 'Webhook HTTP request failed',
      };
    }
  }
}

export const resolveHttpWebhookDeliveryProviderOptions = (
  env: NodeJS.ProcessEnv,
): HttpWebhookDeliveryProviderOptions => ({
  timeoutMs: parseBoundedInteger(env.DELIVERY_WEBHOOK_HTTP_TIMEOUT_MS, 5_000, 100, 30_000),
  maxPayloadBytes: parseBoundedInteger(env.DELIVERY_WEBHOOK_MAX_PAYLOAD_BYTES, 262_144, 1024, 1_048_576),
  userAgent: nonEmptyOrFallback(env.DELIVERY_WEBHOOK_USER_AGENT, 'social-monitor-delivery/0.1'),
});

const eventTypeForResource = (resourceType: SendDeliveryRequest['attempt']['resourceType']): WebhookEventType | null =>
  WEBHOOK_EVENT_CATALOG.find((event) => event.resourceType === resourceType)?.eventType ?? null;

const isRetryableSigningFailure = (error: Error): boolean =>
  error instanceof DomainError && error.code === 'external.dependency_unavailable';

const isRetryableHttpStatus = (status: number): boolean =>
  status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

const nonEmptyOrFallback = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const parseBoundedInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected integer environment value between ${min} and ${max}`);
  }

  return parsed;
};
