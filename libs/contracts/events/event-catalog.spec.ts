import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { WEBHOOK_EVENT_CATALOG } from './webhook-events';

const eventCatalog = JSON.parse(
  readFileSync(join(__dirname, 'event-catalog.json'), 'utf8'),
) as {
  readonly events: readonly {
    readonly eventType: string;
    readonly schemaVersion: number;
    readonly tenantScoped?: boolean;
    readonly requiredEnvelopeFields?: readonly string[];
    readonly requiredPayloadFields?: readonly string[];
  }[];
};

describe('event catalog', () => {
  it('declares unique event type and schema version pairs', () => {
    const keys = eventCatalog.events.map((event) => `${event.eventType}@${event.schemaVersion}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps webhook event contracts in the shared event catalog', () => {
    for (const webhookEvent of WEBHOOK_EVENT_CATALOG) {
      expect(eventCatalog.events).toContainEqual(
        expect.objectContaining({
          eventType: webhookEvent.eventType,
          schemaVersion: webhookEvent.payloadVersion,
        }),
      );
    }
  });

  it('declares tenant context for tenant-scoped events', () => {
    for (const event of eventCatalog.events.filter((catalogEvent) => catalogEvent.tenantScoped === true)) {
      expect(event.requiredEnvelopeFields).toEqual(expect.arrayContaining([
        'tenantId',
        'workspaceId',
        'correlationId',
      ]));
      expect(event.requiredPayloadFields).toEqual(expect.arrayContaining([
        'tenantId',
        'workspaceId',
      ]));
    }
  });
});
