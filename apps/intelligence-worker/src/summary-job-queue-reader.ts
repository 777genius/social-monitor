import { Inject, Injectable } from '@nestjs/common';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import {
  emptyQueueCommandDeliveryDiagnostics,
  queueCommandDeliveryDiagnosticsFromRabbitMq,
  type QueueCommandDeliveryDiagnostics,
  type QueueCommandEnvelope,
} from '@social-monitor/platform-queue';
import {
  rabbitMqDurableQueueArguments,
  type RabbitMqFieldValue,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import type { GetMessage, Message } from 'amqplib';

import {
  INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS,
  type IntelligenceRabbitMqSummaryQueueReaderOptions,
} from './intelligence-worker-provider-tokens';

export const INTELLIGENCE_SUMMARY_JOB_QUEUE_READER = Symbol('INTELLIGENCE_SUMMARY_JOB_QUEUE_READER');
export const INTELLIGENCE_BRIEFING_JOB_QUEUE_READER = Symbol('INTELLIGENCE_BRIEFING_JOB_QUEUE_READER');

export type SummaryJobCommandDelivery = {
  readonly command: QueueCommandEnvelope<Readonly<Record<string, unknown>>>;
  readonly diagnostics: QueueCommandDeliveryDiagnostics;
  ack(): Promise<void>;
  nack(params: { readonly requeue: boolean }): Promise<void>;
};

export interface SummaryJobQueueReaderPort {
  drain(params: {
    readonly commandType: string;
    readonly limit: number;
  }): Promise<readonly SummaryJobCommandDelivery[]>;
}

export interface RabbitMqSummaryQueueReaderChannelPort {
  assertExchange(
    exchange: string,
    type: 'fanout',
    options: { readonly durable: boolean },
  ): Promise<unknown>;
  assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, RabbitMqFieldValue>>;
    },
  ): Promise<unknown>;
  get(queue: string, options: { readonly noAck: boolean }): Promise<GetMessage | false>;
  ack(message: Message): Promise<void>;
  nack(message: Message, allUpTo: boolean, requeue: boolean): Promise<void>;
  prefetch(count: number): Promise<unknown>;
}

@Injectable()
export class InMemorySummaryJobQueueReader implements SummaryJobQueueReaderPort {
  constructor(private readonly queue: InMemoryQueuePublisher) {}

  async drain(params: {
    readonly commandType: string;
    readonly limit: number;
  }): Promise<readonly SummaryJobCommandDelivery[]> {
    return this.queue.drain(params).map((command) => ({
      command,
      diagnostics: emptyQueueCommandDeliveryDiagnostics,
      ack: async () => undefined,
      nack: async () => undefined,
    }));
  }
}

@Injectable()
export class RabbitMqSummaryJobQueueReader implements SummaryJobQueueReaderPort {
  private routeAsserted = false;

  constructor(
    private readonly channel: RabbitMqSummaryQueueReaderChannelPort,
    @Inject(INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS)
    private readonly options: IntelligenceRabbitMqSummaryQueueReaderOptions,
  ) {}

  async drain(params: {
    readonly commandType: string;
    readonly limit: number;
  }): Promise<readonly SummaryJobCommandDelivery[]> {
    await this.ensureRoute(params.limit);

    const deliveries: SummaryJobCommandDelivery[] = [];
    for (let index = 0; index < params.limit; index += 1) {
      const message = await this.channel.get(this.options.queue, { noAck: false });

      if (message === false) {
        break;
      }

      const command = await parseQueueCommandOrNack(this.channel, message);
      if (command === null) {
        continue;
      }

      if (command.commandType !== params.commandType) {
        await this.channel.nack(message, false, false);
        continue;
      }

      deliveries.push({
        command,
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
    await this.channel.prefetch(prefetch);
    this.routeAsserted = true;
  }
}

const parseQueueCommand = (
  message: GetMessage,
): QueueCommandEnvelope<Readonly<Record<string, unknown>>> => {
  const parsed = JSON.parse(message.content.toString('utf8')) as Readonly<Record<string, unknown>>;
  const payload = parsed.payload;

  if (typeof parsed.commandId !== 'string' || parsed.commandId.trim().length === 0) {
    throw new Error('Invalid RabbitMQ summary command envelope: commandId');
  }

  if (typeof parsed.commandType !== 'string' || parsed.commandType.trim().length === 0) {
    throw new Error('Invalid RabbitMQ summary command envelope: commandType');
  }

  if (typeof parsed.correlationId !== 'string' || parsed.correlationId.trim().length === 0) {
    throw new Error('Invalid RabbitMQ summary command envelope: correlationId');
  }

  if (typeof parsed.schemaVersion !== 'number' || !Number.isInteger(parsed.schemaVersion)) {
    throw new Error('Invalid RabbitMQ summary command envelope: schemaVersion');
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Invalid RabbitMQ summary command envelope: payload');
  }

  return {
    commandId: parsed.commandId,
    commandType: parsed.commandType,
    schemaVersion: parsed.schemaVersion,
    correlationId: parsed.correlationId,
    causationId: typeof parsed.causationId === 'string' ? parsed.causationId : undefined,
    payload: payload as Readonly<Record<string, unknown>>,
  };
};

const parseQueueCommandOrNack = async (
  channel: RabbitMqSummaryQueueReaderChannelPort,
  message: GetMessage,
): Promise<QueueCommandEnvelope<Readonly<Record<string, unknown>>> | null> => {
  try {
    return parseQueueCommand(message);
  } catch {
    await channel.nack(message, false, false);
    return null;
  }
};
