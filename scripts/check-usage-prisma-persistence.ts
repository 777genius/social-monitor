import { FixedClock, type IdGenerator, isOk, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { PrismaPublicApiAuditLog } from '../libs/usage/adapters/persistence/prisma/prisma-public-api-audit-log';
import { PrismaRateLimitCounter } from '../libs/usage/adapters/persistence/prisma/prisma-rate-limit-counter';
import type { PrismaUsageClient } from '../libs/usage/adapters/persistence/prisma/prisma-usage-client';
import { PrismaUsageQuotaLedger } from '../libs/usage/adapters/persistence/prisma/prisma-usage-quota-ledger';
import type {
  PrismaPublicApiAuditEventRecord,
  PrismaRateLimitBucketRecord,
  PrismaUsageQuotaBucketRecord,
} from '../libs/usage/adapters/persistence/prisma/prisma-usage-records';
import { CheckPublicApiRateLimitUseCase } from '../libs/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';
import { RecordPublicApiAuditEventUseCase } from '../libs/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';
import { ReserveUsageQuotaUseCase } from '../libs/usage/features/reserve-usage-quota/reserve-usage-quota.use-case';
import { resolveUsagePersistenceMode } from '../libs/usage/interfaces/rest/usage-provider-tokens';

const clock = new FixedClock(new Date('2026-06-07T00:00:05.000Z'));
const tenant = tenantId('00000000-0000-7000-8000-000000000601');
const workspace = workspaceId('00000000-0000-7000-8000-000000000602');

async function main(): Promise<void> {
  assert(resolveUsagePersistenceMode({}) === 'in-memory', 'usage persistence must default to in-memory');
  assertThrows(
    () => resolveUsagePersistenceMode({ USAGE_PERSISTENCE: 'prisma' }),
    'USAGE_PERSISTENCE=prisma must require DATABASE_URL',
  );
  assert(
    resolveUsagePersistenceMode({
      USAGE_PERSISTENCE: 'prisma',
      DATABASE_URL: 'postgresql://example.test/social-monitor',
    }) === 'prisma',
    'usage persistence must accept explicit Prisma mode with DATABASE_URL',
  );

  const prisma = new FakePrismaUsageClient();
  const auditLog = new PrismaPublicApiAuditLog(prisma);
  const rateLimits = new PrismaRateLimitCounter(prisma);
  const quotas = new PrismaUsageQuotaLedger(prisma);
  const ids = new SequenceIdGenerator(['00000000-0000-7000-8000-000000000603']);

  const audit = await new RecordPublicApiAuditEventUseCase(auditLog, ids, clock).execute({
    tenantId: tenant,
    workspaceId: workspace,
    actorType: 'api_key',
    actorId: 'api-key-1',
    action: 'feed.list',
    outcome: 'succeeded',
    resourceType: 'feed',
    metadata: {
      authorization: 'Bearer smk_secret',
      source: 'public-api',
    },
  });
  assert(isOk(audit), 'public API audit event must be persisted');

  const records = await auditLog.list({ tenantId: tenant, workspaceId: workspace });
  assert(records.length === 1, 'public API audit log must list persisted event');
  assert(records[0]?.metadata.authorization === '[REDACTED]', 'public API audit metadata must stay redacted');

  const rateLimitUseCase = new CheckPublicApiRateLimitUseCase(rateLimits, clock);
  assert(isOk(await rateLimitUseCase.execute({
    subjectKey: 'api-key-1',
    operation: 'feed.list',
    limit: 2,
    windowSeconds: 60,
  })), 'first rate-limit hit must pass');
  assert(isOk(await rateLimitUseCase.execute({
    subjectKey: 'api-key-1',
    operation: 'feed.list',
    limit: 2,
    windowSeconds: 60,
  })), 'second rate-limit hit must pass');
  assert(!isOk(await rateLimitUseCase.execute({
    subjectKey: 'api-key-1',
    operation: 'feed.list',
    limit: 2,
    windowSeconds: 60,
  })), 'third rate-limit hit must fail');

  const quotaUseCase = new ReserveUsageQuotaUseCase(quotas, clock);
  const firstQuota = await quotaUseCase.execute({
    tenantId: tenant,
    workspaceId: workspace,
    subjectKey: 'topic-1',
    operation: 'scan',
    amount: 3,
    limit: 5,
    windowSeconds: 60,
  });
  assert(isOk(firstQuota), 'first usage quota reservation must pass');
  assert(firstQuota.value.consumed === 3, 'usage quota consumed units must persist');

  const rejectedQuota = await quotaUseCase.execute({
    tenantId: tenant,
    workspaceId: workspace,
    subjectKey: 'topic-1',
    operation: 'scan',
    amount: 3,
    limit: 5,
    windowSeconds: 60,
  });
  assert(!isOk(rejectedQuota), 'quota reservation over limit must fail');

  console.log('Usage Prisma persistence smoke OK');
}

class SequenceIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  generate(): string {
    const value = this.values[this.index];

    if (value === undefined) {
      throw new Error('SequenceIdGenerator exhausted');
    }

    this.index += 1;

    return value;
  }
}

class FakePrismaUsageClient implements PrismaUsageClient {
  private readonly auditEvents: PrismaPublicApiAuditEventRecord[] = [];
  private readonly rateLimitBuckets = new Map<string, PrismaRateLimitBucketRecord>();
  private readonly quotaBuckets = new Map<string, PrismaUsageQuotaBucketRecord>();

  readonly publicApiAuditEvent: PrismaUsageClient['publicApiAuditEvent'] = {
    create: async (args) => {
      const record: PrismaPublicApiAuditEventRecord = {
        ...args.data,
        reasonCode: args.data.reasonCode ?? null,
        resourceId: args.data.resourceId ?? null,
      };
      this.auditEvents.push(record);

      return record;
    },
    findMany: async (args) =>
      this.auditEvents
        .filter((record) => (
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId
        ))
        .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()),
  };

  readonly rateLimitBucket: PrismaUsageClient['rateLimitBucket'] = {
    deleteMany: async (args) => {
      let count = 0;

      for (const [key, record] of this.rateLimitBuckets.entries()) {
        if (record.windowEndsAt.getTime() <= args.where.windowEndsAt.lte.getTime()) {
          this.rateLimitBuckets.delete(key);
          count += 1;
        }
      }

      return { count };
    },
    upsert: async (args) => {
      const existing = this.rateLimitBuckets.get(args.where.bucketKey);
      const record: PrismaRateLimitBucketRecord = {
        bucketKey: existing?.bucketKey ?? args.create.bucketKey,
        windowStartedAt: args.update.windowStartedAt,
        windowEndsAt: args.update.windowEndsAt,
        count: (existing?.count ?? 0) + args.update.count.increment,
      };
      this.rateLimitBuckets.set(record.bucketKey, record);

      return record;
    },
  };

  readonly usageQuotaBucket: PrismaUsageClient['usageQuotaBucket'] = {
    deleteMany: async (args) => {
      let count = 0;

      for (const [key, record] of this.quotaBuckets.entries()) {
        if (record.windowEndsAt.getTime() <= args.where.windowEndsAt.lte.getTime()) {
          this.quotaBuckets.delete(key);
          count += 1;
        }
      }

      return { count };
    },
    findUnique: async (args) => this.quotaBuckets.get(args.where.bucketKey) ?? null,
    upsert: async (args) => {
      const existing = this.quotaBuckets.get(args.where.bucketKey);
      const record: PrismaUsageQuotaBucketRecord = {
        bucketKey: existing?.bucketKey ?? args.create.bucketKey,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        subjectKey: existing?.subjectKey ?? args.create.subjectKey,
        operation: existing?.operation ?? args.create.operation,
        windowStartedAt: existing?.windowStartedAt ?? args.create.windowStartedAt,
        windowEndsAt: args.update.windowEndsAt,
        consumed: args.update.consumed,
        limit: args.update.limit,
      };
      this.quotaBuckets.set(record.bucketKey, record);

      return record;
    },
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const assertThrows = (operation: () => unknown, message: string): void => {
  try {
    operation();
  } catch {
    return;
  }

  throw new Error(message);
};

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
