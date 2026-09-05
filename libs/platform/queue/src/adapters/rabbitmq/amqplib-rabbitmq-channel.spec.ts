import { EventEmitter } from 'node:events';

import type { ChannelModel, ConfirmChannel, GetMessage } from 'amqplib';

import { AmqplibRabbitMqChannel } from './amqplib-rabbitmq-channel';
import type { RabbitMqPublishOptions } from './rabbitmq-queue-publisher';

class FakeConfirmChannel extends EventEmitter {
  getCount = 0;
  publish = jest.fn(() => true);
  async close(): Promise<void> { this.emit('close'); }

  async get(): Promise<GetMessage | false> {
    this.getCount += 1;
    return false;
  }
}

class FakeConnection extends EventEmitter {
  readonly channels: FakeConfirmChannel[] = [];
  async close(): Promise<void> { this.emit('close'); }

  async createConfirmChannel(): Promise<ConfirmChannel> {
    const channel = new FakeConfirmChannel();
    this.channels.push(channel);
    return channel as unknown as ConfirmChannel;
  }
}

describe('AmqplibRabbitMqChannel', () => {
  const options: RabbitMqPublishOptions = { contentType: 'application/json', deliveryMode: 2, mandatory: true,
    messageId: 'synthetic', correlationId: 'synthetic', type: 'synthetic', timestamp: 0, headers: {} };
  it('inhibits a send suspended on an already-created channel, permanently across close', async () => {
    const connection = new FakeConnection();
    const channel = new AmqplibRabbitMqChannel({ url: 'amqp://synthetic', connect: async () => connection as unknown as ChannelModel });
    await channel.get('synthetic', { noAck: false });
    const pending = channel.publish('synthetic', 'synthetic', Buffer.from('{}'), options);
    channel.cancelPendingPublishes();
    await expect(pending).rejects.toThrow('cancelled');
    expect(connection.channels[0]!.publish).not.toHaveBeenCalled();
    await channel.close();
    await expect(channel.publish('synthetic', 'synthetic', Buffer.from('{}'), options)).rejects.toThrow('cancelled');
    expect(connection.channels).toHaveLength(1);
  });
  it('retains reusable close behavior for shared callers that never cancel', async () => {
    const connection = new FakeConnection();
    const channel = new AmqplibRabbitMqChannel({ url: 'amqp://synthetic', connect: async () => connection as unknown as ChannelModel });
    await channel.publish('synthetic', 'synthetic', Buffer.from('{}'), options);
    await channel.close();
    await channel.publish('synthetic', 'synthetic', Buffer.from('{}'), options);
    expect(connection.channels).toHaveLength(2);
    expect(connection.channels[1]!.publish).toHaveBeenCalledTimes(1);
  });
  it('reconnects after the broker connection emits an error', async () => {
    const first = new FakeConnection();
    const second = new FakeConnection();
    const connections = [first, second];
    const connect = jest.fn(async () =>
      connections.shift() as unknown as ChannelModel,
    );
    const channel = new AmqplibRabbitMqChannel({
      url: 'amqp://rabbitmq',
      connect,
    });

    await channel.get('summary.jobs', { noAck: false });
    expect(() => first.emit('error', new Error('Unexpected close'))).not.toThrow();
    await channel.get('summary.jobs', { noAck: false });

    expect(connect).toHaveBeenCalledTimes(2);
    expect(first.channels[0]?.getCount).toBe(1);
    expect(second.channels[0]?.getCount).toBe(1);
  });

  it('recreates a confirm channel after only that channel closes', async () => {
    const connection = new FakeConnection();
    const connect = jest.fn(async () => connection as unknown as ChannelModel);
    const channel = new AmqplibRabbitMqChannel({
      url: 'amqp://rabbitmq',
      connect,
    });

    await channel.get('summary.jobs', { noAck: false });
    const firstChannel = connection.channels[0];
    expect(() => firstChannel?.emit('error', new Error('channel closed'))).not.toThrow();
    await channel.get('summary.jobs', { noAck: false });

    expect(connect).toHaveBeenCalledTimes(1);
    expect(connection.channels).toHaveLength(2);
    expect(connection.channels[1]?.getCount).toBe(1);
  });
});
