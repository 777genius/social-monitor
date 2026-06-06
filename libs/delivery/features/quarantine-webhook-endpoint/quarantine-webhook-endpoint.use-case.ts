import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { WebhookEndpointRepositoryPort } from '../../ports';
import { presentWebhookEndpoint } from '../shared/webhook-endpoint-presenter';
import type { QuarantineWebhookEndpointCommand } from './quarantine-webhook-endpoint.command';
import type { QuarantineWebhookEndpointResult } from './quarantine-webhook-endpoint.result';

type QuarantineWebhookEndpointFailure = DomainError | Error;

export class QuarantineWebhookEndpointUseCase {
  constructor(
    private readonly endpoints: WebhookEndpointRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: QuarantineWebhookEndpointCommand,
  ): Promise<Result<QuarantineWebhookEndpointResult, QuarantineWebhookEndpointFailure>> {
    if (command.webhookEndpointId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Webhook endpoint id must be non-empty'));
    }

    if (command.reason.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Webhook endpoint quarantine reason must be non-empty'));
    }

    const endpoint = await this.endpoints.findById(command);

    if (endpoint === null) {
      return err(new DomainError('resource.not_found', 'Webhook endpoint not found', {
        webhookEndpointId: command.webhookEndpointId,
      }));
    }

    const quarantined = endpoint.quarantine({
      quarantinedAt: this.clock.now(),
      reason: command.reason,
    });
    await this.endpoints.save(quarantined);

    return ok(presentWebhookEndpoint(quarantined));
  }
}
