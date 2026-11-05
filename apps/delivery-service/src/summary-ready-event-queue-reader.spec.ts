import type { GetMessage } from 'amqplib';
import { queueMessageFixture, queueReaderFixture } from '@social-monitor/platform-queue/adapters/rabbitmq/rabbitmq-queue-reader.spec-support';

import { RabbitMqSummaryReadyEventQueueReader } from './summary-ready-event-queue-reader';

function fixture(messages: readonly GetMessage[] = []) {
  const base = queueReaderFixture(messages);
  const channel = { ...base.channel, bindQueue: jest.fn(async () => undefined) };
  const reader = new RabbitMqSummaryReadyEventQueueReader(channel, {
    exchange: 'synthetic.events', queue: 'synthetic', routingKey: 'summary.ready',
    deadLetterExchange: 'synthetic.dlx', queueType: 'quorum', deliveryLimit: 7,
  });
  return { ...base, channel, reader };
}

describe('summary-ready event reader route recovery', () => {
  it('reasserts both event bindings after a failed drain, retaining the original error', async () => {
    const f = fixture();
    await f.reader.drain({ limit: 1 });
    const failure = new Error('NOT_FOUND - deleted event queue');
    f.channel.get.mockRejectedValueOnce(failure);
    await expect(f.reader.drain({ limit: 1 })).rejects.toBe(failure);
    expect(f.channel.assertQueue).toHaveBeenCalledTimes(1);

    await expect(f.reader.drain({ limit: 1 })).resolves.toEqual([]);
    expect(f.channel.assertExchange.mock.calls).toEqual([
      ['synthetic.events', 'topic', { durable: true }],
      ['synthetic.dlx', 'fanout', { durable: true }],
      ['synthetic.events', 'topic', { durable: true }],
      ['synthetic.dlx', 'fanout', { durable: true }],
    ]);
    expect(f.channel.bindQueue.mock.calls).toEqual([
      ['synthetic', 'synthetic.events', 'reader_summary.ready'],
      ['synthetic', 'synthetic.events', 'summary.ready'],
      ['synthetic', 'synthetic.events', 'reader_summary.ready'],
      ['synthetic', 'synthetic.events', 'summary.ready'],
    ]);
    expect(f.channel.assertQueue).toHaveBeenCalledTimes(2);
    expect(f.channel.prefetch).toHaveBeenCalledTimes(2);
    await f.reader.drain({ limit: 1 });
    expect(f.channel.assertQueue).toHaveBeenCalledTimes(2);
  });

  it('finishes retained delivery recovery before declaring the replacement route', async () => {
    const message = queueMessageFixture();
    const event = { eventType: 'summary.ready', eventId: 'synthetic-event' };
    message.content = Buffer.from(JSON.stringify(event));
    message.fields.routingKey = 'summary.ready';
    const f = fixture([message]);
    const get = f.channel.get.getMockImplementation()!;
    const nack = f.channel.nack.getMockImplementation()!;
    f.channel.get.mockImplementationOnce(get).mockRejectedValueOnce(new Error('synthetic acquisition failure'));
    f.channel.nack.mockRejectedValue(new Error('synthetic release failure'));
    f.channel.recoverDelivery.mockRejectedValue(new Error('synthetic origin recovery failure'));

    await expect(f.reader.drain({ limit: 2 })).rejects.toThrow('synthetic acquisition failure');
    await expect(f.reader.drain({ limit: 1 })).rejects.toThrow('cleanup remains unresolved');
    expect(f.channel.assertQueue).toHaveBeenCalledTimes(1);
    expect(f.channel.get).toHaveBeenCalledTimes(2);

    f.channel.nack.mockImplementation(nack);
    const [delivery] = await f.reader.drain({ limit: 1 });
    expect(f.channel.assertQueue).toHaveBeenCalledTimes(2);
    expect(delivery!.event).toEqual(event);
    expect(delivery!.diagnostics.redelivered).toBe(true);
    await delivery!.ack();
    expect(f.pending.size).toBe(0);
  });
});
