import { Inject, Injectable } from '@nestjs/common';
import {
  assertQueueDrainLimit,
  type QueueDelivery,
} from '@social-monitor/platform-queue';
import {
  rabbitMqDurableQueueArguments,
  RabbitMqQueueDeliveryReader,
  type RabbitMqDeliveryChannel,
  type RabbitMqFieldValue,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import type { GetMessage } from 'amqplib';

import {
  DELIVERY_SUMMARY_READY_EVENT_QUEUE_OPTIONS,
  type DeliverySummaryReadyEventQueueOptions,
} from './delivery-service-provider-tokens';

export const DELIVERY_SUMMARY_READY_EVENT_QUEUE_READER = Symbol('DELIVERY_SUMMARY_READY_EVENT_QUEUE_READER');

export type SummaryReadyEventDelivery = QueueDelivery & {
  readonly event: Readonly<Record<string, unknown>>;
};

export interface SummaryReadyEventQueueReaderPort {
  drain(params: { readonly limit: number }): Promise<readonly SummaryReadyEventDelivery[]>;
}

export interface RabbitMqSummaryReadyEventQueueReaderChannelPort extends RabbitMqDeliveryChannel {
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
  private readonly deliveries: RabbitMqQueueDeliveryReader;

  constructor(
    private readonly channel: RabbitMqSummaryReadyEventQueueReaderChannelPort,
    @Inject(DELIVERY_SUMMARY_READY_EVENT_QUEUE_OPTIONS)
    private readonly options: DeliverySummaryReadyEventQueueOptions,
  ) {
    this.deliveries = new RabbitMqQueueDeliveryReader(channel, options.queue);
  }

  async drain(params: { readonly limit: number }): Promise<readonly SummaryReadyEventDelivery[]> {
    assertQueueDrainLimit(params.limit);
    await this.deliveries.recoverPending();
    await this.ensureRoute(params.limit);
    const deliveries = await this.deliveries.drain(params.limit, parseSummaryReadyEvent);
    return deliveries.map(({ value, ...delivery }) => ({ ...delivery, event: value }));
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
