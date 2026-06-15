import { FixedClock, type IdGenerator, isOk, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { PrismaDeliveryAttemptRepository } from '../libs/delivery/adapters/persistence/prisma/prisma-delivery-attempt.repository';
import type {
  PrismaDeliveryAttemptWriteData,
  PrismaDeliveryClient,
} from '../libs/delivery/adapters/persistence/prisma/prisma-delivery-client';
import type {
  PrismaDeliveryAttemptRecord,
} from '../libs/delivery/adapters/persistence/prisma/prisma-delivery-records';
import { GetDeliveryAttemptUseCase } from '../libs/delivery/features/get-delivery-attempt/get-delivery-attempt.use-case';
import { QueueDeliveryAttemptUseCase } from '../libs/delivery/features/queue-delivery-attempt/queue-delivery-attempt.use-case';
import { RecordDeliveryAttemptStateUseCase } from '../libs/delivery/features/record-delivery-attempt-state/record-delivery-attempt-state.use-case';
import { resolveDeliveryPersistenceMode } from '../libs/delivery/interfaces/rest/delivery-provider-tokens';

const clock = new FixedClock(new Date('2026-06-07T00:00:10.000Z'));
const tenant = tenantId('00000000-0000-7000-8000-000000000701');
const workspace = workspaceId('00000000-0000-7000-8000-000000000702');

async function main(): Promise<void> {
  assert(resolveDeliveryPersistenceMode({}) === 'in-memory', 'delivery persistence must default to in-memory');
  assertThrows(
    () => resolveDeliveryPersistenceMode({ DELIVERY_PERSISTENCE: 'prisma' }),
    'DELIVERY_PERSISTENCE=prisma must require DATABASE_URL',
  );
  assert(
    resolveDeliveryPersistenceMode({
      DELIVERY_PERSISTENCE: 'prisma',
      DATABASE_URL: 'postgresql://example.test/social-monitor',
    }) === 'prisma',
    'delivery persistence must accept explicit Prisma mode with DATABASE_URL',
  );

  const prisma = new FakePrismaDeliveryClient();
  const attempts = new PrismaDeliveryAttemptRepository(prisma);
  const ids = new SequenceIdGenerator([
    '00000000-0000-7000-8000-000000000703',
    '00000000-0000-7000-8000-000000000704',
  ]);
  const queue = new QueueDeliveryAttemptUseCase(attempts, ids, clock);
  const getAttempt = new GetDeliveryAttemptUseCase(attempts);
  const recordState = new RecordDeliveryAttemptStateUseCase(attempts, clock);

  const queued = await queue.execute({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'digest:weekly:recipient-1',
    channel: 'webhook',
    recipientKey: 'endpoint-1',
    resourceType: 'digest',
    resourceId: 'digest-1',
    maxRetries: 3,
  });
  assert(isOk(queued), 'delivery attempt queue must succeed through Prisma repository');
  assert(queued.value.created, 'first queue call must create a delivery attempt');

  const duplicate = await queue.execute({
    tenantId: tenant,
    workspaceId: workspace,
    idempotencyKey: 'digest:weekly:recipient-1',
    channel: 'webhook',
    recipientKey: 'endpoint-1',
    resourceType: 'digest',
    resourceId: 'digest-1',
    maxRetries: 3,
  });
  assert(isOk(duplicate), 'duplicate queue call must return persisted attempt');
  assert(!duplicate.value.created, 'duplicate idempotency key must not create another attempt');
  assert(duplicate.value.deliveryAttemptId === queued.value.deliveryAttemptId, 'duplicate queue call must reuse attempt id');

  const fetched = await getAttempt.execute({
    tenantId: tenant,
    workspaceId: workspace,
    deliveryAttemptId: queued.value.deliveryAttemptId,
  });
  assert(isOk(fetched), 'delivery attempt get must hydrate from Prisma record');
  assert(fetched.value.channel === 'webhook', 'hydrated delivery attempt must preserve channel');
  assert(fetched.value.resourceType === 'digest', 'hydrated delivery attempt must preserve resource type');

  const sending = await recordState.execute({
    tenantId: tenant,
    workspaceId: workspace,
    deliveryAttemptId: queued.value.deliveryAttemptId,
    nextState: 'sending',
  });
  assert(isOk(sending), 'delivery attempt sending transition must persist');

  const terminal = await recordState.execute({
    tenantId: tenant,
    workspaceId: workspace,
    deliveryAttemptId: queued.value.deliveryAttemptId,
    nextState: 'failed_terminal',
    reason: 'provider returned permanent 410',
  });
  assert(isOk(terminal), 'delivery attempt terminal failure transition must persist');
  assert(terminal.value.state === 'failed_terminal', 'explicit terminal failure must not become retryable');
  assert(terminal.value.failureReason === 'provider returned permanent 410', 'terminal failure reason must persist');

  const listed = await attempts.list({ tenantId: tenant, workspaceId: workspace, limit: 10 });
  assert(listed.attempts.length === 1, 'delivery attempt list must return persisted attempt');
  assert(listed.attempts[0]?.toSnapshot().state === 'failed_terminal', 'delivery attempt list must hydrate latest state');

  console.log('Delivery Prisma persistence smoke OK');
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

class FakePrismaDeliveryClient implements PrismaDeliveryClient {
  private readonly attempts = new Map<string, PrismaDeliveryAttemptRecord>();

  readonly deliveryAttempt: PrismaDeliveryClient['deliveryAttempt'] = {
    upsert: async (args) => {
      const existing = this.attempts.get(args.where.id);
      const record: PrismaDeliveryAttemptRecord = {
        id: existing?.id ?? args.create.id,
        ...normalizeWriteData(args.update),
      };
      this.attempts.set(record.id, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.attempts.values()].find((record) => matchesDeliveryAttemptWhere(record, args.where)) ?? null,
    findMany: async (args) =>
      [...this.attempts.values()]
        .filter((record) => matchesDeliveryAttemptWhere(record, args.where))
        .sort(compareDeliveryAttemptRecords)
        .slice(args.skip, args.skip + args.take),
    count: async (args) =>
      [...this.attempts.values()].filter((record) => matchesDeliveryAttemptWhere(record, args.where)).length,
  };
}

const normalizeWriteData = (data: PrismaDeliveryAttemptWriteData): Omit<PrismaDeliveryAttemptRecord, 'id'> => ({
  tenantId: data.tenantId,
  workspaceId: data.workspaceId,
  idempotencyKey: data.idempotencyKey,
  channel: data.channel,
  recipientKey: data.recipientKey,
  resourceType: data.resourceType,
  resourceId: data.resourceId,
  state: data.state,
  queuedAt: data.queuedAt,
  assemblingAt: data.assemblingAt ?? null,
  suppressedAt: data.suppressedAt ?? null,
  sendingAt: data.sendingAt ?? null,
  deliveredAt: data.deliveredAt ?? null,
  failedAt: data.failedAt ?? null,
  deadLetteredAt: data.deadLetteredAt ?? null,
  cancelledAt: data.cancelledAt ?? null,
  retryCount: data.retryCount,
  maxRetries: data.maxRetries,
  failureReason: data.failureReason ?? null,
  suppressionReason: data.suppressionReason ?? null,
});

const matchesDeliveryAttemptWhere = (
  record: PrismaDeliveryAttemptRecord,
  where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly id?: string;
    readonly idempotencyKey?: string;
  },
): boolean =>
  record.tenantId === where.tenantId &&
  record.workspaceId === where.workspaceId &&
  (where.id === undefined || record.id === where.id) &&
  (where.idempotencyKey === undefined || record.idempotencyKey === where.idempotencyKey);

const compareDeliveryAttemptRecords = (
  left: PrismaDeliveryAttemptRecord,
  right: PrismaDeliveryAttemptRecord,
): number => {
  const queuedDiff = right.queuedAt.getTime() - left.queuedAt.getTime();

  if (queuedDiff !== 0) {
    return queuedDiff;
  }

  return right.id.localeCompare(left.id);
};

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
