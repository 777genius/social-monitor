import type {
  SourceProviderScanContext,
  SourceRuntimeConfig,
} from "../../../ports";
import { validateFeedUrl } from "./feed-url-policy";
import type {
  RssReadFeedOptions,
  RssReadFeedResult,
} from "./rss-client.port";

export type RssFeedRead = {
  readonly feedUrl: string;
  readonly feed: RssReadFeedResult;
};

// Cursor codecs and runtime-config readers for the RSS source provider.
export const decodeCursor = (cursor: string | undefined) => {
  if (cursor === undefined) {
    return {};
  }

  try {
    const parsed = JSON.parse(cursor) as Readonly<Record<string, unknown>>;

    return {
      etag: typeof parsed.etag === "string" ? parsed.etag : undefined,
      lastModified:
        typeof parsed.lastModified === "string"
          ? parsed.lastModified
          : undefined,
    };
  } catch {
    return {};
  }
};

export const encodeCursor = (
  feed: { readonly etag?: string; readonly lastModified?: string },
  previousCursor: string | undefined,
): string | undefined => {
  if (feed.etag === undefined && feed.lastModified === undefined) {
    return previousCursor;
  }

  return JSON.stringify({
    etag: feed.etag,
    lastModified: feed.lastModified,
  });
};

export const decodeMultiFeedCursor = (
  cursor: string | undefined,
): ReadonlyMap<string, RssReadFeedOptions> => {
  if (cursor === undefined) {
    return new Map();
  }

  try {
    const parsed = JSON.parse(cursor) as Readonly<Record<string, unknown>>;
    const feeds = parsed.feeds;

    if (feeds === null || typeof feeds !== "object" || Array.isArray(feeds)) {
      return new Map();
    }

    return new Map(
      Object.entries(feeds).map(([feedUrl, value]) => [
        feedUrl,
        cursorOptionsFromRecord(value),
      ]),
    );
  } catch {
    return new Map();
  }
};

export const encodeMultiFeedCursor = (
  feeds: readonly RssFeedRead[],
  previousCursor: string | undefined,
): string | undefined => {
  const previousFeeds = decodeMultiFeedCursor(previousCursor);
  const nextFeeds: Record<string, RssReadFeedOptions> = {};

  for (const [feedUrl, cursor] of previousFeeds.entries()) {
    if (cursor.etag !== undefined || cursor.lastModified !== undefined) {
      nextFeeds[feedUrl] = cursor;
    }
  }

  for (const { feedUrl, feed } of feeds) {
    const nextCursor = {
      etag: feed.etag,
      lastModified: feed.lastModified,
    };

    if (
      nextCursor.etag !== undefined ||
      nextCursor.lastModified !== undefined
    ) {
      nextFeeds[feedUrl] = nextCursor;
    }
  }

  return Object.keys(nextFeeds).length === 0
    ? previousCursor
    : JSON.stringify({ feeds: nextFeeds });
};

const cursorOptionsFromRecord = (value: unknown): RssReadFeedOptions => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const record = value as Readonly<Record<string, unknown>>;

  return {
    etag: typeof record.etag === "string" ? record.etag : undefined,
    lastModified:
      typeof record.lastModified === "string" ? record.lastModified : undefined,
  };
};

export const readFeedUrls = (
  primaryFeedUrl: string,
  config: SourceProviderScanContext["config"] | undefined,
): readonly string[] => {
  const feedUrls = compactUnique([
    primaryFeedUrl,
    ...readStringArray(config?.feedUrls),
    ...readStringArray(config?.extraFeedUrls),
  ]);

  for (const feedUrl of feedUrls) {
    const validation = validateFeedUrl(feedUrl);

    if (!validation.ok) {
      throw new Error(validation.reason);
    }
  }

  return feedUrls;
};

const readStringArray = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === "string" && item.trim().length > 0 ? [item.trim()] : [],
      )
    : [];

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values),
];

export const readPositiveInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `RSS source config integer must be between ${min} and ${max}`,
    );
  }

  return value;
};

export const readOptionalPositiveInteger = (
  value: unknown,
  max: number,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  ) {
    throw new Error(`RSS source config integer must be between 1 and ${max}`);
  }

  return value;
};
