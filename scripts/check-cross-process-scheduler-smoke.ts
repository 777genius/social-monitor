import { FakePrismaMonitoringClient } from './lib/scan-dispatch-prisma.fixture';
import { ScanDispatchFixtureOutbox } from './lib/scan-dispatch-outbox.fixture';
import { CommandOutboxDispatcher } from '@social-monitor/platform-queue';
import { PrismaScanDispatchAdapter } from '@social-monitor/monitoring/adapters/persistence/prisma/prisma-scan-dispatch.adapter';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import {
  RabbitMqQueuePublisher,
  type RabbitMqPublishOptions,
  type RabbitMqQueueChannelPort,
} from '@social-monitor/platform-queue/adapters/rabbitmq';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { InMemoryScanQueueAdapter } from '../libs/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import {
  PrismaScanJobRepository,
} from '../libs/monitoring/adapters/persistence/prisma/prisma-scan-job.repository';
import {
  PrismaScanPolicyRepository,
} from '../libs/monitoring/adapters/persistence/prisma/prisma-scan-policy.repository';
import {
  PrismaSourceBindingRepository,
} from '../libs/monitoring/adapters/persistence/prisma/prisma-source-binding.repository';
import { ScanPolicy, SourceBinding } from '../libs/monitoring/domain';
import { ScheduleDueScansUseCase } from '../libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case';
import { ScheduleDueScansCommandHandler } from '../libs/monitoring/interfaces/queue/schedule-due-scans-command.handler';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `cross-process-scheduler-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const prisma = new FakePrismaMonitoringClient();
  const tenant = tenantId('tenant-cross-process-scheduler-smoke');
  const workspace = workspaceId('workspace-cross-process-scheduler-smoke');
  const now = new Date('2026-06-16T03:00:00.000Z');

  prisma.sourceCatalogEntries.set('source-rss', {
    id: 'source-rss',
    providerKey: 'rss',
  });

  await new PrismaSourceBindingRepository(prisma).save(SourceBinding.create({
    id: 'source-binding-cross-process-scheduler-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    interestId: 'topic-cross-process-scheduler-smoke',
    providerKey: 'rss',
    capabilityProfileVersion: 1,
    config: {
      feedUrl: 'https://example.test/rss.xml',
    },
    createdAt: new Date('2026-06-16T02:50:00.000Z'),
  }));
  await new PrismaScanPolicyRepository(prisma).save(ScanPolicy.create({
    id: 'scan-policy-cross-process-scheduler-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-cross-process-scheduler-smoke',
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 2,
    nextRunAt: new Date('2026-06-16T02:59:00.000Z'),
    createdAt: new Date('2026-06-16T02:50:00.000Z'),
  }));

  const rabbit = new FakeRabbitMqChannel();
  const metrics = new InMemoryMetricsRecorder();
  const runtime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
  runtime.onModuleInit();

  const publisher = new RabbitMqQueuePublisher(rabbit, {
    exchange: 'social-monitor.commands', exchangeType: 'direct',
    routes: { 'ingestion.scan.execute': { queue: 'jobs.freshness.scan',
      routingKey: 'ingestion.scan.execute', durable: true } },
  }, new FixedClock(now));
  const result = await new ScheduleDueScansCommandHandler(
    new ScheduleDueScansUseCase(
      new PrismaSourceBindingRepository(prisma),
      new PrismaScanPolicyRepository(prisma),
      new PrismaScanJobRepository(prisma),
      new InMemoryScanQueueAdapter(publisher, metrics),
      new PrismaScanDispatchAdapter(prisma),
      new SequenceIdGenerator(),
      new FixedClock(now),
    ),
    metrics,
    runtime,
  ).handle({
    commandId: 'cross-process-scheduler-smoke',
    commandType: 'monitoring.scans.schedule_due',
    schemaVersion: 1,
    correlationId: 'correlation-cross-process-scheduler-smoke',
    payload: {
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    },
  });
  assert(Number(rabbit.published.length) === 0, 'scheduler must commit intent before any broker publication');
  const relay = new CommandOutboxDispatcher(new ScanDispatchFixtureOutbox(prisma), publisher,
    new SequenceIdGenerator(), new FixedClock(now));
  const dispatched = await relay.dispatchBatch(10);
  assert(dispatched.published === 1, 'command relay must publish the committed scan intent');
  await runtime.onApplicationShutdown('cross-process-scheduler-smoke-complete');

  assert(result.evaluated === 1, `expected one evaluated policy, got ${result.evaluated}`);
  assert(result.enqueued === 1, `expected one enqueued scan, got ${result.enqueued}`);
  assert(rabbit.published.length === 1, `expected one RabbitMQ command, got ${rabbit.published.length}`);
  assert(
    JSON.stringify(rabbit.assertedQueue) === JSON.stringify({
      queue: 'jobs.freshness.scan',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-delivery-limit': 20,
        },
      },
    }),
    'scheduler must assert quorum scan command queue',
  );
  assert(rabbit.published[0]?.routingKey === 'ingestion.scan.execute', 'scheduler must route scan command');

  const publishedPayload = JSON.parse(rabbit.published[0]?.content.toString('utf8') ?? '{}') as {
    readonly payload?: {
      readonly providerKey?: string;
      readonly retryBudget?: number;
      readonly scanJobId?: string;
    };
  };
  assert(publishedPayload.payload?.providerKey === 'rss', 'scheduler must publish provider key from persisted binding');
  assert(publishedPayload.payload?.retryBudget === 2, 'scheduler must publish retry budget from persisted policy');

  const persistedJob = [...prisma.scanJobs.values()][0];
  assert(persistedJob?.status === 'ENQUEUED', `expected persisted enqueued job, got ${persistedJob?.status}`);
  assert(
    prisma.scanPolicies.get('scan-policy-cross-process-scheduler-smoke')?.nextRunAt.toISOString() ===
      '2026-06-16T03:04:00.000Z',
    'scheduler must advance persisted scan policy nextRunAt',
  );

  console.log('Cross-process scheduler smoke OK');
}

class FakeRabbitMqChannel implements RabbitMqQueueChannelPort {
  assertedQueue: unknown;
  readonly published: {
    readonly routingKey: string;
    readonly content: Buffer;
    readonly options: RabbitMqPublishOptions;
  }[] = [];

  async assertExchange(): Promise<unknown> {
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

  async bindQueue(): Promise<unknown> {
    return undefined;
  }

  publish(
    _exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): boolean {
    this.published.push({ routingKey, content, options });

    return true;
  }

  async publishAndConfirm(...args: Parameters<RabbitMqQueueChannelPort['publishAndConfirm']>): Promise<boolean> {
    const accepted = this.publish(...args);
    if (accepted) await this.waitForConfirms();
    return accepted;
  }

  async waitForConfirms(): Promise<void> {
    return undefined;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
