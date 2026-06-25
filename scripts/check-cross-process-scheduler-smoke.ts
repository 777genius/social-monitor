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
import type { PrismaMonitoringClient } from '../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-client';
import type {
  PrismaIdempotencyKeyRecord,
  PrismaOutboxEventRecord,
  PrismaScanAttemptRecord,
  PrismaScanJobRecord,
  PrismaScanPolicyRecord,
  PrismaSourceBindingRecord,
  PrismaSourceCatalogEntryRecord,
  PrismaTopicRecord,
} from '../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-records';
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
    topicId: 'topic-cross-process-scheduler-smoke',
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

  const result = await new ScheduleDueScansCommandHandler(
    new ScheduleDueScansUseCase(
      new PrismaSourceBindingRepository(prisma),
      new PrismaScanPolicyRepository(prisma),
      new PrismaScanJobRepository(prisma),
      new InMemoryScanQueueAdapter(
        new RabbitMqQueuePublisher(rabbit, {
          exchange: 'social-monitor.commands',
          exchangeType: 'direct',
          routes: {
            'ingestion.scan.execute': {
              queue: 'jobs.freshness.scan',
              routingKey: 'ingestion.scan.execute',
              durable: true,
            },
          },
        }, new FixedClock(now)),
        metrics,
      ),
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

class FakePrismaMonitoringClient implements PrismaMonitoringClient {
  readonly topics = new Map<string, PrismaTopicRecord>();
  readonly sourceCatalogEntries = new Map<string, PrismaSourceCatalogEntryRecord>();
  readonly sourceBindings = new Map<string, PrismaSourceBindingRecord>();
  readonly scanPolicies = new Map<string, PrismaScanPolicyRecord>();
  readonly scanJobs = new Map<string, PrismaScanJobRecord>();
  readonly scanAttempts = new Map<string, PrismaScanAttemptRecord>();
  readonly outboxEvents = new Map<string, PrismaOutboxEventRecord>();
  readonly idempotencyKeys = new Map<string, PrismaIdempotencyKeyRecord>();

  readonly topic: PrismaMonitoringClient['topic'] = {
    upsert: async () => unsupported('topic.upsert'),
    findFirst: async () => unsupported('topic.findFirst'),
    findMany: async () => unsupported('topic.findMany'),
  };

  readonly sourceCatalogEntry: PrismaMonitoringClient['sourceCatalogEntry'] = {
    findUnique: async (args) =>
      [...this.sourceCatalogEntries.values()].find((record) => (
        (args.where.id === undefined || record.id === args.where.id) &&
        (args.where.providerKey === undefined || record.providerKey === args.where.providerKey)
      )) ?? null,
  };

  readonly sourceCredential: PrismaMonitoringClient['sourceCredential'] = {
    upsert: async () => unsupported('sourceCredential.upsert'),
    findFirst: async () => unsupported('sourceCredential.findFirst'),
    findMany: async () => unsupported('sourceCredential.findMany'),
  };

  readonly sourceCredentialSecret: PrismaMonitoringClient['sourceCredentialSecret'] = {
    upsert: async () => unsupported('sourceCredentialSecret.upsert'),
    findUnique: async () => unsupported('sourceCredentialSecret.findUnique'),
    delete: async () => unsupported('sourceCredentialSecret.delete'),
  };

  readonly sourceBinding: PrismaMonitoringClient['sourceBinding'] = {
    upsert: async (args) => {
      const existing = this.sourceBindings.get(args.where.id);
      const record: PrismaSourceBindingRecord = {
        id: args.where.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        topicId: existing?.topicId ?? args.create.topicId,
        sourceCatalogEntryId: existing?.sourceCatalogEntryId ?? args.create.sourceCatalogEntryId,
        capabilityProfileVersion: args.update.capabilityProfileVersion,
        status: args.update.status,
        config: args.update.config,
        createdAt: existing?.createdAt ?? new Date('2026-06-16T02:50:00.000Z'),
      };
      this.sourceBindings.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.sourceBindings.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        (args.where.id === undefined || record.id === args.where.id) &&
        (args.where.topicId === undefined || record.topicId === args.where.topicId) &&
        (args.where.sourceCatalogEntryId === undefined ||
          record.sourceCatalogEntryId === args.where.sourceCatalogEntryId)
      )) ?? null,
    findMany: async () => unsupported('sourceBinding.findMany'),
  };

  readonly scanPolicy: PrismaMonitoringClient['scanPolicy'] = {
    upsert: async (args) => {
      const existing = this.scanPolicies.get(args.where.id);
      const record: PrismaScanPolicyRecord = {
        id: args.where.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        sourceBindingId: existing?.sourceBindingId ?? args.create.sourceBindingId,
        intervalSeconds: args.update.intervalSeconds,
        freshnessSeconds: args.update.freshnessSeconds,
        retryBudget: args.update.retryBudget,
        nextRunAt: args.update.nextRunAt,
        createdAt: existing?.createdAt ?? new Date('2026-06-16T02:50:00.000Z'),
      };
      this.scanPolicies.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.scanPolicies.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        (args.where.workspaceId === undefined || record.workspaceId === args.where.workspaceId) &&
        (args.where.sourceBindingId === undefined || record.sourceBindingId === args.where.sourceBindingId)
      )) ?? null,
    findMany: async (args) =>
      [...this.scanPolicies.values()]
        .filter((record) => (
          (args.where.tenantId === undefined || record.tenantId === args.where.tenantId) &&
          (args.where.workspaceId === undefined || record.workspaceId === args.where.workspaceId) &&
          record.nextRunAt.getTime() <= args.where.nextRunAt.lte.getTime()
        ))
        .sort((left, right) => left.nextRunAt.getTime() - right.nextRunAt.getTime())
        .slice(0, args.take),
  };

  readonly scanJob: PrismaMonitoringClient['scanJob'] = {
    upsert: async (args) => {
      const existing = this.scanJobs.get(args.where.id);
      const record: PrismaScanJobRecord = {
        id: args.where.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        sourceBindingId: existing?.sourceBindingId ?? args.create.sourceBindingId,
        scanPolicyId: existing?.scanPolicyId ?? args.create.scanPolicyId,
        status: args.update.status,
        idempotencyKey: args.update.idempotencyKey,
        requestedAt: args.update.requestedAt,
        enqueuedAt: args.update.enqueuedAt ?? null,
        completedAt: args.update.completedAt ?? null,
        failureReason: args.update.failureReason ?? null,
        createdAt: existing?.createdAt ?? new Date('2026-06-16T03:00:00.000Z'),
      };
      this.scanJobs.set(record.id, record);

      return record;
    },
    findFirst: async (args) => {
      const records = [...this.scanJobs.values()]
        .filter((record) => (
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          (args.where.id === undefined || record.id === args.where.id) &&
          (args.where.idempotencyKey === undefined || record.idempotencyKey === args.where.idempotencyKey) &&
          (args.where.sourceBindingId === undefined || record.sourceBindingId === args.where.sourceBindingId) &&
          (args.where.status === undefined ||
            args.where.status.in.some((status) => status === record.status))
        ));

      if (args.orderBy?.requestedAt === 'asc') {
        records.sort((left, right) => left.requestedAt.getTime() - right.requestedAt.getTime());
      }

      if (args.orderBy?.requestedAt === 'desc') {
        records.sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime());
      }

      return records[0] ?? null;
    },
    findMany: async (args) => {
      const records = [...this.scanJobs.values()]
        .filter((record) => (
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.sourceBindingId === args.where.sourceBindingId
        ))
        .sort((left, right) => {
          const requestedDiff = right.requestedAt.getTime() - left.requestedAt.getTime();

          return requestedDiff === 0 ? right.id.localeCompare(left.id) : requestedDiff;
        });
      const startIndex = args.cursor === undefined
        ? 0
        : Math.max(0, records.findIndex((record) => record.id === args.cursor?.id) + (args.skip ?? 0));

      return records.slice(startIndex, startIndex + args.take);
    },
  };

  readonly scanAttempt: PrismaMonitoringClient['scanAttempt'] = {
    findFirst: async () => null,
  };

  readonly outboxEvent: PrismaMonitoringClient['outboxEvent'] = {
    create: async () => unsupported('outboxEvent.create'),
  };

  readonly idempotencyKey: PrismaMonitoringClient['idempotencyKey'] = {
    findFirst: async () => unsupported('idempotencyKey.findFirst'),
    upsert: async () => unsupported('idempotencyKey.upsert'),
  };
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

  async waitForConfirms(): Promise<void> {
    return undefined;
  }
}

function unsupported(operation: string): never {
  throw new Error(`Unsupported fake Prisma operation: ${operation}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
