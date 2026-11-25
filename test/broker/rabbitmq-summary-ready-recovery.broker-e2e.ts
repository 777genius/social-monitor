import { RabbitMqSummaryReadyEventQueueReader } from '../../apps/delivery-service/src/summary-ready-event-queue-reader';

import { RabbitMqBrokerFixture, rabbitMqBrokerTestUrl } from './support/rabbitmq-broker-fixture';

describe('summary-ready route recovery against a real quorum broker', () => {
  let fixture: RabbitMqBrokerFixture | undefined;

  beforeEach(async () => {
    fixture = new RabbitMqBrokerFixture(rabbitMqBrokerTestUrl(), 'topic');
    await fixture.start();
  });
  afterEach(async () => { await fixture?.close(); });

  it('recreates a deleted event queue and both topic bindings on the next drain', async () => {
    const f = fixture!;
    const reader = new RabbitMqSummaryReadyEventQueueReader(f.channel, {
      exchange: f.exchange, queue: f.queue, routingKey: 'summary.ready',
      deadLetterExchange: f.deadLetterExchange, queueType: 'quorum', deliveryLimit: 20,
    });
    await reader.drain({ limit: 1 });
    await f.admin.deleteQueue(f.queue);
    await expect(reader.drain({ limit: 1 })).rejects.toThrow(/NOT_FOUND|404/);
    await expect(reader.drain({ limit: 1 })).resolves.toEqual([]);

    const events = ['summary.ready', 'reader_summary.ready'].map((eventType) => ({
      eventId: `synthetic-${eventType}`, eventType, schemaVersion: 1, payload: {},
    }));
    for (const event of events) {
      f.admin.publish(f.exchange, event.eventType, Buffer.from(JSON.stringify(event)), {
        persistent: true, contentType: 'application/json',
      });
    }
    await f.admin.waitForConfirms();
    await f.expectReadyCount(2);
    const deliveries = await reader.drain({ limit: 2 });
    expect(deliveries.map((delivery) => delivery.event)).toEqual(events);
    for (const delivery of deliveries) await delivery.ack();
    await f.expectFullySettled();
  });
});
