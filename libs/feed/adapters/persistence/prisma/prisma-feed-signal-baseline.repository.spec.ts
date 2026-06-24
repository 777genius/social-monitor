import type { IdGenerator, JsonObject } from '@social-monitor/shared-kernel';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { SourceItem } from '@social-monitor/ingestion/domain';

import type {
  PrismaFeedClient,
  PrismaFeedSignalBaselineSampleRecord,
} from './prisma-feed-client';
import type { PrismaFeedItemRecord } from './prisma-feed-records';
import { PrismaFeedProjectionAdapter } from './prisma-feed-projection.adapter';
import { PrismaFeedSignalBaselineRepository } from './prisma-feed-signal-baseline.repository';

const now = new Date('2026-06-23T12:00:00.000Z');

describe('Prisma feed signal baseline materialization', () => {
  it('writes lightweight baseline samples during feed projection and reads them without feed item payloads', async () => {
    const prisma = new FakePrismaFeedClient();
    const ids = new SequenceIdGenerator([
      'feed-1',
      'sample-1',
    ]);
    const projection = new PrismaFeedProjectionAdapter(prisma, ids);
    const baseline = new PrismaFeedSignalBaselineRepository(prisma);

    await projection.project({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      sourceBindingId: 'binding-1',
      providerKey: 'reddit',
      sourceItems: [
        sourceItem({
          id: 'source-1',
          externalId: 'reddit-1',
          metadata: {
            subreddit: 'startups',
            score: 55,
            numComments: 18,
            upvoteRatio: 0.91,
          },
        }),
      ],
    });

    await expect(baseline.listSamples({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      observedAfter: new Date('2026-06-22T12:00:00.000Z'),
      limit: 10,
    })).resolves.toEqual([
      {
        feedItemId: 'feed-1',
        providerKey: 'reddit',
        sourceKey: 'r/startups',
        contentType: 'post',
        strength: expect.any(Number),
        publishedAt: new Date('2026-06-23T10:00:00.000Z'),
        observedAt: now,
      },
    ]);
  });

  it('removes stale samples when a projected item no longer has comparable provider metrics', async () => {
    const prisma = new FakePrismaFeedClient();
    const ids = new SequenceIdGenerator([
      'feed-1',
      'sample-1',
      'unused-feed-id',
    ]);
    const projection = new PrismaFeedProjectionAdapter(prisma, ids);
    const baseline = new PrismaFeedSignalBaselineRepository(prisma);

    await projection.project({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      sourceBindingId: 'binding-1',
      providerKey: 'reddit',
      sourceItems: [
        sourceItem({
          id: 'source-1',
          externalId: 'same',
          metadata: {
            subreddit: 'startups',
            score: 55,
            numComments: 18,
          },
        }),
      ],
    });
    await projection.project({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      sourceBindingId: 'binding-1',
      providerKey: 'rss',
      sourceItems: [
        sourceItem({
          id: 'source-2',
          externalId: 'same',
          metadata: undefined,
        }),
      ],
    });

    await expect(baseline.listSamples({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      topicId: 'topic-1',
      observedAfter: new Date('2026-06-22T12:00:00.000Z'),
      limit: 10,
    })).resolves.toEqual([]);
  });
});

const sourceItem = (params: {
  readonly id: string;
  readonly externalId: string;
  readonly metadata?: JsonObject;
}): SourceItem =>
  SourceItem.ingest({
    id: params.id,
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    sourceBindingId: 'binding-1',
    externalId: params.externalId,
    canonicalUrl: `https://example.test/${params.externalId}`,
    title: `Story ${params.externalId}`,
    body: '',
    publishedAt: new Date('2026-06-23T10:00:00.000Z'),
    ingestedAt: now,
    metadata: params.metadata,
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

class FakePrismaFeedClient implements PrismaFeedClient {
  private readonly feedItems = new Map<string, PrismaFeedItemRecord>();
  private readonly samples = new Map<string, PrismaFeedSignalBaselineSampleRecord>();

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
        providerKey: args.update.providerKey,
        dedupeKey: existing?.dedupeKey ?? args.create.dedupeKey,
        canonicalUrl: args.update.canonicalUrl,
        title: args.update.title,
        bodyPreview: args.update.bodyPreview,
        authorHandle: args.update.authorHandle ?? null,
        publishedAt: args.update.publishedAt,
        observedAt: args.update.observedAt,
        providerMetadata: args.update.providerMetadata ?? null,
        status: args.update.status,
        createdAt: existing?.createdAt ?? now,
      };
      this.feedItems.set(key, record);

      return record;
    },
    findMany: async () => [],
    count: async () => 0,
    findFirst: async () => null,
  };

  readonly feedSignalBaselineSample: PrismaFeedClient['feedSignalBaselineSample'] = {
    upsert: async (args) => {
      const key = [
        args.where.tenantId_workspaceId_feedItemId.tenantId,
        args.where.tenantId_workspaceId_feedItemId.workspaceId,
        args.where.tenantId_workspaceId_feedItemId.feedItemId,
      ].join(':');
      const existing = this.samples.get(key);
      const record: PrismaFeedSignalBaselineSampleRecord = {
        id: existing?.id ?? args.create.id,
        tenantId: existing?.tenantId ?? args.create.tenantId,
        workspaceId: existing?.workspaceId ?? args.create.workspaceId,
        topicId: args.update.topicId,
        feedItemId: existing?.feedItemId ?? args.create.feedItemId,
        providerKey: args.update.providerKey,
        sourceKey: args.update.sourceKey,
        contentType: args.update.contentType,
        strength: args.update.strength,
        publishedAt: args.update.publishedAt,
        observedAt: args.update.observedAt,
      };
      this.samples.set(key, record);

      return record;
    },
    findMany: async (args) =>
      [...this.samples.values()]
        .filter((record) => (
          record.tenantId === args.where.tenantId &&
          record.workspaceId === args.where.workspaceId &&
          (args.where.topicId === undefined || record.topicId === args.where.topicId) &&
          record.observedAt.getTime() > args.where.observedAt.gt.getTime()
        ))
        .sort((left, right) => (
          right.observedAt.getTime() - left.observedAt.getTime() ||
          right.feedItemId.localeCompare(left.feedItemId)
        ))
        .slice(0, args.take),
    deleteMany: async (args) => {
      const key = [
        args.where.tenantId,
        args.where.workspaceId,
        args.where.feedItemId,
      ].join(':');
      const existed = this.samples.delete(key);

      return { count: existed ? 1 : 0 };
    },
  };
}
