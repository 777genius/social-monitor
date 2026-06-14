import { FixedClock, type IdGenerator, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { PrismaFeedItemReadRepository } from '../libs/feed/adapters/persistence/prisma/prisma-feed-item-read.repository';
import { PrismaFeedProjectionAdapter } from '../libs/feed/adapters/persistence/prisma/prisma-feed-projection.adapter';
import type { PrismaFeedClient } from '../libs/feed/adapters/persistence/prisma/prisma-feed-client';
import type { PrismaFeedItemRecord } from '../libs/feed/adapters/persistence/prisma/prisma-feed-records';
import { resolveFeedPersistenceMode } from '../libs/feed/interfaces/rest/feed-provider-tokens';
import { SourceItem } from '../libs/ingestion/domain';
import { PrismaScanCursorRepository } from '../libs/ingestion/adapters/persistence/prisma/prisma-scan-cursor.repository';
import { PrismaSourceItemRepository } from '../libs/ingestion/adapters/persistence/prisma/prisma-source-item.repository';
import type { PrismaIngestionClient } from '../libs/ingestion/adapters/persistence/prisma/prisma-ingestion-client';
import type {
  PrismaCursorCheckpointRecord,
  PrismaSourceItemRecord,
} from '../libs/ingestion/adapters/persistence/prisma/prisma-ingestion-records';

const clock = new FixedClock(new Date('2026-06-07T00:00:00.000Z'));
const tenant = tenantId('00000000-0000-7000-8000-000000000101');
const workspace = workspaceId('00000000-0000-7000-8000-000000000102');
const sourceBindingId = '00000000-0000-7000-8000-000000000103';
const topicId = '00000000-0000-7000-8000-000000000104';

async function main(): Promise<void> {
  assert(resolveFeedPersistenceMode({}) === 'in-memory', 'feed persistence must default to in-memory');
  assertThrows(
    () => resolveFeedPersistenceMode({ FEED_PERSISTENCE: 'prisma' }),
    'FEED_PERSISTENCE=prisma must require DATABASE_URL',
  );
  assert(
    resolveFeedPersistenceMode({
      FEED_PERSISTENCE: 'prisma',
      DATABASE_URL: 'postgresql://example.test/social-monitor',
    }) === 'prisma',
    'feed persistence must accept explicit Prisma mode with DATABASE_URL',
  );

  const prisma = new FakePrismaIngestionFeedClient();
  const ids = new SequenceIdGenerator([
    '00000000-0000-7000-8000-000000000201',
    '00000000-0000-7000-8000-000000000202',
    '00000000-0000-7000-8000-000000000203',
  ]);
  const sourceItems = new PrismaSourceItemRepository(prisma);
  const cursors = new PrismaScanCursorRepository(prisma, ids);
  const feedProjection = new PrismaFeedProjectionAdapter(prisma, ids);
  const feedRead = new PrismaFeedItemReadRepository(prisma);
  const firstItem = makeSourceItem({
    id: '00000000-0000-7000-8000-000000000301',
    externalId: 'story-1',
    canonicalUrl: 'https://Example.test/story?utm_source=email&b=2&a=1#comments',
    title: 'Durable Feed',
  });
  const duplicateProviderItem = makeSourceItem({
    id: '00000000-0000-7000-8000-000000000302',
    externalId: 'story-1',
    canonicalUrl: 'https://example.test/story?a=1&b=2',
    title: 'Duplicate Durable Feed',
  });

  const saveResult = await sourceItems.saveBatch({
    tenantId: tenant,
    workspaceId: workspace,
    providerKey: 'fake-source',
    items: [firstItem, duplicateProviderItem],
  });
  assert(saveResult.inserted === 1, 'source item repository must insert first provider item');
  assert(saveResult.skippedDuplicates === 1, 'source item repository must skip duplicate provider item');

  await cursors.save({
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId,
    cursor: 'cursor-1',
    committedAt: clock.now(),
  });
  const cursor = await cursors.findBySourceBinding({ tenantId: tenant, workspaceId: workspace, sourceBindingId });
  assert(cursor?.cursor === 'cursor-1', 'scan cursor must round-trip through Prisma repository');

  const projectionResult = await feedProjection.project({
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    sourceBindingId,
    sourceItems: [firstItem, duplicateProviderItem],
  });
  assert(projectionResult.projected === 2, 'feed projection must process every source item command');

  const list = await feedRead.list({ tenantId: tenant, workspaceId: workspace, topicId, limit: 10 });
  assert(list.items.length === 1, 'feed read repository must dedupe normalized canonical URLs per topic');
  const feedItem = list.items[0];
  assert(feedItem !== undefined, 'feed read repository must return the projected feed item');
  assert(feedItem.toSnapshot().title === 'Duplicate Durable Feed', 'feed upsert must refresh duplicate feed content');

  const search = await feedRead.list({
    tenantId: tenant,
    workspaceId: workspace,
    topicId,
    limit: 10,
    searchQuery: 'duplicate durable',
  });
  assert(search.items.length === 1, 'feed read repository must support search filtering');

  const found = await feedRead.findById({
    tenantId: tenant,
    workspaceId: workspace,
    feedItemId: feedItem.toSnapshot().id,
  });
  assert(found?.toSnapshot().canonicalUrl === 'https://example.test/story?a=1&b=2', 'feed item findById must rehydrate item');

  console.log('Ingestion/feed Prisma persistence smoke OK');
}

const makeSourceItem = (params: {
  readonly id: string;
  readonly externalId: string;
  readonly canonicalUrl: string;
  readonly title: string;
}): SourceItem =>
  SourceItem.ingest({
    id: params.id,
    tenantId: tenant,
    workspaceId: workspace,
    sourceBindingId,
    externalId: params.externalId,
    canonicalUrl: params.canonicalUrl,
    title: params.title,
    body: `${params.title} body`,
    authorHandle: 'author',
    publishedAt: new Date('2026-06-07T00:00:00.000Z'),
    ingestedAt: clock.now(),
  });

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

class FakePrismaIngestionFeedClient implements PrismaIngestionClient, PrismaFeedClient {
  private readonly sourceItems = new Map<string, PrismaSourceItemRecord>();
  private readonly cursors = new Map<string, PrismaCursorCheckpointRecord>();
  private readonly feedItems = new Map<string, PrismaFeedItemRecord>();

  readonly sourceItem: PrismaIngestionClient['sourceItem'] = {
    findFirst: async (args) =>
      [...this.sourceItems.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.providerKey === args.where.providerKey &&
        record.providerItemId === args.where.providerItemId
      )) ?? null,
    create: async (args) => {
      const record: PrismaSourceItemRecord = {
        ...args.data,
        authorHandle: args.data.authorHandle ?? null,
        createdAt: clock.now(),
      };
      this.sourceItems.set(record.id, record);

      return record;
    },
  };

  readonly cursorCheckpoint: PrismaIngestionClient['cursorCheckpoint'] = {
    upsert: async (args) => {
      const key = `${args.where.tenantId_sourceBindingId.tenantId}:${args.where.tenantId_sourceBindingId.sourceBindingId}`;
      const existing = this.cursors.get(key);
      const record: PrismaCursorCheckpointRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        sourceBindingId: existing?.sourceBindingId ?? args.create.sourceBindingId,
        cursorPayload: existing === undefined ? args.create.cursorPayload : args.update.cursorPayload,
        updatedAt: clock.now(),
      };
      this.cursors.set(key, record);

      return record;
    },
    findFirst: async (args) =>
      [...this.cursors.values()].find((record) => (
        record.tenantId === args.where.tenantId &&
        record.workspaceId === args.where.workspaceId &&
        record.sourceBindingId === args.where.sourceBindingId
      )) ?? null,
  };

  readonly feedItem: PrismaFeedClient['feedItem'] = {
    upsert: async (args) => {
      const key = [
        args.where.tenantId_topicId_dedupeKey.tenantId,
        args.where.tenantId_topicId_dedupeKey.topicId,
        args.where.tenantId_topicId_dedupeKey.dedupeKey,
      ].join(':');
      const existing = this.feedItems.get(key);
      const record: PrismaFeedItemRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        topicId: existing?.topicId ?? args.create.topicId,
        sourceItemId: args.update.sourceItemId,
        sourceBindingId: args.update.sourceBindingId,
        dedupeKey: existing?.dedupeKey ?? args.create.dedupeKey,
        canonicalUrl: args.update.canonicalUrl,
        title: args.update.title,
        bodyPreview: args.update.bodyPreview,
        authorHandle: args.update.authorHandle ?? null,
        publishedAt: args.update.publishedAt,
        observedAt: args.update.observedAt,
        status: args.update.status,
        createdAt: existing?.createdAt ?? clock.now(),
      };
      this.feedItems.set(key, record);

      return record;
    },
    findMany: async (args) =>
      this.filterFeedItems(args.where)
        .sort(compareFeedRecords)
        .slice(args.skip, args.skip + args.take),
    count: async (args) => this.filterFeedItems(args.where).length,
    findFirst: async (args) =>
      this.filterFeedItems(args.where).find((record) => record.id === args.where.id) ?? null,
  };

  private filterFeedItems(where: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly status: 'VISIBLE';
    readonly topicId?: string;
    readonly observedAt?: { readonly gt: Date };
  }): PrismaFeedItemRecord[] {
    return [...this.feedItems.values()].filter((record) => (
      record.tenantId === where.tenantId &&
      record.workspaceId === where.workspaceId &&
      record.status === where.status &&
      (where.topicId === undefined || record.topicId === where.topicId) &&
      (where.observedAt === undefined || record.observedAt.getTime() > where.observedAt.gt.getTime())
    ));
  }
}

const compareFeedRecords = (left: PrismaFeedItemRecord, right: PrismaFeedItemRecord): number => {
  const publishedDiff = right.publishedAt.getTime() - left.publishedAt.getTime();

  if (publishedDiff !== 0) {
    return publishedDiff;
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
