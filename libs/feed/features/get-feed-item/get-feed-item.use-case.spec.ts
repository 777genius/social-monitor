import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedItem } from '../../domain';
import type {
  FeedItemReadRepositoryPort,
  FeedSignalBaselineRepositoryPort,
  ListFeedItemsQuery,
  ListFeedItemsResult,
  ListFeedSignalBaselineSamplesQuery,
} from '../../ports';
import { GetFeedItemUseCase } from './get-feed-item.use-case';

const fixedClock = new FixedClock(new Date('2026-06-05T01:00:00.000Z'));

class FakeFeedItemReadRepository implements FeedItemReadRepositoryPort {
  constructor(private readonly item: FeedItem | null) {}

  readonly queries: ListFeedItemsQuery[] = [];

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    this.queries.push(query);
    return { items: [] };
  }

  async findById(): Promise<FeedItem | null> {
    return this.item;
  }
}

class FakeFeedSignalBaselineRepository implements FeedSignalBaselineRepositoryPort {
  readonly queries: ListFeedSignalBaselineSamplesQuery[] = [];

  async listSamples(query: ListFeedSignalBaselineSamplesQuery) {
    this.queries.push(query);

    return [];
  }
}

const makeItem = () =>
  FeedItem.publish({
    id: 'feed-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    interestId: 'topic-1',
    sourceItemId: 'source-1',
    sourceBindingId: 'binding-1',
    providerKey: 'github',
    canonicalUrl: 'https://example.test/feed-1',
    title: 'Feed 1',
    bodyPreview: 'Body 1',
    authorHandle: 'author',
    publishedAt: new Date('2026-06-05T00:00:00.000Z'),
    observedAt: new Date('2026-06-05T00:01:00.000Z'),
  });

const makeRedditItem = () =>
  FeedItem.publish({
    id: 'feed-reddit',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    interestId: 'topic-1',
    sourceItemId: 'source-reddit',
    sourceBindingId: 'binding-tinysaas',
    providerKey: 'reddit',
    canonicalUrl: 'https://reddit.test/r/tinysaas/comments/feed-reddit',
    title: 'Reddit feed',
    bodyPreview: 'Discussion',
    authorHandle: 'author',
    publishedAt: new Date('2026-06-05T00:00:00.000Z'),
    observedAt: new Date('2026-06-05T00:01:00.000Z'),
    providerMetadata: {
      subreddit: 'TinySaaS',
      score: 42,
      numComments: 8,
    },
  });

describe('GetFeedItemUseCase', () => {
  it('returns one feed item DTO', async () => {
    const repository = new FakeFeedItemReadRepository(makeItem());
    const baseline = new FakeFeedSignalBaselineRepository();
    const useCase = new GetFeedItemUseCase(
      repository,
      baseline,
      fixedClock,
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      feedItemId: 'feed-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'feed-1',
        interestId: 'topic-1',
        sourceItemId: 'source-1',
        sourceBindingId: 'binding-1',
        providerKey: 'github',
        canonicalUrl: 'https://example.test/feed-1',
        title: 'Feed 1',
        bodyPreview: 'Body 1',
        authorHandle: 'author',
        publishedAt: '2026-06-05T00:00:00.000Z',
        observedAt: '2026-06-05T00:01:00.000Z',
      },
    });
    expect(repository.queries).toEqual([]);
    expect(baseline.queries).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        interestId: 'topic-1',
        observedAfter: new Date('2026-05-06T01:00:00.000Z'),
        limit: 2000,
      },
    ]);
  });

  it('returns not found for missing feed item', async () => {
    const useCase = new GetFeedItemUseCase(
      new FakeFeedItemReadRepository(null),
      new FakeFeedSignalBaselineRepository(),
      fixedClock,
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      feedItemId: 'missing',
    });

    expect(result.ok).toBe(false);
  });

  it('loads an exact source baseline cohort for detail items with comparable metrics', async () => {
    const baseline = new FakeFeedSignalBaselineRepository();
    const useCase = new GetFeedItemUseCase(
      new FakeFeedItemReadRepository(makeRedditItem()),
      baseline,
      fixedClock,
    );

    await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      feedItemId: 'feed-reddit',
    });

    expect(baseline.queries).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        interestId: 'topic-1',
        observedAfter: new Date('2026-05-06T01:00:00.000Z'),
        limit: 2000,
      },
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        interestId: 'topic-1',
        observedAfter: new Date('2026-05-06T01:00:00.000Z'),
        limit: 2000,
        cohortFilters: [
          {
            providerKey: 'reddit',
            sourceKey: 'r/tinysaas',
            contentType: 'post',
          },
        ],
      },
    ]);
  });
});
