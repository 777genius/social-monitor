import { createHmac } from 'node:crypto';

import { isSupportedWebhookEventType, WEBHOOK_PAYLOAD_VERSION } from '@social-monitor/contracts/events/webhook-events';
import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { WebhookEndpointRepositoryPort, WebhookSecretVaultPort } from '../../ports';
import type { SignWebhookPayloadCommand } from './sign-webhook-payload.command';
import type { SignedWebhookPayload, SignWebhookPayloadResult } from './sign-webhook-payload.result';

type SignWebhookPayloadFailure = DomainError | Error;

export class SignWebhookPayloadUseCase {
  constructor(
    private readonly endpoints: WebhookEndpointRepositoryPort,
    private readonly secrets: WebhookSecretVaultPort,
  ) {}

  async execute(
    command: SignWebhookPayloadCommand,
  ): Promise<Result<SignWebhookPayloadResult, SignWebhookPayloadFailure>> {
    const endpoint = await this.endpoints.findById(command);

    if (endpoint === null) {
      return err(new DomainError('resource.not_found', 'Webhook endpoint not found', {
        webhookEndpointId: command.webhookEndpointId,
      }));
    }

    if (!isSupportedWebhookEventType(command.eventType)) {
      return err(new DomainError('validation.failed', 'Webhook event type is not supported', {
        eventType: command.eventType,
      }));
    }

    const snapshot = endpoint.toSnapshot();

    if (snapshot.status !== 'enabled') {
      return err(new DomainError('operation.conflict', 'Webhook endpoint is not enabled', {
        webhookEndpointId: command.webhookEndpointId,
        status: snapshot.status,
      }));
    }

    if (!snapshot.eventTypes.includes(command.eventType)) {
      return err(new DomainError('authorization.denied', 'Webhook endpoint is not subscribed to event type', {
        webhookEndpointId: command.webhookEndpointId,
        eventType: command.eventType,
      }));
    }

    const secret = await this.secrets.get({ secretKeyId: snapshot.secretKeyId });

    if (secret === null) {
      return err(new DomainError('external.dependency_unavailable', 'Webhook signing secret is unavailable', {
        secretKeyId: snapshot.secretKeyId,
      }));
    }

    const payload: SignedWebhookPayload = {
      payloadVersion: WEBHOOK_PAYLOAD_VERSION,
      deliveryId: command.deliveryId,
      eventType: command.eventType,
      occurredAt: command.occurredAt.toISOString(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      idempotencyKey: command.idempotencyKey,
      correlationId: command.correlationId,
      resourceLinks: command.resourceLinks,
      summary: command.summary,
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = command.occurredAt.toISOString();
    const signature = createHmac('sha256', secret)
      .update(`${timestamp}.${command.deliveryId}.${rawBody}`)
      .digest('hex');

    return ok({
      payload,
      rawBody,
      headers: {
        'x-social-monitor-signature': `v1=${signature}`,
        'x-social-monitor-timestamp': timestamp,
        'x-social-monitor-delivery-id': command.deliveryId,
        'x-social-monitor-key-id': snapshot.secretKeyId,
      },
    });
  }
}
