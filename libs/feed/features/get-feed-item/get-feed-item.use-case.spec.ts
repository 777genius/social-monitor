import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedItem } from '../../domain';
import type { FeedItemReadRepositoryPort, ListFeedItemsResult } from '../../ports';
import { GetFeedItemUseCase } from './get-feed-item.use-case';

class FakeFeedItemReadRepository implements FeedItemReadRepositoryPort {
  constructor(private readonly item: FeedItem | null) {}

  async list(): Promise<ListFeedItemsResult> {
    return { items: [] };
  }

  async findById(): Promise<FeedItem | null> {
    return this.item;
  }
}

const makeItem = () =>
  FeedItem.publish({
    id: 'feed-1',
    tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'),
    sourceItemId: 'source-1',
    sourceBindingId: 'binding-1',
    canonicalUrl: 'https://example.test/feed-1',
    title: 'Feed 1',
    bodyPreview: 'Body 1',
    authorHandle: 'author',
    publishedAt: new Date('2026-06-05T00:00:00.000Z'),
    observedAt: new Date('2026-06-05T00:01:00.000Z'),
  });

describe('GetFeedItemUseCase', () => {
  it('returns one feed item DTO', async () => {
    const useCase = new GetFeedItemUseCase(new FakeFeedItemReadRepository(makeItem()));

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      feedItemId: 'feed-1',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        id: 'feed-1',
        sourceItemId: 'source-1',
        sourceBindingId: 'binding-1',
        canonicalUrl: 'https://example.test/feed-1',
        title: 'Feed 1',
        bodyPreview: 'Body 1',
        authorHandle: 'author',
        publishedAt: '2026-06-05T00:00:00.000Z',
        observedAt: '2026-06-05T00:01:00.000Z',
      },
    });
  });

  it('returns not found for missing feed item', async () => {
    const useCase = new GetFeedItemUseCase(new FakeFeedItemReadRepository(null));

    const result = await useCase.execute({
      tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'),
      feedItemId: 'missing',
    });

    expect(result.ok).toBe(false);
  });
});
