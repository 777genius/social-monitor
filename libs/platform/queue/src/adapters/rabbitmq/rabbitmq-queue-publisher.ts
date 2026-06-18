import type { Clock } from '@social-monitor/shared-kernel';

import type { QueueCommandEnvelope, QueuePublisherPort } from '../../queue-command';
import {
  rabbitMqDurableQueueArguments,
  type RabbitMqFieldValue,
  type RabbitMqQueueType,
} from './rabbitmq-queue-arguments';

export type RabbitMqExchangeType = 'direct' | 'fanout' | 'topic';

export type RabbitMqQueueRoute = {
  readonly queue: string;
  readonly routingKey: string;
  readonly durable?: boolean;
  readonly deadLetterExchange?: string;
  readonly deadLetterExchangeType?: RabbitMqExchangeType;
  readonly headers?: Readonly<Record<string, RabbitMqFieldValue>>;
  readonly queueType?: RabbitMqQueueType;
  readonly deliveryLimit?: number;
};

export type RabbitMqQueuePublisherOptions = {
  readonly exchange: string;
  readonly exchangeType?: RabbitMqExchangeType;
  readonly durable?: boolean;
  readonly persistent?: boolean;
  readonly mandatory?: boolean;
  readonly contentType?: string;
  readonly maxPayloadBytes?: number;
  readonly defaultQueuePrefix?: string;
  readonly routes?: Readonly<Record<string, RabbitMqQueueRoute>>;
};

export interface RabbitMqQueueChannelPort {
  assertExchange(
    exchange: string,
    type: RabbitMqExchangeType,
    options: { readonly durable: boolean },
  ): Promise<unknown>;
  assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, RabbitMqFieldValue>>;
    },
  ): Promise<unknown>;
  bindQueue(
    queue: string,
    exchange: string,
    routingKey: string,
    args?: Readonly<Record<string, RabbitMqFieldValue>>,
  ): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): boolean | Promise<boolean>;
  waitForConfirms(exchange: string, routingKey: string, messageId: string): Promise<void>;
}

export type RabbitMqPublishOptions = {
  readonly contentType: string;
  readonly deliveryMode: 1 | 2;
  readonly mandatory: boolean;
  readonly messageId: string;
  readonly correlationId: string;
  readonly type: string;
  readonly timestamp: number;
  readonly headers: Readonly<Record<string, RabbitMqFieldValue>>;
};

export class RabbitMqQueuePublisher implements QueuePublisherPort {
  private readonly assertedRoutes = new Set<string>();

  constructor(
    private readonly channel: RabbitMqQueueChannelPort,
    private readonly options: RabbitMqQueuePublisherOptions,
    private readonly clock: Clock,
  ) {
    if (options.exchange.trim().length === 0) {
      throw new Error('RabbitMQ queue exchange must be non-empty');
    }
  }

  async publish<TPayload extends Readonly<Record<string, unknown>>>(
    command: QueueCommandEnvelope<TPayload>,
  ): Promise<void> {
    this.assertValidCommand(command);

    const route = this.resolveRoute(command.commandType);
    await this.ensureRoute(route);

    const content = Buffer.from(JSON.stringify(command), 'utf8');
    const maxPayloadBytes = this.options.maxPayloadBytes ?? 262_144;

    if (content.byteLength > maxPayloadBytes) {
      throw new Error(`Queue command payload exceeds RabbitMQ max payload size: ${content.byteLength}`);
    }

    const accepted = await this.channel.publish(this.options.exchange, route.routingKey, content, {
      contentType: this.options.contentType ?? 'application/json',
      deliveryMode: this.options.persistent === false ? 1 : 2,
      mandatory: this.options.mandatory ?? true,
      messageId: command.commandId,
      correlationId: command.correlationId,
      type: command.commandType,
      timestamp: Math.floor(this.clock.now().getTime() / 1000),
      headers: {
        command_type: command.commandType,
        schema_version: command.schemaVersion,
        ...(command.causationId === undefined ? {} : { causation_id: command.causationId }),
        ...route.headers,
      },
    });

    if (!accepted) {
      throw new Error(`RabbitMQ publish backpressure for command type: ${command.commandType}`);
    }

    await this.channel.waitForConfirms(this.options.exchange, route.routingKey, command.commandId);
  }

  private async ensureRoute(route: RabbitMqQueueRoute): Promise<void> {
    const routeKey = `${route.queue}:${route.routingKey}`;

    if (this.assertedRoutes.has(routeKey)) {
      return;
    }

    const durable = route.durable ?? this.options.durable ?? true;
    await this.channel.assertExchange(this.options.exchange, this.options.exchangeType ?? 'direct', { durable });
    if (route.deadLetterExchange !== undefined) {
      await this.channel.assertExchange(route.deadLetterExchange, route.deadLetterExchangeType ?? 'fanout', {
        durable,
      });
    }
    await this.channel.assertQueue(route.queue, {
      durable,
      arguments: rabbitMqDurableQueueArguments({
        deadLetterExchange: route.deadLetterExchange,
        headers: route.headers,
        queueType: route.queueType,
        deliveryLimit: route.deliveryLimit,
      }),
    });
    await this.channel.bindQueue(route.queue, this.options.exchange, route.routingKey);
    this.assertedRoutes.add(routeKey);
  }

  private resolveRoute(commandType: string): RabbitMqQueueRoute {
    const configured = this.options.routes?.[commandType];

    if (configured !== undefined) {
      return configured;
    }

    return {
      queue: `${this.options.defaultQueuePrefix ?? 'jobs'}.${commandType}`,
      routingKey: commandType,
    };
  }

  private assertValidCommand(command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>): void {
    if (command.commandId.trim().length === 0) {
      throw new Error('Queue command id must be non-empty');
    }

    if (command.commandType.trim().length === 0) {
      throw new Error('Queue command type must be non-empty');
    }

    if (!Number.isInteger(command.schemaVersion) || command.schemaVersion < 1) {
      throw new Error('Queue command schema version must be a positive integer');
    }

    if (command.correlationId.trim().length === 0) {
      throw new Error('Queue command correlation id must be non-empty');
    }
  }
}
