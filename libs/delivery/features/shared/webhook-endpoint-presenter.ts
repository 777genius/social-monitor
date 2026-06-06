import type { WebhookEndpoint, WebhookEndpointProps } from '../../domain';

export type WebhookEndpointView = Omit<WebhookEndpointProps, 'createdAt' | 'disabledAt' | 'quarantinedAt'> & {
  readonly createdAt: string;
  readonly disabledAt?: string;
  readonly quarantinedAt?: string;
};

export const presentWebhookEndpoint = (endpoint: WebhookEndpoint): WebhookEndpointView => {
  const snapshot = endpoint.toSnapshot();

  return {
    ...snapshot,
    createdAt: snapshot.createdAt.toISOString(),
    disabledAt: snapshot.disabledAt?.toISOString(),
    quarantinedAt: snapshot.quarantinedAt?.toISOString(),
  };
};
