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
  const firstDispatcher = new OutboxDispatcher(new PrismaOutboxStoreAdapter(prisma, clock), publisher);
  const dispatchResult = await firstDispatcher.dispatchBatch(10);

  assertEqual(dispatchResult.published, 1, 'expected one published outbox event');
  assertEqual(dispatchResult.failed, 0, 'expected no outbox publish failures');
  assertEqual(publisher.published.length, 1, 'expected publisher to receive one event');
  assertEqual(prisma.outboxEvents.get(fixedEventId)?.status, 'PUBLISHED', 'expected outbox status PUBLISHED');

  const restartedOutbox = new PrismaOutboxStoreAdapter(prisma, clock);
  assertEqual((await restartedOutbox.pending(10)).length, 0, 'expected no pending outbox after restart');

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

  const failingDispatcher = new OutboxDispatcher(new PrismaOutboxStoreAdapter(prisma, clock), {
    publish: async () => {
      throw new Error('broker unavailable');
    },
  });
  const failureResult = await failingDispatcher.dispatchBatch(10);

  assertEqual(failureResult.published, 0, 'expected no published events when broker fails');
  assertEqual(failureResult.failed, 1, 'expected one failed publish');
  assertEqual(prisma.outboxEvents.get(failedEventId)?.status, 'FAILED', 'expected failed outbox status');

  const ids = new SequenceIdGenerator();
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

class FakePrismaEventStoreClient implements PrismaEventStoreClient {
  readonly outboxEvents = new Map<string, PrismaEventOutboxRecord>();
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
    update: async (args) => {
      const existing = this.outboxEvents.get(args.where.id);
      if (!existing) {
        throw new Error(`outbox event ${args.where.id} not found`);
      }

      const record: PrismaEventOutboxRecord = {
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

  seedOutbox(record: PrismaEventOutboxRecord): void {
    this.outboxEvents.set(record.id, record);
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
