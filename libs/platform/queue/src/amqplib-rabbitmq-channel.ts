import { connect, type Channel, type ChannelModel, type SocketOptions } from 'amqplib';

import type {
  RabbitMqPublishOptions,
  RabbitMqQueueChannelPort,
} from './rabbitmq-queue-publisher';

export type AmqplibRabbitMqChannelOptions = {
  readonly url: string;
  readonly socketOptions?: SocketOptions;
};

export class AmqplibRabbitMqChannel implements RabbitMqQueueChannelPort {
  private connectionPromise: Promise<ChannelModel> | undefined;
  private channelPromise: Promise<Channel> | undefined;

  constructor(private readonly options: AmqplibRabbitMqChannelOptions) {
    if (options.url.trim().length === 0) {
      throw new Error('RabbitMQ URL must be non-empty');
    }
  }

  async assertExchange(
    exchange: string,
    type: 'direct' | 'topic',
    options: { readonly durable: boolean },
  ): Promise<unknown> {
    return (await this.channel()).assertExchange(exchange, type, options);
  }

  async assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, string | number | boolean>>;
    },
  ): Promise<unknown> {
    return (await this.channel()).assertQueue(queue, options);
  }

  async bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    args?: Readonly<Record<string, string | number | boolean>>,
  ): Promise<unknown> {
    return (await this.channel()).bindQueue(queue, exchange, routingKey, args);
  }

  async publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): Promise<boolean> {
    return (await this.channel()).publish(exchange, routingKey, content, options);
  }

  async close(): Promise<void> {
    const channel = await this.channelPromise?.catch(() => undefined);
    await channel?.close().catch(() => undefined);

    const connection = await this.connectionPromise?.catch(() => undefined);
    await connection?.close().catch(() => undefined);

    this.channelPromise = undefined;
    this.connectionPromise = undefined;
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private async channel(): Promise<Channel> {
    this.channelPromise ??= this.connection().then((connection) => connection.createChannel());

    return this.channelPromise;
  }

  private async connection(): Promise<ChannelModel> {
    this.connectionPromise ??= connect(this.options.url, this.options.socketOptions);

    return this.connectionPromise;
  }
}
