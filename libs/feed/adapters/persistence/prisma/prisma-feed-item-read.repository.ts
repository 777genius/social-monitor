import type { FeedItem } from "../../../domain";
import type {
  FeedItemReadRepositoryPort,
  ListFeedItemsQuery,
  ListFeedItemsResult,
} from "../../../ports";
import {
  matchesFeedItemReadFilters,
  requiresFeedItemScanFilter,
} from "../feed-item-query-filter";
import type { PrismaFeedClient } from "./prisma-feed-client";
import {
  encodeFeedCursor,
  feedItemFromPrisma,
  parseFeedCursor,
} from "./prisma-feed-records";

const MAX_FILTER_SCAN = 500;

type FeedItemObservedAtRange = {
  readonly gt?: Date;
  readonly lt?: Date;
};

export class PrismaFeedItemReadRepository implements FeedItemReadRepositoryPort {
  constructor(private readonly prisma: PrismaFeedClient) {}

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    const offset = parseFeedCursor(query.cursor);
    const observedAt = buildObservedAtRange(query);
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      status: "VISIBLE" as const,
      interestId: query.interestId,
      observedAt,
      providerKey: query.providerKey,
    };

    if (requiresFeedItemScanFilter(query)) {
      const records = await this.prisma.feedItem.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: MAX_FILTER_SCAN,
      });
      const filtered = records
        .map((record) => feedItemFromPrisma(record))
        .filter((item) => matchesFeedItemReadFilters(item, query));
      const items = filtered.slice(offset, offset + query.limit);
      const nextOffset = offset + items.length;

      return {
        items,
        nextCursor:
          nextOffset < filtered.length
            ? encodeFeedCursor(nextOffset)
            : undefined,
      };
    }

    const [records, total] = await Promise.all([
      this.prisma.feedItem.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
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
        status: "VISIBLE",
      },
    });

    return record === null ? null : feedItemFromPrisma(record);
  }
}

const buildObservedAtRange = (
  query: ListFeedItemsQuery,
): FeedItemObservedAtRange | undefined => {
  const range: { gt?: Date; lt?: Date } = {};

  if (query.observedAfter !== undefined) {
    range.gt = query.observedAfter;
  }

  if (query.observedBefore !== undefined) {
    range.lt = query.observedBefore;
  }

  return range.gt === undefined && range.lt === undefined ? undefined : range;
};
