import { type Clock, DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { WebhookEndpointRepositoryPort } from '../../ports';
import { presentWebhookEndpoint } from '../shared/webhook-endpoint-presenter';
import type { DisableWebhookEndpointCommand } from './disable-webhook-endpoint.command';
import type { DisableWebhookEndpointResult } from './disable-webhook-endpoint.result';

type DisableWebhookEndpointFailure = DomainError;

export class DisableWebhookEndpointUseCase {
  constructor(
    private readonly endpoints: WebhookEndpointRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: DisableWebhookEndpointCommand,
  ): Promise<Result<DisableWebhookEndpointResult, DisableWebhookEndpointFailure>> {
    if (command.webhookEndpointId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Webhook endpoint id must be non-empty'));
    }

    const endpoint = await this.endpoints.findById(command);

    if (endpoint === null) {
      return err(new DomainError('resource.not_found', 'Webhook endpoint not found', {
        webhookEndpointId: command.webhookEndpointId,
      }));
    }

    const disabled = endpoint.disable({ disabledAt: this.clock.now() });

    await this.endpoints.save(disabled);

    return ok(presentWebhookEndpoint(disabled));
  }
}
