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
      },
    });
    expect(repository.queries).toEqual([
      expect.objectContaining({ limit: 20 }),
    ]);
    expect(baseline.queries).toEqual([
      {
        tenantId: tenantId('tenant-1'),
        workspaceId: workspaceId('workspace-1'),
        topicId: undefined,
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
    expect(baseline.queries).toEqual([
      expect.objectContaining({
        observedAfter: new Date('2026-05-06T01:00:00.000Z'),
        limit: 2000,
      }),
    ]);
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
