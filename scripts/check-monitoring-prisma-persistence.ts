import {
  causationId,
  correlationId,
  eventId,
  FixedClock,
  type IdGenerator,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';

import { resolveIngestionScanReporterMode } from '../apps/ingestion-worker/src/ingestion-worker-provider-tokens';
import { PrismaIdempotencyAdapter } from '../libs/monitoring/adapters/idempotency/prisma/prisma-idempotency.adapter';
import { Interest, ScanJob, ScanPolicy, SourceBinding, SourceCredential } from '../libs/monitoring/domain';
import { PrismaScanJobRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-scan-job.repository';
import { PrismaScanSchedulerDecisionHistoryRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-scan-scheduler-decision-history.repository';
import { PrismaScanPolicyRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-scan-policy.repository';
import { PrismaSourceBindingRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-source-binding.repository';
import { PrismaSourceCredentialRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-source-credential.repository';
import { PrismaInterestRepository } from '../libs/monitoring/adapters/persistence/prisma/prisma-interest.repository';
import { PrismaMonitoringOutboxAdapter } from '../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-outbox.adapter';
import { PrismaSourceCredentialVault } from '../libs/monitoring/adapters/secrets/prisma/prisma-source-credential.vault';
import {
  resolveMonitoringPersistenceMode,
  resolveMonitoringScanQueueMode,
} from '../libs/monitoring/interfaces/rest/monitoring-provider-tokens';
import type { PrismaMonitoringClient } from '../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-client';
import type {
  PrismaScanJobRecord,
  PrismaIdempotencyKeyRecord,
  PrismaOutboxEventRecord,
  PrismaScanAttemptRecord,
  PrismaScanPolicyRecord,
  PrismaScanSchedulerDecisionRecord,
  PrismaSourceBindingRecord,
  PrismaSourceCatalogEntryRecord,
  PrismaSourceCredentialRecord,
  PrismaSourceCredentialSecretRecord,
  PrismaInterestRecord,
} from '../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-records';

const fixedNow = new Date('2026-06-06T00:00:00.000Z');
const clock = new FixedClock(fixedNow);
const tenant = tenantId('00000000-0000-7000-8000-000000000001');
const workspace = workspaceId('00000000-0000-7000-8000-000000000002');

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `monitoring-prisma-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

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
  assert(
    resolveMonitoringScanQueueMode({}) === 'in-memory',
    'monitoring scan queue mode must default to in-memory for deterministic private MVP smoke',
  );
  assertThrows(
    () => resolveMonitoringScanQueueMode({ MONITORING_SCAN_QUEUE: 'rabbitmq' }),
    'RabbitMQ monitoring scan queue mode must require RABBITMQ_URL',
  );
  assert(
    resolveMonitoringScanQueueMode({
      MONITORING_SCAN_QUEUE: 'rabbitmq',
      RABBITMQ_URL: 'amqp://social_monitor:password@localhost:5672',
    }) === 'rabbitmq',
    'monitoring scan queue mode must allow explicit RabbitMQ runtime wiring',
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

  const interests = new PrismaInterestRepository(prisma);
  const bindings = new PrismaSourceBindingRepository(prisma);
  const policies = new PrismaScanPolicyRepository(prisma);
  const scanJobs = new PrismaScanJobRepository(prisma);
  const schedulerDecisions = new PrismaScanSchedulerDecisionHistoryRepository(prisma);
  const outbox = new PrismaMonitoringOutboxAdapter(prisma);
  const sourceCredentials = new PrismaSourceCredentialRepository(prisma);
  const sourceCredentialVault = new PrismaSourceCredentialVault(prisma, Buffer.alloc(32, 3));
  const ids = new SequenceIdGenerator();
  const idempotency = new PrismaIdempotencyAdapter(prisma, ids);

  const interest = Interest.create({
    id: '00000000-0000-7000-8000-000000000020',
    tenantId: tenant,
    workspaceId: workspace,
    name: 'AI Infrastructure',
    query: 'monitoring',
    createdAt: clock.now(),
  });
  await interests.save(interest);

  const foundInterest = await interests.findByName({
    tenantId: tenant,
    workspaceId: workspace,
    name: 'AI Infrastructure',
  });
  assert(foundInterest?.toSnapshot().id === interest.toSnapshot().id, 'interest must round-trip through Prisma repository');

  const listedInterests = await interests.list({
    tenantId: tenant,
    workspaceId: workspace,
    limit: 10,
  });
  assert(listedInterests.interests.length === 1, 'interest list must include tenant-scoped persisted interests');
  assert(
    listedInterests.interests[0]?.toSnapshot().id === interest.toSnapshot().id,
    'interest list must rehydrate persisted interest snapshots',
  );

  const sourceBinding = SourceBinding.create({
    id: '00000000-0000-7000-8000-000000000030',
    tenantId: tenant,
    workspaceId: workspace,
    interestId: interest.toSnapshot().id,
    providerKey: 'fake-source',
    capabilityProfileVersion: 1,
    config: { mode: 'search', query: 'monitoring' },
    createdAt: clock.now(),
  });
  await bindings.save(sourceBinding);
  await bindings.save(sourceBinding.pause());

  const foundBinding = await bindings.findByInterestAndProvider({
    tenantId: tenant,
    workspaceId: workspace,
    interestId: interest.toSnapshot().id,
    providerKey: 'fake-source',
  });
  assert(foundBinding?.toSnapshot().status === 'paused', 'source binding pause state must persist');
  assert(foundBinding.toSnapshot().providerKey === 'fake-source', 'source binding provider key must rehydrate from catalog');

  const listedBindings = await bindings.listByInterest({
    tenantId: tenant,
    workspaceId: workspace,
    interestId: interest.toSnapshot().id,
    limit: 10,
  });
  assert(listedBindings.sourceBindings.length === 1, 'source binding list must include interest-scoped bindings');
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

  await schedulerDecisions.recordBatch({
    records: [{
      id: '00000000-0000-7000-8000-000000000055',
      tenantId: tenant,
      workspaceId: workspace,
      decisionKey: 'scan-policy:00000000-0000-7000-8000-000000000040:due-at:2026-06-06T00:15:00.000Z',
      scanPolicyId: scanPolicy.toSnapshot().id,
      sourceBindingId: sourceBinding.toSnapshot().id,
      providerKey: 'fake-source',
      decision: 'skipped',
      reason: 'fresh_success',
      policyDueAt: new Date('2026-06-06T00:15:00.000Z'),
      evaluatedAt: new Date('2026-06-06T00:15:00.000Z'),
      nextRunAt: new Date('2026-06-06T00:30:00.000Z'),
      configuredIntervalSeconds: 900,
      effectiveIntervalSeconds: 900,
      freshnessSeconds: 3600,
      providerMinimumIntervalEnforced: false,
      correlationId: 'scheduler-decision-prisma-smoke',
    }],
  });
  const schedulerHistory = await schedulerDecisions.listBySourceBindingWindow({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId: sourceBinding.toSnapshot().id,
    windowStartedAt: new Date('2026-06-06T00:00:00.000Z'),
    windowEndedAt: new Date('2026-06-07T00:00:00.000Z'),
    limit: 10,
  });
  assert(schedulerHistory.records.length === 1, 'scheduler decision history must round-trip through Prisma');
  assert(schedulerHistory.records[0]?.reason === 'fresh_success', 'scheduler decision reason must persist');

  await outbox.append({
    eventId: eventId('00000000-0000-7000-8000-000000000060'),
    eventType: 'monitoring.interest.created',
    schemaVersion: 1,
    occurredAt: clock.now(),
    tenantId: tenant,
    workspaceId: workspace,
    correlationId: correlationId('monitoring-prisma-outbox-smoke'),
    causationId: causationId('interest:create:monitoring-prisma-outbox-smoke'),
    payload: {
      interestId: interest.toSnapshot().id,
      tenantId: tenant,
      workspaceId: workspace,
      name: interest.toSnapshot().name,
      query: interest.toSnapshot().query,
    },
  });

  const outboxRecord = prisma.outboxEvents.get('00000000-0000-7000-8000-000000000060');
  assert(outboxRecord?.eventType === 'monitoring.interest.created', 'outbox must persist event type');
  assert(outboxRecord.status === 'PENDING', 'outbox events must start pending for dispatcher delivery');
  assert(outboxRecord.tenantId === tenant, 'outbox event must preserve tenant scope');
  assert(outboxRecord.workspaceId === workspace, 'outbox event must preserve workspace scope');

  await idempotency.set({
    tenantId: tenant,
    workspaceId: workspace,
    scope: 'interest:create',
    key: 'interest-create-idempotency-key',
    value: {
      interestId: interest.toSnapshot().id,
      created: true,
    },
  });

  const rehydratedIdempotency = new PrismaIdempotencyAdapter(prisma, ids);
  const idempotencyRecord = await rehydratedIdempotency.get<{
    readonly interestId: string;
    readonly created: boolean;
  }>({
    tenantId: tenant,
    workspaceId: workspace,
    scope: 'interest:create',
    key: 'interest-create-idempotency-key',
  });
  assert(idempotencyRecord !== null, 'idempotency record must be readable after write');
  assert(
    idempotencyRecord.value.interestId === interest.toSnapshot().id,
    'idempotency response payload must persist across adapter instances',
  );
  assert(idempotencyRecord.value.created === true, 'idempotency response payload must preserve created flag');

  const storedIdempotency = prisma.idempotencyKeys.get(idempotencyStorageKey({
    tenantId: tenant,
    workspaceId: workspace,
    scope: 'interest:create',
    key: 'interest-create-idempotency-key',
  }));
  assert(storedIdempotency !== undefined, 'idempotency record must be stored in Prisma client');
  assert(storedIdempotency.responseStatus === 200, 'idempotency records must persist response status');
  assert(storedIdempotency.expiresAt === null, 'monitoring idempotency records must not expire implicitly');

  await sourceCredentialVault.put({
    secretKeyId: 'source-credential-secret-prisma-smoke',
    secret: {
      accessToken: 'prisma-source-access-token',
      refreshToken: 'prisma-source-refresh-token',
    },
  });
  await sourceCredentials.save(SourceCredential.create({
    id: '00000000-0000-7000-8000-000000000070',
    tenantId: tenant,
    workspaceId: workspace,
    providerKey: 'reddit',
    kind: 'oauth2',
    secretKeyId: 'source-credential-secret-prisma-smoke',
    secretPreview: 'smoke-token',
    scopes: ['identity', 'read'],
    expiresAt: new Date('2026-06-06T01:00:00.000Z'),
    createdAt: clock.now(),
  }));

  const foundSourceCredential = await sourceCredentials.findById({
    tenantId: tenant,
    workspaceId: workspace,
    sourceCredentialId: '00000000-0000-7000-8000-000000000070',
  });
  assert(foundSourceCredential?.toSnapshot().providerKey === 'reddit', 'source credential metadata must persist');
  assert(
    foundSourceCredential.toSnapshot().expiresAt?.toISOString() === '2026-06-06T01:00:00.000Z',
    'source credential expiration must persist',
  );

  const listedSourceCredentials = await sourceCredentials.list({
    tenantId: tenant,
    workspaceId: workspace,
    providerKey: 'reddit',
    limit: 10,
  });
  assert(listedSourceCredentials.sourceCredentials.length === 1, 'source credential list must filter by provider');

  const sourceCredentialSecret = await sourceCredentialVault.get({
    secretKeyId: 'source-credential-secret-prisma-smoke',
  });
  assert(
    sourceCredentialSecret?.accessToken === 'prisma-source-access-token',
    'source credential secret must decrypt from Prisma vault',
  );
  await sourceCredentialVault.delete({ secretKeyId: 'source-credential-secret-prisma-smoke' });
  assert(
    await sourceCredentialVault.get({ secretKeyId: 'source-credential-secret-prisma-smoke' }) === null,
    'source credential secret delete must remove encrypted payload',
  );

  console.log('Monitoring Prisma persistence smoke OK');
}

class FakePrismaMonitoringClient implements PrismaMonitoringClient {
  readonly sourceCatalogEntries = new Map<string, PrismaSourceCatalogEntryRecord>();
  private readonly sourceCatalogEntriesById = new Map<string, PrismaSourceCatalogEntryRecord>();
  private readonly interests = new Map<string, PrismaInterestRecord>();
  private readonly sourceBindings = new Map<string, PrismaSourceBindingRecord>();
  private readonly sourceCredentials = new Map<string, PrismaSourceCredentialRecord>();
  private readonly sourceCredentialSecrets = new Map<string, PrismaSourceCredentialSecretRecord>();
  private readonly scanPolicies = new Map<string, PrismaScanPolicyRecord>();
  private readonly scanJobs = new Map<string, PrismaScanJobRecord>();
  private readonly scanSchedulerDecisions = new Map<string, PrismaScanSchedulerDecisionRecord>();
  private readonly scanAttempts = new Map<string, PrismaScanAttemptRecord>();
  readonly idempotencyKeys = new Map<string, PrismaIdempotencyKeyRecord>();
  readonly outboxEvents = new Map<string, PrismaOutboxEventRecord>();

  readonly interest: PrismaMonitoringClient['interest'] = {
    upsert: async (args) => {
      const existing = this.interests.get(args.where.id);
      const record: PrismaInterestRecord = {
        id: args.where.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        name: existing === undefined ? args.create.name : args.update.name,
        query: existing === undefined ? args.create.query : args.update.query,
        status: existing === undefined ? (args.create.status ?? 'ENABLED') : (args.update.status ?? existing.status),
        createdAt: existing?.createdAt ?? clock.now(),
        deletedAt: existing === undefined ? (args.create.deletedAt ?? null) : (args.update.deletedAt ?? existing.deletedAt),
      };
      this.interests.set(record.id, record);

      return record;
    },
    updateMany: async (args) => {
      const existing = this.interests.get(args.where.id);
      if (
        existing === undefined ||
        existing.tenantId !== args.where.tenantId ||
        existing.workspaceId !== args.where.workspaceId ||
        (existing.deletedAt ?? null) !== args.where.deletedAt
      ) {
        return { count: 0 };
      }

      this.interests.set(existing.id, {
        ...existing,
        status: args.data.status,
        deletedAt: args.data.deletedAt,
      });

      return { count: 1 };
    },
    findFirst: async (args) =>
      [...this.interests.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        (args.where.id === undefined || record.id === args.where.id) &&
        (args.where.name === undefined || record.name === args.where.name) &&
        (record.deletedAt ?? null) === args.where.deletedAt
      )) ?? null,
    findMany: async (args) =>
      [...this.interests.values()]
        .filter((record) => (
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          (record.deletedAt ?? null) === args.where.deletedAt
        ))
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
        interestId: existing?.interestId ?? args.create.interestId,
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
        (args.where.interestId === undefined || record.interestId === args.where.interestId) &&
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
          record.interestId === args.where.interestId
        ))
        .sort(compareRecordsByCreationDesc)
        .slice(args.skip, args.skip + args.take),
  };

  readonly sourceCredential: PrismaMonitoringClient['sourceCredential'] = {
    upsert: async (args) => {
      const existing = this.sourceCredentials.get(args.where.id);
      const record: PrismaSourceCredentialRecord = {
        id: args.where.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        providerKey: existing?.providerKey ?? args.create.providerKey,
        kind: existing === undefined ? args.create.kind : args.update.kind,
        status: existing === undefined ? args.create.status : args.update.status,
        secretKeyId: existing === undefined ? args.create.secretKeyId : args.update.secretKeyId,
        secretPreview: existing === undefined ? args.create.secretPreview : args.update.secretPreview,
        scopes: existing === undefined ? args.create.scopes : args.update.scopes,
        expiresAt: existing === undefined ? args.create.expiresAt ?? null : args.update.expiresAt ?? null,
        createdAt: existing?.createdAt ?? args.create.createdAt,
        updatedAt: existing === undefined ? args.create.updatedAt : clock.now(),
        rotatedAt: existing === undefined ? args.create.rotatedAt ?? null : args.update.rotatedAt ?? null,
        revokedAt: existing === undefined ? args.create.revokedAt ?? null : args.update.revokedAt ?? null,
      };
      this.sourceCredentials.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.sourceCredentials.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        (args.where.id === undefined || record.id === args.where.id) &&
        (args.where.providerKey === undefined || record.providerKey === args.where.providerKey)
      )) ?? null,
    findMany: async (args) =>
      [...this.sourceCredentials.values()]
        .filter((record) => (
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          (args.where.providerKey === undefined || record.providerKey === args.where.providerKey)
        ))
        .sort((left, right) => {
          const updatedDiff = right.updatedAt.getTime() - left.updatedAt.getTime();

          return updatedDiff === 0 ? right.id.localeCompare(left.id) : updatedDiff;
        })
        .slice(args.skip, args.skip + args.take),
  };

  readonly sourceCredentialSecret: PrismaMonitoringClient['sourceCredentialSecret'] = {
    upsert: async (args) => {
      const existing = this.sourceCredentialSecrets.get(args.where.id);
      const record: PrismaSourceCredentialSecretRecord = {
        id: args.where.id,
        algorithm: args.update.algorithm,
        ciphertext: args.update.ciphertext,
        iv: args.update.iv,
        authTag: args.update.authTag,
        createdAt: existing?.createdAt ?? clock.now(),
        updatedAt: clock.now(),
      };
      this.sourceCredentialSecrets.set(record.id, record);

      return record;
    },
    findUnique: async (args) => this.sourceCredentialSecrets.get(args.where.id) ?? null,
    delete: async (args) => {
      const existing = this.sourceCredentialSecrets.get(args.where.id);
      if (existing === undefined) {
        throw new Error('No SourceCredentialSecret found');
      }

      this.sourceCredentialSecrets.delete(args.where.id);

      return existing;
    },
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
        failureMetadata: args.update.failureMetadata ?? null,
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

  readonly scanSchedulerDecision: PrismaMonitoringClient['scanSchedulerDecision'] = {
    upsert: async (args) => {
      const storageKey = schedulerDecisionStorageKey(args.where.tenantId_workspaceId_decisionKey);
      const existing = this.scanSchedulerDecisions.get(storageKey);
      const record: PrismaScanSchedulerDecisionRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        decisionKey: existing?.decisionKey ?? args.create.decisionKey,
        scanPolicyId: existing?.scanPolicyId ?? args.create.scanPolicyId,
        sourceBindingId: existing?.sourceBindingId ?? args.create.sourceBindingId,
        providerKey: args.update.providerKey ?? null,
        decision: args.update.decision,
        reason: args.update.reason,
        scanJobId: args.update.scanJobId ?? null,
        policyDueAt: args.update.policyDueAt,
        evaluatedAt: args.update.evaluatedAt,
        nextRunAt: args.update.nextRunAt,
        configuredIntervalSeconds: args.update.configuredIntervalSeconds,
        effectiveIntervalSeconds: args.update.effectiveIntervalSeconds ?? null,
        freshnessSeconds: args.update.freshnessSeconds ?? null,
        providerMinimumIntervalEnforced: args.update.providerMinimumIntervalEnforced ?? null,
        backoffUntil: args.update.backoffUntil ?? null,
        correlationId: args.update.correlationId ?? null,
        causationId: args.update.causationId ?? null,
        createdAt: existing?.createdAt ?? clock.now(),
        updatedAt: clock.now(),
      };
      this.scanSchedulerDecisions.set(storageKey, record);

      return record;
    },
    findMany: async (args) =>
      [...this.scanSchedulerDecisions.values()]
        .filter((record) => (
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          record.sourceBindingId === args.where.sourceBindingId &&
          record.evaluatedAt.getTime() >= args.where.evaluatedAt.gte.getTime() &&
          record.evaluatedAt.getTime() < args.where.evaluatedAt.lt.getTime()
        ))
        .sort((left, right) => {
          const evaluatedDiff = right.evaluatedAt.getTime() - left.evaluatedAt.getTime();

          return evaluatedDiff === 0 ? right.id.localeCompare(left.id) : evaluatedDiff;
        })
        .slice(0, args.take),
  };

  readonly scanAttempt: PrismaMonitoringClient['scanAttempt'] = {
    findFirst: async (args) =>
      [...this.scanAttempts.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        record.scanJobId === args.where.scanJobId
      )) ?? null,
  };

  readonly outboxEvent: PrismaMonitoringClient['outboxEvent'] = {
    create: async (args) => {
      const record: PrismaOutboxEventRecord = {
        id: args.data.id,
        tenantId: args.data.tenantId ?? null,
        workspaceId: args.data.workspaceId ?? null,
        eventType: args.data.eventType,
        schemaVersion: args.data.schemaVersion,
        payload: args.data.payload,
        status: 'PENDING',
        correlationId: args.data.correlationId,
        causationId: args.data.causationId ?? null,
        createdAt: clock.now(),
        publishedAt: null,
      };
      this.outboxEvents.set(record.id, record);

      return record;
    },
  };

  readonly idempotencyKey: PrismaMonitoringClient['idempotencyKey'] = {
    findFirst: async (args) =>
      this.idempotencyKeys.get(idempotencyStorageKey({
        tenantId: args.where.tenantId,
        workspaceId: args.where.workspaceId,
        scope: args.where.scope,
        key: args.where.key,
      })) ?? null,
    upsert: async (args) => {
      const storageKey = idempotencyStorageKey(args.where.tenantId_workspaceId_scope_key);
      const existing = this.idempotencyKeys.get(storageKey);
      const record: PrismaIdempotencyKeyRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        scope: existing?.scope ?? args.create.scope,
        key: existing?.key ?? args.create.key,
        requestHash: existing?.requestHash ?? args.create.requestHash,
        responseStatus: args.update.responseStatus,
        responsePayload: args.update.responsePayload,
        expiresAt: args.update.expiresAt,
        createdAt: existing?.createdAt ?? clock.now(),
      };
      this.idempotencyKeys.set(storageKey, record);

      return record;
    },
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

const idempotencyStorageKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly scope: string;
  readonly key: string;
}): string => `${params.tenantId}:${params.workspaceId}:${params.scope}:${params.key}`;

const schedulerDecisionStorageKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly decisionKey: string;
}): string => `${params.tenantId}:${params.workspaceId}:${params.decisionKey}`;

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
