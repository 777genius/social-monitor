import type { SourceProviderScanContext } from "../../../ports";
import type {
  HackerNewsSearchOptions,
  HackerNewsStory,
} from "./hacker-news-client.port";
import type { HackerNewsScanPass } from "./hacker-news-scan-pass-support";

export const isTargetPublishedSearchOptions = (
  options: HackerNewsSearchOptions | undefined,
): boolean => options?.from !== undefined && options.to !== undefined;

export const historicalListingSearchQuery = (
  pass: HackerNewsScanPass,
  fallbackQuery: string,
): string =>
  pass.mode === "listing" && pass.requiredKeywords !== undefined
    ? pass.requiredKeywords.join(" ")
    : fallbackQuery;

export const decodeTimeCursor = (
  cursor: string | undefined,
): number | undefined => {
  if (cursor === undefined) {
    return undefined;
  }

  const parsed = Date.parse(cursor);

  return Number.isNaN(parsed) ? undefined : parsed;
};

export const filterStoriesByRequiredKeywords = (
  stories: readonly HackerNewsStory[],
  requiredKeywords: readonly string[] | undefined,
): readonly HackerNewsStory[] => {
  if (requiredKeywords === undefined || requiredKeywords.length === 0) {
    return stories;
  }

  const normalizedKeywords = requiredKeywords.map((keyword) =>
    keyword.toLocaleLowerCase("en-US"),
  );

  return stories.filter((story) => {
    const haystack = [story.title, story.storyTitle, story.text, story.url]
      .flatMap((value) => (value === undefined ? [] : [value]))
      .join(" ")
      .toLocaleLowerCase("en-US");

    return normalizedKeywords.some((keyword) => haystack.includes(keyword));
  });
};

export const filterStoriesByRequiredStoryKeywords = (
  stories: readonly HackerNewsStory[],
  requiredStoryKeywords: readonly string[] | undefined,
): readonly HackerNewsStory[] => {
  if (
    requiredStoryKeywords === undefined ||
    requiredStoryKeywords.length === 0
  ) {
    return stories;
  }

  const normalizedKeywords = requiredStoryKeywords.map((keyword) =>
    keyword.toLocaleLowerCase("en-US"),
  );

  return stories.filter((story) => {
    const haystack = [story.title, story.storyTitle, story.url]
      .flatMap((value) => (value === undefined ? [] : [value]))
      .join(" ")
      .toLocaleLowerCase("en-US");

    return normalizedKeywords.some((keyword) => haystack.includes(keyword));
  });
};

export const encodeTimeCursor = (
  items: readonly { readonly publishedAt: Date }[],
  previousCursor: string | undefined,
): string | undefined => {
  const previousTime = decodeTimeCursor(previousCursor);
  const maxPublishedAt = items.reduce(
    (max, item) => Math.max(max, item.publishedAt.getTime()),
    previousTime ?? Number.NEGATIVE_INFINITY,
  );

  if (
    maxPublishedAt === Number.NEGATIVE_INFINITY ||
    maxPublishedAt === previousTime
  ) {
    return previousCursor;
  }

  return new Date(maxPublishedAt).toISOString();
};

export const filterItemsByMaxAge = <
  TItem extends { readonly publishedAt: Date },
>(
  items: readonly TItem[],
  maxItemAgeHours: number | undefined,
  now: Date,
): readonly TItem[] => {
  if (maxItemAgeHours === undefined) {
    return items;
  }

  const cutoff = now.getTime() - maxItemAgeHours * 60 * 60 * 1000;

  return items.filter((item) => item.publishedAt.getTime() >= cutoff);
};

export const searchOptionsForMaxItemAge = (
  maxItemAgeHours: number | undefined,
  now: Date,
): HackerNewsSearchOptions | undefined =>
  maxItemAgeHours === undefined
    ? undefined
    : {
        from: new Date(now.getTime() - maxItemAgeHours * 60 * 60 * 1000),
        to: now,
      };

export const searchOptionsForTargetWindow = (
  window: TargetPublishedWindow | undefined,
): HackerNewsSearchOptions | undefined =>
  window === undefined
    ? undefined
    : {
        from: window.startInclusive,
        to: window.endExclusive,
      };

type TargetPublishedWindow = {
  readonly startInclusive: Date;
  readonly endExclusive: Date;
};

export const readTargetPublishedWindow = (
  config: SourceProviderScanContext["config"] | undefined,
): TargetPublishedWindow | undefined => {
  const raw = readRecord(config?.targetPublishedWindow);
  const startInclusive = readDate(raw?.startInclusive);
  const endExclusive = readDate(raw?.endExclusive);

  return startInclusive !== undefined &&
    endExclusive !== undefined &&
    startInclusive < endExclusive
    ? { startInclusive, endExclusive }
    : undefined;
};

const readRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const readDate = (value: unknown): Date | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? undefined : date;
};

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
      `Hacker News source config integer must be between ${min} and ${max}`,
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
    throw new Error(
      `Hacker News source config integer must be between 1 and ${max}`,
    );
  }

  return value;
};
