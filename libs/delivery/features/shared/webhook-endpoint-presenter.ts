import type { WebhookEndpoint, WebhookEndpointProps } from '../../domain';

export type WebhookEndpointView = Omit<WebhookEndpointProps, 'createdAt' | 'quarantinedAt'> & {
  readonly createdAt: string;
  readonly quarantinedAt?: string;
};

export const presentWebhookEndpoint = (endpoint: WebhookEndpoint): WebhookEndpointView => {
  const snapshot = endpoint.toSnapshot();

  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    quarantinedAt: snapshot.quarantinedAt?.toISOString(),
  };
};
