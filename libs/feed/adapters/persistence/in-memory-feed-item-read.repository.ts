import {
  classifyFeedPromotionEligibility,
  feedSignalBaselineSampleFromItem,
  FeedItem,
  type FeedSignalBaselineSample,
} from "../../domain";
import type {
  FeedItemReadRepositoryPort,
  ListFeedItemSignalCandidatesQuery,
  ListFeedItemsQuery,
  ListFeedItemsResult,
  PromotionFeedItemSnapshotResult,
  PromotionFeedItemSnapshotRepositoryPort,
  ReadPromotionFeedItemSnapshotQuery,
} from "../../ports";
import {
  assertValidFeedItemListQuery,
  PROMOTION_ELIGIBLE_ITEM_CEILING,
  PROMOTION_PHYSICAL_ROW_CEILING,
} from "../../ports";
import type {
  FeedSignalBaselineCohortFilter,
  FeedSignalBaselineRepositoryPort,
  ListFeedSignalBaselineSamplesQuery,
} from "../../ports/feed-signal-baseline-repository.port";
import { feedDedupeKeyForItem } from "./feed-dedupe-key";
import { matchesFeedItemReadFilters } from "./feed-item-query-filter";

const PROVIDER_SIGNAL_SCAN_LIMIT = 1_000;

export class InMemoryFeedItemReadRepository
  implements FeedItemReadRepositoryPort, FeedSignalBaselineRepositoryPort,
    PromotionFeedItemSnapshotRepositoryPort
{
  private readonly itemsByKey = new Map<string, FeedItem>();
  private readonly itemsById = new Map<string, FeedItem>();
  private readonly itemsByCanonicalUrl = new Map<string, FeedItem>();

  upsert(item: FeedItem): void {
    const snapshot = item.toSnapshot();
    const key = [
      snapshot.tenantId,
      snapshot.workspaceId,
      snapshot.interestId,
      snapshot.sourceItemId,
    ].join(":");
    const canonicalKey = [
      snapshot.tenantId,
      snapshot.workspaceId,
      snapshot.interestId,
      feedDedupeKeyForItem({
        canonicalUrl: snapshot.canonicalUrl,
        sourceBindingId: snapshot.sourceBindingId,
        providerMetadata: snapshot.providerMetadata,
      }),
    ].join(":");
    const existingCanonicalItem = this.itemsByCanonicalUrl.get(canonicalKey);

    if (existingCanonicalItem !== undefined) {
      this.itemsByKey.set(key, existingCanonicalItem);
      return;
    }

    this.itemsByKey.set(key, item);
    this.itemsById.set(
      [snapshot.tenantId, snapshot.workspaceId, snapshot.id].join(":"),
      item,
    );
    this.itemsByCanonicalUrl.set(canonicalKey, item);
  }

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    assertValidFeedItemListQuery(query);
    const allItems = await this.listSignalCandidates(query);

    const offset = parseOffsetCursor(query.cursor);
    const boundedItems = [...allItems].sort(compareFeedItemsByProviderSignal);
    const items = boundedItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor:
        nextOffset < boundedItems.length
          ? encodeOffsetCursor(nextOffset)
          : undefined,
    };
  }

  async listSignalCandidates(
    query: ListFeedItemSignalCandidatesQuery,
  ): Promise<readonly FeedItem[]> {
    return [...this.itemsById.values()]
      .filter((item) => {
        const snapshot = item.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.interestId === undefined || snapshot.interestId === query.interestId) &&
          (query.observedAfter === undefined ||
            snapshot.observedAt.getTime() > query.observedAfter.getTime()) &&
          (query.observedAtOrAfter === undefined ||
            snapshot.observedAt.getTime() >=
              query.observedAtOrAfter.getTime()) &&
          (query.observedAtOrBefore === undefined ||
            snapshot.observedAt.getTime() <=
              query.observedAtOrBefore.getTime()) &&
          (query.observedBefore === undefined ||
            snapshot.observedAt.getTime() < query.observedBefore.getTime()) &&
          (query.publishedAtOrAfter === undefined ||
            snapshot.publishedAt.getTime() >=
              query.publishedAtOrAfter.getTime()) &&
          (query.publishedBefore === undefined ||
            snapshot.publishedAt.getTime() < query.publishedBefore.getTime()) &&
          matchesFeedItemReadFilters(item, query)
        );
      })
      .sort(compareFeedItemsByPublishedAt)
      .slice(0, PROVIDER_SIGNAL_SCAN_LIMIT);
  }

  async readPromotionSnapshot(
    query: ReadPromotionFeedItemSnapshotQuery,
  ): Promise<PromotionFeedItemSnapshotResult> {
    assertPromotionWindow(query);
    const snapshot = [...this.itemsById.values()].map(copyFeedItem)
      .filter((item) => promotionItemInScope(item, query))
      .sort((left, right) => comparePromotionScanOrder(left, right, query));
    const bounded = snapshot.slice(0, PROMOTION_PHYSICAL_ROW_CEILING + 1);
    const physicalRowsRead = bounded.length;
    if (bounded.length > PROMOTION_PHYSICAL_ROW_CEILING) {
      return {
        ok: false,
        reason: "physical_row_ceiling_exceeded",
        physicalRowsRead,
        eligibleItemCount: countEligible(
          bounded.slice(0, PROMOTION_PHYSICAL_ROW_CEILING),
          query,
        ),
        exhausted: false,
      };
    }
    const candidates = bounded.flatMap((item) => {
      const itemSnapshot = item.toSnapshot();
      if (itemSnapshot.observedAt.getTime() > query.observedThrough.getTime()) {
        return [];
      }
      const canonical = classifyFeedPromotionEligibility({
        providerKey: itemSnapshot.providerKey,
        providerMetadata: itemSnapshot.providerMetadata,
      });
      return canonical.eligible ? [{
        item,
        canonical,
        exactTimestamps: {
          publishedAt: exactTimestamp(itemSnapshot.publishedAt),
          observedAt: exactTimestamp(itemSnapshot.observedAt),
        },
      }] : [];
    });
    if (candidates.length > PROMOTION_ELIGIBLE_ITEM_CEILING) {
      return {
        ok: false,
        reason: "eligible_item_ceiling_exceeded",
        physicalRowsRead,
        eligibleItemCount: candidates.length,
        exhausted: true,
      };
    }
    const supplementalItems = bounded.filter((item) => {
      const itemSnapshot = item.toSnapshot();
      return itemSnapshot.providerKey.trim().toLowerCase() ===
          "github-trending-page" &&
        itemSnapshot.observedAt.getTime() <= query.observedThrough.getTime();
    });
    return {
      ok: true,
      candidates,
      supplementalItems,
      sourceContent: bounded.map((item) => {
        const value = item.toSnapshot();
        return {
          feedItemId: value.id,
          sourceItemId: value.sourceItemId,
          body: value.bodyPreview,
        };
      }),
      physicalRowsRead,
      exhausted: true,
    };
  }

  async findById(query: {
    tenantId: string;
    workspaceId: string;
    feedItemId: string;
    observedBefore?: Date;
    observedAtOrBefore?: Date;
  }): Promise<FeedItem | null> {
    const item = this.itemsById.get(
      [query.tenantId, query.workspaceId, query.feedItemId].join(":"),
    );

    if (item === undefined) {
      return null;
    }
    const snapshot = item.toSnapshot();
    if (query.observedAtOrBefore !== undefined &&
        snapshot.observedAt.getTime() > query.observedAtOrBefore.getTime()) {
      return null;
    }
    return query.observedBefore !== undefined &&
      snapshot.observedAt.getTime() >= query.observedBefore.getTime()
      ? null
      : item;
  }

  async readSourceContent(query: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly feedItemIds: readonly string[];
    readonly observedBefore?: Date;
    readonly observedAtOrBefore?: Date;
  }) {
    const requestedIds = new Set(query.feedItemIds);

    return [...this.itemsById.values()].flatMap((item) => {
      const snapshot = item.toSnapshot();
      return snapshot.tenantId === query.tenantId &&
        snapshot.workspaceId === query.workspaceId &&
        requestedIds.has(snapshot.id) &&
        (query.observedAtOrBefore === undefined ||
          snapshot.observedAt.getTime() <= query.observedAtOrBefore.getTime()) &&
        (query.observedBefore === undefined ||
          snapshot.observedAt.getTime() < query.observedBefore.getTime())
        ? [
            {
              feedItemId: snapshot.id,
              sourceItemId: snapshot.sourceItemId,
              body: snapshot.bodyPreview,
            },
          ]
        : [];
    });
  }

  async listSamples(query: ListFeedSignalBaselineSamplesQuery) {
    return [...this.itemsById.values()]
      .flatMap((item) => {
        const snapshot = item.toSnapshot();
        const inScope =
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.interestId === undefined || snapshot.interestId === query.interestId) &&
          snapshot.observedAt.getTime() > query.observedAfter.getTime();

        if (!inScope) {
          return [];
        }

        const sample = feedSignalBaselineSampleFromItem(item);

        return sample === undefined ? [] : [sample];
      })
      .filter((sample) =>
        matchesBaselineCohortFilters(sample, query.cohortFilters ?? []),
      )
      .sort(compareFeedSignalBaselineSamples)
      .slice(0, query.limit);
  }

  async listCohortSamples(
    query: ListFeedSignalBaselineSamplesQuery & {
      readonly cohortFilters: readonly FeedSignalBaselineCohortFilter[];
    },
  ) {
    const matching = await this.listSamples({ ...query, limit: Number.MAX_SAFE_INTEGER });
    const byCohort = new Map<string, FeedSignalBaselineSample[]>();
    for (const sample of matching) {
      const key = baselineCohortKey(sample);
      const values = byCohort.get(key) ?? [];
      values.push(sample);
      byCohort.set(key, values);
    }
    return roundRobinSamples(
      query.cohortFilters.map((filter) => byCohort.get(baselineCohortKey(filter)) ?? []),
      query.limit,
    );
  }

  all(): readonly FeedItem[] {
    return [...this.itemsById.values()];
  }
}

const exactTimestamp = (value: Date): string =>
  value.toISOString().replace(/\.(\d{3})Z$/u, ".$1" + "000Z");

const compareFeedItemsByPublishedAt = (
  left: FeedItem,
  right: FeedItem,
): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const publishedDiff =
    rightSnapshot.publishedAt.getTime() - leftSnapshot.publishedAt.getTime();

  if (publishedDiff !== 0) {
    return publishedDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};

const compareFeedItemsByProviderSignal = (
  left: FeedItem,
  right: FeedItem,
): number => {
  const leftSignal = feedSignalBaselineSampleFromItem(left)?.strength ?? 0;
  const rightSignal = feedSignalBaselineSampleFromItem(right)?.strength ?? 0;
  return rightSignal - leftSignal || compareFeedItemsByPublishedAt(left, right);
};

const compareFeedSignalBaselineSamples = (
  left: FeedSignalBaselineSample,
  right: FeedSignalBaselineSample,
): number => {
  const observedDiff = right.observedAt.getTime() - left.observedAt.getTime();

  if (observedDiff !== 0) {
    return observedDiff;
  }

  return right.feedItemId.localeCompare(left.feedItemId);
};

const matchesBaselineCohortFilters = (
  sample: FeedSignalBaselineSample,
  filters: readonly FeedSignalBaselineCohortFilter[],
): boolean =>
  filters.length === 0 ||
  filters.some(
    (filter) =>
      sample.providerKey === filter.providerKey &&
      sample.sourceKey === filter.sourceKey &&
      sample.contentType === filter.contentType,
  );

const baselineCohortKey = (value: FeedSignalBaselineCohortFilter): string =>
  JSON.stringify([value.providerKey, value.sourceKey, value.contentType]);

const roundRobinSamples = (
  cohorts: readonly (readonly FeedSignalBaselineSample[])[],
  limit: number,
): readonly FeedSignalBaselineSample[] => {
  const result: FeedSignalBaselineSample[] = [];
  for (let position = 0; result.length < limit; position += 1) {
    let added = false;
    for (const cohort of cohorts) {
      const sample = cohort[position];
      if (sample !== undefined) {
        result.push(sample);
        added = true;
        if (result.length === limit) break;
      }
    }
    if (!added) break;
  }
  return result;
};

const encodeOffsetCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset })).toString("base64url");

const parseOffsetCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { offset?: unknown };

    if (
      typeof parsed.offset === "number" &&
      Number.isInteger(parsed.offset) &&
      parsed.offset >= 0
    ) {
      return parsed.offset;
    }
  } catch {
    throw new Error("Invalid feed item cursor");
  }

  throw new Error("Invalid feed item cursor");
};

const copyFeedItem = (item: FeedItem): FeedItem => {
  const snapshot = item.toSnapshot();
  return FeedItem.rehydrate({
    ...snapshot,
    publishedAt: new Date(snapshot.publishedAt),
    observedAt: new Date(snapshot.observedAt),
    providerMetadata: snapshot.providerMetadata === undefined
      ? undefined
      : structuredClone(snapshot.providerMetadata),
  });
};

const promotionItemInScope = (
  item: FeedItem,
  query: ReadPromotionFeedItemSnapshotQuery,
): boolean => {
  const snapshot = item.toSnapshot();
  const activeTimestamp = query.timestampPolicy === "published_at"
    ? snapshot.publishedAt
    : snapshot.observedAt;
  return snapshot.tenantId === query.tenantId &&
    snapshot.workspaceId === query.workspaceId &&
    (query.interestId === undefined || snapshot.interestId === query.interestId) &&
    activeTimestamp.getTime() >= query.windowStartedAt.getTime() &&
    activeTimestamp.getTime() < query.windowEndedAt.getTime() &&
    (query.timestampPolicy === "published_at" ||
      snapshot.observedAt.getTime() <= query.observedThrough.getTime());
};

const comparePromotionScanOrder = (
  left: FeedItem,
  right: FeedItem,
  query: ReadPromotionFeedItemSnapshotQuery,
): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const leftTimestamp = query.timestampPolicy === "published_at"
    ? leftSnapshot.publishedAt
    : leftSnapshot.observedAt;
  const rightTimestamp = query.timestampPolicy === "published_at"
    ? rightSnapshot.publishedAt
    : rightSnapshot.observedAt;
  return rightTimestamp.getTime() - leftTimestamp.getTime() ||
    rightSnapshot.id.localeCompare(leftSnapshot.id);
};

const countEligible = (
  items: readonly FeedItem[],
  query: ReadPromotionFeedItemSnapshotQuery,
): number => items.reduce(
  (count, item) => {
    const snapshot = item.toSnapshot();
    if (snapshot.observedAt.getTime() > query.observedThrough.getTime()) {
      return count;
    }
    return count + Number(classifyFeedPromotionEligibility({
      providerKey: snapshot.providerKey,
      providerMetadata: snapshot.providerMetadata,
    }).eligible);
  },
  0,
);

const assertPromotionWindow = (query: ReadPromotionFeedItemSnapshotQuery): void => {
  if (query.windowStartedAt.getTime() >= query.windowEndedAt.getTime()) {
    throw new Error("Promotion snapshot window is invalid");
  }
};
