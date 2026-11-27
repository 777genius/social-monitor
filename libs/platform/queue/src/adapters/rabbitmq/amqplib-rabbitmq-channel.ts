import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type GetMessage,
  type Message,
  type SocketOptions,
} from 'amqplib';

import { DomainError } from '@social-monitor/shared-kernel';

import type { RabbitMqFieldValue } from './rabbitmq-queue-arguments';
import { RabbitMqPublicationTracker } from './rabbitmq-publication-tracker';
import type {
  RabbitMqExchangeType,
  RabbitMqPublishOptions,
  RabbitMqQueueChannelPort,
} from './rabbitmq-queue-publisher';

export type AmqplibRabbitMqChannelOptions = {
  readonly url: string;
  readonly socketOptions?: SocketOptions;
  readonly confirmationTimeoutMs?: number;
  readonly flowControlTimeoutMs?: number;
  readonly maxPendingPublishes?: number;
  /** Optional synchronous authority check immediately before handing bytes to amqplib. */
  readonly beforePublish?: () => void;
  readonly connect?: (
    url: string,
    socketOptions?: SocketOptions,
  ) => Promise<ChannelModel>;
};

export class AmqplibRabbitMqChannel implements RabbitMqQueueChannelPort {
  private connectionPromise: Promise<ChannelModel> | undefined;
  private channelPromise: Promise<ConfirmChannel> | undefined;
  private readonly publications: RabbitMqPublicationTracker;
  private readonly maxPendingPublishes: number;
  private activePublishes = 0;
  private shuttingDown = false;
  private readonly declarations = new WeakMap<ConfirmChannel, Map<string, Promise<unknown>>>();
  private readonly channelConnections = new WeakMap<ConfirmChannel, ChannelModel>();
  private readonly deliveryChannels = new WeakMap<Message, ConfirmChannel>();
  private readonly channelOrigins = new WeakMap<ConfirmChannel, Promise<ConfirmChannel>>();
  private readonly originRecovery = new WeakMap<ConfirmChannel, Promise<void>>();
  private readonly connectionChannels = new WeakMap<ChannelModel, Set<ConfirmChannel>>();
  private readonly closedConnections = new WeakSet<ChannelModel>();
  private publishesCancelled = false;

  constructor(private readonly options: AmqplibRabbitMqChannelOptions) {
    if (options.url.trim().length === 0) {
      throw new Error('RabbitMQ URL must be non-empty');
    }
    this.maxPendingPublishes = positiveBound(options.maxPendingPublishes, 128, 'pending publications');
    this.publications = new RabbitMqPublicationTracker({
      confirmationTimeoutMs: positiveBound(options.confirmationTimeoutMs, 30_000, 'confirmation timeout', 2_147_483_647),
      flowControlTimeoutMs: positiveBound(options.flowControlTimeoutMs, 30_000, 'flow control timeout', 2_147_483_647),
      retireChannel: (channel) => this.retirePublicationChannel(channel),
    });
  }

  async assertExchange(
    exchange: string,
    type: RabbitMqExchangeType,
    options: { readonly durable: boolean },
  ): Promise<unknown> {
    const channel = await this.channel();
    return this.declare(channel, JSON.stringify(['exchange', exchange, type, options]),
      () => channel.assertExchange(exchange, type, options));
  }

  async assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, RabbitMqFieldValue>>;
    },
  ): Promise<unknown> {
    const channel = await this.channel();
    return this.declare(channel, JSON.stringify(['queue', queue, options]),
      () => channel.assertQueue(queue, options));
  }

  async bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    args?: Readonly<Record<string, RabbitMqFieldValue>>,
  ): Promise<unknown> {
    const channel = await this.channel();
    return this.declare(channel, JSON.stringify(['binding', queue, exchange, routingKey, args]),
      () => channel.bindQueue(queue, exchange, routingKey, args));
  }

  async publishAndConfirm(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): Promise<boolean> {
    this.assertPublishAllowed();
    if (this.activePublishes >= this.maxPendingPublishes) {
      throw new DomainError('operation.backpressure', 'RabbitMQ pending publication capacity reached');
    }
    this.activePublishes += 1;
    try {
      const channel = await this.channel();
      // No await between the terminal authority guard and handing bytes to amqplib.
      this.assertPublishAllowed();
      this.options.beforePublish?.();
      this.assertPublishAllowed();
      return await this.publications.publishAndConfirm(channel, exchange, routingKey, content, options);
    } finally {
      this.activePublishes -= 1;
    }
  }

  /** Synchronously and permanently inhibits future sends, including pending
   * connect/assert/channel creation continuations. close/reconnect never resets it.
   * Does not claim to retract bytes already handed to the wire library. */
  cancelPendingPublishes(): void {
    this.publishesCancelled = true;
    this.publications.cancel();
  }

  private assertPublishAllowed(): void {
    if (this.publishesCancelled) throw new Error('RabbitMQ publishing cancelled');
  }

  async get(queue: string, options: { readonly noAck: boolean }): Promise<GetMessage | false> {
    const channel = await this.channel();
    const message = await channel.get(queue, options);
    if (message !== false && !options.noAck) this.deliveryChannels.set(message, channel);
    return message;
  }

  async ack(message: Message): Promise<void> {
    this.deliveryChannel(message).ack(message);
    this.deliveryChannels.delete(message);
  }

  async nack(message: Message, allUpTo: boolean, requeue: boolean): Promise<void> {
    this.deliveryChannel(message).nack(message, allUpTo, requeue);
    this.deliveryChannels.delete(message);
  }

  /** Requeue uncertainty belongs to the native acquisition channel. A reconnect
   * may already exist, so neither channel() nor close() is safe here. */
  async recoverDelivery(message: Message): Promise<void> {
    const origin = this.deliveryChannels.get(message);
    if (origin === undefined) throw new Error('RabbitMQ delivery has no unsettled origin channel');
    if (!this.publications.isClosed(origin)) {
      let recovery = this.originRecovery.get(origin);
      if (recovery === undefined) {
        recovery = this.closeDeliveryOrigin(origin).finally(() => { this.originRecovery.delete(origin); });
        this.originRecovery.set(origin, recovery);
      }
      await recovery;
    }
    this.deliveryChannels.delete(message);
  }

  private async closeDeliveryOrigin(origin: ConfirmChannel): Promise<void> {
    try {
      await origin.close();
    } catch (error) {
      // A native close/error event independently proves this origin is gone.
      // Otherwise retain its authority and allow a later cleanup retry.
      if (!this.publications.isClosed(origin)) throw error;
    }
    const pending = this.channelOrigins.get(origin);
    if (pending === undefined) this.publications.close(origin);
    else this.invalidateChannel(pending, origin);
  }

  private deliveryChannel(message: Message): ConfirmChannel {
    const channel = this.deliveryChannels.get(message);
    if (channel === undefined) throw new Error('RabbitMQ delivery has no unsettled origin channel');
    if (this.publications.isClosed(channel)) throw new Error('RabbitMQ delivery origin channel closed');
    return channel;
  }

  async prefetch(count: number): Promise<unknown> {
    return (await this.channel()).prefetch(count);
  }

  async close(): Promise<void> {
    // Detach synchronously. A concurrent caller may establish a new generation;
    // cleanup must never reread and close that caller's replacement.
    const pendingChannel = this.channelPromise;
    const pendingConnection = this.connectionPromise;
    this.channelPromise = undefined;
    this.connectionPromise = undefined;
    const channel = await pendingChannel?.catch(() => undefined);
    if (channel !== undefined && pendingChannel !== undefined) {
      this.invalidateChannel(pendingChannel, channel);
      await channel.close().catch(() => undefined);
    }
    const connection = await pendingConnection?.catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }

  async onApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    this.cancelPendingPublishes();
    await this.close();
  }

  private declare(channel: ConfirmChannel, key: string, operation: () => Promise<unknown>): Promise<unknown> {
    let declarations = this.declarations.get(channel);
    if (declarations === undefined) {
      declarations = new Map();
      this.declarations.set(channel, declarations);
    }
    const existing = declarations.get(key);
    if (existing !== undefined) return existing;
    const owned = declarations;
    const pending = Promise.resolve().then(operation);
    owned.set(key, pending);
    void pending.catch(() => {
      if (owned.get(key) === pending) owned.delete(key);
    });
    return pending;
  }

  private retirePublicationChannel(channel: ConfirmChannel): void {
    if (this.publications.isClosed(channel)) return;
    const origin = this.channelOrigins.get(channel);
    if (origin !== undefined) this.invalidateChannel(origin, channel);
    else this.publications.close(channel);
    // Native close retires the affected origin only; reconnect never waits on it.
    void channel.close().catch(() => undefined);
  }

  private async channel(): Promise<ConfirmChannel> {
    if (this.shuttingDown) throw new Error('RabbitMQ channel is shutting down');
    const active = this.channelPromise;
    if (active !== undefined) {
      return active;
    }

    const pending = this.connection().then(async (connection) => {
      const channel = await connection.createConfirmChannel();
      this.channelOrigins.set(channel, pending);
      this.channelConnections.set(channel, connection);
      this.connectionChannels.get(connection)?.add(channel);
      channel.on('return', (message) => {
        this.publications.returned(channel, message);
      });
      channel.on('drain', () => this.publications.drained(channel));
      channel.on('error', () => this.invalidateChannel(pending, channel));
      channel.on('close', () => this.invalidateChannel(pending, channel));
      if (this.closedConnections.has(connection) || this.shuttingDown) {
        this.retirePublicationChannel(channel);
        throw new Error('RabbitMQ connection closed during channel creation');
      }
      return channel;
    });
    this.channelPromise = pending;
    void pending.catch(() => this.invalidateChannel(pending));

    return pending;
  }

  private async connection(): Promise<ChannelModel> {
    const active = this.connectionPromise;
    if (active !== undefined) {
      return active;
    }

    const connectToBroker = this.options.connect ?? connect;
    const pending = connectToBroker(
      this.options.url,
      this.options.socketOptions,
    ).then((connection) => {
      this.connectionChannels.set(connection, new Set());
      connection.on('error', () => this.invalidateConnection(pending, connection));
      connection.on('close', () => this.invalidateConnection(pending, connection));
      return connection;
    });
    this.connectionPromise = pending;
    void pending.catch(() => this.invalidateConnection(pending));

    return pending;
  }

  private invalidateChannel(pending: Promise<ConfirmChannel>, channel?: ConfirmChannel): void {
    if (channel !== undefined) {
      this.publications.close(channel);
      this.declarations.delete(channel);
      const connection = this.channelConnections.get(channel);
      if (connection !== undefined) this.connectionChannels.get(connection)?.delete(channel);
    }
    if (this.channelPromise !== pending) {
      return;
    }

    this.channelPromise = undefined;
  }

  private invalidateConnection(pending: Promise<ChannelModel>, connection?: ChannelModel): void {
    if (connection !== undefined) {
      this.closedConnections.add(connection);
      const channels = this.connectionChannels.get(connection);
      for (const channel of channels ?? []) {
        this.publications.close(channel);
        this.declarations.delete(channel);
      }
      channels?.clear();
    }
    if (this.connectionPromise !== pending) {
      return;
    }

    this.connectionPromise = undefined;
    const channel = this.channelPromise;
    this.channelPromise = undefined;
    void channel?.then((resolved) => this.publications.close(resolved)).catch(() => undefined);
  }
}

const positiveBound = (value: number | undefined, fallback: number, label: string,
  maximum = Number.MAX_SAFE_INTEGER): number => {
  const bound = value ?? fallback;
  if (!Number.isSafeInteger(bound) || bound <= 0 || bound > maximum) {
    throw new Error('RabbitMQ ' + label + ' must be a positive bounded integer');
  }
  return bound;
};
