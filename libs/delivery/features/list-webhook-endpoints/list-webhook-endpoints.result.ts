import type { WebhookEndpointView } from '../shared/webhook-endpoint-presenter';

export type ListWebhookEndpointsResult = {
  readonly endpoints: readonly WebhookEndpointView[];
  readonly nextCursor?: string;
};
