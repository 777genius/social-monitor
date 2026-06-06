export const WEBHOOK_PAYLOAD_VERSION = 1;

export const WEBHOOK_EVENT_CATALOG = [
  {
    eventType: 'digest.ready.v1',
    payloadVersion: WEBHOOK_PAYLOAD_VERSION,
    resourceType: 'digest',
    description: 'Digest is assembled and ready to be fetched through REST resources.',
  },
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_CATALOG)[number]['eventType'];

export const supportedWebhookEventTypes = (): readonly WebhookEventType[] =>
  WEBHOOK_EVENT_CATALOG.map((event) => event.eventType);

export const isSupportedWebhookEventType = (eventType: string): eventType is WebhookEventType =>
  supportedWebhookEventTypes().includes(eventType as WebhookEventType);
