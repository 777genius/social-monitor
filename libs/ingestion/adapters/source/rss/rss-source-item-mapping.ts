import type { RssFeedItem } from './rss-client.port';
import { hasReadableFeedText } from './rss-readable-content';

/** RSS normalization and evidence warnings share the same readability policy. */
export const normalizeItem = (item: RssFeedItem, _index: number, feedUrl: string) => {
  const title = item.title ?? "";
  const body = item.content ?? "";

  if (!hasReadableContent(item)) {
    return [];
  }

  if (item.publishedAt === undefined) {
    return [];
  }

  const canonicalUrl = canonicalLinkForItem(item, feedUrl);

  if (canonicalUrl === undefined) {
    return [];
  }

  return [
    {
      externalId: item.guid ?? canonicalUrl,
      canonicalUrl,
      title,
      body,
      authorHandle: item.author,
      publishedAt: item.publishedAt,
      metadata: rssItemMetadata(item, feedUrl),
    },
  ];
};

const rssItemMetadata = (item: RssFeedItem, feedUrl: string) => {
  const searchQuery = searchQueryFromFeedUrl(feedUrl);

  return {
    kind: "rss_item",
    ...(item.contentComplete === true ? { nativeContentComplete: true } : {}),
    feedUrl,
    ...(searchQuery === undefined ? {} : { searchQuery }),
    ...(item.mediaThumbnailUrl === undefined
      ? {}
      : { mediaThumbnailUrl: item.mediaThumbnailUrl }),
    ...(item.mediaContentUrl === undefined
      ? {}
      : { mediaContentUrl: item.mediaContentUrl }),
    ...(item.mediaContentType === undefined
      ? {}
      : { mediaContentType: item.mediaContentType }),
    ...(item.enclosureUrl === undefined
      ? {}
      : { enclosureUrl: item.enclosureUrl }),
    ...(item.enclosureType === undefined
      ? {}
      : { enclosureType: item.enclosureType }),
  };
};

const searchQueryFromFeedUrl = (feedUrl: string): string | undefined => {
  try {
    const parsed = new URL(feedUrl);
    const query = parsed.searchParams.get("q")?.trim();

    return query === undefined || query.length === 0 ? undefined : query;
  } catch {
    return undefined;
  }
};

export const rssWarnings = (items: readonly RssFeedItem[]): readonly string[] => [
  ...(items.some(
    (item) =>
      hasReadableContent(item) &&
      item.publishedAt !== undefined &&
      item.guid === undefined,
  )
    ? ["Some RSS items had no GUID; canonical URL fallback was used."]
    : []),
  ...(items.some(
    (item) => hasReadableContent(item) && item.publishedAt === undefined,
  )
    ? ["Some RSS items had no published timestamp; they were skipped."]
    : []),
  ...(items.some(
    (item) =>
      hasReadableContent(item) &&
      item.publishedAt !== undefined &&
      (item.link?.trim().length ?? 0) === 0,
  )
    ? ["Some RSS items had no canonical link; they were skipped."]
    : []),
];

export const rssHistoricalRejectionWarnings = (
  rejectedEntries: number | undefined,
  items: readonly RssFeedItem[],
  historical: boolean,
): readonly string[] => historical ? [
  ...((rejectedEntries ?? 0) > 0
    ? ["Some RSS entries could not be parsed; historical acquisition is incomplete."] : []),
  ...(items.some((item) => !hasReadableContent(item))
    ? ["Some RSS entries had no readable title or content; historical acquisition is incomplete."] : []),
] : [];

export const rssRecencyWarnings = (
  originalItems: readonly RssFeedItem[],
  filteredItems: readonly RssFeedItem[],
  maxItemAgeHours: number | undefined,
): readonly string[] =>
  maxItemAgeHours !== undefined && filteredItems.length < originalItems.length
    ? [
        `Some RSS items were older than maxItemAgeHours=${maxItemAgeHours}; they were skipped.`,
      ]
    : [];

const hasReadableContent = (item: RssFeedItem): boolean =>
  (item.titleType === 'xhtml'
    ? item.title !== undefined && item.xhtmlReadability?.title === true
    : hasReadableFeedText(item.title, item.titleType)) ||
  (item.contentType === 'xhtml'
    ? item.content !== undefined && item.xhtmlReadability?.content === true
    : hasReadableFeedText(item.content, item.contentType));

const canonicalLinkForItem = (item: RssFeedItem, feedUrl: string): string | undefined => {
  const rawLink = item.link?.trim();
  if (rawLink === undefined || rawLink.length === 0) return undefined;
  try {
    const url = new URL(rawLink, feedUrl);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};
