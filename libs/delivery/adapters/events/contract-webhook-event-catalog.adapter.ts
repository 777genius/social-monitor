import {
  isSupportedWebhookEventType,
  WEBHOOK_PAYLOAD_VERSION,
} from '@social-monitor/contracts/events/webhook-events';

import type { WebhookEventCatalogPort } from '../../ports';

export class ContractWebhookEventCatalogAdapter implements WebhookEventCatalogPort {
  readonly payloadVersion = WEBHOOK_PAYLOAD_VERSION;

  isSupported(eventType: string): boolean {
    return isSupportedWebhookEventType(eventType);
  }
}
