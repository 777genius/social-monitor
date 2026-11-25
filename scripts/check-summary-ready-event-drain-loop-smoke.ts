import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import type { QueueCommandDeliveryDiagnostics } from '@social-monitor/platform-queue';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { GetMessage, Message } from 'amqplib';

import {
  SummaryReadyEventDrainLoop,
  type SummaryReadyEventHandlerPort,
} from '../apps/delivery-service/src/summary-ready-event-drain-loop';
import {
  RabbitMqSummaryReadyEventQueueReader,
  type RabbitMqSummaryReadyEventQueueReaderChannelPort,
  type SummaryReadyEventDelivery,
  type SummaryReadyEventQueueReaderPort,
} from '../apps/delivery-service/src/summary-ready-event-queue-reader';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  await verifySuccessfulDrainLoopAck();
  await verifyFailedDrainLoopNack();
  await verifyRabbitMqSummaryReadyReaderDelivery();

  console.log('Summary ready event drain loop smoke OK');
}

async function verifySuccessfulDrainLoopAck(): Promise<void> {
  const metrics = new InMemoryMetricsRecorder();
  const delivery = mutableDelivery({
    diagnostics: {
      redelivered: false,
      deadLetterCount: 0,
      publishedAtEpochMs: Date.parse('2026-06-17T02:00:00.000Z'),
    },
  });
  const reader = new SingleDeliveryQueueReader([delivery.delivery]);
  const handled: Readonly<Record<string, unknown>>[] = [];
  const handler: SummaryReadyEventHandlerPort = {
    handle: async (event) => {
      handled.push(event);
      return {
        channel: 'interest:topic-summary-ready-event-drain-smoke:summary-status',
        realtimeEventId: 'realtime-summary-ready-event-drain-smoke',
        sequence: 1,
      };
    },
  };
  const loop = new SummaryReadyEventDrainLoop(
    reader,
    handler,
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
    metrics,
    new FixedClock(new Date('2026-06-17T02:00:42.000Z')),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('summary-ready-event-drain-loop-success-smoke-complete');

  assert(reader.limits[0] === 10, 'summary ready event drain loop must pass configured drain limit');
  assert(handled.length === 1, `expected one handled summary.ready event, got ${handled.length}`);
  assert(delivery.state.acked === 1, `expected one ack, got ${delivery.state.acked}`);
  assert(delivery.state.nacks.length === 0, `expected no nack, got ${delivery.state.nacks.length}`);
  assert(
    metrics.latestGaugeValue('queue_command_delivery_lag_seconds', {
      command_type: 'summary.ready',
      queue: 'events',
      worker: 'delivery-service',
    }) === 42,
    'summary ready event drain loop must record RabbitMQ delivery lag seconds',
  );
}

async function verifyFailedDrainLoopNack(): Promise<void> {
  const delivery = mutableDelivery();
  const loop = new SummaryReadyEventDrainLoop(
    new SingleDeliveryQueueReader([delivery.delivery]),
    {
      handle: async () => {
        throw new Error('summary ready projection failed');
      },
    },
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 1,
      runOnStart: true,
    },
    new InMemoryMetricsRecorder(),
    new FixedClock(new Date('2026-06-17T02:10:00.000Z')),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('summary-ready-event-drain-loop-failure-smoke-complete');

  assert(delivery.state.acked === 0, `expected no ack on handler failure, got ${delivery.state.acked}`);
  assert(delivery.state.nacks.length === 1, `expected one nack on handler failure, got ${delivery.state.nacks.length}`);
  assert(delivery.state.nacks[0]?.requeue === false, 'summary ready event failures must be nacked without requeue');
}

async function verifyRabbitMqSummaryReadyReaderDelivery(): Promise<void> {
  const channel = new FakeRabbitMqSummaryReadyEventReaderChannel([
    messageFrom({
      eventId: 'summary-ready-rabbit-reader-invalid',
      eventType: 'summary.failed',
      schemaVersion: 1,
    }),
    messageFrom(summaryReadyEvent({
      eventId: 'summary-ready-rabbit-reader-smoke',
      payload: {
        tenantId: 'tenant-summary-ready-rabbit-reader-smoke',
        workspaceId: 'workspace-summary-ready-rabbit-reader-smoke',
        interestId: 'topic-summary-ready-rabbit-reader-smoke',
        summaryJobId: 'summary-job-ready-rabbit-reader-smoke',
        summaryId: 'summary-ready-rabbit-reader-smoke',
        status: 'completed',
      },
    }), {
      redelivered: true,
      headers: {
        'x-death': [
          {
            queue: 'events.delivery.summary.ready',
            count: 2,
            reason: 'rejected',
          },
        ],
      },
    }),
  ]);
  const reader = new RabbitMqSummaryReadyEventQueueReader(channel, {
    exchange: 'social-monitor.events',
    queue: 'events.delivery.summary.ready',
    routingKey: 'summary.ready',
    deadLetterExchange: 'dead.letters',
    queueType: 'quorum',
    deliveryLimit: 20,
  });
  const deliveries = await reader.drain({ limit: 5 });

  assert(deliveries.length === 1, `expected one Rabbit summary.ready delivery, got ${deliveries.length}`);
  assert(channel.nacked === 1, `expected malformed summary.ready event to be nacked, got ${channel.nacked}`);
  assert(
    JSON.stringify(channel.assertedExchanges) === JSON.stringify([
      {
        exchange: 'social-monitor.events',
        type: 'topic',
        options: { durable: true },
      },
      {
        exchange: 'dead.letters',
        type: 'fanout',
        options: { durable: true },
      },
    ]),
    'Rabbit summary.ready reader must assert event topic exchange and DLX',
  );
  assert(
    JSON.stringify(channel.assertedQueue) === JSON.stringify({
      queue: 'events.delivery.summary.ready',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dead.letters',
          'x-delivery-limit': 20,
        },
      },
    }),
    'Rabbit summary.ready reader must assert quorum queue',
  );
  assert(
    JSON.stringify(channel.bindings) === JSON.stringify([{
      queue: 'events.delivery.summary.ready',
      exchange: 'social-monitor.events',
      routingKey: 'reader_summary.ready',
    }, {
      queue: 'events.delivery.summary.ready',
      exchange: 'social-monitor.events',
      routingKey: 'summary.ready',
    }]),
    'Rabbit summary.ready reader must bind queue to both exact summary ready routing keys',
  );
  assert(channel.prefetchCount === 5, 'Rabbit summary.ready reader must set prefetch from limit');
  assert(deliveries[0]?.event.eventId === 'summary-ready-rabbit-reader-smoke', 'summary.ready event id mismatch');
  assert(
    deliveries[0]?.diagnostics.redelivered === true &&
      deliveries[0]?.diagnostics.deadLetterCount === 2 &&
      deliveries[0]?.diagnostics.deadLetterReason === 'rejected',
    'Rabbit summary.ready reader must expose x-death diagnostics',
  );
  await deliveries[0]?.ack();
  assert(channel.acked === 1, `expected one Rabbit ack, got ${channel.acked}`);
}

class SingleDeliveryQueueReader implements SummaryReadyEventQueueReaderPort {
  readonly limits: number[] = [];

  constructor(private readonly deliveries: SummaryReadyEventDelivery[]) {}

  async drain(params: { readonly limit: number }): Promise<readonly SummaryReadyEventDelivery[]> {
    this.limits.push(params.limit);

    return this.deliveries.splice(0, params.limit);
  }
}

class FakeRabbitMqSummaryReadyEventReaderChannel implements RabbitMqSummaryReadyEventQueueReaderChannelPort {
  readonly assertedExchanges: unknown[] = [];
  assertedQueue: unknown;
  readonly bindings: unknown[] = [];
  prefetchCount = 0;
  acked = 0;
  nacked = 0;

  constructor(private readonly messages: GetMessage[]) {}

  async assertExchange(
    exchange: string,
    type: 'fanout' | 'topic',
    options: { readonly durable: boolean },
  ): Promise<unknown> {
    this.assertedExchanges.push({ exchange, type, options });

    return undefined;
  }

  async assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, string | number | boolean>>;
    },
  ): Promise<unknown> {
    this.assertedQueue = { queue, options };

    return undefined;
  }

  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown> {
    this.bindings.push({ queue, exchange, routingKey });

    return undefined;
  }

  async get(): Promise<GetMessage | false> {
    return this.messages.shift() ?? false;
  }

  async ack(): Promise<void> {
    this.acked += 1;
  }

  async nack(): Promise<void> {
    this.nacked += 1;
  }

  async prefetch(count: number): Promise<unknown> {
    this.prefetchCount = count;

    return undefined;
  }
}

function mutableDelivery(
  params: {
    readonly event?: Readonly<Record<string, unknown>>;
    readonly diagnostics?: QueueCommandDeliveryDiagnostics;
  } = {},
): {
  readonly delivery: SummaryReadyEventDelivery;
  readonly state: {
    acked: number;
    nacks: { readonly requeue: boolean }[];
  };
} {
  const state = {
    acked: 0,
    nacks: [] as { readonly requeue: boolean }[],
  };

  return {
    delivery: {
      event: params.event ?? summaryReadyEvent(),
      diagnostics: params.diagnostics ?? {
        redelivered: false,
        deadLetterCount: 0,
      },
      ack: async () => {
        state.acked += 1;
      },
      nack: async ({ requeue }) => {
        state.nacks.push({ requeue });
      },
    },
    state,
  };
}

function summaryReadyEvent(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return {
    eventId: 'summary-ready-event-drain-smoke',
    eventType: 'summary.ready',
    schemaVersion: 1,
    occurredAt: '2026-06-17T02:00:00.000Z',
    tenantId: tenantId('tenant-summary-ready-event-drain-smoke'),
    workspaceId: workspaceId('workspace-summary-ready-event-drain-smoke'),
    correlationId: 'summary-ready-event-drain-smoke',
    causationId: 'summary-job-ready-event-drain-smoke',
    payload: {
      tenantId: tenantId('tenant-summary-ready-event-drain-smoke'),
      workspaceId: workspaceId('workspace-summary-ready-event-drain-smoke'),
      interestId: 'topic-summary-ready-event-drain-smoke',
      summaryJobId: 'summary-job-ready-event-drain-smoke',
      summaryId: 'summary-ready-event-drain-smoke',
      status: 'completed',
    },
    ...overrides,
  };
}

function messageFrom(
  event: Readonly<Record<string, unknown>>,
  metadata: {
    readonly redelivered?: boolean;
    readonly headers?: Readonly<Record<string, unknown>>;
  } = {},
): GetMessage {
  return {
    content: Buffer.from(JSON.stringify(event), 'utf8'),
    fields: {
      redelivered: metadata.redelivered ?? false,
      routingKey: String(event.eventType),
    },
    properties: {
      headers: metadata.headers ?? {},
    },
  } as GetMessage & Message;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
