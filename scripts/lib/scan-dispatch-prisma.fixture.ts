import type { PrismaMonitoringClient } from '../../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-client';
import type {
  PrismaIdempotencyKeyRecord,
  PrismaOutboxEventRecord,
  PrismaScanAttemptRecord,
  PrismaScanJobRecord,
  PrismaScanPolicyRecord,
  PrismaScanSchedulerDecisionRecord,
  PrismaSourceBindingRecord,
  PrismaSourceCatalogEntryRecord,
  PrismaInterestRecord,
} from '../../libs/monitoring/adapters/persistence/prisma/prisma-monitoring-records';

export class FakePrismaMonitoringClient implements PrismaMonitoringClient {
  failAfterWrite: 'job' | 'event' | 'command' | undefined;

  async $transaction<TValue>(
    work: (transaction: PrismaMonitoringClient) => Promise<TValue>,
    options: { readonly isolationLevel: 'Serializable' },
  ): Promise<TValue> {
    if (options.isolationLevel !== 'Serializable') throw new Error('Serializable transaction required');
    const jobs = new Map(this.scanJobs);
    const outbox = new Map(this.outboxEvents);
    try { return await work(this); }
    catch (error) {
      this.scanJobs.clear();
      for (const [id, row] of jobs) this.scanJobs.set(id, row);
      this.outboxEvents.clear();
      for (const [id, row] of outbox) this.outboxEvents.set(id, row);
      throw error;
    }
  }

  private failAt(stage: 'job' | 'event' | 'command'): void {
    if (this.failAfterWrite === stage) {
      this.failAfterWrite = undefined;
      throw new Error(`Synthetic dispatch failure after ${stage}`);
    }
  }

  readonly interests = new Map<string, PrismaInterestRecord>();
  readonly sourceCatalogEntries = new Map<string, PrismaSourceCatalogEntryRecord>();
  readonly sourceBindings = new Map<string, PrismaSourceBindingRecord>();
  readonly scanPolicies = new Map<string, PrismaScanPolicyRecord>();
  readonly scanJobs = new Map<string, PrismaScanJobRecord>();
  readonly scanSchedulerDecisions = new Map<string, PrismaScanSchedulerDecisionRecord>();
  readonly scanAttempts = new Map<string, PrismaScanAttemptRecord>();
  readonly outboxEvents = new Map<string, PrismaOutboxEventRecord & { readonly messageKind: 'EVENT' | 'COMMAND' }>();
  readonly idempotencyKeys = new Map<string, PrismaIdempotencyKeyRecord>();

  readonly interest: PrismaMonitoringClient['interest'] = {
    create: async () => unsupported('interest.create'),
    count: async () => unsupported('interest.count'),
    upsert: async () => unsupported('interest.upsert'),
    updateMany: async () => unsupported('interest.updateMany'),
    findFirst: async () => unsupported('interest.findFirst'),
    findMany: async () => unsupported('interest.findMany'),
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
    updateMany: async ({ where, data }) => {
      const current = this.sourceBindings.get(where.id);
      if (current === undefined || current.tenantId !== where.tenantId ||
        current.workspaceId !== where.workspaceId ||
        current.interestId !== where.interestId || current.status !== where.status) {
        return { count: 0 };
      }
      this.sourceBindings.set(current.id, { ...current, status: data.status });
      return { count: 1 };
    },
    create: async ({ data }) => {
      if (this.sourceBindings.has(data.id)) throw new Error('Duplicate source binding in test store');
      const record: PrismaSourceBindingRecord = { ...data, createdAt: new Date('2026-06-16T02:50:00.000Z') };
      this.sourceBindings.set(record.id, record);
      return record;
    },
    count: async ({ where }) =>
      [...this.sourceBindings.values()].filter((row) =>
        row.tenantId === where.tenantId &&
        row.workspaceId === where.workspaceId &&
        row.interestId === where.interestId &&
        row.status === where.status
      ).length,
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
        (args.where.interestId === undefined || record.interestId === args.where.interestId) &&
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
    updateMany: async ({ where, data }) => {
      const current = this.scanJobs.get(where.id);
      if (current?.tenantId !== where.tenantId || current.workspaceId !== where.workspaceId ||
          current.status !== where.status) return { count: 0 };
      this.scanJobs.set(where.id, { ...current, ...data, completedAt: data.completedAt ?? null });
      return { count: 1 };
    },
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
        createdAt: existing?.createdAt ?? new Date('2026-06-16T03:00:00.000Z'),
      };
      this.scanJobs.set(record.id, record);
      this.failAt('job');

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
        createdAt: existing?.createdAt ?? new Date('2026-06-16T03:00:00.000Z'),
        updatedAt: new Date('2026-06-16T03:00:00.000Z'),
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
    findFirst: async () => null,
  };

  readonly outboxEvent: PrismaMonitoringClient['outboxEvent'] = {
    create: async ({ data }) => {
      if (this.outboxEvents.has(data.id)) throw new Error('Duplicate outbox identity');
      const record = { ...data, tenantId: data.tenantId ?? null, workspaceId: data.workspaceId ?? null,
        causationId: data.causationId ?? null, messageKind: data.messageKind ?? 'EVENT',
        status: 'PENDING' as const, publishedAt: null,
        createdAt: data.createdAt ?? new Date('2026-06-16T03:00:00.000Z') };
      this.outboxEvents.set(record.id, record);
      this.failAt(record.messageKind === 'EVENT' ? 'event' : 'command');
      return record;
    },
  };

  readonly idempotencyKey: PrismaMonitoringClient['idempotencyKey'] = {
    findFirst: async () => unsupported('idempotencyKey.findFirst'),
    upsert: async () => unsupported('idempotencyKey.upsert'),
  };
}

function unsupported(operation: string): never {
  throw new Error(`Unsupported fake Prisma operation: ${operation}`);
}

function schedulerDecisionStorageKey(params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly decisionKey: string;
}): string {
  return `${params.tenantId}:${params.workspaceId}:${params.decisionKey}`;
}

