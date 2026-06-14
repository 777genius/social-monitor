import type { FeedItem } from '../../../domain';
import type { FeedItemReadRepositoryPort, ListFeedItemsQuery, ListFeedItemsResult } from '../../../ports';
import type { PrismaFeedClient } from './prisma-feed-client';
import { encodeFeedCursor, feedItemFromPrisma, parseFeedCursor } from './prisma-feed-records';

const MAX_SEARCH_SCAN = 500;

export class PrismaFeedItemReadRepository implements FeedItemReadRepositoryPort {
  constructor(private readonly prisma: PrismaFeedClient) {}

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    const offset = parseFeedCursor(query.cursor);
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      status: 'VISIBLE' as const,
      topicId: query.topicId,
      observedAt: query.observedAfter === undefined ? undefined : { gt: query.observedAfter },
    };

    if (query.searchQuery !== undefined && query.searchQuery.trim().length > 0) {
      const records = await this.prisma.feedItem.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: MAX_SEARCH_SCAN,
      });
      const filtered = records
        .map((record) => feedItemFromPrisma(record))
        .filter((item) => matchesSearch(item, query.searchQuery));
      const items = filtered.slice(offset, offset + query.limit);
      const nextOffset = offset + items.length;

      return {
        items,
        nextCursor: nextOffset < filtered.length ? encodeFeedCursor(nextOffset) : undefined,
      };
    }

    const [records, total] = await Promise.all([
      this.prisma.feedItem.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.feedItem.count({ where }),
    ]);
    const items = records.map((record) => feedItemFromPrisma(record));
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < total ? encodeFeedCursor(nextOffset) : undefined,
    };
  }

  async findById(query: {
    tenantId: string;
    workspaceId: string;
    feedItemId: string;
  }): Promise<FeedItem | null> {
    const record = await this.prisma.feedItem.findFirst({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        id: query.feedItemId,
        status: 'VISIBLE',
      },
    });

    return record === null ? null : feedItemFromPrisma(record);
  }
}

const matchesSearch = (item: FeedItem, searchQuery: string | undefined): boolean => {
  if (searchQuery === undefined) {
    return true;
  }

  const normalizedQuery = normalizeSearchText(searchQuery);

  if (normalizedQuery.length === 0) {
    return true;
  }

  const snapshot = item.toSnapshot();
  const haystack = normalizeSearchText([
    snapshot.title,
    snapshot.bodyPreview,
    snapshot.canonicalUrl,
    snapshot.authorHandle ?? '',
  ].join(' '));

  return normalizedQuery
    .split(/\s+/u)
    .every((term) => haystack.includes(term));
};

const normalizeSearchText = (value: string): string => value.trim().toLocaleLowerCase('en-US');
