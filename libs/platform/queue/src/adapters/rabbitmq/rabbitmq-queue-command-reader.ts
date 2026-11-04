import type { QueueCommandEnvelope } from '../../queue-command';
import { assertQueueDrainLimit, type QueueCommandDelivery, type QueueCommandReader } from '../../queue-delivery';
import { rabbitMqDurableQueueArguments, type RabbitMqFieldValue } from './rabbitmq-queue-arguments';
import { RabbitMqQueueDeliveryReader, type RabbitMqDeliveryChannel } from './rabbitmq-queue-delivery-reader';

export interface RabbitMqCommandReaderChannel extends RabbitMqDeliveryChannel {
  assertExchange(exchange: string, type: 'fanout', options: { readonly durable: boolean }): Promise<unknown>;
  assertQueue(queue: string, options: {
    readonly durable: boolean;
    readonly arguments?: Readonly<Record<string, RabbitMqFieldValue>>;
  }): Promise<unknown>;
  prefetch(count: number): Promise<unknown>;
}

export type RabbitMqCommandReaderOptions = {
  readonly queue: string;
  readonly deadLetterExchange?: string;
  readonly queueType?: 'classic' | 'quorum';
  readonly deliveryLimit?: number;
};

export class RabbitMqQueueCommandReader implements QueueCommandReader {
  private routeAsserted = false;
  private readonly deliveries: RabbitMqQueueDeliveryReader;

  constructor(private readonly channel: RabbitMqCommandReaderChannel, private readonly options: RabbitMqCommandReaderOptions) {
    this.deliveries = new RabbitMqQueueDeliveryReader(channel, options.queue);
  }

  async drain(params: { readonly commandType: string; readonly limit: number }): Promise<readonly QueueCommandDelivery[]> {
    assertQueueDrainLimit(params.limit);
    try {
      await this.deliveries.recoverPending();
      await this.ensureRoute(params.limit);
      const deliveries = await this.deliveries.drain(params.limit, (message) => {
        const command = decodeQueueCommand(message.content.toString('utf8'));
        return command.commandType === params.commandType ? command : null;
      });
      return deliveries.map(({ value, ...delivery }) => ({ ...delivery, command: value }));
    } catch (error) {
      // A broker failure may close the channel or invalidate the queue. The next
      // drain recovers outstanding deliveries before reasserting its route.
      this.routeAsserted = false;
      throw error;
    }
  }

  private async ensureRoute(prefetch: number): Promise<void> {
    if (this.routeAsserted) return;
    if (this.options.deadLetterExchange !== undefined) {
      await this.channel.assertExchange(this.options.deadLetterExchange, 'fanout', { durable: true });
    }
    await this.channel.assertQueue(this.options.queue, {
      durable: true,
      arguments: rabbitMqDurableQueueArguments(this.options),
    });
    await this.channel.prefetch(prefetch);
    this.routeAsserted = true;
  }
}

const decodeQueueCommand = (body: string): QueueCommandEnvelope<Readonly<Record<string, unknown>>> => {
  const parsed = JSON.parse(body) as Readonly<Record<string, unknown>>;
  const payload = parsed.payload;
  for (const field of ['commandId', 'commandType', 'correlationId'] as const) {
    if (typeof parsed[field] !== 'string' || parsed[field].trim().length === 0) {
      throw new Error(`Invalid RabbitMQ command envelope: ${field}`);
    }
  }
  if (typeof parsed.schemaVersion !== 'number' || !Number.isInteger(parsed.schemaVersion)) {
    throw new Error('Invalid RabbitMQ command envelope: schemaVersion');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error('Invalid RabbitMQ command envelope: payload');
  }
  return {
    commandId: parsed.commandId as string,
    commandType: parsed.commandType as string,
    correlationId: parsed.correlationId as string,
    schemaVersion: parsed.schemaVersion,
    causationId: typeof parsed.causationId === 'string' ? parsed.causationId : undefined,
    payload: payload as Readonly<Record<string, unknown>>,
  };
};
