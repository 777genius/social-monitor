import type { WebhookEndpoint, WebhookEndpointProps } from '../../domain';

export type WebhookEndpointView = Omit<WebhookEndpointProps, 'createdAt'> & {
  readonly createdAt: string;
};

export const presentWebhookEndpoint = (endpoint: WebhookEndpoint): WebhookEndpointView => {
  const snapshot = endpoint.toSnapshot();

  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
  };
};
