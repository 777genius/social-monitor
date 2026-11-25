import { correlationId, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { SUMMARY_READY_CONSUMER, type SummaryReadyProjection } from '../../../application/contracts/summary-ready-projection-store';
import { encodeRealtimeReplayCursor, RealtimeEvent } from '../../../domain';
import { summaryReadyReplayId } from '../summary-ready-projection-identity';
import type { PrismaInboxRecord } from '@social-monitor/platform-events/adapters/prisma';
import type { PrismaRealtimeEventRecord } from './prisma-delivery-records';
import type { PrismaReaderSummaryProjectionClient, PrismaReaderSummaryProjectionTransaction } from './prisma-reader-summary-projection-client';
import { PrismaSummaryReadyProjectionStore } from './prisma-summary-ready-projection.store';

const projection: SummaryReadyProjection = {
  sourceEventId: 'source-event-1',
  sourceIdentityHash: 'causation-and-payload-hash',
  protocolVersion: 1,
  eventType: 'summary.status.changed.v1',
  tenantId: tenantId('tenant-1'),
  workspaceId: workspaceId('workspace-1'),
  channel: 'interest:interest-1:summary-status',
  resourceType: 'summary',
  resourceId: 'summary-1',
  occurredAt: new Date('2026-06-06T00:00:00.000Z'),
  correlationId: correlationId('correlation-1'),
  payload: { summaryId: 'summary-1', status: 'completed' },
};

type InboxLookup = Parameters<PrismaReaderSummaryProjectionTransaction['inboxRecord']['findUnique']>[0];
type LatestLookup = Parameters<PrismaReaderSummaryProjectionTransaction['realtimeEvent']['findFirst']>[0];
type InboxCreate = Parameters<PrismaReaderSummaryProjectionTransaction['inboxRecord']['create']>[0];
type RealtimeCreate = Parameters<PrismaReaderSummaryProjectionTransaction['realtimeEvent']['create']>[0];

class FakePrisma implements PrismaReaderSummaryProjectionClient {
  readonly inboxRows = new Map<string, PrismaInboxRecord>();
  readonly realtimeRows = new Map<string, PrismaRealtimeEventRecord>();
  readonly isolationLevels: string[] = [];
  readonly inboxLookups: InboxLookup[] = [];
  readonly realtimeLookups: string[] = [];
  readonly latestLookups: LatestLookup[] = [];
  readonly inboxCreates: InboxCreate[] = [];
  readonly realtimeCreates: RealtimeCreate[] = [];
  private concurrentCommit?: { inbox: PrismaInboxRecord; realtime: PrismaRealtimeEventRecord };

  seedInbox(row: PrismaInboxRecord): void {
    this.inboxRows.set(`${row.consumerName}:${row.eventId}`, row);
  }

  raceWithCommitted(inbox: PrismaInboxRecord, realtime: PrismaRealtimeEventRecord): void {
    this.concurrentCommit = { inbox, realtime };
  }

  async $transaction<T>(
    operation: (tx: PrismaReaderSummaryProjectionTransaction) => Promise<T>,
    options: { readonly isolationLevel: 'Serializable' },
  ): Promise<T> {
    this.isolationLevels.push(options.isolationLevel);
    const inboxRows = new Map(this.inboxRows);
    const realtimeRows = new Map(this.realtimeRows);
    const tx: PrismaReaderSummaryProjectionTransaction = {
      inboxRecord: {
        findUnique: async args => {
          this.inboxLookups.push(args);
          const key = args.where.consumerName_eventId;
          return inboxRows.get(`${key.consumerName}:${key.eventId}`) ?? null;
        },
        create: async args => {
          this.inboxCreates.push(args);
          if (this.concurrentCommit) {
            const committed = this.concurrentCommit;
            this.concurrentCommit = undefined;
            this.seedInbox(committed.inbox);
            this.realtimeRows.set(committed.realtime.id, committed.realtime);
            throw { code: 'P2002' };
          }
          const row: PrismaInboxRecord = { ...args.data, processedAt: projection.occurredAt };
          inboxRows.set(`${row.consumerName}:${row.eventId}`, row);
          return row;
        },
      },
      realtimeEvent: {
        findUnique: async args => {
          this.realtimeLookups.push(args.where.id);
          return realtimeRows.get(args.where.id) ?? null;
        },
        findFirst: async args => {
          this.latestLookups.push(args);
          return [...realtimeRows.values()]
            .filter(row => row.tenantId === args.where.tenantId &&
              row.workspaceId === args.where.workspaceId && row.channel === args.where.channel)
            .sort((a, b) => b.sequence - a.sequence)[0] ?? null;
        },
        findMany: async () => [],
        create: async args => {
          this.realtimeCreates.push(args);
          const row: PrismaRealtimeEventRecord = args.data;
          realtimeRows.set(row.id, row);
          return row;
        },
      },
    };
    const result = await operation(tx);
    this.inboxRows.clear();
    inboxRows.forEach((row, key) => this.inboxRows.set(key, row));
    this.realtimeRows.clear();
    realtimeRows.forEach((row, key) => this.realtimeRows.set(key, row));
    return result;
  }
}

function committedRows(input: SummaryReadyProjection, sequence = 1) {
  const { sourceEventId, sourceIdentityHash, ...props } = input;
  const realtime: PrismaRealtimeEventRecord = RealtimeEvent.create({
    ...props, id: summaryReadyReplayId({ sourceEventId, sourceIdentityHash }), sequence,
    replayCursor: encodeRealtimeReplayCursor(sequence),
  }).toSnapshot();
  const inbox: PrismaInboxRecord = {
    id: realtime.id, consumerName: SUMMARY_READY_CONSUMER, eventId: sourceEventId,
    tenantId: input.tenantId, schemaVersion: 1, processedAt: input.occurredAt,
  };
  return { inbox, realtime };
}

describe('PrismaSummaryReadyProjectionStore', () => {
  it('inserts once and replays the exact committed identity and sequence', async () => {
    const prisma = new FakePrisma();
    const store = new PrismaSummaryReadyProjectionStore(prisma);

    const first = (await store.project(projection)).toSnapshot();
    const replay = (await store.project(projection)).toSnapshot();

    expect(first).toEqual({ ...committedRows(projection).realtime });
    expect(replay).toEqual(first);
    expect(first.id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
    expect(first.sequence).toBe(1);
    expect(prisma.inboxRows.size).toBe(1);
    expect(prisma.realtimeRows.size).toBe(1);
    expect(prisma.isolationLevels).toEqual(['Serializable', 'Serializable']);
    expect(prisma.inboxLookups).toEqual([
      { where: { consumerName_eventId: { consumerName: SUMMARY_READY_CONSUMER, eventId: projection.sourceEventId } } },
      { where: { consumerName_eventId: { consumerName: SUMMARY_READY_CONSUMER, eventId: projection.sourceEventId } } },
    ]);
    expect(prisma.latestLookups).toEqual([{
      where: { tenantId: projection.tenantId, workspaceId: projection.workspaceId, channel: projection.channel },
      orderBy: { sequence: 'desc' },
    }]);
    expect(prisma.inboxCreates).toEqual([{ data: {
      id: first.id, consumerName: SUMMARY_READY_CONSUMER, eventId: projection.sourceEventId,
      tenantId: projection.tenantId, schemaVersion: 1,
    } }]);
    expect(prisma.realtimeCreates).toEqual([{ data: first }]);
    expect(prisma.realtimeLookups).toEqual([first.id]);
  });

  it('assigns distinct identities and increasing channel sequence to distinct source IDs with the same payload', async () => {
    const prisma = new FakePrisma();
    const store = new PrismaSummaryReadyProjectionStore(prisma);
    const secondInput = { ...projection, sourceEventId: 'source-event-2' };

    const first = (await store.project(projection)).toSnapshot();
    const second = (await store.project(secondInput)).toSnapshot();

    expect([first.id, second.id]).toEqual([
      summaryReadyReplayId(projection), summaryReadyReplayId(secondInput),
    ]);
    expect(second.id).not.toBe(first.id);
    expect([first.sequence, second.sequence]).toEqual([1, 2]);
    expect([first.replayCursor, second.replayCursor]).toEqual([
      encodeRealtimeReplayCursor(1), encodeRealtimeReplayCursor(2),
    ]);
    expect(prisma.inboxRows.size).toBe(2);
    expect(prisma.realtimeRows.size).toBe(2);
    expect(prisma.isolationLevels).toEqual(['Serializable', 'Serializable']);
    expect(prisma.latestLookups).toHaveLength(2);
  });

  it('rejects a reused source ID across tenant or payload without returning another tenant row', async () => {
    const prisma = new FakePrisma();
    const store = new PrismaSummaryReadyProjectionStore(prisma);
    const original = (await store.project(projection)).toSnapshot();

    await expect(store.project({ ...projection, tenantId: tenantId('tenant-2') }))
      .rejects.toMatchObject({ code: 'validation.failed', message: expect.stringContaining('unavailable in this scope') });
    expect(prisma.realtimeLookups).toEqual([]);
    await expect(store.project({ ...projection, payload: { summaryId: 'summary-1', status: 'no_signal' } }))
      .rejects.toMatchObject({ code: 'validation.failed' });
    expect(prisma.realtimeLookups).toEqual([original.id]);
    expect(prisma.inboxRows.size).toBe(1);
    expect(prisma.realtimeRows.size).toBe(1);
    expect(prisma.realtimeCreates).toHaveLength(1);
    expect(prisma.isolationLevels).toEqual(['Serializable', 'Serializable', 'Serializable']);
  });

  it('retries a P2002 insert conflict as a full transaction and replays the concurrently committed row', async () => {
    const prisma = new FakePrisma();
    const committed = committedRows(projection, 4);
    prisma.raceWithCommitted(committed.inbox, committed.realtime);
    const store = new PrismaSummaryReadyProjectionStore(prisma);

    expect((await store.project(projection)).toSnapshot()).toEqual(committed.realtime);
    expect(prisma.isolationLevels).toEqual(['Serializable', 'Serializable']);
    expect(prisma.inboxLookups).toHaveLength(2);
    expect(prisma.inboxCreates).toHaveLength(1);
    expect(prisma.realtimeCreates).toHaveLength(0);
    expect(prisma.realtimeLookups).toEqual([committed.realtime.id]);
    expect([...prisma.inboxRows.values()]).toEqual([committed.inbox]);
    expect([...prisma.realtimeRows.values()]).toEqual([committed.realtime]);
  });

  it('fails closed when an inbox replay has no realtime row', async () => {
    const prisma = new FakePrisma();
    prisma.seedInbox(committedRows(projection).inbox);
    const store = new PrismaSummaryReadyProjectionStore(prisma);

    await expect(store.project(projection)).rejects.toMatchObject({ code: 'validation.failed' });
    expect(prisma.realtimeRows.size).toBe(0);
    expect(prisma.inboxCreates).toHaveLength(0);
    expect(prisma.isolationLevels).toEqual(['Serializable']);
  });
});
