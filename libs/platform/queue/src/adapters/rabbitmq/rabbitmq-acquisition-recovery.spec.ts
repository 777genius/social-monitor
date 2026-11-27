import { EventEmitter } from 'node:events';
import type { ChannelModel, ConfirmChannel } from 'amqplib';

import { AmqplibRabbitMqChannel } from './amqplib-rabbitmq-channel';
import type { RabbitMqPublishOptions } from './rabbitmq-queue-publisher';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

class AcquiredChannel extends EventEmitter {
  readonly close = jest.fn(async () => { this.emit('close'); });
  readonly publish = jest.fn((_exchange: string, _route: string, _content: Buffer,
    _options: RabbitMqPublishOptions, confirm: (error: Error | null) => void) => {
    confirm(null);
    return true;
  });
}

class AcquiredConnection extends EventEmitter {
  readonly close = jest.fn(async () => { this.emit('close'); });
  readonly createConfirmChannel: jest.Mock<Promise<ConfirmChannel>, []>;
  readonly channelRequested = deferred<void>();

  constructor(channel: Promise<ConfirmChannel>) {
    super();
    this.createConfirmChannel = jest.fn(() => {
      this.channelRequested.resolve(undefined);
      return channel;
    });
  }
}

const options: RabbitMqPublishOptions = {
  messageId: 'synthetic', mandatory: true, contentType: 'application/json', deliveryMode: 2,
  correlationId: 'synthetic-correlation', type: 'synthetic', timestamp: 0, headers: {},
};
const send = (adapter: AmqplibRabbitMqChannel, id = 'synthetic') => {
  const pending = adapter.publishAndConfirm('synthetic', 'synthetic', Buffer.from('{}'), {
    ...options, messageId: id,
  });
  void pending.catch(() => undefined);
  return pending;
};

describe('RabbitMQ acquisition failures and replacement ownership', () => {
  it('bounds admission before connecting and releases a failed acquisition slot', async () => {
    const connecting = deferred<ChannelModel>();
    const native = new AcquiredChannel();
    const recovered = new AcquiredConnection(Promise.resolve(native as unknown as ConfirmChannel));
    const connect = jest.fn<Promise<ChannelModel>, []>()
      .mockReturnValueOnce(connecting.promise)
      .mockResolvedValueOnce(recovered as unknown as ChannelModel);
    const adapter = new AmqplibRabbitMqChannel({
      url: 'amqp://synthetic', connect, maxPendingPublishes: 1,
    });
    try {
      const first = send(adapter);
      await expect(send(adapter, 'excess')).rejects.toMatchObject({ code: 'operation.backpressure' });
      expect(connect).toHaveBeenCalledTimes(1);
      connecting.reject(new Error('connection unavailable'));
      await expect(first).rejects.toThrow('connection unavailable');
      await expect(send(adapter, 'recovered')).resolves.toBe(true);
      expect(connect).toHaveBeenCalledTimes(2);
      expect(native.publish).toHaveBeenCalledTimes(1);
    } finally {
      connecting.resolve(recovered as unknown as ChannelModel);
      await adapter.onApplicationShutdown();
    }
  });

  it('rejects a late channel from a closed connection without retiring the replacement', async () => {
    const creating = deferred<ConfirmChannel>();
    const oldNative = new AcquiredChannel();
    const freshNative = new AcquiredChannel();
    const oldConnection = new AcquiredConnection(creating.promise);
    const freshConnection = new AcquiredConnection(Promise.resolve(freshNative as unknown as ConfirmChannel));
    const connect = jest.fn<Promise<ChannelModel>, []>()
      .mockResolvedValueOnce(oldConnection as unknown as ChannelModel)
      .mockResolvedValueOnce(freshConnection as unknown as ChannelModel);
    const adapter = new AmqplibRabbitMqChannel({ url: 'amqp://synthetic', connect });
    try {
      const old = send(adapter, 'old');
      await oldConnection.channelRequested.promise;
      expect(oldConnection.createConfirmChannel).toHaveBeenCalledTimes(1);
      oldConnection.emit('close');
      await expect(send(adapter, 'replacement')).resolves.toBe(true);
      creating.resolve(oldNative as unknown as ConfirmChannel);
      await expect(old).rejects.toThrow('closed during channel creation');
      oldNative.emit('close');
      expect(oldNative.publish).not.toHaveBeenCalled();
      expect(freshNative.close).not.toHaveBeenCalled();
      expect(freshConnection.close).not.toHaveBeenCalled();
      await expect(send(adapter, 'replacement-still-usable')).resolves.toBe(true);
      expect(freshNative.publish).toHaveBeenCalledTimes(2);
      expect(connect).toHaveBeenCalledTimes(2);
    } finally {
      creating.resolve(oldNative as unknown as ConfirmChannel);
      await adapter.onApplicationShutdown();
    }
  });

  it('prevents publication when shutdown occurs during an unresolved connection', async () => {
    const connecting = deferred<ChannelModel>();
    const native = new AcquiredChannel();
    const connection = new AcquiredConnection(Promise.resolve(native as unknown as ConfirmChannel));
    const connect = jest.fn(() => connecting.promise);
    const adapter = new AmqplibRabbitMqChannel({ url: 'amqp://synthetic', connect });
    const pending = send(adapter);
    const rejected = expect(pending).rejects.toThrow(/cancelled|closed during channel creation/);
    const closing = adapter.onApplicationShutdown();
    connecting.resolve(connection as unknown as ChannelModel);
    await closing;
    await rejected;
    expect(native.publish).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledTimes(1);
    await expect(send(adapter, 'late')).rejects.toThrow('cancelled');
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
