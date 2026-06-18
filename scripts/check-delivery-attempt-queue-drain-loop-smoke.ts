import { DeliveryAttempt } from '@social-monitor/delivery/domain';
import { InMemoryDeliveryProvider } from '@social-monitor/delivery/adapters/notification/in-memory-delivery.provider';
import { InMemoryDeliveryAttemptDispatchQueueAdapter } from '@social-monitor/delivery/adapters/messaging/in-memory-delivery-attempt-dispatch-queue.adapter';
import { InMemoryDeliveryAttemptRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-delivery-attempt.repository';
import { InMemoryNotificationPreferenceReader } from '@social-monitor/delivery/adapters/preferences/in-memory-notification-preference.reader';
import { EnqueueDeliveryAttemptDispatchUseCase } from '@social-monitor/delivery/features/enqueue-delivery-attempt-dispatch/enqueue-delivery-attempt-dispatch.use-case';
import { SendDeliveryAttemptUseCase } from '@social-monitor/delivery/features/send-delivery-attempt/send-delivery-attempt.use-case';
import { SendDeliveryAttemptCommandHandler } from '@social-monitor/delivery/interfaces/queue/send-delivery-attempt-command.handler';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { GetMessage, Message } from 'amqplib';

import { DeliveryAttemptQueueDrainLoop } from '../apps/delivery-service/src/delivery-attempt-queue-drain-loop';
import {
  InMemoryDeliveryAttemptQueueReader,
  RabbitMqDeliveryAttemptQueueReader,
  type DeliveryAttemptCommandDelivery,
  type DeliveryAttemptQueueReaderPort,
  type RabbitMqDeliveryAttemptQueueReaderChannelPort,
} from '../apps/delivery-service/src/delivery-attempt-queue-reader';

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-delivery-attempt-queue-drain-smoke');
  const workspace = workspaceId('workspace-delivery-attempt-queue-drain-smoke');
  const deliveryAttemptId = 'delivery-attempt-queue-drain-smoke';
  const attempts = new InMemoryDeliveryAttemptRepository();
  const queuePublisher = new InMemoryQueuePublisher();
  const metrics = new InMemoryMetricsRecorder();
  const provider = new InMemoryDeliveryProvider('webhook');
  const runtime = new WorkerRuntime({ serviceName: 'delivery-service' });
  runtime.onModuleInit();

  await attempts.save(DeliveryAttempt.queue({
    id: deliveryAttemptId,
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'delivery-attempt-queue-drain-smoke:summary-1',
    channel: 'webhook',
    recipientKey: 'webhook-endpoint-delivery-attempt-queue-drain-smoke',
    resourceType: 'summary',
    resourceId: 'summary-delivery-attempt-queue-drain-smoke',
    queuedAt: new Date('2026-06-16T04:10:00.000Z'),
    maxRetries: 2,
  }));

  const enqueueDispatch = new EnqueueDeliveryAttemptDispatchUseCase(
    attempts,
    new InMemoryDeliveryAttemptDispatchQueueAdapter(queuePublisher, metrics),
    new FixedClock(new Date('2026-06-16T04:11:00.000Z')),
  );

  const enqueued = await enqueueDispatch.execute({
    tenantId: tenant,
    workspaceId: workspace,
    deliveryAttemptId,
    correlationId: 'correlation-delivery-attempt-queue-drain-smoke',
  });

  if (!enqueued.ok) {
    throw enqueued.error;
  }

  assert(enqueued.value.enqueued, 'delivery dispatch enqueue use case must publish a command');
  assert(enqueued.value.state === 'assembling', 'queued dispatch attempt must move to assembling state');
  assert(queuePublisher.all().length === 1, 'delivery dispatch queue must contain one command');
  assert(
    metrics.counterValue('queue_commands_enqueued_total', {
      command_type: 'delivery.attempt.send',
      job_type: 'delivery',
      status: 'enqueued',
    }) === 1,
    'delivery dispatch enqueue must record queue enqueue metric',
  );

  const loop = new DeliveryAttemptQueueDrainLoop(
    new InMemoryDeliveryAttemptQueueReader(queuePublisher),
    new SendDeliveryAttemptCommandHandler(
      new SendDeliveryAttemptUseCase(
        attempts,
        [provider],
        new InMemoryNotificationPreferenceReader(),
        new FixedClock(new Date('2026-06-16T04:12:00.000Z')),
      ),
      metrics,
      runtime,
    ),
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
    metrics,
    new FixedClock(new Date('2026-06-16T04:12:30.000Z')),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('delivery-attempt-queue-drain-smoke-complete');
  await runtime.onApplicationShutdown('delivery-attempt-queue-drain-smoke-complete');

  const persisted = await attempts.findById({ tenantId: tenant, workspaceId: workspace, deliveryAttemptId });
  const snapshot = persisted?.toSnapshot();
  assert(snapshot?.state === 'delivered', `expected delivered queued attempt, got ${snapshot?.state}`);
  assert(queuePublisher.all().length === 0, 'delivery attempt queue drain loop must ack and remove command');
  assert(provider.getSentRequests().length === 1, 'delivery queue drain loop must send one provider request');
  assert(
    provider.getSentRequests()[0]?.content.body ===
      'Delivery resource summary:summary-delivery-attempt-queue-drain-smoke is ready.',
    'delivery queue drain loop must preserve deterministic MVP delivery content',
  );
  assert(
    metrics.counterValue('delivery_attempt_dispatch_total', {
      status: 'started',
      worker: 'delivery-service',
    }) === 1,
    'delivery queue drain loop must record started dispatch metric',
  );
  assert(
    metrics.counterValue('delivery_attempt_dispatch_total', {
      status: 'succeeded',
      worker: 'delivery-service',
    }) === 1,
    'delivery queue drain loop must record succeeded dispatch metric',
  );

  await verifyRabbitMqReaderDelivery();
  await verifyDeliveryQueueDeliveryLagMetric();

  console.log('Delivery attempt queue drain loop smoke OK');
}

async function verifyRabbitMqReaderDelivery(): Promise<void> {
  const channel = new FakeRabbitMqDeliveryAttemptQueueReaderChannel([
    deliveryMessageFrom({
      commandType: 'delivery.attempt.send',
      schemaVersion: 1,
      payload: {},
    }),
    deliveryMessageFrom({
      commandId: 'delivery-rabbit-reader-smoke',
      commandType: 'delivery.attempt.send',
      schemaVersion: 1,
      correlationId: 'delivery-rabbit-reader-smoke',
      payload: {
        tenantId: 'tenant-delivery-rabbit-reader-smoke',
        workspaceId: 'workspace-delivery-rabbit-reader-smoke',
        deliveryAttemptId: 'delivery-rabbit-reader-smoke',
      },
    }, {
      redelivered: true,
      headers: {
        'x-death': [
          {
            queue: 'jobs.delivery.attempt.send',
            count: 4,
            reason: 'rejected',
          },
        ],
      },
    }),
  ]);
  const reader = new RabbitMqDeliveryAttemptQueueReader(channel, {
    queue: 'jobs.delivery.attempt.send',
    deadLetterExchange: 'dead.letters',
    queueType: 'quorum',
    deliveryLimit: 20,
  });
  const deliveries = await reader.drain({ commandType: 'delivery.attempt.send', limit: 5 });

  assert(deliveries.length === 1, `expected one Rabbit delivery, got ${deliveries.length}`);
  assert(channel.nacked === 1, `expected malformed delivery message to be nacked, got ${channel.nacked}`);
  assert(
    JSON.stringify(channel.assertedExchange) === JSON.stringify({
      exchange: 'dead.letters',
      type: 'fanout',
      options: { durable: true },
    }),
    'Rabbit delivery reader must assert dead-letter exchange',
  );
  assert(
    JSON.stringify(channel.assertedQueue) === JSON.stringify({
      queue: 'jobs.delivery.attempt.send',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'dead.letters',
          'x-delivery-limit': 20,
        },
      },
    }),
    'Rabbit delivery reader must assert quorum queue',
  );
  assert(deliveries[0]?.command.commandId === 'delivery-rabbit-reader-smoke', 'Rabbit delivery command id mismatch');
  assert(
    deliveries[0]?.diagnostics.redelivered === true &&
      deliveries[0]?.diagnostics.deadLetterCount === 4 &&
      deliveries[0]?.diagnostics.deadLetterReason === 'rejected',
    'Rabbit delivery reader must expose x-death diagnostics',
  );
  await deliveries[0]?.ack();
  assert(channel.acked === 1, `expected one Rabbit ack, got ${channel.acked}`);
}

async function verifyDeliveryQueueDeliveryLagMetric(): Promise<void> {
  const metrics = new InMemoryMetricsRecorder();
  const delivery: DeliveryAttemptCommandDelivery = {
    command: {
      commandId: 'delivery-lag-metric-smoke',
      commandType: 'delivery.attempt.send',
      schemaVersion: 1,
      correlationId: 'delivery-lag-metric-smoke',
      payload: {
        tenantId: 'tenant-delivery-lag-metric-smoke',
        workspaceId: 'workspace-delivery-lag-metric-smoke',
        deliveryAttemptId: 'delivery-lag-metric-smoke',
      },
    },
    diagnostics: {
      redelivered: false,
      deadLetterCount: 0,
      publishedAtEpochMs: Date.parse('2026-06-16T04:00:00.000Z'),
    },
    ack: async () => undefined,
    nack: async () => undefined,
  };
  const reader: DeliveryAttemptQueueReaderPort = {
    drain: async () => [delivery],
  };
  const handler = {
    handle: async () => undefined,
  } as unknown as SendDeliveryAttemptCommandHandler;
  const loop = new DeliveryAttemptQueueDrainLoop(
    reader,
    handler,
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 1,
      runOnStart: true,
    },
    metrics,
    new FixedClock(new Date('2026-06-16T04:00:33.000Z')),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('delivery-lag-metric-smoke-complete');
  assert(
    metrics.latestGaugeValue('queue_command_delivery_lag_seconds', {
      command_type: 'delivery.attempt.send',
      queue: 'delivery',
      worker: 'delivery-service',
    }) === 33,
    'delivery queue drain loop must record RabbitMQ delivery lag seconds',
  );
}

class FakeRabbitMqDeliveryAttemptQueueReaderChannel implements RabbitMqDeliveryAttemptQueueReaderChannelPort {
  assertedExchange: unknown;
  assertedQueue: unknown;
  prefetchCount = 0;
  acked = 0;
  nacked = 0;

  constructor(private readonly messages: GetMessage[]) {}

  async assertExchange(
    exchange: string,
    type: 'fanout',
    options: { readonly durable: boolean },
  ): Promise<unknown> {
    this.assertedExchange = { exchange, type, options };

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

function deliveryMessageFrom(
  command: Readonly<Record<string, unknown>>,
  metadata: {
    readonly redelivered?: boolean;
    readonly headers?: Readonly<Record<string, unknown>>;
  } = {},
): GetMessage {
  return {
    content: Buffer.from(JSON.stringify(command), 'utf8'),
    fields: {
      redelivered: metadata.redelivered ?? false,
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
