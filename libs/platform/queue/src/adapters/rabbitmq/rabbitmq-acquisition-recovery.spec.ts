import { EventEmitter, once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import type { ChannelModel, ConfirmChannel, SocketOptions } from 'amqplib';

import { AmqplibRabbitMqChannel } from './amqplib-rabbitmq-channel';
import type { RabbitMqPublishOptions } from './rabbitmq-queue-publisher';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

const silentAmqpPeer = async (safetyTimeoutMs: number) => {
  const sockets = new Set<Socket>();
  const received: Buffer[][] = [];
  const server = createServer((socket) => {
    sockets.add(socket);
    const chunks: Buffer[] = [];
    received.push(chunks);
    socket.on('data', (chunk: Buffer) => { chunks.push(chunk); });
    socket.on('error', () => undefined);
    socket.once('close', () => sockets.delete(socket));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP listener');
  let safetyExpired = false;
  // The unpatched client has no deadline. Close its peer before Jest's limit
  // so a regression fails with a socket-close error and still releases handles.
  const safety = setTimeout(() => {
    safetyExpired = true;
    for (const socket of sockets) socket.destroy();
  }, safetyTimeoutMs);
  return {
    url: 'amqp://127.0.0.1:' + address.port,
    get headers(): string[] { return received.map((chunks) => Buffer.concat(chunks).toString('hex')); },
    get safetyExpired(): boolean { return safetyExpired; },
    async close(): Promise<void> {
      clearTimeout(safety);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error) reject(error); else resolve(); });
      });
    },
  };
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
  it('times out a silent real TCP peer with the default connection options', async () => {
    const peer = await silentAmqpPeer(35_000);
    const adapter = new AmqplibRabbitMqChannel({ url: peer.url });
    try {
      await expect(adapter.assertExchange('synthetic', 'topic', { durable: true }))
        .rejects.toThrow('connect ETIMEDOUT');
      expect(peer.headers).toEqual(['414d515000000901']);
      expect(peer.safetyExpired).toBe(false);
    } finally {
      await peer.close();
      await adapter.onApplicationShutdown();
    }
  }, 45_000);

  it('retries a fresh native connection after an explicit handshake timeout', async () => {
    const peer = await silentAmqpPeer(2_000);
    const adapter = new AmqplibRabbitMqChannel({ url: peer.url, socketOptions: { timeout: 200 } });
    try {
      await expect(adapter.assertExchange('synthetic', 'topic', { durable: true }))
        .rejects.toThrow('connect ETIMEDOUT');
      await expect(adapter.assertExchange('synthetic', 'topic', { durable: true }))
        .rejects.toThrow('connect ETIMEDOUT');
      expect(peer.headers).toEqual(['414d515000000901', '414d515000000901']);
      expect(peer.safetyExpired).toBe(false);
    } finally {
      await peer.close();
      await adapter.onApplicationShutdown();
    }
  });

  it.each([undefined, 75, 0])('preserves socket options with timeout %s', async (timeout) => {
    const socketOptions: SocketOptions = Object.freeze({
      ...(timeout === undefined ? {} : { timeout }),
      noDelay: true, keepAlive: true, clientProperties: { connection_name: 'synthetic' },
    });
    const connect = jest.fn<Promise<ChannelModel>, [string, SocketOptions?]>()
      .mockRejectedValue(new Error('synthetic acquisition failure'));
    const adapter = new AmqplibRabbitMqChannel({ url: 'amqp://synthetic', socketOptions, connect });
    try {
      await expect(adapter.assertExchange('synthetic', 'topic', { durable: true }))
        .rejects.toThrow('synthetic acquisition failure');
      expect(connect).toHaveBeenCalledWith('amqp://synthetic', {
        ...socketOptions, timeout: timeout ?? 30_000,
      });
      expect(socketOptions.timeout).toBe(timeout);
    } finally {
      await adapter.onApplicationShutdown();
    }
  });

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
