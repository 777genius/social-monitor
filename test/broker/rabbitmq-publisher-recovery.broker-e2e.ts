import { RabbitMqEventPublisher } from '@social-monitor/platform-events/adapters/rabbitmq';
import type { EventEnvelope } from '@social-monitor/shared-kernel';

import { brokerCommand, RabbitMqBrokerFixture, rabbitMqBrokerTestUrl } from './support/rabbitmq-broker-fixture';

describe('RabbitMQ publisher recovery against a real quorum broker', () => {
  let url: string;
  let fixture: RabbitMqBrokerFixture | undefined;

  beforeAll(() => { url = rabbitMqBrokerTestUrl(); });
  afterEach(async () => { await fixture?.close(); });

  it('recreates command topology after connection replacement and broker resource loss', async () => {
    const f = fixture = new RabbitMqBrokerFixture(url);
    await f.start();
    await f.publisher.publish(brokerCommand('before-reconnect', 'before'));
    const [first] = await f.deliveries(1);
    await first!.ack();
    await f.channel.close();
    await f.admin.deleteQueue(f.queue);
    await f.admin.deleteExchange(f.exchange);

    // Reuse the application publisher: no process restart or new publisher instance.
    await f.publisher.publish(brokerCommand('after-reconnect', 'after'));
    const [recovered] = await f.deliveries(1);
    expect(recovered!.command).toMatchObject({
      commandId: 'after-reconnect', payload: { occurrence: 'after' },
    });
    await recovered!.ack();
    await f.expectFullySettled();
  });

  it('reasserts an event exchange after reconnect and preserves a mandatory return for retry', async () => {
    const f = fixture = new RabbitMqBrokerFixture(url, 'topic');
    await f.start();
    const publisher = new RabbitMqEventPublisher(f.channel, { exchange: f.exchange });
    const event: EventEnvelope<Readonly<Record<string, unknown>>> = {
      eventId: 'event-before-reconnect', eventType: 'synthetic.ready', schemaVersion: 1,
      occurredAt: new Date('2026-11-04T00:00:00.000Z'), correlationId: 'synthetic-correlation',
      payload: { summaryId: 'synthetic-summary' },
    };
    await f.admin.bindQueue(f.queue, f.exchange, event.eventType);
    await publisher.publish(event);
    const [first] = await f.rawDeliveries(1);
    await f.channel.ack(first!);
    await f.channel.close();
    await f.admin.deleteExchange(f.exchange);
    const retry = { ...event, eventId: 'event-after-reconnect' };
    // The exchange is repaired, but a missing route must still be reported.
    await expect(publisher.publish(retry)).rejects.toThrow('mandatory publish returned');
    await f.admin.bindQueue(f.queue, f.exchange, event.eventType);
    await publisher.publish(retry);
    const [recovered] = await f.rawDeliveries(1);
    expect(JSON.parse(recovered!.content.toString('utf8'))).toMatchObject({
      eventId: retry.eventId, payload: event.payload,
    });
    await f.channel.ack(recovered!);
    await f.expectFullySettled();
  });

  it('continues the same publisher after a broker protocol error and confirms concurrent siblings', async () => {
    const f = fixture = new RabbitMqBrokerFixture(url);
    await f.start();
    await expect(f.channel.assertQueue(f.queue, { durable: false })).rejects.toThrow(/PRECONDITION_FAILED|406/);
    const ids = Array.from({ length: 24 }, (_, index) => 'after-protocol-error-' + index);
    await Promise.all(ids.map((id) => f.publisher.publish(brokerCommand(id, id))));
    const deliveries = await f.deliveries(ids.length);
    expect(deliveries.map((delivery) => delivery.command.commandId).sort()).toEqual([...ids].sort());
    for (const delivery of deliveries) await delivery.ack();
    await f.expectFullySettled();
  });
});
