import {
  connect,
  type ChannelModel,
  type ConfirmChannel,
  type GetMessage,
  type Message,
  type SocketOptions,
} from 'amqplib';

import type { RabbitMqFieldValue } from './rabbitmq-queue-arguments';
import type {
  RabbitMqExchangeType,
  RabbitMqPublishOptions,
  RabbitMqQueueChannelPort,
} from './rabbitmq-queue-publisher';

export type AmqplibRabbitMqChannelOptions = {
  readonly url: string;
  readonly socketOptions?: SocketOptions;
  readonly connect?: (
    url: string,
    socketOptions?: SocketOptions,
  ) => Promise<ChannelModel>;
};

export class AmqplibRabbitMqChannel implements RabbitMqQueueChannelPort {
  private connectionPromise: Promise<ChannelModel> | undefined;
  private channelPromise: Promise<ConfirmChannel> | undefined;
  private readonly returnedMessages: ReturnedRabbitMqMessage[] = [];

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

  async publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): Promise<boolean> {
    return (await this.channel()).publish(exchange, routingKey, content, options);
  }

  async waitForConfirms(exchange: string, routingKey: string, messageId: string): Promise<void> {
    await (await this.channel()).waitForConfirms();
    const returned = this.takeReturnedMessage(exchange, routingKey, messageId);

    if (returned !== undefined) {
      throw new Error(
        `RabbitMQ mandatory publish returned: exchange=${returned.exchange} routingKey=${returned.routingKey} messageId=${returned.messageId} replyCode=${returned.replyCode} replyText=${returned.replyText}`,
      );
    }
  }

  async get(queue: string, options: { readonly noAck: boolean }): Promise<GetMessage | false> {
    return (await this.channel()).get(queue, options);
  }

  async ack(message: Message): Promise<void> {
    (await this.channel()).ack(message);
  }

  async nack(message: Message, allUpTo: boolean, requeue: boolean): Promise<void> {
    (await this.channel()).nack(message, allUpTo, requeue);
  }

  async prefetch(count: number): Promise<unknown> {
    return (await this.channel()).prefetch(count);
  }

  async close(): Promise<void> {
    const channel = await this.channelPromise?.catch(() => undefined);
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
      channel.on('return', (message) => {
        this.returnedMessages.push(toReturnedMessage(message));
      });
      channel.on('error', () => this.invalidateChannel(pending));
      channel.on('close', () => this.invalidateChannel(pending));

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
      connection.on('error', () => this.invalidateConnection(pending));
      connection.on('close', () => this.invalidateConnection(pending));
      return connection;
    });
    this.connectionPromise = pending;
    void pending.catch(() => this.invalidateConnection(pending));

    return pending;
  }

  private invalidateChannel(pending: Promise<ConfirmChannel>): void {
    if (this.channelPromise !== pending) {
      return;
    }

    this.channelPromise = undefined;
    this.returnedMessages.length = 0;
  }

  private invalidateConnection(pending: Promise<ChannelModel>): void {
    if (this.connectionPromise !== pending) {
      return;
    }

    this.connectionPromise = undefined;
    this.channelPromise = undefined;
    this.returnedMessages.length = 0;
  }

  private takeReturnedMessage(
    exchange: string,
    routingKey: string,
    messageId: string,
  ): ReturnedRabbitMqMessage | undefined {
    const index = this.returnedMessages.findIndex((message) =>
      message.exchange === exchange &&
      message.routingKey === routingKey &&
      message.messageId === messageId,
    );

    if (index === -1) {
      return undefined;
    }

    const [message] = this.returnedMessages.splice(index, 1);

    return message;
  }
}

type ReturnedRabbitMqMessage = {
  readonly exchange: string;
  readonly routingKey: string;
  readonly messageId: string;
  readonly replyCode: string;
  readonly replyText: string;
};

const toReturnedMessage = (message: Message): ReturnedRabbitMqMessage => {
  const fields = message.fields as Message['fields'] & {
    readonly replyCode?: number;
    readonly replyText?: string;
  };

  return {
    exchange: message.fields.exchange,
    routingKey: message.fields.routingKey,
    messageId: String(message.properties.messageId ?? ''),
    replyCode: fields.replyCode === undefined ? 'unknown' : String(fields.replyCode),
    replyText: fields.replyText ?? 'unknown',
  };
};
