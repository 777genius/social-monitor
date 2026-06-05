import type { FeedItem } from '../../domain';
import type { FeedItemReadRepositoryPort, ListFeedItemsQuery, ListFeedItemsResult } from '../../ports';

export class InMemoryFeedItemReadRepository implements FeedItemReadRepositoryPort {
  private readonly itemsByKey = new Map<string, FeedItem>();

  upsert(item: FeedItem): void {
    const snapshot = item.toSnapshot();
    const key = [
      snapshot.tenantId,
      snapshot.workspaceId,
      snapshot.sourceItemId,
    ].join(':');

    this.itemsByKey.set(key, item);
  }

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    const offset = parseCursor(query.cursor);
    const allItems = [...this.itemsByKey.values()]
      .filter((item) => {
        const snapshot = item.toSnapshot();

        return snapshot.tenantId === query.tenantId && snapshot.workspaceId === query.workspaceId;
      })
      .sort(compareFeedItems);
    const items = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }
}

const compareFeedItems = (left: FeedItem, right: FeedItem): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const publishedDiff = rightSnapshot.publishedAt.getTime() - leftSnapshot.publishedAt.getTime();

  if (publishedDiff !== 0) {
    return publishedDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
