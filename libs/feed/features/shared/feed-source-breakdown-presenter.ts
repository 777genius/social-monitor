import type {
  FeedItemListEntry,
  FeedSourceBreakdown,
  FeedSourceBreakdownEntry,
} from '../list-feed-items/list-feed-items.result';

const SAMPLE_ITEM_LIMIT = 3;

export const buildFeedSourceBreakdown = (
  items: readonly FeedItemListEntry[],
): FeedSourceBreakdown => {
  const providers = new Set<string>();
  const bySource = new Map<string, FeedSourceBreakdownAccumulator>();

  for (const item of items) {
    providers.add(item.providerKey);

    const providerMetrics = item.providerMetrics;
    const providerKey = providerMetrics?.providerKey ?? item.providerKey;
    const sourceKey = providerMetrics?.sourceKey ?? `binding:${item.sourceBindingId}`;
    const contentType = providerMetrics?.contentType ?? 'item';
    const key = `${providerKey}\u0000${sourceKey}\u0000${contentType}`;
    const existing = bySource.get(key);
    const accumulator = existing ?? {
      providerKey,
      sourceKey,
      contentType,
      sourceBindingIds: new Set<string>(),
      itemCount: 0,
      sampleItems: [],
    };

    accumulator.sourceBindingIds.add(item.sourceBindingId);
    accumulator.itemCount += 1;
    accumulator.latestObservedAt = latestIso(accumulator.latestObservedAt, item.observedAt);
    accumulator.latestPublishedAt = latestIso(accumulator.latestPublishedAt, item.publishedAt);

    if (item.normalizedSignal !== undefined) {
      const currentMax = accumulator.maxSignalScore ?? Number.NEGATIVE_INFINITY;

      if (item.normalizedSignal.score > currentMax) {
        accumulator.maxSignalScore = item.normalizedSignal.score;
        accumulator.maxSignalBand = item.normalizedSignal.band;
      }
    }

    accumulator.sampleItems.push(item);

    bySource.set(key, accumulator);
  }

  const sources = [...bySource.values()]
    .map(toSourceBreakdownEntry)
    .sort(compareSourceBreakdownEntries);

  return {
    totalItems: items.length,
    providerCount: providers.size,
    sourceCount: sources.length,
    sources,
  };
};

type FeedSourceBreakdownAccumulator = {
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
  readonly sourceBindingIds: Set<string>;
  itemCount: number;
  latestObservedAt?: string;
  latestPublishedAt?: string;
  maxSignalScore?: number;
  maxSignalBand?: FeedSourceBreakdownEntry['maxSignalBand'];
  readonly sampleItems: FeedItemListEntry[];
};

const toSourceBreakdownEntry = (
  accumulator: FeedSourceBreakdownAccumulator,
): FeedSourceBreakdownEntry => ({
  providerKey: accumulator.providerKey,
  sourceKey: accumulator.sourceKey,
  contentType: accumulator.contentType,
  sourceBindingIds: [...accumulator.sourceBindingIds].sort((left, right) =>
    left.localeCompare(right, 'en-US'),
  ),
  itemCount: accumulator.itemCount,
  latestObservedAt: accumulator.latestObservedAt,
  latestPublishedAt: accumulator.latestPublishedAt,
  maxSignalScore: accumulator.maxSignalScore,
  maxSignalBand: accumulator.maxSignalBand,
  sampleItemIds: [...accumulator.sampleItems]
    .sort(compareSampleItems)
    .slice(0, SAMPLE_ITEM_LIMIT)
    .map((item) => item.id),
});

const compareSampleItems = (
  left: FeedItemListEntry,
  right: FeedItemListEntry,
): number =>
  right.observedAt.localeCompare(left.observedAt, 'en-US') ||
  right.publishedAt.localeCompare(left.publishedAt, 'en-US');

const compareSourceBreakdownEntries = (
  left: FeedSourceBreakdownEntry,
  right: FeedSourceBreakdownEntry,
): number =>
  right.itemCount - left.itemCount ||
  (right.maxSignalScore ?? -1) - (left.maxSignalScore ?? -1) ||
  compareIsoDesc(left.latestObservedAt, right.latestObservedAt) ||
  left.providerKey.localeCompare(right.providerKey, 'en-US') ||
  left.sourceKey.localeCompare(right.sourceKey, 'en-US') ||
  left.contentType.localeCompare(right.contentType, 'en-US');

const latestIso = (left: string | undefined, right: string): string =>
  left === undefined || right > left ? right : left;

const compareIsoDesc = (
  left: string | undefined,
  right: string | undefined,
): number => {
  if (left === right) {
    return 0;
  }

  if (left === undefined) {
    return 1;
  }

  if (right === undefined) {
    return -1;
  }

  return right.localeCompare(left, 'en-US');
};
