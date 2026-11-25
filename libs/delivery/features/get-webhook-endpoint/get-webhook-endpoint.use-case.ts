import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { WebhookEndpointRepositoryPort } from '../../ports';
import { presentWebhookEndpoint } from '../shared/webhook-endpoint-presenter';
import type { GetWebhookEndpointQuery } from './get-webhook-endpoint.query';
import type { GetWebhookEndpointResult } from './get-webhook-endpoint.result';

type GetWebhookEndpointFailure = DomainError;

export class GetWebhookEndpointUseCase {
  constructor(private readonly endpoints: WebhookEndpointRepositoryPort) {}

  async execute(query: GetWebhookEndpointQuery): Promise<Result<GetWebhookEndpointResult, GetWebhookEndpointFailure>> {
    if (query.webhookEndpointId.trim().length === 0) {
      return err(new DomainError('validation.failed', 'Webhook endpoint id must be non-empty'));
    }

    const endpoint = await this.endpoints.findById(query);

    if (endpoint === null) {
      return err(new DomainError('resource.not_found', 'Webhook endpoint not found', {
        webhookEndpointId: query.webhookEndpointId,
      }));
    }

    return ok(presentWebhookEndpoint(endpoint));
  }
}
