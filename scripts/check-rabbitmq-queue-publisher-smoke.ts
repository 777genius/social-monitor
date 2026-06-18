import type {
  RabbitMqPublishOptions,
  RabbitMqQueueChannelPort,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import { RabbitMqQueuePublisher } from '@social-monitor/platform-queue/adapters/rabbitmq';
import { FixedClock } from '@social-monitor/shared-kernel';

class FakeRabbitMqChannel implements RabbitMqQueueChannelPort {
  readonly exchanges: unknown[] = [];
  readonly queues: unknown[] = [];
  readonly bindings: unknown[] = [];
  readonly published: Array<{
    readonly exchange: string;
    readonly routingKey: string;
    readonly content: Buffer;
    readonly options: RabbitMqPublishOptions;
  }> = [];

  publishAccepted = true;
  confirmCount = 0;

  async assertExchange(
    exchange: string,
    type: 'direct' | 'fanout' | 'topic',
    options: { readonly durable: boolean },
  ): Promise<void> {
    this.exchanges.push({ exchange, type, options });
  }

  async assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, string | number | boolean>>;
    },
  ): Promise<void> {
    this.queues.push({ queue, options });
  }

  async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
    this.bindings.push({ queue, exchange, routingKey });
  }

  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): boolean {
    this.published.push({ exchange, routingKey, content, options });

    return this.publishAccepted;
  }

  async waitForConfirms(): Promise<void> {
    this.confirmCount += 1;
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const channel = new FakeRabbitMqChannel();
  const publisher = new RabbitMqQueuePublisher(channel, {
    exchange: 'social-monitor.jobs',
    routes: {
      'ingestion.scan.execute': {
        queue: 'jobs.freshness.scan',
        routingKey: 'scan.execute',
        deadLetterExchange: 'social-monitor.jobs.dlx',
      },
    },
  }, new FixedClock(new Date('2026-06-18T10:15:30.000Z')));

  await publisher.publish({
    commandId: 'scan-job-rabbit-smoke',
    commandType: 'ingestion.scan.execute',
    schemaVersion: 1,
    correlationId: 'correlation-rabbit-smoke',
    causationId: 'scan-policy-rabbit-smoke',
    payload: {
      tenantId: 'tenant-rabbit-smoke',
      workspaceId: 'workspace-rabbit-smoke',
      scanJobId: 'scan-job-rabbit-smoke',
    },
  });

  assert(channel.exchanges.length === 2, 'publisher must assert main and dead-letter exchanges');
  assert(
    JSON.stringify(channel.exchanges[1]) === JSON.stringify({
      exchange: 'social-monitor.jobs.dlx',
      type: 'fanout',
      options: { durable: true },
    }),
    'publisher must assert configured dead-letter exchange before binding the queue',
  );
  assert(channel.queues.length === 1, 'publisher must assert one queue');
  assert(channel.bindings.length === 1, 'publisher must bind one queue');
  assert(channel.published.length === 1, 'publisher must publish one command');
  assert(channel.published[0]?.exchange === 'social-monitor.jobs', 'publisher must use configured exchange');
  assert(channel.published[0]?.routingKey === 'scan.execute', 'publisher must use configured routing key');
  assert(channel.published[0]?.options.deliveryMode === 2, 'publisher must use persistent delivery mode by default');
  assert(channel.published[0]?.options.mandatory === true, 'publisher must require mandatory routing by default');
  assert(channel.published[0]?.options.timestamp === 1781777730, 'publisher must use injected clock for timestamp');
  assert(channel.confirmCount === 1, 'publisher must wait for broker confirms after publish');

  const payload = JSON.parse(channel.published[0]?.content.toString('utf8') ?? '{}') as Readonly<Record<string, unknown>>;
  assert(payload.commandType === 'ingestion.scan.execute', 'serialized command must preserve command type');
  assert(payload.commandId === 'scan-job-rabbit-smoke', 'serialized command must preserve command id');

  channel.publishAccepted = false;
  await publisher.publish({
    commandId: 'scan-job-rabbit-smoke-2',
    commandType: 'ingestion.scan.execute',
    schemaVersion: 1,
    correlationId: 'correlation-rabbit-smoke',
    payload: {
      tenantId: 'tenant-rabbit-smoke',
      workspaceId: 'workspace-rabbit-smoke',
      scanJobId: 'scan-job-rabbit-smoke-2',
    },
  }).then(
    () => {
      throw new Error('publisher must fail on broker backpressure');
    },
    (error: unknown) => {
      assert(
        error instanceof Error && error.message.includes('backpressure'),
        'publisher must expose broker backpressure',
      );
    },
  );

  console.log('RabbitMQ queue publisher smoke OK');
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
