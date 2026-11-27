import { EventEmitter } from 'node:events';
import type { ChannelModel, ConfirmChannel, GetMessage } from 'amqplib';
import { FixedClock } from '@social-monitor/shared-kernel';

import { AmqplibRabbitMqChannel, type AmqplibRabbitMqChannelOptions } from './amqplib-rabbitmq-channel';
import { RabbitMqQueuePublisher, type RabbitMqPublishOptions } from './rabbitmq-queue-publisher';

class ProgressChannel extends EventEmitter {
  readonly sends: Array<{ id: string; confirm: (error: Error | null) => void }> = [];
  readonly deliveries: GetMessage[] = [];
  readonly ack = jest.fn();
  async get(): Promise<GetMessage | false> { return this.deliveries.shift() ?? false; }
  writable = true;
  readonly assertExchange = jest.fn(async () => undefined);
  readonly assertQueue = jest.fn(async () => undefined);
  readonly bindQueue = jest.fn(async () => undefined);
  readonly close = jest.fn(async () => { this.emit('close'); });

  publish(_exchange: string, _route: string, _content: Buffer, options: RabbitMqPublishOptions,
    confirm: (error: Error | null) => void): boolean {
    this.sends.push({ id: options.messageId, confirm });
    this.emit('sent');
    return this.writable;
  }

  async waitForSends(count: number): Promise<void> {
    while (this.sends.length < count) {
      await new Promise<void>((resolve) => { this.once('sent', resolve); });
    }
  }
}

class ProgressConnection extends EventEmitter {
  readonly channels: ProgressChannel[] = [];
  readonly close = jest.fn(async () => { this.emit('close'); });
  async createConfirmChannel(): Promise<ConfirmChannel> {
    const channel = new ProgressChannel();
    this.channels.push(channel);
    return channel as unknown as ConfirmChannel;
  }
}

const options = (messageId: string): RabbitMqPublishOptions => ({
  messageId, mandatory: true, contentType: 'application/json', deliveryMode: 2,
  correlationId: 'synthetic-correlation', type: 'synthetic', timestamp: 0, headers: {},
});
const observed = <T>(promise: Promise<T>): Promise<T> => {
  void promise.catch(() => undefined);
  return promise;
};
const adapters: AmqplibRabbitMqChannel[] = [];

function fixture(bounds: Partial<Pick<AmqplibRabbitMqChannelOptions,
  'confirmationTimeoutMs' | 'flowControlTimeoutMs' | 'maxPendingPublishes'>> = {}) {
  const connections: ProgressConnection[] = [];
  const connect = jest.fn(async () => {
    const connection = new ProgressConnection();
    connections.push(connection);
    return connection as unknown as ChannelModel;
  });
  const adapter = new AmqplibRabbitMqChannel({ url: 'amqp://synthetic', connect, ...bounds });
  adapters.push(adapter);
  const publisher = new RabbitMqQueuePublisher(adapter, { exchange: 'synthetic' }, new FixedClock(new Date(0)));
  return {
    adapter, publisher, connect, connections,
    native: () => connections.at(-1)!.channels.at(-1)!,
    open: () => adapter.assertExchange('synthetic', 'direct', { durable: true }),
    send: (id: string) => observed(adapter.publishAndConfirm('synthetic', 'synthetic', Buffer.from('{}'), options(id))),
    command: (id: string) => observed(publisher.publish({
      commandId: id, commandType: 'synthetic', schemaVersion: 1, correlationId: 'synthetic', payload: {},
    })),
  };
}

describe('RabbitMQ bounded publisher progress', () => {
  afterEach(async () => {
    await Promise.all(adapters.splice(0).map((adapter) => adapter.onApplicationShutdown()));
    jest.useRealTimers();
  });

  it('completes a confirmed command exactly once when the native buffer reports false', async () => {
    const f = fixture();
    await f.open();
    const native = f.native();
    native.writable = false;
    const pending = f.command('confirmed-buffer-full');
    await native.waitForSends(1);
    native.sends[0]!.confirm(null);
    await expect(pending).resolves.toBeUndefined();
    expect(native.sends.map((send) => send.id)).toEqual(['confirmed-buffer-full']);
  });

  it('rejects new work while flow is blocked and resumes on the native drain event', async () => {
    const f = fixture();
    await f.open();
    const native = f.native();
    native.writable = false;
    const first = f.send('first');
    await native.waitForSends(1);
    native.sends[0]!.confirm(null);
    await expect(first).resolves.toBe(false);
    await expect(f.send('blocked')).rejects.toMatchObject({ code: 'operation.backpressure' });
    expect(native.sends).toHaveLength(1);
    native.writable = true;
    native.emit('drain');
    const next = f.send('resumed');
    await native.waitForSends(2);
    native.sends[1]!.confirm(null);
    await expect(next).resolves.toBe(true);
  });

  it('retires a stalled confirmation and never lets a late old confirm settle a same-ID retry', async () => {
    jest.useFakeTimers();
    const f = fixture({ confirmationTimeoutMs: 25 });
    await f.open();
    const origin = f.native();
    const first = f.send('same-id');
    const failed = expect(first).rejects.toThrow('confirmation timed out');
    await origin.waitForSends(1);
    await jest.advanceTimersByTimeAsync(25);
    await failed;
    expect(origin.close).toHaveBeenCalledTimes(1);
    await f.open();
    const replacement = f.native();
    expect(replacement).not.toBe(origin);
    let retrySettled = false;
    const retry = observed(f.send('same-id').then((result) => { retrySettled = true; return result; }));
    await replacement.waitForSends(1);
    origin.sends[0]!.confirm(null);
    await Promise.resolve();
    expect(retrySettled).toBe(false);
    replacement.sends[0]!.confirm(null);
    await expect(retry).resolves.toBe(true);
  });

  it('recovers a confirmed but permanently full buffer without affecting the completed send', async () => {
    jest.useFakeTimers();
    const f = fixture({ flowControlTimeoutMs: 25 });
    await f.open();
    const origin = f.native();
    origin.writable = false;
    const first = f.send('already-confirmed');
    await origin.waitForSends(1);
    origin.sends[0]!.confirm(null);
    await expect(first).resolves.toBe(false);
    await jest.advanceTimersByTimeAsync(25);
    expect(origin.close).toHaveBeenCalledTimes(1);
    await f.open();
    const replacement = f.native();
    const next = f.send('after-stall');
    await replacement.waitForSends(1);
    replacement.sends[0]!.confirm(null);
    await expect(next).resolves.toBe(true);
  });

  it('clears the flow deadline on drain and reuses the healthy origin', async () => {
    jest.useFakeTimers();
    const f = fixture({ flowControlTimeoutMs: 25 });
    await f.open();
    const native = f.native();
    native.writable = false;
    const first = f.send('buffer-full');
    await native.waitForSends(1);
    native.sends[0]!.confirm(null);
    await first;
    native.writable = true;
    native.emit('drain');
    await jest.advanceTimersByTimeAsync(50);
    expect(native.close).not.toHaveBeenCalled();
    const next = f.send('after-drain');
    await native.waitForSends(2);
    native.sends[1]!.confirm(null);
    await expect(next).resolves.toBe(true);
  });

  it('bounds unconfirmed publications without enqueueing excess payloads, then releases capacity', async () => {
    const f = fixture({ maxPendingPublishes: 1 });
    await f.open();
    const native = f.native();
    const first = f.send('first');
    await native.waitForSends(1);
    await expect(f.send('excess')).rejects.toMatchObject({ code: 'operation.backpressure' });
    expect(native.sends).toHaveLength(1);
    native.sends[0]!.confirm(null);
    await first;
    const next = f.send('next');
    await native.waitForSends(2);
    native.sends[1]!.confirm(null);
    await expect(next).resolves.toBe(true);
  });

  it('coalesces route declarations per native channel and reasserts after reconnect', async () => {
    const f = fixture();
    await f.open();
    const origin = f.native();
    const both = observed(Promise.all([f.command('one'), f.command('two')]));
    await origin.waitForSends(2);
    expect(origin.assertExchange).toHaveBeenCalledTimes(1);
    expect(origin.assertQueue).toHaveBeenCalledTimes(1);
    expect(origin.bindQueue).toHaveBeenCalledTimes(1);
    for (const send of origin.sends) send.confirm(null);
    await both;
    f.connections[0]!.emit('close');
    await f.open();
    const replacement = f.native();
    const third = f.command('three');
    await replacement.waitForSends(1);
    expect(replacement.assertExchange).toHaveBeenCalledTimes(1);
    expect(replacement.assertQueue).toHaveBeenCalledTimes(1);
    expect(replacement.bindQueue).toHaveBeenCalledTimes(1);
    replacement.sends[0]!.confirm(null);
    await third;
  });

  it('retries a failed declaration without retaining a rejected cache entry', async () => {
    const f = fixture();
    await f.open();
    const native = f.native();
    native.assertQueue.mockRejectedValueOnce(new Error('synthetic declaration failed'));
    await expect(f.command('failed-declaration')).rejects.toThrow('synthetic declaration failed');
    expect(native.sends).toHaveLength(0);
    const retry = f.command('after-declaration');
    await native.waitForSends(1);
    expect(native.assertQueue).toHaveBeenCalledTimes(2);
    native.sends[0]!.confirm(null);
    await retry;
  });

  it('keeps distinct declaration arguments visible to the broker', async () => {
    const f = fixture();
    await f.open();
    const native = f.native();
    await f.adapter.assertQueue('synthetic', { durable: true });
    await f.adapter.assertQueue('synthetic', { durable: false });
    expect(native.assertQueue).toHaveBeenCalledTimes(2);
    expect(native.assertQueue).toHaveBeenNthCalledWith(2, 'synthetic', { durable: false });
  });

  it('closes only the captured connection when replacement work begins during cleanup', async () => {
    const f = fixture();
    await f.open();
    const origin = f.native();
    let finish!: () => void;
    origin.close.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const closing = f.adapter.close();
    // close() detaches before yielding, so this opens a separate connection.
    await f.open();
    const replacement = f.native();
    expect(replacement).not.toBe(origin);
    const pending = f.send('replacement');
    await replacement.waitForSends(1);
    finish();
    await closing;
    expect(f.connections[0]!.close).toHaveBeenCalledTimes(1);
    expect(f.connections[1]!.close).not.toHaveBeenCalled();
    expect(replacement.close).not.toHaveBeenCalled();
    replacement.sends[0]!.confirm(null);
    await expect(pending).resolves.toBe(true);
  });


  it('retains delivery ownership when publication timeout retires an origin whose close fails', async () => {
    jest.useFakeTimers();
    const f = fixture({ confirmationTimeoutMs: 25 });
    await f.open();
    const origin = f.native();
    origin.deliveries.push({
      fields: { deliveryTag: 1, redelivered: false, exchange: 'synthetic', routingKey: 'synthetic', messageCount: 0 },
      properties: {}, content: Buffer.from('{}'),
    } as GetMessage);
    const delivery = await f.adapter.get('synthetic', { noAck: false });
    if (delivery === false) throw new Error('Synthetic delivery absent');
    origin.close.mockRejectedValueOnce(new Error('native close did not complete'));
    const stalled = f.send('stalled');
    const rejected = expect(stalled).rejects.toThrow('confirmation timed out');
    await origin.waitForSends(1);
    await jest.advanceTimersByTimeAsync(25);
    await rejected;
    expect(origin.close).toHaveBeenCalledTimes(1);

    await f.open();
    const replacement = f.native();
    const next = f.send('healthy-replacement');
    await replacement.waitForSends(1);
    // Failed timeout cleanup must remain retryable for the captured delivery.
    await f.adapter.recoverDelivery(delivery);
    expect(origin.close).toHaveBeenCalledTimes(2);
    expect(replacement.close).not.toHaveBeenCalled();
    replacement.sends[0]!.confirm(null);
    await expect(next).resolves.toBe(true);
    await expect(f.adapter.ack(delivery)).rejects.toThrow('no unsettled origin');
  });

  it('cancels deadlines and prevents reconnect after application shutdown', async () => {
    jest.useFakeTimers();
    const f = fixture({ confirmationTimeoutMs: 25, flowControlTimeoutMs: 25 });
    await f.open();
    const native = f.native();
    native.writable = false;
    const pending = f.send('shutdown');
    const rejected = expect(pending).rejects.toThrow('cancelled');
    await native.waitForSends(1);
    await f.adapter.onApplicationShutdown();
    await rejected;
    await jest.advanceTimersByTimeAsync(100);
    native.sends[0]!.confirm(null);
    expect(native.close).toHaveBeenCalledTimes(1);
    await expect(f.send('late')).rejects.toThrow('cancelled');
    await expect(f.open()).rejects.toThrow('shutting down');
    expect(f.connect).toHaveBeenCalledTimes(1);
  });
});
