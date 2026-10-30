import { EventEmitter } from 'node:events';
import type { ChannelModel, ConfirmChannel, GetMessage, Message } from 'amqplib';
import { FixedClock } from '@social-monitor/shared-kernel';
import { CommandOutboxDispatcher } from '../../command-outbox-dispatcher';

import { AmqplibRabbitMqChannel } from './amqplib-rabbitmq-channel';
import { RabbitMqQueuePublisher, type RabbitMqPublishOptions } from './rabbitmq-queue-publisher';

class WireChannel extends EventEmitter {
  readonly sends: Array<{ options: RabbitMqPublishOptions; confirm: (error: Error | null) => void }> = [];
  readonly deliveries: GetMessage[] = [];
  writable = true;
  readonly ack = jest.fn();
  readonly nack = jest.fn();
  async assertExchange(): Promise<void> {}
  async assertQueue(): Promise<void> {}
  async bindQueue(): Promise<void> {}
  async close(): Promise<void> { this.emit('close'); }
  async get(): Promise<GetMessage | false> { return this.deliveries.shift() ?? false; }
  publish(_exchange: string, _route: string, _content: Buffer, options: RabbitMqPublishOptions,
    confirm: (error: Error | null) => void): boolean {
    this.sends.push({ options, confirm });
    return this.writable;
  }
}

class WireConnection extends EventEmitter {
  readonly channels: WireChannel[] = [];
  async close(): Promise<void> { this.emit('close'); }
  async createConfirmChannel(): Promise<ConfirmChannel> {
    const channel = new WireChannel();
    this.channels.push(channel);
    return channel as unknown as ConfirmChannel;
  }
}

const options = (messageId: string, mandatory = true): RabbitMqPublishOptions => ({
  messageId, mandatory, contentType: 'application/json', deliveryMode: 2,
  correlationId: 'synthetic-correlation', type: 'synthetic', timestamp: 0, headers: {},
});

function fixture() {
  const connections: WireConnection[] = [];
  const connect = jest.fn(async () => {
    const connection = new WireConnection();
    connections.push(connection);
    return connection as unknown as ChannelModel;
  });
  const adapter = new AmqplibRabbitMqChannel({ url: 'amqp://synthetic', connect });
  return { adapter, connect, connections, channel: () => connections.at(-1)!.channels.at(-1)! };
}

const send = (adapter: AmqplibRabbitMqChannel, id: string, mandatory = true) =>
  adapter.publishAndConfirm('synthetic', 'synthetic', Buffer.from('{}'), options(id, mandatory));
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const message = (tag: number): GetMessage => ({
  fields: { deliveryTag: tag, redelivered: false, exchange: 'synthetic', routingKey: 'synthetic', messageCount: 0 },
  properties: {}, content: Buffer.from('{}'),
} as GetMessage);

describe('RabbitMQ channel generation ownership', () => {
  it('cannot confirm a lost send using a replacement channel or same-ID retry', async () => {
    const f = fixture();
    const lost = send(f.adapter, 'same-id');
    const rejected = expect(lost).rejects.toThrow('closed before confirmation');
    await flush();
    const first = f.channel();
    first.emit('close');
    const retry = send(f.adapter, 'same-id');
    await flush();
    const replacement = f.channel();
    expect(replacement).not.toBe(first);
    replacement.sends[0]!.confirm(null);
    await expect(retry).resolves.toBe(true);
    await rejected;
  });

  it('correlates concurrent out-of-order confirmations and mandatory returns', async () => {
    const f = fixture();
    const rejected = send(f.adapter, 'unroutable');
    const rejectedAssertion = expect(rejected).rejects.toThrow('mandatory publish returned');
    let acceptedFinished = false;
    const accepted = send(f.adapter, 'routable').then(() => { acceptedFinished = true; });
    await flush();
    const native = f.channel();
    native.emit('return', {
      fields: { exchange: 'synthetic', routingKey: 'synthetic', replyCode: 312, replyText: 'NO_ROUTE' },
      properties: { messageId: 'unroutable' }, content: Buffer.from('{}'),
    } as unknown as Message);
    native.sends.find((entry) => entry.options.messageId === 'routable')!.confirm(null);
    await accepted;
    expect(acceptedFinished).toBe(true);
    native.sends.find((entry) => entry.options.messageId === 'unroutable')!.confirm(null);
    await rejectedAssertion;
    expect(native.sends).toHaveLength(2);
  });

  it('allows a confirmed send with mandatory disabled and rejects a broker nack', async () => {
    const f = fixture();
    const accepted = send(f.adapter, 'non-mandatory', false);
    await flush();
    expect(f.channel().sends[0]!.options.mandatory).toBe(false);
    f.channel().sends[0]!.confirm(null);
    await expect(accepted).resolves.toBe(true);
    const rejected = send(f.adapter, 'nacked');
    const rejection = expect(rejected).rejects.toThrow('synthetic broker nack');
    await flush();
    f.channel().sends[1]!.confirm(new Error('synthetic broker nack'));
    await rejection;
  });

  it('rejects ambiguous duplicate pending identities before a second wire send', async () => {
    const f = fixture();
    const first = send(f.adapter, 'duplicate');
    await flush();
    await expect(send(f.adapter, 'duplicate')).rejects.toThrow('already pending');
    expect(f.channel().sends).toHaveLength(1);
    f.channel().sends[0]!.confirm(null);
    await first;
    const again = send(f.adapter, 'duplicate');
    await flush();
    f.channel().sends[1]!.confirm(null);
    await expect(again).resolves.toBe(true);
  });

  it('releases backpressured and synchronously failed outcomes', async () => {
    const f = fixture();
    await f.adapter.get('synthetic', { noAck: false });
    const native = f.channel();
    native.writable = false;
    const backpressured = send(f.adapter, 'same-id');
    await flush();
    await expect(send(f.adapter, 'same-id')).rejects.toThrow('already pending');
    native.sends[0]!.confirm(null);
    await expect(backpressured).resolves.toBe(false);
    const publish = jest.spyOn(native, 'publish').mockImplementationOnce(() => { throw new Error('wire failed'); });
    await expect(send(f.adapter, 'same-id')).rejects.toThrow('wire failed');
    publish.mockRestore();
    native.writable = true;
    const recovered = send(f.adapter, 'same-id');
    await flush();
    native.sends.at(-1)!.confirm(null);
    await recovered;
  });

  it('keeps a backpressured mandatory return attached to its original send', async () => {
    const f = fixture();
    await f.adapter.get('synthetic', { noAck: false });
    const native = f.channel();
    native.writable = false;
    const pending = send(f.adapter, 'same-id');
    const rejected = expect(pending).rejects.toThrow('mandatory publish returned');
    await flush();
    await expect(send(f.adapter, 'same-id')).rejects.toThrow('already pending');
    native.emit('return', { fields: { exchange: 'synthetic', routingKey: 'synthetic' },
      properties: { messageId: 'same-id' } } as Message);
    native.sends[0]!.confirm(null);
    await rejected;
    native.writable = true;
    const retry = send(f.adapter, 'same-id');
    await flush();
    native.sends[1]!.confirm(null);
    await expect(retry).resolves.toBe(true);
  });

  it('cancels unresolved confirmations and permanently prevents later sends', async () => {
    const f = fixture();
    const pending = send(f.adapter, 'cancelled');
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await flush();
    f.adapter.cancelPendingPublishes();
    await rejected;
    // A late native confirmation must be harmless after cancellation.
    f.channel().sends[0]!.confirm(null);
    await f.adapter.close();
    await expect(send(f.adapter, 'cancelled')).rejects.toThrow('cancelled');
    expect(f.connect).toHaveBeenCalledTimes(1);
  });

  it.each(['channel', 'connection'])('never settles stale delivery tags after %s closure', async (surface) => {
    const f = fixture();
    await f.adapter.get('synthetic', { noAck: false });
    const oldChannel = f.channel();
    oldChannel.deliveries.push(message(1));
    const stale = await f.adapter.get('synthetic', { noAck: false });
    if (stale === false) throw new Error('fixture delivery absent');
    if (surface === 'channel') oldChannel.emit('close');
    else f.connections[0]!.emit('error', new Error('synthetic connection failed'));
    // Settlement itself must not establish a replacement connection/channel.
    await expect(f.adapter.ack(stale)).rejects.toThrow('origin channel closed');
    await expect(f.adapter.nack(stale, false, true)).rejects.toThrow('origin channel closed');
    expect(oldChannel.ack).not.toHaveBeenCalled();
    expect(oldChannel.nack).not.toHaveBeenCalled();
    await f.adapter.get('synthetic', { noAck: false });
    const current = f.channel();
    current.deliveries.push(message(1));
    const fresh = await f.adapter.get('synthetic', { noAck: false });
    if (fresh === false) throw new Error('fixture delivery absent');
    await expect(f.adapter.ack(stale)).rejects.toThrow('origin channel closed');
    expect(current.ack).not.toHaveBeenCalled();
    await f.adapter.ack(fresh);
    expect(current.ack).toHaveBeenCalledWith(fresh);
    await expect(f.adapter.ack(fresh)).rejects.toThrow('no unsettled origin');
  });

  it('keeps an unconfirmed command in the outbox retry path', async () => {
    const f = fixture();
    const publisher = new RabbitMqQueuePublisher(f.adapter, { exchange: 'synthetic' }, new FixedClock(new Date(0)));
    const markPublished = jest.fn(async () => undefined);
    const markFailed = jest.fn(async () => undefined);
    const dispatcher = new CommandOutboxDispatcher({
      claimPending: async () => [{ id: 'synthetic-row', publishAttempt: 1,
        command: { commandId: 'outbox-command', commandType: 'synthetic',
          schemaVersion: 1, correlationId: 'synthetic', payload: {} } }],
      markPublished, markFailed,
    }, publisher, { generate: () => 'synthetic-owner' }, new FixedClock(new Date(0)));
    const pending = dispatcher.dispatchBatch(1);
    await flush();
    f.channel().emit('close');
    await expect(pending).resolves.toEqual({ published: 0, retrying: 1, failed: 0 });
    expect(markPublished).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith(expect.objectContaining({ terminal: false }));
  });
});
