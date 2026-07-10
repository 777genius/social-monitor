import {
  type FeedItem,
  feedProviderMetricsFromMetadata,
  feedProviderMetricStrength,
} from "../../../domain";
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

const MAX_FILTER_SCAN = 1_000;

type FeedItemObservedAtRange = {
  readonly gt?: Date;
  readonly lt?: Date;
};

type FeedItemPublishedAtRange = {
  readonly gte?: Date;
  readonly lt?: Date;
};

export class PrismaFeedItemReadRepository implements FeedItemReadRepositoryPort {
  constructor(private readonly prisma: PrismaFeedClient) {}

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    const offset = parseFeedCursor(query.cursor);
    const observedAt = buildObservedAtRange(query);
    const publishedAt = buildPublishedAtRange(query);
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      status: "VISIBLE" as const,
      interestId: query.interestId,
      observedAt,
      publishedAt,
      providerKey: query.providerKey,
    };

    if (requiresFeedItemScanFilter(query)) {
      const records = await this.prisma.feedItem.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        skip: 0,
        take: MAX_FILTER_SCAN,
      });
      const filtered = sortFeedItemsBySignal(
        records
          .map((record) => feedItemFromPrisma(record))
          .filter((item) => matchesFeedItemReadFilters(item, query)),
      );
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

    const records = await this.prisma.feedItem.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: MAX_FILTER_SCAN,
    });
    const sorted = sortFeedItemsBySignal(
      records.map((record) => feedItemFromPrisma(record)),
    );
    const items = sorted.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor:
        nextOffset < sorted.length ? encodeFeedCursor(nextOffset) : undefined,
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

  async readSourceContent(query: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly feedItemIds: readonly string[];
  }) {
    if (query.feedItemIds.length === 0) {
      return [];
    }

    const records = await this.prisma.feedItem.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        status: "VISIBLE",
        id: { in: query.feedItemIds },
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip: 0,
      take: query.feedItemIds.length,
      include: {
        sourceItem: {
          select: { body: true },
        },
      },
    });

    return records.flatMap((record) =>
      record.sourceItem === undefined
        ? []
        : [
            {
              feedItemId: record.id,
              sourceItemId: record.sourceItemId,
              body: record.sourceItem.body,
            },
          ],
    );
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

const buildPublishedAtRange = (
  query: ListFeedItemsQuery,
): FeedItemPublishedAtRange | undefined => {
  const range: { gte?: Date; lt?: Date } = {};

  if (query.publishedAtOrAfter !== undefined) {
    range.gte = query.publishedAtOrAfter;
  }

  if (query.publishedBefore !== undefined) {
    range.lt = query.publishedBefore;
  }

  return range.gte === undefined && range.lt === undefined ? undefined : range;
};

const sortFeedItemsBySignal = (
  items: readonly FeedItem[],
): readonly FeedItem[] =>
  [...items].sort((left, right) => {
    const leftSnapshot = left.toSnapshot();
    const rightSnapshot = right.toSnapshot();
    const signalDiff =
      feedItemSignalStrength(rightSnapshot) -
      feedItemSignalStrength(leftSnapshot);

    if (signalDiff !== 0) {
      return signalDiff;
    }

    const publishedAtDiff =
      rightSnapshot.publishedAt.getTime() - leftSnapshot.publishedAt.getTime();
    if (publishedAtDiff !== 0) {
      return publishedAtDiff;
    }

    return rightSnapshot.id.localeCompare(leftSnapshot.id);
  });

const feedItemSignalStrength = (
  item: ReturnType<FeedItem["toSnapshot"]>,
): number => {
  const metrics = feedProviderMetricsFromMetadata({
    providerKey: item.providerKey,
    providerMetadata: item.providerMetadata,
  });

  return metrics === undefined ? 0 : feedProviderMetricStrength(metrics);
};
