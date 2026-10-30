import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type GetMessage,
  type Message,
  type SocketOptions,
} from 'amqplib';

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
  private readonly publications = new RabbitMqPublicationTracker();
  private readonly deliveryChannels = new WeakMap<Message, ConfirmChannel>();
  private readonly connectionChannels = new WeakMap<ChannelModel, Set<ConfirmChannel>>();
  private readonly closedConnections = new WeakSet<ChannelModel>();
  private publishesCancelled = false;

  constructor(private readonly options: AmqplibRabbitMqChannelOptions) {
    if (options.url.trim().length === 0) {
      throw new Error('RabbitMQ URL must be non-empty');
    }
  }

  async assertExchange(
    exchange: string,
    type: RabbitMqExchangeType,
    options: { readonly durable: boolean },
  ): Promise<unknown> {
    return (await this.channel()).assertExchange(exchange, type, options);
  }

  async assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, RabbitMqFieldValue>>;
    },
  ): Promise<unknown> {
    return (await this.channel()).assertQueue(queue, options);
  }

  async bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    args?: Readonly<Record<string, RabbitMqFieldValue>>,
  ): Promise<unknown> {
    return (await this.channel()).bindQueue(queue, exchange, routingKey, args);
  }

  async publishAndConfirm(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): Promise<boolean> {
    this.assertPublishAllowed();
    const channel = await this.channel();
    // No await between this terminal guard and the wire-library call. A send
    // already handed to amqplib cannot be recalled; its outcome remains uncertain.
    this.assertPublishAllowed();
    this.options.beforePublish?.();
    this.assertPublishAllowed();
    return this.publications.publishAndConfirm(channel, exchange, routingKey, content, options);
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
    const channel = await this.channelPromise?.catch(() => undefined);
    if (channel !== undefined) this.publications.close(channel);
    await channel?.close().catch(() => undefined);

    const connection = await this.connectionPromise?.catch(() => undefined);
    await connection?.close().catch(() => undefined);

    this.channelPromise = undefined;
    this.connectionPromise = undefined;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.close();
  }

  private async channel(): Promise<ConfirmChannel> {
    const active = this.channelPromise;
    if (active !== undefined) {
      return active;
    }

    const pending = this.connection().then(async (connection) => {
      const channel = await connection.createConfirmChannel();
      this.connectionChannels.get(connection)?.add(channel);
      if (this.closedConnections.has(connection)) this.publications.close(channel);
      channel.on('return', (message) => {
        this.publications.returned(channel, message);
      });
      channel.on('error', () => this.invalidateChannel(pending, channel));
      channel.on('close', () => this.invalidateChannel(pending, channel));

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
    if (channel !== undefined) this.publications.close(channel);
    if (this.channelPromise !== pending) {
      return;
    }

    this.channelPromise = undefined;
  }

  private invalidateConnection(pending: Promise<ChannelModel>, connection?: ChannelModel): void {
    if (connection !== undefined) {
      this.closedConnections.add(connection);
      for (const channel of this.connectionChannels.get(connection) ?? []) {
        this.publications.close(channel);
      }
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
