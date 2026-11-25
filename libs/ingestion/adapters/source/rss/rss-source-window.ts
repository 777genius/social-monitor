import type { SourceProviderScanContext } from "../../../ports";
import type { RssFeedItem } from "./rss-client.port";

export type SourcedRssFeedItem = {
  readonly feedUrl: string;
  readonly item: RssFeedItem;
  readonly index: number;
};

export type TargetPublishedWindow = {
  readonly startInclusive: Date;
  readonly endExclusive: Date;
};

export const readTargetPublishedWindow = (
  config: SourceProviderScanContext["config"],
): TargetPublishedWindow | undefined => {
  const raw = config?.targetPublishedWindow;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }

  const record = raw as Record<string, unknown>;
  const start = readDate(record.startInclusive);
  const end = readDate(record.endExclusive);

  return start === undefined ||
    end === undefined ||
    start.getTime() >= end.getTime()
    ? undefined
    : { startInclusive: start, endExclusive: end };
};

const readDate = (value: unknown): Date | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
};

export const feedUrlsForTargetWindow = (
  feedUrls: readonly string[],
  targetWindow: TargetPublishedWindow | undefined,
): readonly string[] =>
  targetWindow === undefined
    ? feedUrls
    : feedUrls.flatMap((feedUrl) =>
        googleNewsHistoricalFeedUrls(feedUrl, targetWindow) ?? [feedUrl],
      );

const googleNewsHistoricalFeedUrls = (
  feedUrl: string,
  targetWindow: TargetPublishedWindow,
): readonly string[] | undefined => {
  try {
    const parsed = new URL(feedUrl);
    if (
      parsed.hostname !== "news.google.com" ||
      parsed.pathname !== "/rss/search"
    ) {
      return undefined;
    }
    const query = parsed.searchParams.get("q")?.trim();
    if (query === undefined || query.length === 0) {
      return undefined;
    }
    const queryTerms = historicalGoogleNewsQueryTerms(query);

    return queryTerms.map((term) => {
      const historicalUrl = new URL(parsed.toString());
      historicalUrl.searchParams.set(
        "q",
        `${term} after:${dateToken(targetWindow.startInclusive)} before:${dateToken(
          targetWindow.endExclusive,
        )}`,
      );

      return historicalUrl.toString();
    });
  } catch {
    return undefined;
  }
};

const maxHistoricalGoogleNewsFeeds = 12;

const historicalGoogleNewsQueryTerms = (query: string): readonly string[] => {
  const normalized = queryWithoutRelativeWindow(query);
  const terms = normalized
    .split(/\s+OR\s+/iu)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);

  return (terms.length === 0 ? [normalized] : terms).slice(
    0,
    maxHistoricalGoogleNewsFeeds,
  );
};

const queryWithoutRelativeWindow = (query: string): string =>
  query.replace(/\bwhen:\d+[dhm]\b/giu, "").replace(/\s+/gu, " ").trim();

const dateToken = (date: Date): string => date.toISOString().slice(0, 10);

const filterItemsByRelativeAge = (
  items: readonly RssFeedItem[],
  maxItemAgeHours: number | undefined,
): readonly RssFeedItem[] => {
  if (maxItemAgeHours === undefined) {
    return items;
  }

  const newestPublishedAt = items.reduce<number | undefined>((newest, item) => {
    const publishedTime = item.publishedAt?.getTime();

    if (publishedTime === undefined) {
      return newest;
    }

    return newest === undefined
      ? publishedTime
      : Math.max(newest, publishedTime);
  }, undefined);

  if (newestPublishedAt === undefined) {
    return items;
  }

  const minimumPublishedAt =
    newestPublishedAt - maxItemAgeHours * 60 * 60 * 1000;

  return items.filter(
    (item) =>
      item.publishedAt === undefined ||
      item.publishedAt.getTime() >= minimumPublishedAt,
  );
};

export const filterItemsForWindow = (
  items: readonly RssFeedItem[],
  maxItemAgeHours: number | undefined,
  targetWindow: TargetPublishedWindow | undefined,
): readonly RssFeedItem[] =>
  targetWindow === undefined
    ? filterItemsByRelativeAge(items, maxItemAgeHours)
    : items.filter((item) => isInsideTargetWindow(item, targetWindow));

const isInsideTargetWindow = (
  item: RssFeedItem,
  targetWindow: TargetPublishedWindow,
): boolean =>
  item.publishedAt === undefined ||
  (item.publishedAt >= targetWindow.startInclusive &&
    item.publishedAt < targetWindow.endExclusive);

export const filterSourcedItemsByRelativeAge = (
  entries: readonly SourcedRssFeedItem[],
  maxItemAgeHours: number | undefined,
  targetWindow: TargetPublishedWindow | undefined,
): readonly SourcedRssFeedItem[] => {
  const filteredItems = filterItemsForWindow(
    entries.map(({ item }) => item),
    maxItemAgeHours,
    targetWindow,
  );
  const filteredSet = new Set(filteredItems);

  return entries.filter(({ item }) => filteredSet.has(item));
};
