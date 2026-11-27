import {
  InboxDeduplicator,
  OutboxDispatcher,
} from '@social-monitor/platform-events';
import { FixedClock, type IdGenerator } from '@social-monitor/shared-kernel';
import {
  PrismaInboxStoreAdapter,
  PrismaOutboxStoreAdapter,
  type PrismaEventOutboxRecord,
  type PrismaEventStoreClient,
  type PrismaEventOutboxClient,
  type PrismaInboxRecord,
} from '@social-monitor/platform-events/adapters/prisma';
import { InMemoryEventPublisher } from '@social-monitor/platform-events/adapters/in-memory';

const fixedEventId = '00000000-0000-7000-8000-000000000701';
const tenant = '00000000-0000-7000-8000-000000000702';
const workspace = '00000000-0000-7000-8000-000000000703';
const clock = new FixedClock(new Date('2026-06-16T00:02:00.000Z'));

class SequenceIdGenerator implements IdGenerator {
  private nextId = 1;

  generate(): string {
    const id = `platform-event-store-smoke-${this.nextId}`;
    this.nextId += 1;
    return id;
  }
}

async function main(): Promise<void> {
  const prisma = new FakePrismaEventStoreClient();
  const ids = new SequenceIdGenerator();
  prisma.seedOutbox({
    id: fixedEventId,
    tenantId: tenant,
      workspaceId: workspace,
      messageKind: 'EVENT',
    eventType: 'monitoring.scan.requested',
    schemaVersion: 1,
    payload: { scanJobId: 'scan-job-1' },
    status: 'PENDING',
    correlationId: 'correlation-1',
    causationId: null,
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
    publishedAt: null,
    publishAttempts: 0,
    lastError: null,
  });

  const publisher = new InMemoryEventPublisher();
  const firstDispatcher = new OutboxDispatcher(new PrismaOutboxStoreAdapter(prisma), publisher, ids, clock);
  const dispatchResult = await firstDispatcher.dispatchBatch(10);

  assertEqual(dispatchResult.published, 1, 'expected one published outbox event');
  assertEqual(dispatchResult.failed, 0, 'expected no outbox publish failures');
  assertEqual(publisher.published.length, 1, 'expected publisher to receive one event');
  assertEqual(prisma.outboxEvents.get(fixedEventId)?.status, 'PUBLISHED', 'expected outbox status PUBLISHED');

  const restartedOutbox = new PrismaOutboxStoreAdapter(prisma);
  assertEqual((await restartedOutbox.claimPending({ limit: 10, now: clock.now(), leaseOwner: ids.generate(),
    leasedUntil: new Date(clock.now().getTime() + 30_000) })).length, 0, 'expected no pending outbox after restart');

  const failedEventId = '00000000-0000-7000-8000-000000000704';
  prisma.seedOutbox({
    id: failedEventId,
    tenantId: null,
      workspaceId: null,
      messageKind: 'EVENT',
    eventType: 'summary.ready',
    schemaVersion: 1,
    payload: { summaryId: 'summary-1' },
    status: 'PENDING',
    correlationId: 'correlation-2',
    causationId: null,
    createdAt: new Date('2026-06-16T00:01:00.000Z'),
    publishedAt: null,
    publishAttempts: 0,
    lastError: null,
  });

  const failingDispatcher = new OutboxDispatcher(new PrismaOutboxStoreAdapter(prisma), {
    publish: async () => {
      throw new Error('broker unavailable');
    },
  }, ids, clock, { maxAttempts: 1 });
  const failureResult = await failingDispatcher.dispatchBatch(10);

  assertEqual(failureResult.published, 0, 'expected no published events when broker fails');
  assertEqual(failureResult.failed, 1, 'expected one failed publish');
  assertEqual(prisma.outboxEvents.get(failedEventId)?.status, 'FAILED', 'expected failed outbox status');

  const deduplicator = new InboxDeduplicator(new PrismaInboxStoreAdapter(prisma, ids));
  let handlerCalls = 0;
  const firstInboxResult = await deduplicator.runOnce({
    consumerName: 'feed-projection',
    eventId: fixedEventId,
    schemaVersion: 1,
    handler: async () => {
      handlerCalls += 1;
    },
  });

  const restartedDeduplicator = new InboxDeduplicator(new PrismaInboxStoreAdapter(prisma, ids));
  const secondInboxResult = await restartedDeduplicator.runOnce({
    consumerName: 'feed-projection',
    eventId: fixedEventId,
    schemaVersion: 1,
    handler: async () => {
      handlerCalls += 1;
    },
  });

  assertEqual(firstInboxResult.processed, true, 'expected first inbox pass to process');
  assertEqual(secondInboxResult.processed, false, 'expected restarted inbox pass to dedupe');
  assertEqual(handlerCalls, 1, 'expected inbox handler to run once');

  console.log('Platform event store smoke OK');
}

type FixtureEvent = PrismaEventOutboxRecord & {
  availableAt: Date; leaseOwner: string | null; leasedUntil: Date | null;
};

class FakePrismaEventStoreClient implements PrismaEventStoreClient, PrismaEventOutboxClient {
  readonly outboxEvents = new Map<string, FixtureEvent>();
  readonly inboxRecords = new Map<string, PrismaInboxRecord>();

  readonly outboxEvent: PrismaEventStoreClient['outboxEvent'] = {
    findMany: async (args) =>
      [...this.outboxEvents.values()]
        .filter((record) => record.status === args.where.status)
        .sort((left, right) => (
          left.createdAt.getTime() - right.createdAt.getTime() ||
          left.id.localeCompare(right.id)
        ))
        .slice(0, args.take),
    updateMany: async ({ where, data }) => {
      const existing = this.outboxEvents.get(where.id);
      if (existing === undefined || existing.messageKind !== where.messageKind ||
        existing.status !== where.status) return { count: 0 };
      this.outboxEvents.set(existing.id, {
        ...existing,
        status: data.status ?? existing.status,
        publishAttempts: existing.publishAttempts + (data.publishAttempts?.increment ?? 0),
        lastError: data.lastError === undefined ? existing.lastError : data.lastError,
        publishedAt: data.publishedAt === undefined ? existing.publishedAt : data.publishedAt,
      });
      return { count: 1 };
    },
    update: async (args) => {
      const existing = this.outboxEvents.get(args.where.id);
      if (!existing) {
        throw new Error(`outbox event ${args.where.id} not found`);
      }

      const record: FixtureEvent = {
        ...existing,
        status: args.data.status ?? existing.status,
        publishAttempts: existing.publishAttempts + (args.data.publishAttempts?.increment ?? 0),
        lastError: args.data.lastError === undefined ? existing.lastError : args.data.lastError,
        publishedAt: args.data.publishedAt ?? null,
      };
      this.outboxEvents.set(record.id, record);

      return record;
    },
  };

  readonly inboxRecord: PrismaEventStoreClient['inboxRecord'] = {
    findUnique: async (args) =>
      this.inboxRecords.get(inboxKey(
        args.where.consumerName_eventId.consumerName,
        args.where.consumerName_eventId.eventId,
      )) ?? null,
    create: async (args) => {
      const key = inboxKey(args.data.consumerName, args.data.eventId);
      if (this.inboxRecords.has(key)) {
        throw Object.assign(new Error('unique inbox record'), { code: 'P2002' });
      }

      const record: PrismaInboxRecord = {
        id: args.data.id,
        consumerName: args.data.consumerName,
        eventId: args.data.eventId,
        tenantId: args.data.tenantId,
        schemaVersion: args.data.schemaVersion,
        processedAt: new Date('2026-06-16T00:02:00.000Z'),
      };
      this.inboxRecords.set(key, record);

      return record;
    },
  };


  async $queryRaw<T>(sql: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    const statement = sql.join('?');
    if (statement.includes('WITH eligible AS')) {
      const [limit, owner, duration] = values as [number, string, number];
      const records = [...this.outboxEvents.values()]
        .filter(row => row.messageKind === 'EVENT' && row.status === 'PENDING' &&
          row.availableAt <= clock.now() && (row.leasedUntil === null || row.leasedUntil <= clock.now()))
        .sort((left, right) => left.availableAt.getTime() - right.availableAt.getTime() ||
          left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id))
        .slice(0, limit);
      for (const row of records) this.outboxEvents.set(row.id, {
        ...row, leaseOwner: owner, leasedUntil: new Date(clock.now().getTime() + duration),
      });
      return records as unknown as T;
    }
    if (statement.includes('RETURNING event."publish_attempts"')) {
      const [id, owner] = values as [string, string];
      const row = this.owned(id, owner);
      if (!row) return [] as unknown as T;
      const next = { ...row, publishAttempts: row.publishAttempts + 1,
        lastError: 'Dispatch started; outcome unknown. Earlier uninstrumented attempts unknown.' };
      this.outboxEvents.set(id, next);
      return [{ publishAttempts: next.publishAttempts }] as unknown as T;
    }
    throw new Error('Unexpected event store smoke query');
  }

  async $executeRaw(sql: TemplateStringsArray, ...values: unknown[]): Promise<number> {
    const statement = sql.join('?');
    if (statement.includes('SET "leased_until"')) {
      const [ids, owner, duration] = values as [string[], string, number];
      let count = 0;
      for (const id of ids) {
        const row = this.owned(id, owner);
        if (row) {
          this.outboxEvents.set(id, { ...row, leasedUntil: new Date(clock.now().getTime() + duration) });
          count += 1;
        }
      }
      return count;
    }
    const [id, owner] = values as [string, string];
    const row = this.owned(id, owner);
    if (!row) return 0;
    if (statement.includes('"status" = \'PUBLISHED\'')) {
      this.outboxEvents.set(id, { ...row, status: 'PUBLISHED', publishedAt: values[2] as Date,
        leaseOwner: null, leasedUntil: null, lastError: null });
      return 1;
    }
    if (statement.includes('"status" = (CASE')) {
      const [, , terminal, delay, reason] = values as [string, string, boolean, number, string];
      this.outboxEvents.set(id, { ...row, status: terminal ? 'FAILED' : 'PENDING',
        availableAt: new Date(clock.now().getTime() + delay), lastError: reason,
        leaseOwner: null, leasedUntil: null, publishedAt: null });
      return 1;
    }
    throw new Error('Unexpected event store smoke write');
  }

  private owned(id: string, owner: string): FixtureEvent | undefined {
    const row = this.outboxEvents.get(id);
    return row?.messageKind === 'EVENT' && row.status === 'PENDING' && row.leaseOwner === owner &&
      row.leasedUntil !== null && row.leasedUntil > clock.now() ? row : undefined;
  }

  seedOutbox(record: PrismaEventOutboxRecord): void {
    this.outboxEvents.set(record.id, { ...record, availableAt: record.createdAt, leaseOwner: null, leasedUntil: null });
  }
}

function inboxKey(consumerName: string, eventId: string): string {
  return `${consumerName}:${eventId}`;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
