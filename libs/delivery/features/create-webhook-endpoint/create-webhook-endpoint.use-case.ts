import { type Clock, DomainError, type IdGenerator, err, ok, type Result } from '@social-monitor/shared-kernel';

import { WebhookEndpoint } from '../../domain';
import type { WebhookEndpointRepositoryPort, WebhookSecretVaultPort } from '../../ports';
import { presentWebhookEndpoint } from '../shared/webhook-endpoint-presenter';
import type { CreateWebhookEndpointCommand } from './create-webhook-endpoint.command';
import type { CreateWebhookEndpointResult } from './create-webhook-endpoint.result';

type CreateWebhookEndpointFailure = DomainError | Error;

export class CreateWebhookEndpointUseCase {
  constructor(
    private readonly endpoints: WebhookEndpointRepositoryPort,
    private readonly secrets: WebhookSecretVaultPort,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    command: CreateWebhookEndpointCommand,
  ): Promise<Result<CreateWebhookEndpointResult, CreateWebhookEndpointFailure>> {
    if (command.eventTypes.length === 0) {
      return err(new DomainError('validation.failed', 'Webhook endpoint must subscribe to at least one event type'));
    }

    const secretKeyId = `whsec_key_${this.ids.generate()}`;
    const signingSecret = `whsec_${this.ids.generate()}_${this.ids.generate()}`;
    const endpoint = WebhookEndpoint.create({
      id: this.ids.generate(),
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      url: command.url,
      eventTypes: command.eventTypes,
      status: 'enabled',
      secretKeyId,
      secretPreview: signingSecret.slice(-8),
      createdAt: this.clock.now(),
    });

    await this.secrets.put({
      secretKeyId,
      secret: signingSecret,
    });
    await this.endpoints.save(endpoint);

    return ok({
      endpoint: presentWebhookEndpoint(endpoint),
      signingSecret,
    });
  }
}
