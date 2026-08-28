import { EventEmitter } from 'node:events';

import type { ChannelModel, ConfirmChannel, GetMessage } from 'amqplib';

import { AmqplibRabbitMqChannel } from './amqplib-rabbitmq-channel';

class FakeConfirmChannel extends EventEmitter {
  getCount = 0;

  async get(): Promise<GetMessage | false> {
    this.getCount += 1;
    return false;
  }
}

class FakeConnection extends EventEmitter {
  readonly channels: FakeConfirmChannel[] = [];

  async createConfirmChannel(): Promise<ConfirmChannel> {
    const channel = new FakeConfirmChannel();
    this.channels.push(channel);
    return channel as unknown as ConfirmChannel;
  }
}

describe('AmqplibRabbitMqChannel', () => {
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
