import {
  isSupportedWebhookEventType,
  WEBHOOK_EVENT_CATALOG,
  WEBHOOK_PAYLOAD_VERSION,
} from './webhook-events';

describe('webhook event catalog', () => {
  it('declares supported webhook event types and payload version', () => {
    expect(WEBHOOK_PAYLOAD_VERSION).toBe(1);
    expect(WEBHOOK_EVENT_CATALOG).toEqual([
      {
        eventType: 'digest.ready.v1',
        payloadVersion: 1,
        resourceType: 'digest',
        description: 'Digest is assembled and ready to be fetched through REST resources.',
      },
    ]);
    expect(isSupportedWebhookEventType('digest.ready.v1')).toBe(true);
    expect(isSupportedWebhookEventType('digest.unknown.v1')).toBe(false);
  });
});
