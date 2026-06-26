import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedItem, feedSignalBaselineSampleFromItem, type FeedSignalBaselineSample } from '../../domain';
import type {
  FeedItemReadRepositoryPort,
  FeedSignalBaselineRepositoryPort,
  ListFeedItemsQuery,
  ListFeedItemsResult,
  ListFeedSignalBaselineSamplesQuery,
} from '../../ports';
import { ListFeedItemsUseCase } from './list-feed-items.use-case';

const fixedClock = new FixedClock(new Date('2026-06-05T01:00:00.000Z'));

class FakeFeedItemReadRepository implements FeedItemReadRepositoryPort {
  private readonly results: readonly ListFeedItemsResult[];

  constructor(results: ListFeedItemsResult | readonly ListFeedItemsResult[]) {
    this.results = Array.isArray(results) ? results : [results];
  }

  readonly queries: ListFeedItemsQuery[] = [];

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    this.queries.push(query);
    return this.results[Math.min(this.queries.length - 1, this.results.length - 1)] ?? { items: [] };
  }

  async findById(): Promise<FeedItem | null> {
    return null;
  }
}

class FakeFeedSignalBaselineRepository implements FeedSignalBaselineRepositoryPort {
  constructor(private readonly samples: readonly FeedSignalBaselineSample[] = []) {}

  readonly queries: ListFeedSignalBaselineSamplesQuery[] = [];

  async listSamples(query: ListFeedSignalBaselineSamplesQuery) {
    this.queries.push(query);

    return this.samples;
  }
}

const makeItem = (id: string) =>
  FeedItem.publish({
    id,
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    topicId: 'topic-1',
    sourceItemId: `source-${id}`,
    sourceBindingId: 'binding-1',
    providerKey: 'reddit',
    canonicalUrl: `https://example.test/${id}`,
    title: `Title ${id}`,
    bodyPreview: `Body ${id}`,
    authorHandle: 'author',
    publishedAt: new Date('2026-06-05T00:00:00.000Z'),
    observedAt: new Date('2026-06-05T00:01:00.000Z'),
  });

const makeRedditItem = (id: string, subreddit: string) =>
  FeedItem.publish({
    id,
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    topicId: 'topic-1',
    sourceItemId: `source-${id}`,
    sourceBindingId: `binding-${subreddit}`,
    providerKey: 'reddit',
    canonicalUrl: `https://reddit.test/r/${subreddit}/comments/${id}`,
    title: `Title ${id}`,
    bodyPreview: `Body ${id}`,
    authorHandle: 'author',
    publishedAt: new Date('2026-06-05T00:00:00.000Z'),
    observedAt: new Date('2026-06-05T00:01:00.000Z'),
    providerMetadata: {
      subreddit,
      score: 42,
      numComments: 8,
    },
  });

describe('ListFeedItemsUseCase', () => {
  it('returns feed items as stable read-model DTOs', async () => {
    const item = makeItem('1');
    const repository = new FakeFeedItemReadRepository({
      items: [item],
      nextCursor: 'next',
    });
    const baseline = new FakeFeedSignalBaselineRepository([
      feedSignalBaselineSampleFromItem(item),
    ].flatMap((sample) => sample === undefined ? [] : [sample]));
    const useCase = new ListFeedItemsUseCase(repository, baseline, fixedClock);

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 20,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          {
            id: '1',
            topicId: 'topic-1',
            sourceItemId: 'source-1',
            sourceBindingId: 'binding-1',
            providerKey: 'reddit',
            canonicalUrl: 'https://example.test/1',
            title: 'Title 1',
            bodyPreview: 'Body 1',
            authorHandle: 'author',
            publishedAt: '2026-06-05T00:00:00.000Z',
            observedAt: '2026-06-05T00:01:00.000Z',
          },
        ],
        nextCursor: 'next',
        sourceBreakdown: {
          totalItems: 1,
          providerCount: 1,
          sourceCount: 1,
          sources: [
            {
              providerKey: 'reddit',
              sourceKey: 'binding:binding-1',
              contentType: 'item',
              sourceBindingIds: ['binding-1'],
              itemCount: 1,
              latestObservedAt: '2026-06-05T00:01:00.000Z',
              latestPublishedAt: '2026-06-05T00:00:00.000Z',
              sampleItemIds: ['1'],
            },
          ],
        },
      },
    });
    expect(repository.queries).toEqual([
      expect.objectContaining({ limit: 20 }),
    ]);
    expect(baseline.queries).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        topicId: 'topic-1',
        observedAfter: new Date('2026-05-06T01:00:00.000Z'),
        limit: 2000,
      },
    ]);
  });

  it('rejects unsafe page limits', async () => {
    const useCase = new ListFeedItemsUseCase(
      new FakeFeedItemReadRepository({ items: [] }),
      new FakeFeedSignalBaselineRepository(),
      fixedClock,
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 0,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects oversized search query', async () => {
    const useCase = new ListFeedItemsUseCase(
      new FakeFeedItemReadRepository({ items: [] }),
      new FakeFeedSignalBaselineRepository(),
      fixedClock,
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 20,
      searchQuery: 'x'.repeat(201),
    });

    expect(result.ok).toBe(false);
  });

  it('passes search query to read repository', async () => {
    const repository = new FakeFeedItemReadRepository({ items: [] });
    const baseline = new FakeFeedSignalBaselineRepository();
    const useCase = new ListFeedItemsUseCase(repository, baseline, fixedClock);

    await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 20,
      searchQuery: 'open source',
    });

    expect(repository.queries).toEqual([
      expect.objectContaining({
        searchQuery: 'open source',
      }),
    ]);
    expect(baseline.queries).toEqual([]);
  });

  it('passes provider and repository trend filters to read repository', async () => {
    const repository = new FakeFeedItemReadRepository({ items: [] });
    const baseline = new FakeFeedSignalBaselineRepository();
    const useCase = new ListFeedItemsUseCase(repository, baseline, fixedClock);

    await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 20,
      topicId: 'topic-1',
      providerKey: 'github-repo-radar',
      repositoryTrendWindow: '24h',
      repositoryLanguage: 'TypeScript',
      repositoryTopic: 'agents',
    });

    expect(repository.queries).toEqual([
      expect.objectContaining({
        providerKey: 'github-repo-radar',
        repositoryTrendWindow: '24h',
        repositoryLanguage: 'TypeScript',
        repositoryTopic: 'agents',
      }),
    ]);
    expect(baseline.queries).toEqual([]);
  });

  it('accepts long repository trend windows used by repo radar scans', async () => {
    const repository = new FakeFeedItemReadRepository({ items: [] });
    const baseline = new FakeFeedSignalBaselineRepository();
    const useCase = new ListFeedItemsUseCase(repository, baseline, fixedClock);

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 20,
      providerKey: 'github-repo-radar',
      repositoryTrendWindow: '90d',
    });

    expect(result.ok).toBe(true);
    expect(repository.queries).toEqual([
      expect.objectContaining({
        providerKey: 'github-repo-radar',
        repositoryTrendWindow: '90d',
      }),
    ]);
    expect(baseline.queries).toEqual([]);
  });

  it('loads an exact source baseline cohort for visible items with comparable metrics', async () => {
    const item = makeRedditItem('reddit-1', 'TinySaaS');
    const repository = new FakeFeedItemReadRepository({ items: [item] });
    const baseline = new FakeFeedSignalBaselineRepository();
    const useCase = new ListFeedItemsUseCase(repository, baseline, fixedClock);

    await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 20,
      topicId: 'topic-1',
    });

    expect(baseline.queries).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        topicId: 'topic-1',
        observedAfter: new Date('2026-05-06T01:00:00.000Z'),
        limit: 2000,
      },
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        topicId: 'topic-1',
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

  it('loads all-topics baseline cohorts separately for each visible topic', async () => {
    const firstTopicItem = makeRedditItem('reddit-1', 'TinySaaS');
    const secondTopicItem = FeedItem.publish({
      ...makeRedditItem('reddit-2', 'Programming').toSnapshot(),
      topicId: 'topic-2',
    });
    const repository = new FakeFeedItemReadRepository({ items: [firstTopicItem, secondTopicItem] });
    const baseline = new FakeFeedSignalBaselineRepository();
    const useCase = new ListFeedItemsUseCase(repository, baseline, fixedClock);

    await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 20,
    });

    expect(baseline.queries).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        topicId: 'topic-1',
        observedAfter: new Date('2026-05-06T01:00:00.000Z'),
        limit: 2000,
      },
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        topicId: 'topic-1',
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
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        topicId: 'topic-2',
        observedAfter: new Date('2026-05-06T01:00:00.000Z'),
        limit: 2000,
      },
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        topicId: 'topic-2',
        observedAfter: new Date('2026-05-06T01:00:00.000Z'),
        limit: 2000,
        cohortFilters: [
          {
            providerKey: 'reddit',
            sourceKey: 'r/programming',
            contentType: 'post',
          },
        ],
      },
    ]);
  });

  it('returns a stable source breakdown for visible provider sources', async () => {
    const repository = new FakeFeedItemReadRepository({
      items: [
        makeRedditItem('reddit-1', 'TinySaaS'),
        makeRedditItem('reddit-2', 'TinySaaS'),
        makeRedditItem('reddit-3', 'ClaudeAI'),
      ],
    });
    const baseline = new FakeFeedSignalBaselineRepository();
    const useCase = new ListFeedItemsUseCase(repository, baseline, fixedClock);

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 20,
      topicId: 'topic-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.sourceBreakdown).toEqual({
      totalItems: 3,
      providerCount: 1,
      sourceCount: 2,
      sources: [
        {
          providerKey: 'reddit',
          sourceKey: 'r/tinysaas',
          contentType: 'post',
          sourceBindingIds: ['binding-TinySaaS'],
          itemCount: 2,
          latestObservedAt: '2026-06-05T00:01:00.000Z',
          latestPublishedAt: '2026-06-05T00:00:00.000Z',
          maxSignalScore: 50,
          maxSignalBand: 'normal',
          sampleItemIds: ['reddit-1', 'reddit-2'],
        },
        {
          providerKey: 'reddit',
          sourceKey: 'r/claudeai',
          contentType: 'post',
          sourceBindingIds: ['binding-ClaudeAI'],
          itemCount: 1,
          latestObservedAt: '2026-06-05T00:01:00.000Z',
          latestPublishedAt: '2026-06-05T00:00:00.000Z',
          maxSignalScore: 50,
          maxSignalBand: 'normal',
          sampleItemIds: ['reddit-3'],
        },
      ],
    });
  });

  it('rejects invalid repository trend windows', async () => {
    const useCase = new ListFeedItemsUseCase(
      new FakeFeedItemReadRepository({ items: [] }),
      new FakeFeedSignalBaselineRepository(),
      fixedClock,
    );

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 20,
      repositoryTrendWindow: '1y',
    });

    expect(result.ok).toBe(false);
  });
});
