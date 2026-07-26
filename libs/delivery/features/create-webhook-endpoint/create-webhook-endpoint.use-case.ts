import { type Clock, DomainError, type IdGenerator, err, ok, type Result } from '@social-monitor/shared-kernel';

import { WebhookEndpoint } from '../../domain';
import type { WebhookEndpointRepositoryPort, WebhookEventCatalogPort, WebhookSecretVaultPort } from '../../ports';
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
    private readonly eventCatalog: WebhookEventCatalogPort,
  ) {}

  async execute(
    command: CreateWebhookEndpointCommand,
  ): Promise<Result<CreateWebhookEndpointResult, CreateWebhookEndpointFailure>> {
    if (command.eventTypes.length === 0) {
      return err(new DomainError('validation.failed', 'Webhook endpoint must subscribe to at least one event type'));
    }

    const unsupportedEventTypes = command.eventTypes.filter((eventType) => !this.eventCatalog.isSupported(eventType));

    if (unsupportedEventTypes.length > 0) {
      return err(new DomainError('validation.failed', 'Webhook endpoint contains unsupported event types', {
        unsupportedEventTypes,
      }));
    }

    const secretKeyId = `whsec_key_${this.ids.generate()}`;
    const signingSecret = `whsec_${this.ids.generate()}_${this.ids.generate()}`;
    const endpointResult = createWebhookEndpoint({
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

    if (!endpointResult.ok) {
      return err(endpointResult.error);
    }

    await this.secrets.put({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      secretKeyId,
      secret: signingSecret,
    });
    await this.endpoints.save(endpointResult.value);

    return ok({
      endpoint: presentWebhookEndpoint(endpointResult.value),
      signingSecret,
    });
  }
}

const createWebhookEndpoint = (
  props: Parameters<typeof WebhookEndpoint.create>[0],
): Result<WebhookEndpoint, DomainError> => {
  try {
    return ok(WebhookEndpoint.create(props));
  } catch (error) {
    return err(new DomainError(
      'validation.failed',
      error instanceof Error ? error.message : 'Webhook endpoint validation failed',
    ));
  }
};
