export interface WebhookReplayStorePort {
  rememberDelivery(params: {
    readonly webhookEndpointId: string;
    readonly deliveryId: string;
    readonly now: Date;
    readonly expiresAt: Date;
  }): Promise<boolean>;
}
