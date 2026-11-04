import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { connect, type ChannelModel, type ConfirmChannel, type GetMessage } from 'amqplib';
import type { QueueCommandDelivery, QueueCommandEnvelope } from '@social-monitor/platform-queue';
import {
  AmqplibRabbitMqChannel,
  RabbitMqQueueCommandReader,
  RabbitMqQueuePublisher,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import { FixedClock } from '@social-monitor/shared-kernel';

export const brokerCommandType = 'foundation.broker.execute';

export function rabbitMqBrokerTestUrl(): string {
  const value = process.env.RABBITMQ_INTEGRATION_TEST_URL?.trim();
  if (!value) throw new Error('RABBITMQ_INTEGRATION_TEST_URL is required; broker E2E never silently skips');
  const url = new URL(value);
  if (url.protocol !== 'amqp:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Broker E2E requires an explicit disposable RabbitMQ endpoint on loopback');
  }
  return value;
}

export function brokerCommand(commandId: string, occurrence: string): QueueCommandEnvelope<{ readonly occurrence: string }> {
  return { commandId, commandType: brokerCommandType, schemaVersion: 1,
    correlationId: 'synthetic-broker-correlation', payload: { occurrence } };
}

/** Real AMQP clients only. Every test owns uniquely named disposable resources. */
export class RabbitMqBrokerFixture {
  readonly prefix = `test.foundation.${randomUUID()}`;
  readonly queue = `${this.prefix}.commands`;
  readonly exchange = `${this.prefix}.exchange`;
  readonly deadLetterExchange = `${this.prefix}.dlx`;
  readonly deadLetterQueue = `${this.prefix}.dead`;
  readonly channel: AmqplibRabbitMqChannel;
  readonly reader: RabbitMqQueueCommandReader;
  readonly publisher: RabbitMqQueuePublisher;
  private connection: ChannelModel | undefined;
  private adminChannel: ConfirmChannel | undefined;

  constructor(private readonly url: string) {
    this.channel = new AmqplibRabbitMqChannel({ url, socketOptions: { timeout: 5_000 } });
    this.reader = new RabbitMqQueueCommandReader(this.channel, {
      queue: this.queue, deadLetterExchange: this.deadLetterExchange,
      queueType: 'quorum', deliveryLimit: 20,
    });
    this.publisher = new RabbitMqQueuePublisher(this.channel, {
      exchange: this.exchange,
      routes: { [brokerCommandType]: { queue: this.queue, routingKey: brokerCommandType,
        queueType: 'quorum', deliveryLimit: 20, deadLetterExchange: this.deadLetterExchange } },
    }, new FixedClock(new Date('2026-11-04T00:00:00.000Z')));
  }

  get admin(): ConfirmChannel {
    if (this.adminChannel === undefined) throw new Error('Broker fixture is not started');
    return this.adminChannel;
  }

  async start(): Promise<void> {
    this.connection = await connect(this.url, { timeout: 5_000 });
    this.adminChannel = await this.connection.createConfirmChannel();
    await this.admin.assertExchange(this.exchange, 'direct', { durable: true });
    await this.admin.assertExchange(this.deadLetterExchange, 'fanout', { durable: true });
    await this.admin.assertQueue(this.deadLetterQueue, {
      durable: true, arguments: { 'x-queue-type': 'quorum' },
    });
    await this.admin.bindQueue(this.deadLetterQueue, this.deadLetterExchange, '');
    await this.reader.drain({ commandType: brokerCommandType, limit: 1 });
  }

  async publishRaw(content: Buffer): Promise<void> {
    this.admin.sendToQueue(this.queue, content, { persistent: true, contentType: 'application/json' });
    await this.admin.waitForConfirms();
  }

  async deliveries(count: number): Promise<readonly QueueCommandDelivery[]> {
    const deliveries: QueueCommandDelivery[] = [];
    await pollUntil(async () => {
      deliveries.push(...await this.reader.drain({ commandType: brokerCommandType, limit: count - deliveries.length }));
      return deliveries.length === count;
    }, `expected ${count} command deliveries`);
    return deliveries;
  }

  async rawDeliveries(count: number, queue = this.queue): Promise<readonly GetMessage[]> {
    const deliveries: GetMessage[] = [];
    await pollUntil(async () => {
      const delivery = await this.channel.get(queue, { noAck: false });
      if (delivery !== false) deliveries.push(delivery);
      return deliveries.length === count;
    }, `expected ${count} raw deliveries`);
    return deliveries;
  }

  async expectReadyCount(count: number, queue = this.queue): Promise<void> {
    await pollUntil(async () => (await this.admin.checkQueue(queue)).messageCount === count,
      `expected ${count} ready messages`);
  }

  async expectFullySettled(): Promise<void> {
    // Closing the real consumer requeues any accidentally abandoned unacked item.
    // A queue count before this close alone would miss such a leak.
    await this.channel.close();
    await this.expectReadyCount(0);
  }

  async close(): Promise<void> {
    await this.channel.close();
    try {
      if (this.adminChannel !== undefined) {
        const cleanup = await Promise.allSettled([
          this.admin.deleteQueue(this.queue), this.admin.deleteQueue(this.deadLetterQueue),
          this.admin.deleteExchange(this.exchange), this.admin.deleteExchange(this.deadLetterExchange),
        ]);
        const failures = cleanup.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
        if (failures.length > 0) throw new AggregateError(failures, 'Broker fixture cleanup failed');
      }
    } finally {
      await this.connection?.close();
    }
  }
}

async function pollUntil(check: () => Promise<boolean>, description: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  do {
    if (await check()) return;
    await delay(25);
  } while (Date.now() < deadline);
  throw new Error(`Broker fixture timed out: ${description}`);
}
