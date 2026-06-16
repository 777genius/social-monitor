import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { resolveIngestionScanReporterMode } from '../apps/ingestion-worker/src/ingestion-worker-provider-tokens';
import { ScanJob, ScanPolicy, SourceBinding, Topic } from '../libs/monitoring/domain';
import { PrismaScanJobRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-scan-job.repository';
import { PrismaScanPolicyRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-scan-policy.repository';
import { PrismaSourceBindingRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-source-binding.repository';
import { PrismaTopicRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-topic.repository';
import { resolveMonitoringPersistenceMode } from '../libs/monitoring/interfaces/rest/monitoring-provider-tokens';
import type { PrismaMonitoringClient } from '../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-client';
import type {
  PrismaScanJobRecord,
  PrismaScanAttemptRecord,
  PrismaScanPolicyRecord,
  PrismaSourceBindingRecord,
  PrismaSourceCatalogEntryRecord,
  PrismaTopicRecord,
} from '../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-records';

const fixedNow = new Date('2026-06-06T00:00:00.000Z');
const clock = new FixedClock(fixedNow);
const tenant = tenantId('00000000-0000-7000-8000-000000000001');
const workspace = workspaceId('00000000-0000-7000-8000-000000000002');

async function main(): Promise<void> {
  assert(
    resolveMonitoringPersistenceMode({}) === 'in-memory',
    'monitoring persistence mode must default to in-memory for deterministic private MVP smoke',
  );
  assert(
    resolveMonitoringPersistenceMode({
      MONITORING_PERSISTENCE: 'prisma',
      DATABASE_URL: 'postgresql://social_monitor:social_monitor_local_password@localhost:5432/social_monitor',
    }) === 'prisma',
    'monitoring persistence mode must allow explicit Prisma runtime wiring',
  );
  assertThrows(
    () => resolveMonitoringPersistenceMode({ MONITORING_PERSISTENCE: 'prisma' }),
    'Prisma monitoring persistence must require DATABASE_URL',
  );
  assert(resolveIngestionScanReporterMode({}) === 'noop', 'ingestion scan reporter must default to noop');
  assertThrows(
    () => resolveIngestionScanReporterMode({ INGESTION_SCAN_REPORTER: 'monitoring' }),
    'monitoring scan reporter must require Prisma monitoring persistence',
  );
  assert(
    resolveIngestionScanReporterMode({
      INGESTION_SCAN_REPORTER: 'monitoring',
      MONITORING_PERSISTENCE: 'prisma',
    }) === 'monitoring',
    'monitoring scan reporter must be opt-in when Prisma monitoring persistence is enabled',
  );

  const prisma = new FakePrismaMonitoringClient();
  prisma.sourceCatalogEntries.set('fake-source', {
    id: '00000000-0000-7000-8000-000000000010',
    providerKey: 'fake-source',
  });

  const topics = new PrismaTopicRepository(prisma);
  const bindings = new PrismaSourceBindingRepository(prisma);
  const policies = new PrismaScanPolicyRepository(prisma);
  const scanJobs = new PrismaScanJobRepository(prisma);

  const topic = Topic.create({
    id: '00000000-0000-7000-8000-000000000020',
    tenantId: tenant,
    workspaceId: workspace,
    name: 'AI Infrastructure',
    query: 'monitoring',
    createdAt: clock.now(),
  });
  await topics.save(topic);

  const foundTopic = await topics.findByName({
    tenantId: tenant,
    workspaceId: workspace,
    name: 'AI Infrastructure',
  });
  assert(foundTopic?.toSnapshot().id === topic.toSnapshot().id, 'topic must round-trip through Prisma repository');

  const listedTopics = await topics.list({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
  });
  assert(listedTopics.topics.length === 1, 'topic list must include tenant-scoped persisted topics');
  assert(
    listedTopics.topics[0]?.toSnapshot().id === topic.toSnapshot().id,
    'topic list must rehydrate persisted topic snapshots',
  );

  const sourceBinding = SourceBinding.create({
    id: '00000000-0000-7000-8000-000000000030',
    tenantId: tenant,
    workspaceId: workspace,
    topicId: topic.toSnapshot().id,
    providerKey: 'fake-source',
    capabilityProfileVersion: 1,
    config: { mode: 'search', query: 'monitoring' },
    createdAt: clock.now(),
  });
  await bindings.save(sourceBinding);
  await bindings.save(sourceBinding.pause());

  const foundBinding = await bindings.findByTopicAndProvider({
    tenantId: tenant,
    workspaceId: workspace,
    topicId: topic.toSnapshot().id,
    providerKey: 'fake-source',
  });
  assert(foundBinding?.toSnapshot().status === 'paused', 'source binding pause state must persist');
  assert(foundBinding.toSnapshot().providerKey === 'fake-source', 'source binding provider key must rehydrate from catalog');

  const listedBindings = await bindings.listByTopic({
    tenantId: tenant,
    workspaceId: workspace,
    topicId: topic.toSnapshot().id,
    limit: 10,
  });
  assert(listedBindings.sourceBindings.length === 1, 'source binding list must include topic-scoped bindings');
  assert(
    listedBindings.sourceBindings[0]?.toSnapshot().providerKey === 'fake-source',
    'source binding list must rehydrate provider keys from catalog entries',
  );

  const scanPolicy = ScanPolicy.create({
    id: '00000000-0000-7000-8000-000000000040',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: sourceBinding.toSnapshot().id,
    intervalSeconds: 900,
    freshnessSeconds: 3600,
    retryBudget: 2,
    nextRunAt: new Date('2026-06-06T00:15:00.000Z'),
    createdAt: clock.now(),
  });
  await policies.save(scanPolicy);

  const foundPolicy = await policies.findBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: sourceBinding.toSnapshot().id,
  });
  assert(
    foundPolicy?.toSnapshot().nextRunAt.toISOString() === '2026-06-06T00:15:00.000Z',
    'scan policy nextRunAt must persist for durable scheduler correctness',
  );

  const dueBefore = await policies.findDue({
    tenantId: tenant,
    workspaceId: workspace,
    now: new Date('2026-06-06T00:14:59.000Z'),
    limit: 10,
  });
  assert(dueBefore.length === 0, 'scan policy must not be due before nextRunAt');

  const dueAt = await policies.findDue({
    tenantId: tenant,
    workspaceId: workspace,
    now: new Date('2026-06-06T00:15:00.000Z'),
    limit: 10,
  });
  assert(dueAt.length === 1, 'scan policy must be due at nextRunAt');

  const scanJob = ScanJob.request({
    id: '00000000-0000-7000-8000-000000000050',
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: sourceBinding.toSnapshot().id,
    scanPolicyId: scanPolicy.toSnapshot().id,
    idempotencyKey: 'manual:fake-source:monitoring',
    requestedAt: clock.now(),
  });
  await scanJobs.save(scanJob);

  const foundByIdempotency = await scanJobs.findByIdempotencyKey({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'manual:fake-source:monitoring',
  });
  assert(foundByIdempotency?.toSnapshot().status === 'requested', 'scan job requested state must persist');

  const enqueuedScanJob = scanJob.markEnqueued({ enqueuedAt: new Date('2026-06-06T00:00:05.000Z') });
  await scanJobs.save(enqueuedScanJob);

  const activeScanJob = await scanJobs.findActiveBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: sourceBinding.toSnapshot().id,
  });
  assert(activeScanJob?.toSnapshot().status === 'enqueued', 'active scan job lookup must include enqueued jobs');

  const succeededScanJob = enqueuedScanJob.markSucceeded({
    completedAt: new Date('2026-06-06T00:00:10.000Z'),
  });
  await scanJobs.save(succeededScanJob);

  const noActiveScanJob = await scanJobs.findActiveBySourceBinding({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: sourceBinding.toSnapshot().id,
  });
  assert(noActiveScanJob === null, 'completed scan jobs must no longer block active scan lookup');

  const completedById = await scanJobs.findById({
    tenantId: tenant,
    workspaceId: workspace,
    scanJobId: scanJob.toSnapshot().id,
  });
  assert(completedById?.toSnapshot().status === 'succeeded', 'scan job completion state must persist');

  console.log('Monitoring Prisma persistence smoke OK');
}

class FakePrismaMonitoringClient implements PrismaMonitoringClient {
  readonly sourceCatalogEntries = new Map<string, PrismaSourceCatalogEntryRecord>();
  private readonly sourceCatalogEntriesById = new Map<string, PrismaSourceCatalogEntryRecord>();
  private readonly topics = new Map<string, PrismaTopicRecord>();
  private readonly sourceBindings = new Map<string, PrismaSourceBindingRecord>();
  private readonly scanPolicies = new Map<string, PrismaScanPolicyRecord>();
  private readonly scanJobs = new Map<string, PrismaScanJobRecord>();
  private readonly scanAttempts = new Map<string, PrismaScanAttemptRecord>();

  readonly topic: PrismaMonitoringClient['topic'] = {
    upsert: async (args) => {
      const existing = this.topics.get(args.where.id);
      const record: PrismaTopicRecord = {
        id: args.where.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        name: existing === undefined ? args.create.name : args.update.name,
        query: existing === undefined ? args.create.query : args.update.query,
        createdAt: existing?.createdAt ?? clock.now(),
      };
      this.topics.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.topics.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        (args.where.id === undefined || record.id === args.where.id) &&
        (args.where.name === undefined || record.name === args.where.name)
      )) ?? null,
    findMany: async (args) =>
      [...this.topics.values()]
        .filter((record) => record.tenantId === args.where.tenantId && record.workspaceId === args.where.workspaceId)
        .sort(compareRecordsByCreationDesc)
        .slice(args.skip, args.skip + args.take),
  };

  readonly sourceCatalogEntry: PrismaMonitoringClient['sourceCatalogEntry'] = {
    findUnique: async (args) => {
      this.reindexSourceCatalog();
      if (args.where.providerKey !== undefined) {
        return this.sourceCatalogEntries.get(args.where.providerKey) ?? null;
      }

      if (args.where.id !== undefined) {
        return this.sourceCatalogEntriesById.get(args.where.id) ?? null;
      }

      return null;
    },
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
        createdAt: existing?.createdAt ?? clock.now(),
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
        (
          args.where.sourceCatalogEntryId === undefined ||
          record.sourceCatalogEntryId === args.where.sourceCatalogEntryId
        )
      )) ?? null,
    findMany: async (args) =>
      [...this.sourceBindings.values()]
        .filter((record) => (
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.topicId === args.where.topicId
        ))
        .sort(compareRecordsByCreationDesc)
        .slice(args.skip, args.skip + args.take),
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
        createdAt: existing?.createdAt ?? clock.now(),
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
        createdAt: existing?.createdAt ?? clock.now(),
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
          (args.where.status === undefined || args.where.status.in.some((status) => status === record.status))
        ));

      if (args.orderBy?.requestedAt === 'asc') {
        records.sort((left, right) => left.requestedAt.getTime() - right.requestedAt.getTime());
      }

      if (args.orderBy?.requestedAt === 'desc') {
        records.sort((left, right) => right.requestedAt.getTime() - left.requestedAt.getTime());
      }

      return records[0] ?? null;
    },
  };

  readonly scanAttempt: PrismaMonitoringClient['scanAttempt'] = {
    findFirst: async (args) =>
      [...this.scanAttempts.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        record.scanJobId === args.where.scanJobId
      )) ?? null,
  };

  private reindexSourceCatalog(): void {
    this.sourceCatalogEntriesById.clear();
    for (const record of this.sourceCatalogEntries.values()) {
      this.sourceCatalogEntriesById.set(record.id, record);
    }
  }
}

const compareRecordsByCreationDesc = (
  left: { readonly id: string; readonly createdAt: Date },
  right: { readonly id: string; readonly createdAt: Date },
): number => {
  const createdDiff = right.createdAt.getTime() - left.createdAt.getTime();

  if (createdDiff !== 0) {
    return createdDiff;
  }

  return right.id.localeCompare(left.id);
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(action: () => void, message: string): void {
  try {
    action();
  } catch {
    return;
  }

  throw new Error(message);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
