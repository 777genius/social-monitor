import { createHmac, timingSafeEqual } from 'node:crypto';

import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type {
  WebhookEndpointRepositoryPort,
  WebhookReplayStorePort,
  WebhookSecretVaultPort,
} from '../../ports';
import type { VerifyWebhookSignatureCommand } from './verify-webhook-signature.command';
import type { VerifyWebhookSignatureResult } from './verify-webhook-signature.result';

type VerifyWebhookSignatureFailure = DomainError;

export class VerifyWebhookSignatureUseCase {
  constructor(
    private readonly endpoints: WebhookEndpointRepositoryPort,
    private readonly secrets: WebhookSecretVaultPort,
    private readonly replayStore: WebhookReplayStorePort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: VerifyWebhookSignatureCommand,
  ): Promise<Result<VerifyWebhookSignatureResult, VerifyWebhookSignatureFailure>> {
    if (!Number.isInteger(command.toleranceSeconds) || command.toleranceSeconds < 1 || command.toleranceSeconds > 86400) {
      return err(new DomainError('validation.failed', 'Webhook replay tolerance must be between 1 and 86400 seconds'));
    }

    const endpoint = await this.endpoints.findById(command);

    if (endpoint === null) {
      return err(new DomainError('resource.not_found', 'Webhook endpoint not found', {
        webhookEndpointId: command.webhookEndpointId,
      }));
    }

    const snapshot = endpoint.toSnapshot();

    if (snapshot.secretKeyId !== command.keyId) {
      return ok({
        verified: false,
        reason: 'secret_unavailable',
      });
    }

    const timestamp = new Date(command.timestamp);

    if (Number.isNaN(timestamp.getTime())) {
      return ok({
        verified: false,
        reason: 'invalid_timestamp',
      });
    }

    const now = this.clock.now();
    const toleranceMs = command.toleranceSeconds * 1000;
    const ageMs = Math.abs(now.getTime() - timestamp.getTime());

    if (ageMs > toleranceMs) {
      return ok({
        verified: false,
        reason: 'invalid_timestamp',
      });
    }

    const secret = await this.secrets.get({ secretKeyId: command.keyId });

    if (secret === null) {
      return ok({
        verified: false,
        reason: 'secret_unavailable',
      });
    }

    const expectedSignature = `v1=${createHmac('sha256', secret)
      .update(`${command.timestamp}.${command.deliveryId}.${command.rawBody}`)
      .digest('hex')}`;

    if (!safeEquals(expectedSignature, command.signatureHeader)) {
      return ok({
        verified: false,
        reason: 'invalid_signature',
      });
    }

    const remembered = await this.replayStore.rememberDelivery({
      webhookEndpointId: command.webhookEndpointId,
      deliveryId: command.deliveryId,
      now,
      expiresAt: new Date(now.getTime() + toleranceMs),
    });

    if (!remembered) {
      return ok({
        verified: false,
        reason: 'replay_detected',
      });
    }

    return ok({
      verified: true,
    });
  }
}

const safeEquals = (expected: string, actual: string): boolean => {
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
};
