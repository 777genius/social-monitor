import { InMemoryFeedItemReadRepository } from '@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository';
import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type { GetMessage } from 'amqplib';

import { InMemoryFeedProjectionAdapter } from '../apps/ingestion-worker/src/adapters/feed/in-memory-feed-projection.adapter';
import {
  InMemoryScanCommandQueueReader,
  RabbitMqScanCommandQueueReader,
  type QueueCommandDelivery,
  type RabbitMqScanQueueReaderChannelPort,
  type ScanCommandQueueReaderPort,
} from '../apps/ingestion-worker/src/scan-command-queue-reader';
import { ScanQueueDrainLoop } from '../apps/ingestion-worker/src/scan-queue-drain-loop';
import { NoopScanExecutionReporterAdapter } from '../libs/ingestion/adapters/reporting/noop-scan-execution-reporter.adapter';
import { InMemoryScanLeaseAdapter } from '../libs/ingestion/adapters/lease/in-memory-scan-lease.adapter';
import { InMemoryScanAttemptRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-attempt.repository';
import { InMemoryScanCursorRepository } from '../libs/ingestion/adapters/persistence/in-memory-scan-cursor.repository';
import { InMemorySourceItemRepository } from '../libs/ingestion/adapters/persistence/in-memory-source-item.repository';
import { InMemoryScanFailureQueueAdapter } from '../libs/ingestion/adapters/queue/in-memory-scan-failure-queue.adapter';
import { FakeSourceProvider } from '../libs/ingestion/adapters/source/fake-source.provider';
import { InMemorySourceProviderRegistry } from '../libs/ingestion/adapters/source/in-memory-source-provider.registry';
import { RegistrySourceFetcherAdapter } from '../libs/ingestion/adapters/source/registry-source-fetcher.adapter';
import { sourceReadinessProfiles } from '../libs/ingestion/adapters/source/source-readiness-profiles';
import { ExecuteScanUseCase } from '../libs/ingestion/features/execute-scan/execute-scan.use-case';
import { ExecuteScanCommandHandler } from '../libs/ingestion/interfaces/queue/execute-scan-command.handler';
import type { ScanRetryQueuePort } from '../libs/ingestion/ports';
import { InMemoryScanJobRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-job.repository';
import { InMemoryScanPolicyRepository } from '../libs/monitoring/adapters/persistence/in-memory-scan-policy.repository';
import { InMemorySourceBindingRepository } from '../libs/monitoring/adapters/persistence/in-memory-source-binding.repository';
import { InMemoryScanQueueAdapter } from '../libs/monitoring/adapters/queue/in-memory-scan-queue.adapter';
import { ScanPolicy, SourceBinding } from '../libs/monitoring/domain';
import { ScheduleDueScansUseCase } from '../libs/monitoring/features/schedule-due-scans/schedule-due-scans.use-case';

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `scan-queue-drain-loop-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

class FakeRabbitMqReaderChannel implements RabbitMqScanQueueReaderChannelPort {
  readonly assertedExchanges: unknown[] = [];
  readonly assertedQueues: unknown[] = [];
  readonly prefetchCounts: number[] = [];
  acked = 0;
  nacked = 0;

  constructor(private readonly messages: GetMessage[]) {}

  async assertExchange(
    exchange: string,
    type: 'fanout',
    options: { readonly durable: boolean },
  ): Promise<void> {
    this.assertedExchanges.push({ exchange, type, options });
  }

  async assertQueue(
    queue: string,
    options: {
      readonly durable: boolean;
      readonly arguments?: Readonly<Record<string, string | number | boolean>>;
    },
  ): Promise<void> {
    this.assertedQueues.push({ queue, options });
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

  async prefetch(count: number): Promise<void> {
    this.prefetchCounts.push(count);
  }
}

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const tenant = tenantId('tenant-scan-queue-drain-loop-smoke');
  const workspace = workspaceId('workspace-scan-queue-drain-loop-smoke');
  const now = new Date('2026-06-06T10:00:00.000Z');
  const bindings = new InMemorySourceBindingRepository();
  const scanPolicies = new InMemoryScanPolicyRepository();
  const scanJobs = new InMemoryScanJobRepository();
  const queuePublisher = new InMemoryQueuePublisher();
  const queueReader = new InMemoryScanCommandQueueReader(queuePublisher);
  const metrics = new InMemoryMetricsRecorder();
  const feedItems = new InMemoryFeedItemReadRepository();
  const sourceItems = new InMemorySourceItemRepository();
  const scanAttempts = new InMemoryScanAttemptRepository();
  const scanCursors = new InMemoryScanCursorRepository();
  const scanFailures = new InMemoryScanFailureQueueAdapter(metrics);
  const scanLeases = new InMemoryScanLeaseAdapter();
  const runtime = new WorkerRuntime({ serviceName: 'ingestion-worker' });
  runtime.onModuleInit();

  await bindings.save(SourceBinding.create({
    id: 'source-binding-drain-loop-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: 'topic-drain-loop-smoke',
    providerKey: 'fake-source',
    capabilityProfileVersion: 1,
    config: {
      mode: 'search',
      query: 'drain loop monitoring',
    },
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));
  await scanPolicies.save(ScanPolicy.create({
    id: 'scan-policy-drain-loop-smoke',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: 'source-binding-drain-loop-smoke',
    intervalSeconds: 300,
    freshnessSeconds: 900,
    retryBudget: 2,
    nextRunAt: new Date('2026-06-06T09:59:00.000Z'),
    createdAt: new Date('2026-06-06T09:00:00.000Z'),
  }));

  const scheduled = await new ScheduleDueScansUseCase(
    bindings,
    scanPolicies,
    scanJobs,
    new InMemoryScanQueueAdapter(queuePublisher, metrics),
    new SequenceIdGenerator(),
    new FixedClock(now),
  ).execute({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
    correlationId: 'scan-queue-drain-loop-smoke',
  });

  if (!scheduled.ok) {
    throw scheduled.error;
  }

  assert(scheduled.value.enqueued === 1, `expected one enqueued scan, got ${scheduled.value.enqueued}`);
  assert(queuePublisher.all().length === 1, `expected one queued scan command, got ${queuePublisher.all().length}`);
  const queuedCommand = queuePublisher.all()[0];
  assert(queuedCommand !== undefined, 'expected queued scan command to exist before drain');
  assert(
    typeof queuedCommand.payload.scanJobId === 'string',
    'expected queued scan command payload to include scanJobId',
  );

  const handler = new ExecuteScanCommandHandler(
    new ExecuteScanUseCase(
      new RegistrySourceFetcherAdapter(
        new InMemorySourceProviderRegistry([new FakeSourceProvider()], sourceReadinessProfiles),
      ),
      sourceItems,
      new InMemoryFeedProjectionAdapter(feedItems),
      scanAttempts,
      scanCursors,
      new NoopScanExecutionReporterAdapter(),
      scanFailures,
      scanLeases,
      new SequenceIdGenerator(),
      new FixedClock(new Date('2026-06-06T10:00:01.000Z')),
    ),
    metrics,
    runtime,
  );

  const loop = new ScanQueueDrainLoop(
    queueReader,
    handler,
    scanFailures,
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
    metrics,
    new FixedClock(new Date('2026-06-06T10:00:02.000Z')),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('scan-queue-drain-loop-smoke-complete');

  assert(queuePublisher.all().length === 0, `drain loop must empty scan queue, got ${queuePublisher.all().length}`);
  assert(sourceItems.all().length === 2, `drain loop must persist two source items, got ${sourceItems.all().length}`);

  const feed = await feedItems.list({ tenantId: tenant, workspaceId: workspace, limit: 10 });
  assert(feed.items.length === 2, `drain loop must project two feed items, got ${feed.items.length}`);

  const attempt = await scanAttempts.findByScanJob({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: queuedCommand.payload.scanJobId,
  });
  assert(attempt?.toSnapshot().status === 'succeeded', `expected succeeded scan attempt, got ${attempt?.toSnapshot().status}`);
  assert(
    metrics.counterValue('scan_jobs_total', {
      job_type: 'scan',
      status: 'started',
      worker: 'ingestion-worker',
    }) === 1,
    'drain loop must record started scan metric',
  );
  assert(
    metrics.counterValue('scan_jobs_total', {
      job_type: 'scan',
      status: 'succeeded',
      worker: 'ingestion-worker',
    }) === 1,
    'drain loop must record succeeded scan metric',
  );

  await scanFailures.enqueueRetry({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: 'scan-job-retry-drain-loop-smoke',
    topicId: 'topic-drain-loop-smoke',
    sourceBindingId: 'source-binding-drain-loop-smoke',
    scanPolicyId: 'scan-policy-drain-loop-smoke',
    providerKey: 'fake-source',
    sourceQuery: {
      mode: 'search',
      query: 'drain loop monitoring',
    },
    correlationId: 'scan-queue-drain-loop-smoke-retry',
    causationId: 'scan-queue-drain-loop-smoke-primary-failure',
    attemptNumber: 1,
    retryBudget: 2,
    nextAttemptNumber: 2,
    failureReason: 'Provider unavailable',
  });

  assert(scanFailures.retries().length === 1, 'retry queue must contain one retry before retry drain');

  const retryLoop = new ScanQueueDrainLoop(
    queueReader,
    handler,
    scanFailures,
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 10,
      runOnStart: true,
    },
    metrics,
    new FixedClock(new Date('2026-06-06T10:00:03.000Z')),
  );

  await retryLoop.onModuleInit();
  await retryLoop.onApplicationShutdown('scan-queue-drain-loop-retry-smoke-complete');
  await runtime.onApplicationShutdown('scan-queue-drain-loop-smoke-complete');

  assert(scanFailures.retries().length === 0, 'retry drain loop must empty scan retry queue');
  const retryAttempt = await scanAttempts.findByScanJob({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: 'scan-job-retry-drain-loop-smoke',
  });
  assert(
    retryAttempt?.toSnapshot().status === 'succeeded',
    `expected succeeded retry scan attempt, got ${retryAttempt?.toSnapshot().status}`,
  );
  assert(
    metrics.counterValue('scan_jobs_total', {
      job_type: 'scan',
      status: 'started',
      worker: 'ingestion-worker',
    }) === 2,
    'retry drain loop must record second started scan metric',
  );
  assert(
    metrics.counterValue('scan_jobs_total', {
      job_type: 'scan',
      status: 'succeeded',
      worker: 'ingestion-worker',
    }) === 2,
    'retry drain loop must record second succeeded scan metric',
  );

  const malformedRabbitMessage = {
    content: Buffer.from(JSON.stringify({
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      payload: {},
    })),
  } as GetMessage;
  const rabbitMessage = {
    content: Buffer.from(JSON.stringify({
      commandId: 'rabbit-scan-command-smoke',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'rabbit-scan-command-smoke-correlation',
      payload: {
        tenantId: tenant,
        workspaceId: workspace,
        scanJobId: 'rabbit-scan-command-smoke',
      },
    })),
    fields: {
      redelivered: true,
    },
    properties: {
      headers: {
        'x-death': [
          {
            queue: 'jobs.freshness.scan',
            count: 2,
            reason: 'expired',
          },
        ],
      },
    },
  } as GetMessage;
  const rabbitChannel = new FakeRabbitMqReaderChannel([malformedRabbitMessage, rabbitMessage]);
  const rabbitReader = new RabbitMqScanCommandQueueReader(rabbitChannel, {
    queue: 'jobs.freshness.scan',
    deadLetterExchange: 'social-monitor.jobs.dlx',
    queueType: 'quorum',
    deliveryLimit: 20,
  });
  const rabbitDeliveries = await rabbitReader.drain({
    commandType: 'ingestion.scan.execute',
    limit: 5,
  });
  assert(rabbitDeliveries.length === 1, 'RabbitMQ reader must drain one matching scan command');
  assert(
    JSON.stringify(rabbitChannel.assertedExchanges[0]) === JSON.stringify({
      exchange: 'social-monitor.jobs.dlx',
      type: 'fanout',
      options: { durable: true },
    }),
    'RabbitMQ reader must assert configured scan dead-letter exchange',
  );
  assert(
    JSON.stringify(rabbitChannel.assertedQueues[0]) === JSON.stringify({
      queue: 'jobs.freshness.scan',
      options: {
        durable: true,
        arguments: {
          'x-queue-type': 'quorum',
          'x-dead-letter-exchange': 'social-monitor.jobs.dlx',
          'x-delivery-limit': 20,
        },
      },
    }),
    'RabbitMQ reader must assert configured quorum scan queue',
  );
  assert(rabbitChannel.prefetchCounts[0] === 5, 'RabbitMQ reader must prefetch the drain limit');
  const rabbitDelivery = rabbitDeliveries[0];
  assert(rabbitDelivery !== undefined, 'RabbitMQ reader must return a delivery');
  assert(
    rabbitDelivery.command.commandId === 'rabbit-scan-command-smoke',
    'RabbitMQ reader must parse command envelope',
  );
  assert(
    rabbitDelivery.diagnostics.redelivered === true &&
      rabbitDelivery.diagnostics.deadLetterCount === 2 &&
      rabbitDelivery.diagnostics.deadLetterReason === 'expired',
    'RabbitMQ reader must expose x-death diagnostics on valid deliveries',
  );
  assert(rabbitChannel.nacked === 1, 'RabbitMQ reader must nack malformed poison envelopes and continue');
  await rabbitDelivery.ack();
  assert(rabbitChannel.acked === 1, 'RabbitMQ reader delivery ack must ack broker message');
  assert(rabbitChannel.nacked === 1, 'RabbitMQ reader must not nack successful broker message');
  await verifyScanQueueDeliveryLagMetric();

  console.log('Scan queue drain loop smoke OK');
}

async function verifyScanQueueDeliveryLagMetric(): Promise<void> {
  const metrics = new InMemoryMetricsRecorder();
  const delivery: QueueCommandDelivery = {
    command: {
      commandId: 'scan-lag-metric-smoke',
      commandType: 'ingestion.scan.execute',
      schemaVersion: 1,
      correlationId: 'scan-lag-metric-smoke',
      payload: {
        tenantId: 'tenant-scan-lag-metric-smoke',
        workspaceId: 'workspace-scan-lag-metric-smoke',
        scanJobId: 'scan-lag-metric-smoke',
      },
    },
    diagnostics: {
      redelivered: false,
      deadLetterCount: 0,
      publishedAtEpochMs: Date.parse('2026-06-06T10:00:00.000Z'),
    },
    ack: async () => undefined,
    nack: async () => undefined,
  };
  const reader: ScanCommandQueueReaderPort = {
    drain: async () => [delivery],
  };
  const retryQueue: ScanRetryQueuePort = {
    drainRetries: async () => [],
  };
  const handler = {
    handle: async () => undefined,
  } as unknown as ExecuteScanCommandHandler;
  const loop = new ScanQueueDrainLoop(
    reader,
    handler,
    retryQueue,
    {
      enabled: true,
      intervalMs: 60_000,
      limit: 1,
      runOnStart: true,
    },
    metrics,
    new FixedClock(new Date('2026-06-06T10:00:45.000Z')),
  );

  await loop.onModuleInit();
  await loop.onApplicationShutdown('scan-lag-metric-smoke-complete');
  assert(
    metrics.latestGaugeValue('queue_command_delivery_lag_seconds', {
      command_type: 'ingestion.scan.execute',
      queue: 'scan',
      worker: 'ingestion-worker',
    }) === 45,
    'scan queue drain loop must record RabbitMQ delivery lag seconds',
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
