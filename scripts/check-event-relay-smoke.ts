import {
  InMemoryOutboxStore,
  OutboxDispatcher,
  RabbitMqEventPublisher,
} from '@social-monitor/platform-events';
import type {
  RabbitMqPublishOptions,
  RabbitMqQueueChannelPort,
} from '@social-monitor/platform-queue';
import {
  correlationId,
  eventId,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { OutboxRelayLoop } from '../apps/event-relay/src/outbox-relay-loop';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const outbox = new InMemoryOutboxStore();
  const channel = new FakeRabbitMqEventChannel();
  outbox.add({
    id: '00000000-0000-7000-8000-000000000801',
    event: {
      eventId: eventId('00000000-0000-7000-8000-000000000801'),
      eventType: 'summary.ready',
      schemaVersion: 1,
      occurredAt: new Date('2026-06-16T02:00:00.000Z'),
      tenantId: tenantId('tenant-event-relay-smoke'),
      workspaceId: workspaceId('workspace-event-relay-smoke'),
      correlationId: correlationId('correlation-event-relay-smoke'),
      payload: {
        summaryId: 'summary-event-relay-smoke',
      },
    },
  });

  const loop = new OutboxRelayLoop(
    new OutboxDispatcher(
      outbox,
      new RabbitMqEventPublisher(channel, {
        exchange: 'social-monitor.events',
        exchangeType: 'topic',
        durable: true,
        persistent: true,
      }),
    ),
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('event-relay-smoke-complete');

  assert(channel.assertedExchange === 'social-monitor.events', 'event relay must assert event exchange');
  assert(channel.assertedType === 'topic', 'event relay must use topic exchange');
  assert(channel.published.length === 1, `expected one published event, got ${channel.published.length}`);
  assert(channel.published[0]?.routingKey === 'summary.ready', 'event routing key must be event type');
  assert(channel.published[0]?.options.messageId === '00000000-0000-7000-8000-000000000801', 'event message id mismatch');
  assert(channel.published[0]?.options.type === 'summary.ready', 'event publish type mismatch');
  assert((await outbox.pending(10)).length === 0, 'event relay must remove published event from pending outbox');

  console.log('Event relay smoke OK');
}

class FakeRabbitMqEventChannel implements RabbitMqQueueChannelPort {
  assertedExchange: string | undefined;
  assertedType: 'direct' | 'topic' | undefined;
  readonly published: {
    readonly exchange: string;
    readonly routingKey: string;
    readonly content: Buffer;
    readonly options: RabbitMqPublishOptions;
  }[] = [];

  async assertExchange(
    exchange: string,
    type: 'direct' | 'topic',
  ): Promise<unknown> {
    this.assertedExchange = exchange;
    this.assertedType = type;

    return undefined;
  }

  async assertQueue(): Promise<unknown> {
    return undefined;
  }

  async bindQueue(): Promise<unknown> {
    return undefined;
  }

  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): boolean {
    this.published.push({ exchange, routingKey, content, options });

    return true;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
