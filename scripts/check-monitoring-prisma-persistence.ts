import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { ScanPolicy, SourceBinding, Topic } from '../libs/monitoring/domain';
import { PrismaScanPolicyRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-scan-policy.repository';
import { PrismaSourceBindingRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-source-binding.repository';
import { PrismaTopicRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-topic.repository';
import type { PrismaMonitoringClient } from '../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-client';
import type {
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
  const prisma = new FakePrismaMonitoringClient();
  prisma.sourceCatalogEntries.set('fake-source', {
    id: '00000000-0000-7000-8000-000000000010',
    providerKey: 'fake-source',
  });

  const topics = new PrismaTopicRepository(prisma);
  const bindings = new PrismaSourceBindingRepository(prisma);
  const policies = new PrismaScanPolicyRepository(prisma);

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

  console.log('Monitoring Prisma persistence smoke OK');
}

class FakePrismaMonitoringClient implements PrismaMonitoringClient {
  readonly sourceCatalogEntries = new Map<string, PrismaSourceCatalogEntryRecord>();
  private readonly sourceCatalogEntriesById = new Map<string, PrismaSourceCatalogEntryRecord>();
  private readonly topics = new Map<string, PrismaTopicRecord>();
  private readonly sourceBindings = new Map<string, PrismaSourceBindingRecord>();
  private readonly scanPolicies = new Map<string, PrismaScanPolicyRecord>();

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

  private reindexSourceCatalog(): void {
    this.sourceCatalogEntriesById.clear();
    for (const record of this.sourceCatalogEntries.values()) {
      this.sourceCatalogEntriesById.set(record.id, record);
    }
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
