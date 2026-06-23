import type { FeedItem } from '../../domain';
import type { FeedItemReadRepositoryPort, ListFeedItemsQuery, ListFeedItemsResult } from '../../ports';
import { matchesFeedItemReadFilters } from './feed-item-query-filter';

export class InMemoryFeedItemReadRepository implements FeedItemReadRepositoryPort {
  private readonly itemsByKey = new Map<string, FeedItem>();
  private readonly itemsById = new Map<string, FeedItem>();
  private readonly itemsByCanonicalUrl = new Map<string, FeedItem>();

  upsert(item: FeedItem): void {
    const snapshot = item.toSnapshot();
    const key = [
      snapshot.tenantId,
      snapshot.workspaceId,
      snapshot.topicId,
      snapshot.sourceItemId,
    ].join(':');
    const canonicalKey = [
      snapshot.tenantId,
      snapshot.workspaceId,
      snapshot.topicId,
      normalizeCanonicalUrl(snapshot.canonicalUrl),
    ].join(':');
    const existingCanonicalItem = this.itemsByCanonicalUrl.get(canonicalKey);

    if (existingCanonicalItem !== undefined) {
      this.itemsByKey.set(key, existingCanonicalItem);
      return;
    }

    this.itemsByKey.set(key, item);
    this.itemsById.set([
      snapshot.tenantId,
      snapshot.workspaceId,
      snapshot.id,
    ].join(':'), item);
    this.itemsByCanonicalUrl.set(canonicalKey, item);
  }

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    const offset = parseCursor(query.cursor);
    const allItems = [...this.itemsById.values()]
      .filter((item) => {
        const snapshot = item.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.topicId === undefined || snapshot.topicId === query.topicId) &&
          (query.observedAfter === undefined || snapshot.observedAt.getTime() > query.observedAfter.getTime()) &&
          matchesFeedItemReadFilters(item, query)
        );
      })
      .sort(compareFeedItems);
    const items = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  async findById(query: {
    tenantId: string;
    workspaceId: string;
    feedItemId: string;
  }): Promise<FeedItem | null> {
    const item = this.itemsById.get([
      query.tenantId,
      query.workspaceId,
      query.feedItemId,
    ].join(':'));

    return item ?? null;
  }

  all(): readonly FeedItem[] {
    return [...this.itemsById.values()];
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

const normalizeCanonicalUrl = (value: string): string => {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLocaleLowerCase('en-US');

    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLocaleLowerCase('en-US').startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
        parsed.searchParams.delete(key);
      }
    }

    parsed.searchParams.sort();

    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/u, '');
    }

    return parsed.toString();
  } catch {
    return value.trim().toLocaleLowerCase('en-US');
  }
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
