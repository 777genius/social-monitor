import { Inject, Injectable } from '@nestjs/common';
import {
  queueCommandDeliveryDiagnosticsFromRabbitMq,
  type QueueCommandDeliveryDiagnostics,
} from '@social-monitor/platform-queue';
import {
  rabbitMqDurableQueueArguments,
  type RabbitMqFieldValue,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import type { GetMessage, Message } from 'amqplib';

import {
  DELIVERY_SUMMARY_READY_EVENT_QUEUE_OPTIONS,
  type DeliverySummaryReadyEventQueueOptions,
} from './delivery-service-provider-tokens';

export const DELIVERY_SUMMARY_READY_EVENT_QUEUE_READER = Symbol('DELIVERY_SUMMARY_READY_EVENT_QUEUE_READER');

export type SummaryReadyEventDelivery = {
  readonly event: Readonly<Record<string, unknown>>;
  readonly diagnostics: QueueCommandDeliveryDiagnostics;
  ack(): Promise<void>;
  nack(params: { readonly requeue: boolean }): Promise<void>;
};

export interface SummaryReadyEventQueueReaderPort {
  drain(params: { readonly limit: number }): Promise<readonly SummaryReadyEventDelivery[]>;
}

export interface RabbitMqSummaryReadyEventQueueReaderChannelPort {
  assertExchange(
    exchange: string,
    type: 'fanout' | 'topic',
    options: { readonly durable: boolean },
  ): Promise<unknown>;
  assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, RabbitMqFieldValue>>;
    },
  ): Promise<unknown>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
  get(queue: string, options: { readonly noAck: boolean }): Promise<GetMessage | false>;
  ack(message: Message): Promise<void>;
  nack(message: Message, allUpTo: boolean, requeue: boolean): Promise<void>;
  prefetch(count: number): Promise<unknown>;
}

@Injectable()
export class DisabledSummaryReadyEventQueueReader implements SummaryReadyEventQueueReaderPort {
  async drain(): Promise<readonly SummaryReadyEventDelivery[]> {
    return [];
  }
}

@Injectable()
export class RabbitMqSummaryReadyEventQueueReader implements SummaryReadyEventQueueReaderPort {
  private routeAsserted = false;

  constructor(
    private readonly channel: RabbitMqSummaryReadyEventQueueReaderChannelPort,
    @Inject(DELIVERY_SUMMARY_READY_EVENT_QUEUE_OPTIONS)
    private readonly options: DeliverySummaryReadyEventQueueOptions,
  ) {}

  async drain(params: { readonly limit: number }): Promise<readonly SummaryReadyEventDelivery[]> {
    await this.ensureRoute(params.limit);

    const deliveries: SummaryReadyEventDelivery[] = [];
    for (let index = 0; index < params.limit; index += 1) {
      const message = await this.channel.get(this.options.queue, { noAck: false });

      if (message === false) {
        break;
      }

      const event = await parseSummaryReadyEventOrNack(this.channel, message);
      if (event === null) {
        continue;
      }

      deliveries.push({
        event,
        diagnostics: queueCommandDeliveryDiagnosticsFromRabbitMq(message, this.options.queue),
        ack: async () => this.channel.ack(message),
        nack: async ({ requeue }) => this.channel.nack(message, false, requeue),
      });
    }

    return deliveries;
  }

  private async ensureRoute(prefetch: number): Promise<void> {
    if (this.routeAsserted) {
      return;
    }

    await this.channel.assertExchange(this.options.exchange, 'topic', { durable: true });
    if (this.options.deadLetterExchange !== undefined) {
      await this.channel.assertExchange(this.options.deadLetterExchange, 'fanout', { durable: true });
    }
    await this.channel.assertQueue(this.options.queue, {
      durable: true,
      arguments: rabbitMqDurableQueueArguments({
        deadLetterExchange: this.options.deadLetterExchange,
        queueType: this.options.queueType,
        deliveryLimit: this.options.deliveryLimit,
      }),
    });
    await this.channel.bindQueue(this.options.queue, this.options.exchange, 'reader_summary.ready');
    await this.channel.bindQueue(this.options.queue, this.options.exchange, this.options.routingKey);
    await this.channel.prefetch(prefetch);
    this.routeAsserted = true;
  }
}

const parseSummaryReadyEvent = (
  message: GetMessage,
): Readonly<Record<string, unknown>> => {
  const parsed = JSON.parse(message.content.toString('utf8')) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid RabbitMQ event envelope: root');
  }

  const event = parsed as Readonly<Record<string, unknown>>;
  if ((event.eventType !== 'summary.ready' && event.eventType !== 'reader_summary.ready') ||
      message.fields.routingKey !== event.eventType) {
    throw new Error('Invalid RabbitMQ event envelope: eventType');
  }

  return event;
};

const parseSummaryReadyEventOrNack = async (
  channel: RabbitMqSummaryReadyEventQueueReaderChannelPort,
  message: GetMessage,
): Promise<Readonly<Record<string, unknown>> | null> => {
  try {
    return parseSummaryReadyEvent(message);
  } catch {
    await channel.nack(message, false, false);
    return null;
  }
};
