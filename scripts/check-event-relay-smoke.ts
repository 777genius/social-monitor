import {
  OutboxDispatcher,
} from '@social-monitor/platform-events';
import {
  RabbitMqEventPublisher,
} from '@social-monitor/platform-events/adapters/rabbitmq';
import { InMemoryOutboxStore } from '@social-monitor/platform-events/adapters/in-memory';
import type {
  RabbitMqPublishOptions,
  RabbitMqQueueChannelPort,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import {
  CommandOutboxDispatcher,
  type CommandOutboxRecord,
  type CommandOutboxStorePort,
  type QueueCommandEnvelope,
} from '@social-monitor/platform-queue';
import {
  RabbitMqQueuePublisher,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import {
  correlationId,
  eventId,
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { OutboxRelayLoop } from '../apps/event-relay/src/outbox-relay-loop';
import { ScanCommandRelayLoop } from '../apps/event-relay/src/scan-command-relay-loop';

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

  const commandChannel = new FakeRabbitMqEventChannel();
  const commandOutbox = new FakeCommandOutbox();
  const commandLoop = new ScanCommandRelayLoop(
    new CommandOutboxDispatcher(
      commandOutbox,
      new RabbitMqQueuePublisher(
        commandChannel,
        {
          exchange: 'social-monitor.jobs',
          routes: {
            'ingestion.scan.execute': {
              queue: 'jobs.freshness.scan',
              routingKey: 'scan.execute',
            },
          },
        },
        new FixedClock(new Date('2026-06-16T02:00:00.000Z')),
      ),
      new FixedIdGenerator(),
      new FixedClock(new Date('2026-06-16T02:00:00.000Z')),
    ),
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
  );

  await commandLoop.onModuleInit();
  await commandLoop.onApplicationShutdown('event-relay-smoke-complete');

  assert(commandChannel.published.length === 1, 'expected one published scan command');
  assert(commandChannel.published[0]?.exchange === 'social-monitor.jobs', 'scan command exchange mismatch');
  assert(commandChannel.published[0]?.routingKey === 'scan.execute', 'scan command routing key mismatch');
  assert(commandOutbox.published, 'scan command relay must mark the command published');

  console.log('Event relay smoke OK');
}

class FixedIdGenerator implements IdGenerator {
  generate(): string {
    return '00000000-0000-7000-8000-000000000899';
  }
}

class FakeCommandOutbox implements CommandOutboxStorePort {
  published = false;
  private claimed = false;

  async claimPending(): Promise<readonly CommandOutboxRecord[]> {
    if (this.claimed) {
      return [];
    }
    this.claimed = true;

    return [{
      id: '00000000-0000-7000-8000-000000000802',
      publishAttempt: 1,
      command: {
        commandId: '00000000-0000-7000-8000-000000000802',
        commandType: 'ingestion.scan.execute',
        schemaVersion: 1,
        correlationId: 'correlation-command-relay-smoke',
        causationId: 'causation-command-relay-smoke',
        payload: {
          tenantId: 'tenant-command-relay-smoke',
          workspaceId: 'workspace-command-relay-smoke',
          scanJobId: '00000000-0000-7000-8000-000000000802',
        },
      } satisfies QueueCommandEnvelope<Readonly<Record<string, unknown>>>,
    }];
  }

  async markPublished(): Promise<void> {
    this.published = true;
  }

  async markFailed(): Promise<void> {
    throw new Error('command relay smoke did not expect publish failure');
  }
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

  async waitForConfirms(): Promise<void> {
    return undefined;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
