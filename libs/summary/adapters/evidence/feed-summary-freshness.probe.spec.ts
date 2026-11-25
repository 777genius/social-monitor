import { FeedItem } from '@social-monitor/feed/domain';
import type { FeedItemReadRepositoryPort, ListFeedItemsQuery, ListFeedItemsResult } from '@social-monitor/feed/ports';
import { FixedClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { FeedSummaryFreshnessProbe } from './feed-summary-freshness.probe';

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
            (query.interestId === undefined || snapshot.interestId === query.interestId) &&
            (query.observedAfter === undefined || snapshot.observedAt.getTime() > query.observedAfter.getTime())
          );
        })
        .sort((left, right) =>
          right.toSnapshot().observedAt.getTime() - left.toSnapshot().observedAt.getTime(),
        )
        .slice(0, query.limit),
      nextCursor: undefined,
    };
  }

  async findById(): Promise<FeedItem | null> {
    return null;
  }
}

describe('FeedSummaryFreshnessProbe', () => {
  it('marks a summary stale when newer interest evidence arrives after the frozen source window', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const feedItems = new FakeFeedItems();
    feedItems.upsert(makeFeedItem({
      id: 'feed-window',
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      observedAt: new Date('2026-06-06T00:01:00.000Z'),
    }));
    feedItems.upsert(makeFeedItem({
      id: 'feed-newer',
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      observedAt: new Date('2026-06-06T00:03:00.000Z'),
    }));
    feedItems.upsert(makeFeedItem({
      id: 'feed-other-interest',
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-2',
      observedAt: new Date('2026-06-06T00:04:00.000Z'),
    }));

    const result = await new FeedSummaryFreshnessProbe(
      feedItems,
      new FixedClock(new Date('2026-06-06T00:05:00.000Z')),
    ).evaluate({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      sourceWindow: {
        windowId: 'window-1',
        startedAt: new Date('2026-06-06T00:00:00.000Z'),
        endedAt: new Date('2026-06-06T00:02:00.000Z'),
        selectedFeedItemIds: ['feed-window'],
      },
    });

    expect(result).toEqual({
      status: 'stale',
      checkedAt: new Date('2026-06-06T00:05:00.000Z'),
      staleMarkedAt: new Date('2026-06-06T00:05:00.000Z'),
      reason: 'new_evidence_after_window',
      newestFeedItemId: 'feed-newer',
      newestObservedAt: new Date('2026-06-06T00:03:00.000Z'),
    });
  });

  it('keeps the summary fresh when evidence is inside the selected window boundary', async () => {
    const tenant = tenantId('tenant-1');
    const workspace = workspaceId('workspace-1');
    const feedItems = new FakeFeedItems();
    feedItems.upsert(makeFeedItem({
      id: 'feed-boundary',
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      observedAt: new Date('2026-06-06T00:02:00.000Z'),
    }));

    const result = await new FeedSummaryFreshnessProbe(
      feedItems,
      new FixedClock(new Date('2026-06-06T00:05:00.000Z')),
    ).evaluate({
      tenantId: tenant,
      workspaceId: workspace,
      interestId: 'interest-1',
      sourceWindow: {
        windowId: 'window-1',
        startedAt: new Date('2026-06-06T00:00:00.000Z'),
        endedAt: new Date('2026-06-06T00:02:00.000Z'),
        selectedFeedItemIds: ['feed-boundary'],
      },
    });

    expect(result).toEqual({
      status: 'fresh',
      checkedAt: new Date('2026-06-06T00:05:00.000Z'),
    });
  });
});

const makeFeedItem = (params: {
  readonly id: string;
  readonly tenantId: ReturnType<typeof tenantId>;
  readonly workspaceId: ReturnType<typeof workspaceId>;
  readonly interestId: string;
  readonly observedAt: Date;
}): FeedItem =>
  FeedItem.publish({
    id: params.id,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    interestId: params.interestId,
    sourceItemId: `${params.id}:source`,
    sourceBindingId: `${params.interestId}:binding`,
    providerKey: 'rss',
    canonicalUrl: `https://example.test/${params.id}`,
    title: `Title ${params.id}`,
    bodyPreview: `Body ${params.id}`,
    publishedAt: params.observedAt,
    observedAt: params.observedAt,
  });
