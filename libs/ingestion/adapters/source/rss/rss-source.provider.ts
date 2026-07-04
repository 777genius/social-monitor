import { redactSensitiveText } from "@social-monitor/shared-kernel";

import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from "../../../ports";
import { validateFeedUrl } from "./feed-url-policy";
import {
  decodeCursor,
  decodeMultiFeedCursor,
  encodeCursor,
  encodeMultiFeedCursor,
  readFeedUrls,
  readOptionalPositiveInteger,
  readPositiveInteger,
  type RssFeedRead,
} from "./rss-cursor-and-config";
import type {
  RssClientPort,
  RssFeedItem,
  RssReadFeedOptions,
  RssReadFeedResult,
} from "./rss-client.port";


type RssFeedReadResult =
  | {
      readonly ok: true;
      readonly read: RssFeedRead;
    }
  | {
      readonly ok: false;
      readonly feedUrl: string;
      readonly error: unknown;
    };

type SourcedRssFeedItem = {
  readonly feedUrl: string;
  readonly item: RssFeedItem;
  readonly index: number;
};

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: "rss",
  displayName: "RSS/Atom",
  version: 1,
  productionSafe: true,
  supportedContentUnits: ["post", "link"],
  supportedQueryModes: ["url"],
  cursorModel: "etag_last_modified",
  stableIdentity: ["guid", "canonicalUrl", "contentHash"],
  quotaModel: "per_source_binding",
  limitations: [
    "Uses SSRF-checked HTTP feed polling with ETag and Last-Modified cursor metadata. Publisher policy and retry budget still apply.",
  ],
};

export class RssSourceProvider implements SourceProviderPort {
  constructor(private readonly client: RssClientPort) {}

  key(): string {
    return capabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return capabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (!capabilityProfile.supportedQueryModes.includes(query.mode)) {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    const feedUrl = validateFeedUrl(query.query);

    return feedUrl.ok ? { ok: true } : { ok: false, reason: feedUrl.reason };
  }

  planScan(
    query: SourceQuery,
    context: SourceProviderScanContext,
  ): SourceProviderScanPlan {
    return {
      query,
      maxItems: readPositiveInteger(context.config?.maxItems, 30, 1, 100),
    };
  }

  async scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult> {
    const validation = this.validateBinding(plan.query);

    if (!validation.ok) {
      throw new Error(validation.reason);
    }

    const maxItemAgeHours = readOptionalPositiveInteger(
      context.config?.maxItemAgeHours,
      24 * 31,
    );
    const feedUrls = readFeedUrls(plan.query.query, context.config);

    if (feedUrls.length === 1) {
      const feed = await this.client.readFeed(
        plan.query.query,
        plan.maxItems,
        decodeCursor(plan.cursor),
      );
      const filteredItems = filterItemsByRelativeAge(
        feed.items,
        maxItemAgeHours,
      );

      return {
        items: filteredItems.flatMap((item, index) =>
          normalizeItem(item, index, plan.query.query),
        ),
        nextCursor: encodeCursor(feed, plan.cursor),
        warnings: [
          ...rssWarnings(feed.items),
          ...rssRecencyWarnings(feed.items, filteredItems, maxItemAgeHours),
        ],
      };
    }

    const feedCursor = decodeMultiFeedCursor(plan.cursor);
    const perFeedLimit = Math.max(
      1,
      Math.ceil(plan.maxItems / feedUrls.length),
    );
    const feedResults = await Promise.all(
      feedUrls.map((feedUrl) =>
        readFeedSafely(
          this.client,
          feedUrl,
          perFeedLimit,
          feedCursor.get(feedUrl),
        ),
      ),
    );
    const feeds = feedResults.flatMap((result) =>
      result.ok ? [result.read] : [],
    );
    const feedReadWarnings = feedResults.flatMap((result) =>
      result.ok ? [] : [formatFeedReadWarning(result.feedUrl, result.error)],
    );

    if (feeds.length === 0) {
      throw new Error(feedReadWarnings.join("; "));
    }

    const sourcedItems = feeds.flatMap(({ feedUrl, feed }) =>
      feed.items.map((item, index): SourcedRssFeedItem => ({
        feedUrl,
        item,
        index,
      })),
    );
    const filteredSourcedItems = filterSourcedItemsByRelativeAge(
      sourcedItems,
      maxItemAgeHours,
    );
    const allItems = sourcedItems.map(({ item }) => item);
    const filteredItems = filteredSourcedItems.map(({ item }) => item);

    return {
      items: filteredSourcedItems
        .flatMap(({ item, index, feedUrl }) =>
          normalizeItem(item, index, feedUrl),
        )
        .sort(
          (left, right) =>
            right.publishedAt.getTime() - left.publishedAt.getTime(),
        )
        .slice(0, plan.maxItems),
      nextCursor: encodeMultiFeedCursor(feeds, plan.cursor),
      warnings: [
        ...feedReadWarnings,
        ...rssWarnings(allItems),
        ...rssRecencyWarnings(allItems, filteredItems, maxItemAgeHours),
      ],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage =
      error instanceof Error ? error.message : "Unknown RSS provider error";
    const lowerMessage = rawMessage.toLowerCase();
    const message = redactSensitiveText(rawMessage);

    if (rawMessage.includes("429") || lowerMessage.includes("rate limit")) {
      return {
        kind: "rate_limited",
        retryable: true,
        message,
      };
    }

    return {
      kind: rawMessage.includes("Feed URL") ? "invalid_query" : "unavailable",
      retryable: !rawMessage.includes("Feed URL"),
      message,
    };
  }
}

const normalizeItem = (item: RssFeedItem, index: number, feedUrl: string) => {
  const title = item.title ?? "";
  const body = item.content ?? "";

  if (!hasReadableContent(item)) {
    return [];
  }

  if (item.publishedAt === undefined) {
    return [];
  }

  const canonicalUrl = canonicalLinkForItem(item);

  if (canonicalUrl === undefined) {
    return [];
  }

  return [
    {
      externalId: item.guid ?? `${canonicalUrl}#${index}`,
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

const readFeedSafely = async (
  client: RssClientPort,
  feedUrl: string,
  limit: number,
  options: RssReadFeedOptions | undefined,
): Promise<RssFeedReadResult> => {
  try {
    return {
      ok: true,
      read: {
        feedUrl,
        feed: await client.readFeed(feedUrl, limit, options),
      },
    };
  } catch (error) {
    return {
      ok: false,
      feedUrl,
      error,
    };
  }
};

const formatFeedReadWarning = (feedUrl: string, error: unknown): string => {
  const message =
    error instanceof Error ? error.message : "Unknown RSS feed read failure";

  return `RSS feed ${redactSensitiveText(feedUrl)} could not be read: ${redactSensitiveText(message)}`;
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

const rssWarnings = (items: readonly RssFeedItem[]): readonly string[] => [
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
      canonicalLinkForItem(item) === undefined,
  )
    ? ["Some RSS items had no canonical link; they were skipped."]
    : []),
];

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

const rssRecencyWarnings = (
  originalItems: readonly RssFeedItem[],
  filteredItems: readonly RssFeedItem[],
  maxItemAgeHours: number | undefined,
): readonly string[] =>
  maxItemAgeHours !== undefined && filteredItems.length < originalItems.length
    ? [
        `Some RSS items were older than maxItemAgeHours=${maxItemAgeHours}; they were skipped.`,
      ]
    : [];

const filterSourcedItemsByRelativeAge = (
  entries: readonly SourcedRssFeedItem[],
  maxItemAgeHours: number | undefined,
): readonly SourcedRssFeedItem[] => {
  const filteredItems = filterItemsByRelativeAge(
    entries.map(({ item }) => item),
    maxItemAgeHours,
  );
  const filteredSet = new Set(filteredItems);

  return entries.filter(({ item }) => filteredSet.has(item));
};

const hasReadableContent = (item: RssFeedItem): boolean =>
  (item.title ?? "").trim().length + (item.content ?? "").trim().length > 0;

const canonicalLinkForItem = (item: RssFeedItem): string | undefined => {
  const link = item.link?.trim();

  return link === undefined || link.length === 0 ? undefined : link;
};
