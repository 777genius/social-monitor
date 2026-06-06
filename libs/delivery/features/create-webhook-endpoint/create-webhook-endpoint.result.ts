import type { WebhookEndpointView } from '../shared/webhook-endpoint-presenter';

export type CreateWebhookEndpointResult = {
  readonly endpoint: WebhookEndpointView;
  readonly signingSecret: string;
};
