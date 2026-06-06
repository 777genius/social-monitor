import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedItem } from '../../domain';
import type { FeedItemReadRepositoryPort, ListFeedItemsQuery, ListFeedItemsResult } from '../../ports';
import { ListFeedItemsUseCase } from './list-feed-items.use-case';

class FakeFeedItemReadRepository implements FeedItemReadRepositoryPort {
  constructor(private readonly result: ListFeedItemsResult) {}

  readonly queries: ListFeedItemsQuery[] = [];

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    this.queries.push(query);
    return this.result;
  }

  async findById(): Promise<FeedItem | null> {
    return null;
  }
}

const makeItem = (id: string) =>
  FeedItem.publish({
    id,
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    sourceItemId: `source-${id}`,
    sourceBindingId: 'binding-1',
    canonicalUrl: `https://example.test/${id}`,
    title: `Title ${id}`,
    bodyPreview: `Body ${id}`,
    authorHandle: 'author',
    publishedAt: new Date('2026-06-05T00:00:00.000Z'),
    observedAt: new Date('2026-06-05T00:01:00.000Z'),
  });

describe('ListFeedItemsUseCase', () => {
  it('returns feed items as stable read-model DTOs', async () => {
    const repository = new FakeFeedItemReadRepository({
      items: [makeItem('1')],
      nextCursor: 'next',
    });
    const useCase = new ListFeedItemsUseCase(repository);

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
            sourceItemId: 'source-1',
            sourceBindingId: 'binding-1',
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
    expect(repository.queries).toHaveLength(1);
  });

  it('rejects unsafe page limits', async () => {
    const useCase = new ListFeedItemsUseCase(new FakeFeedItemReadRepository({ items: [] }));

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      limit: 0,
    });

    expect(result.ok).toBe(false);
  });

  it('rejects oversized search query', async () => {
    const useCase = new ListFeedItemsUseCase(new FakeFeedItemReadRepository({ items: [] }));

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
    const useCase = new ListFeedItemsUseCase(repository);

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
  });
});
