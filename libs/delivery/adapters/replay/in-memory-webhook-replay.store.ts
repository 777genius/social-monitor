import type { WebhookReplayStorePort } from '../../ports';

export class InMemoryWebhookReplayStore implements WebhookReplayStorePort {
  private readonly deliveries = new Map<string, Date>();

  async rememberDelivery(params: {
    readonly webhookEndpointId: string;
    readonly deliveryId: string;
    readonly now: Date;
    readonly expiresAt: Date;
  }): Promise<boolean> {
    const key = `${params.webhookEndpointId}:${params.deliveryId}`;
    const existing = this.deliveries.get(key);

    if (existing !== undefined && existing.getTime() > params.now.getTime()) {
      return false;
    }

    this.deliveries.set(key, params.expiresAt);

    return true;
  }
}
