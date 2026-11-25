export type WebhookEventCatalogPort = {
  readonly payloadVersion: number;
  isSupported(eventType: string): boolean;
};
