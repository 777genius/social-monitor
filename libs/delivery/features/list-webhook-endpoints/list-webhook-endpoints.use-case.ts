import { DomainError, err, ok, type Result } from '@social-monitor/shared-kernel';

import type { WebhookEndpointRepositoryPort } from '../../ports';
import { presentWebhookEndpoint } from '../shared/webhook-endpoint-presenter';
import type { ListWebhookEndpointsQuery } from './list-webhook-endpoints.query';
import type { ListWebhookEndpointsResult } from './list-webhook-endpoints.result';

type ListWebhookEndpointsFailure = DomainError;

export class ListWebhookEndpointsUseCase {
  constructor(private readonly endpoints: WebhookEndpointRepositoryPort) {}

  async execute(
    query: ListWebhookEndpointsQuery,
  ): Promise<Result<ListWebhookEndpointsResult, ListWebhookEndpointsFailure>> {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      return err(new DomainError('validation.failed', 'Webhook endpoint list limit must be between 1 and 100'));
    }

    const result = await this.endpoints.list(query);

    return ok({
      endpoints: result.endpoints.map(presentWebhookEndpoint),
      nextCursor: result.nextCursor,
    });
  }
}
