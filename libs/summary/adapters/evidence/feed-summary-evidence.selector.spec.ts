import { FeedItem } from '@social-monitor/feed/domain';
import type { FeedItemReadRepositoryPort, ListFeedItemsQuery, ListFeedItemsResult } from '@social-monitor/feed/ports';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedSummaryEvidenceSelector } from './feed-summary-evidence.selector';

class FakeFeedItems implements FeedItemReadRepositoryPort {
  private readonly items: FeedItem[] = [];

  upsert(item: FeedItem): void {
    this.items.push(item);
  }

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    return {
      items: this.items
        .filter((item) => {
          const snapshot = item.toSnapshot();

          return (
            snapshot.tenantId === query.tenantId &&
            snapshot.workspaceId === query.workspaceId &&
            (query.topicId === undefined || snapshot.topicId === query.topicId)
          );
        })
        .sort((left, right) =>
          right.toSnapshot().publishedAt.getTime() - left.toSnapshot().publishedAt.getTime(),
        )
        .slice(0, query.limit),
      nextCursor: undefined,
    };
  }

  async findById(): Promise<FeedItem | null> {
    return null;
  }
}

describe('FeedSummaryEvidenceSelector', () => {
  it('selects latest workspace feed items as cited summary evidence', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const feedItems = new FakeFeedItems();
    feedItems.upsert(FeedItem.publish({
      id: 'feed-old',
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-1',
      sourceItemId: 'binding-1:item-old',
      sourceBindingId: 'binding-1',
      providerKey: 'reddit',
      canonicalUrl: 'https://example.test/old',
      title: 'Old signal',
      bodyPreview: 'Older body',
      publishedAt: new Date('2026-06-06T10:00:00.000Z'),
      observedAt: new Date('2026-06-06T10:01:00.000Z'),
    }));
    feedItems.upsert(FeedItem.publish({
      id: 'feed-new',
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-1',
      sourceItemId: 'binding-2:item-new',
      sourceBindingId: 'binding-2',
      providerKey: 'github',
      canonicalUrl: 'https://example.test/new',
      title: 'New signal',
      bodyPreview: 'Newer body',
      publishedAt: new Date('2026-06-06T11:00:00.000Z'),
      observedAt: new Date('2026-06-06T11:01:00.000Z'),
    }));
    feedItems.upsert(FeedItem.publish({
      id: 'feed-other-tenant',
      tenantId: tenantId('tenant-2'),
      workspaceId: workspace,
      topicId: 'topic-1',
      sourceItemId: 'binding-3:item-other',
      sourceBindingId: 'binding-3',
      providerKey: 'rss',
      canonicalUrl: 'https://example.test/other',
      title: 'Other tenant signal',
      bodyPreview: 'Other body',
      publishedAt: new Date('2026-06-06T12:00:00.000Z'),
      observedAt: new Date('2026-06-06T12:01:00.000Z'),
    }));

    const result = await new FeedSummaryEvidenceSelector(
      feedItems,
      new FixedClock(new Date('2026-06-06T12:30:00.000Z')),
    ).select({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-1',
      maxItems: 2,
    });

    expect(result.items).toEqual([
      {
        feedItemId: 'feed-new',
        sourceItemId: 'binding-2:item-new',
        sourceBindingId: 'binding-2',
        providerKey: 'github',
        title: 'New signal',
        bodyPreview: 'Newer body',
        canonicalUrl: 'https://example.test/new',
        observedAt: new Date('2026-06-06T11:01:00.000Z'),
      },
      {
        feedItemId: 'feed-old',
        sourceItemId: 'binding-1:item-old',
        sourceBindingId: 'binding-1',
        providerKey: 'reddit',
        title: 'Old signal',
        bodyPreview: 'Older body',
        canonicalUrl: 'https://example.test/old',
        observedAt: new Date('2026-06-06T10:01:00.000Z'),
      },
    ]);
    expect(result.sourceWindow).toEqual({
      windowId: 'tenant-1:workspace-1:topic-1:2026-06-06T10:01:00.000Z:2026-06-06T11:01:00.000Z',
      startedAt: new Date('2026-06-06T10:01:00.000Z'),
      endedAt: new Date('2026-06-06T11:01:00.000Z'),
      selectedFeedItemIds: ['feed-new', 'feed-old'],
    });
  });

  it('returns an empty window when no feed evidence exists', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const result = await new FeedSummaryEvidenceSelector(
      new FakeFeedItems(),
      new FixedClock(new Date('2026-06-06T12:30:00.000Z')),
    ).select({
      tenantId: tenant,
      workspaceId: workspace,
      topicId: 'topic-1',
      maxItems: 20,
    });

    expect(result.items).toEqual([]);
    expect(result.sourceWindow.windowId).toBe('tenant-1:workspace-1:topic-1:empty');
    expect(result.sourceWindow.selectedFeedItemIds).toEqual([]);
    expect(result.sourceWindow.endedAt.getTime()).toBeGreaterThan(result.sourceWindow.startedAt.getTime());
  });
});
