import {
  classifyFeedPromotionEligibility,
  type FeedItem,
  feedProviderMetricsFromMetadata,
  feedProviderMetricStrength,
} from "../../../domain";
import {
  assertValidFeedItemListQuery,
  PROMOTION_ELIGIBLE_ITEM_CEILING,
  PROMOTION_PHYSICAL_ROW_CEILING,
  type FeedItemReadRepositoryPort,
  type ListFeedItemsQuery,
  type ListFeedItemsResult,
  type ListFeedItemSignalCandidatesQuery,
  type PromotionFeedItemCandidate,
  type PromotionFeedItemSnapshotRepositoryPort,
  type PromotionFeedItemSnapshotResult,
  type ReadPromotionFeedItemSnapshotQuery,
} from "../../../ports";
import { matchesFeedItemReadFilters } from "../feed-item-query-filter";
import type { PrismaFeedClient } from "./prisma-feed-client";
import {
  encodeFeedOffsetCursor,
  feedItemFromPrisma,
  parseFeedOffsetCursor,
  type PrismaFeedItemRecord,
} from "./prisma-feed-records";

const PROVIDER_SIGNAL_SCAN_LIMIT = 1_000;
const PROMOTION_INTERNAL_PAGE_SIZE = 200;
const PROMOTION_TRANSACTION_TIMEOUT_MS = 30_000;

export class PrismaFeedItemReadRepository implements
  FeedItemReadRepositoryPort, PromotionFeedItemSnapshotRepositoryPort
{
  constructor(private readonly prisma: PrismaFeedClient) {}

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    assertValidFeedItemListQuery(query);
    const offset = parseFeedOffsetCursor(query.cursor);
    const candidates = await this.listSignalCandidates(query);
    const sorted = sortFeedItems(candidates);
    const items = sorted.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;
    return {
      items,
      nextCursor: nextOffset < sorted.length
        ? encodeFeedOffsetCursor(nextOffset)
        : undefined,
    };
  }

  async listSignalCandidates(
    query: ListFeedItemSignalCandidatesQuery,
  ): Promise<readonly FeedItem[]> {
    const records = await this.prisma.feedItem.findMany({
      where: commonWhere(query),
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: PROVIDER_SIGNAL_SCAN_LIMIT,
    });
    return records.map(feedItemFromPrisma)
      .filter((item) => matchesFeedItemReadFilters(item, query));
  }

  async readPromotionSnapshot(
    query: ReadPromotionFeedItemSnapshotQuery,
  ): Promise<PromotionFeedItemSnapshotResult> {
    assertPromotionWindow(query);
    if (this.prisma.$transaction === undefined) {
      throw new Error("Repeatable-read promotion snapshot is unavailable");
    }
    return this.prisma.$transaction(
      (transaction) => scanPromotionSnapshot(transaction, query),
      {
        isolationLevel: "RepeatableRead",
        timeout: PROMOTION_TRANSACTION_TIMEOUT_MS,
      },
    );
  }

  async findById(query: {
    tenantId: string;
    workspaceId: string;
    feedItemId: string;
    observedBefore?: Date;
    observedAtOrBefore?: Date;
  }): Promise<FeedItem | null> {
    const record = await this.prisma.feedItem.findFirst({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        id: query.feedItemId,
        status: "VISIBLE",
        observedAt: dateRange({
          lte: query.observedAtOrBefore,
          lt: query.observedBefore,
        }),
      },
    });
    return record === null ? null : feedItemFromPrisma(record);
  }

  async readSourceContent(query: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly feedItemIds: readonly string[];
    readonly observedBefore?: Date;
    readonly observedAtOrBefore?: Date;
  }) {
    if (query.feedItemIds.length === 0) return [];
    const records = await this.prisma.feedItem.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        status: "VISIBLE",
        id: { in: query.feedItemIds },
        observedAt: dateRange({
          lte: query.observedAtOrBefore,
          lt: query.observedBefore,
        }),
      },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: query.feedItemIds.length,
      include: { sourceItem: { select: { body: true } } },
    });
    return records.flatMap((record) => record.sourceItem === undefined
      ? []
      : [{
          feedItemId: record.id,
          sourceItemId: record.sourceItemId,
          body: record.sourceItem.body,
        }]);
  }
}

const scanPromotionSnapshot = async (
  transaction: PrismaFeedClient,
  query: ReadPromotionFeedItemSnapshotQuery,
): Promise<PromotionFeedItemSnapshotResult> => {
  if (transaction.$executeRawUnsafe === undefined) {
    throw new Error("Read-only promotion snapshot is unavailable");
  }
  await transaction.$executeRawUnsafe("SET TRANSACTION READ ONLY");
  if (transaction.$queryRawUnsafe === undefined) {
    throw new Error("Exact PostgreSQL promotion cutoff capability is unavailable");
  }
  const candidates: PromotionFeedItemCandidate[] = [];
  const supplementalItems: FeedItem[] = [];
  const sourceContent = [] as {
    feedItemId: string; sourceItemId: string; body: string;
  }[];
  const visitedIds = new Set<string>();
  let physicalRowsRead = 0;
  let afterId: string | undefined;
  while (physicalRowsRead <= PROMOTION_PHYSICAL_ROW_CEILING) {
    const remaining = PROMOTION_PHYSICAL_ROW_CEILING - physicalRowsRead;
    const take = Math.min(PROMOTION_INTERNAL_PAGE_SIZE, remaining + 1);
    const records = await transaction.feedItem.findMany({
      where: promotionWhere(query),
      orderBy: promotionOrder(query),
      ...(afterId === undefined ? {} : { cursor: { id: afterId }, skip: 1 }),
      take,
      include: { sourceItem: { select: { body: true } } },
    });
    for (const record of records) {
      if (visitedIds.has(record.id)) {
        throw new Error("Promotion snapshot keyset returned a duplicate physical row");
      }
      visitedIds.add(record.id);
    }
    physicalRowsRead += records.length;
    if (physicalRowsRead > PROMOTION_PHYSICAL_ROW_CEILING) {
      return {
        ok: false,
        reason: "physical_row_ceiling_exceeded",
        physicalRowsRead,
        eligibleItemCount: candidates.length,
        exhausted: false,
      };
    }
    const exactTimestamps = await exactPageTimestamps(
      transaction,
      records.map((record) => record.id),
      query.observedThrough,
    );
    for (const record of records) {
      const item = feedItemFromPrisma(record);
      const snapshot = item.toSnapshot();
      if (query.timestampPolicy === "published_at" &&
          exactTimestamps.get(record.id)?.observedThrough !== true) {
        continue;
      }
      if (record.sourceItem === undefined ||
          record.sourceItem.body === undefined) {
        throw new Error("Promotion snapshot source content row is missing");
      }
      sourceContent.push({
        feedItemId: record.id,
        sourceItemId: record.sourceItemId,
        body: record.sourceItem.body,
      });
      if (snapshot.providerKey.trim().toLowerCase() === "github-trending-page") {
        supplementalItems.push(item);
      }
      const canonical = classifyFeedPromotionEligibility({
        providerKey: snapshot.providerKey,
        providerMetadata: snapshot.providerMetadata,
      });
      if (!canonical.eligible) continue;
      const exact = exactTimestamps.get(record.id);
      if (exact === undefined) {
        throw new Error("Promotion snapshot exact timestamp row is missing");
      }
      candidates.push({
        item,
        canonical,
        exactTimestamps: {
          publishedAt: exact.publishedAt,
          observedAt: exact.observedAt,
        },
      });
      if (candidates.length > PROMOTION_ELIGIBLE_ITEM_CEILING) {
        return {
          ok: false,
          reason: "eligible_item_ceiling_exceeded",
          physicalRowsRead,
          eligibleItemCount: candidates.length,
          exhausted: records.length < take,
        };
      }
    }
    if (records.length < take) {
      return {
        ok: true,
        candidates,
        supplementalItems,
        sourceContent,
        physicalRowsRead,
        exhausted: true,
      };
    }
    afterId = (records.at(-1) as PrismaFeedItemRecord).id;
  }
  throw new Error("Promotion snapshot scan invariant failed");
};

const exactPageTimestamps = async (
  transaction: PrismaFeedClient,
  ids: readonly string[],
  cutoff: Date,
): Promise<ReadonlyMap<string, {
  readonly publishedAt: string;
  readonly observedAt: string;
  readonly observedThrough: boolean;
}>> => {
  if (ids.length === 0) return new Map();
  const rows = await transaction.$queryRawUnsafe!<readonly {
    readonly id: string;
    readonly publishedAt: string;
    readonly observedAt: string;
    readonly observedThrough: boolean;
  }[]>(
    `SELECT id::text AS id,
            to_char(published_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "publishedAt",
            to_char(observed_at AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "observedAt",
            observed_at <= $2::timestamptz AS "observedThrough"
       FROM feed_items
      WHERE id = ANY($1::uuid[])`,
    ids,
    cutoff,
  );
  return new Map(rows.map((row) => [row.id, row] as const));
};

const promotionWhere = (
  query: ReadPromotionFeedItemSnapshotQuery,
): Parameters<PrismaFeedClient["feedItem"]["findMany"]>[0]["where"] => ({
  tenantId: query.tenantId,
  workspaceId: query.workspaceId,
  status: "VISIBLE",
  interestId: query.interestId,
  observedAt: query.timestampPolicy === "observed_at"
    ? {
        gte: query.windowStartedAt,
        lt: query.windowEndedAt,
        lte: query.observedThrough,
      }
    : undefined,
  publishedAt: query.timestampPolicy === "published_at"
    ? { gte: query.windowStartedAt, lt: query.windowEndedAt }
    : undefined,
});

const promotionOrder = (
  query: ReadPromotionFeedItemSnapshotQuery,
): Parameters<PrismaFeedClient["feedItem"]["findMany"]>[0]["orderBy"] =>
  query.timestampPolicy === "published_at"
    ? [{ publishedAt: "desc" }, { id: "desc" }]
    : [{ observedAt: "desc" }, { id: "desc" }];

const commonWhere = (
  query: ListFeedItemSignalCandidatesQuery,
): Parameters<PrismaFeedClient["feedItem"]["findMany"]>[0]["where"] => ({
  tenantId: query.tenantId,
  workspaceId: query.workspaceId,
  status: "VISIBLE",
  interestId: query.interestId,
  observedAt: dateRange({
    gte: query.observedAtOrAfter,
    gt: query.observedAfter,
    lte: query.observedAtOrBefore,
    lt: query.observedBefore,
  }),
  publishedAt: dateRange({
    gte: query.publishedAtOrAfter,
    lt: query.publishedBefore,
  }),
  providerKey: query.providerKey,
});

const dateRange = (range: {
  readonly gte?: Date;
  readonly gt?: Date;
  readonly lte?: Date;
  readonly lt?: Date;
}) => Object.values(range).every((value) => value === undefined)
  ? undefined
  : range;

const sortFeedItems = (items: readonly FeedItem[]): readonly FeedItem[] =>
  [...items].sort((left, right) => {
    const leftSnapshot = left.toSnapshot();
    const rightSnapshot = right.toSnapshot();
    return feedItemSignalStrength(rightSnapshot) -
        feedItemSignalStrength(leftSnapshot) ||
      rightSnapshot.publishedAt.getTime() - leftSnapshot.publishedAt.getTime() ||
      rightSnapshot.id.localeCompare(leftSnapshot.id);
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

const assertPromotionWindow = (query: ReadPromotionFeedItemSnapshotQuery): void => {
  if (query.windowStartedAt.getTime() >= query.windowEndedAt.getTime()) {
    throw new Error("Promotion snapshot window is invalid");
  }
};
