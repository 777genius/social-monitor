import {
  feedSignalBaselineSampleFromItem,
  type FeedItem,
  type FeedSignalBaselineSample,
} from "../../domain";
import type {
  FeedItemReadRepositoryPort,
  ListFeedItemsQuery,
  ListFeedItemsResult,
} from "../../ports";
import type {
  FeedSignalBaselineCohortFilter,
  FeedSignalBaselineRepositoryPort,
  ListFeedSignalBaselineSamplesQuery,
} from "../../ports/feed-signal-baseline-repository.port";
import { feedDedupeKeyForItem } from "./feed-dedupe-key";
import { matchesFeedItemReadFilters } from "./feed-item-query-filter";

export class InMemoryFeedItemReadRepository
  implements FeedItemReadRepositoryPort, FeedSignalBaselineRepositoryPort
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
    const offset = parseCursor(query.cursor);
    const allItems = [...this.itemsById.values()]
      .filter((item) => {
        const snapshot = item.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.interestId === undefined || snapshot.interestId === query.interestId) &&
          (query.observedAfter === undefined ||
            snapshot.observedAt.getTime() > query.observedAfter.getTime()) &&
          (query.observedBefore === undefined ||
            snapshot.observedAt.getTime() < query.observedBefore.getTime()) &&
          matchesFeedItemReadFilters(item, query)
        );
      })
      .sort(compareFeedItems);
    const items = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor:
        nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  async findById(query: {
    tenantId: string;
    workspaceId: string;
    feedItemId: string;
  }): Promise<FeedItem | null> {
    const item = this.itemsById.get(
      [query.tenantId, query.workspaceId, query.feedItemId].join(":"),
    );

    return item ?? null;
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

  all(): readonly FeedItem[] {
    return [...this.itemsById.values()];
  }
}

const compareFeedItems = (left: FeedItem, right: FeedItem): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const publishedDiff =
    rightSnapshot.publishedAt.getTime() - leftSnapshot.publishedAt.getTime();

  if (publishedDiff !== 0) {
    return publishedDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
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

const encodeCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset })).toString("base64url");

const parseCursor = (cursor: string | undefined): number => {
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
    return 0;
  }

  return 0;
};
