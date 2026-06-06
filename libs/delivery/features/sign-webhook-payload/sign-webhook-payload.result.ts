export type SignedWebhookPayload = {
  readonly payloadVersion: 1;
  readonly deliveryId: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
  readonly resourceLinks: Readonly<Record<string, string>>;
  readonly summary: Readonly<Record<string, string | number | boolean | null>>;
};

export type SignWebhookPayloadResult = {
  readonly payload: SignedWebhookPayload;
  readonly rawBody: string;
  readonly headers: {
    readonly 'x-social-monitor-signature': string;
    readonly 'x-social-monitor-timestamp': string;
    readonly 'x-social-monitor-delivery-id': string;
    readonly 'x-social-monitor-key-id': string;
  };
};
