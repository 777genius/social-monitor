import type {
  FetchedSourceItem,
  SourceProviderScanContext,
} from "../../../ports";
import { redditListings, redditTopTimes } from "./http-reddit-client";
import type {
  RedditCommentSort,
  RedditPost,
  RedditPostListing,
  RedditSearchSort,
  RedditSearchTime,
  RedditTopTime,
} from "./reddit-client.port";

export type RedditScanPass =
  | {
      readonly mode: "listing";
      readonly subreddit: string;
      readonly listing: RedditPostListing;
      readonly topTime?: RedditTopTime;
      readonly maxItems?: number;
      readonly minScore?: number;
      readonly includeComments?: boolean;
      readonly maxCommentsPerPost?: number;
      readonly commentDepth?: number;
      readonly commentSort?: RedditCommentSort;
    }
  | {
      readonly mode: "search";
      readonly query: string;
      readonly searchSort?: RedditSearchSort;
      readonly searchTime?: RedditSearchTime;
      readonly maxItems?: number;
      readonly minScore?: number;
      readonly allowedSubreddits?: readonly string[];
      readonly includeComments?: boolean;
      readonly maxCommentsPerPost?: number;
      readonly commentDepth?: number;
      readonly commentSort?: RedditCommentSort;
    };

const redditCommentSorts: readonly RedditCommentSort[] = [
  "confidence",
  "top",
  "new",
];
const redditSearchSorts: readonly RedditSearchSort[] = [
  "relevance",
  "hot",
  "top",
  "new",
  "comments",
];

const maxConfiguredRedditScanPasses = 48;

export {
  normalizePost,
  redditWarnings,
  type RedditSourceQueryLaneMetadata,
} from "./reddit-post-normalizer";

export const parseListingQuery = (
  value: string,
): { readonly subreddit: string; readonly listing: RedditPostListing } => {
  const [subreddit, listing] = value.split(":");

  return {
    subreddit: readRequiredString(subreddit, "subreddit"),
    listing: readListing(listing),
  };
};

export const readListing = (value: unknown): RedditPostListing => {
  const listing = readOptionalString(value) ?? "hot";

  if (!redditListings.includes(listing as RedditPostListing)) {
    throw new Error(`Unsupported Reddit listing: ${listing}`);
  }

  return listing as RedditPostListing;
};

export const readTopTime = (value: unknown): RedditTopTime => {
  const topTime = readOptionalString(value) ?? "week";

  if (!redditTopTimes.includes(topTime as RedditTopTime)) {
    throw new Error(`Unsupported Reddit topTime: ${topTime}`);
  }

  return topTime as RedditTopTime;
};

export const readCommentSort = (value: unknown): RedditCommentSort => {
  const sort = readOptionalString(value) ?? "confidence";

  if (!redditCommentSorts.includes(sort as RedditCommentSort)) {
    throw new Error(`Unsupported Reddit commentSort: ${sort}`);
  }

  return sort as RedditCommentSort;
};

export const readSearchSort = (value: unknown): RedditSearchSort => {
  const sort = readOptionalString(value) ?? "new";

  if (!redditSearchSorts.includes(sort as RedditSearchSort)) {
    throw new Error(`Unsupported Reddit searchSort: ${sort}`);
  }

  return sort as RedditSearchSort;
};

export const readOptionalSearchSort = (
  value: unknown,
): RedditSearchSort | undefined =>
  readOptionalString(value) === undefined ? undefined : readSearchSort(value);

export const readOptionalSearchTime = (
  value: unknown,
): RedditSearchTime | undefined =>
  readOptionalString(value) === undefined
    ? undefined
    : (readTopTime(value) as RedditSearchTime);

export const readScanPasses = (
  config: SourceProviderScanContext["config"] | undefined,
): readonly RedditScanPass[] => {
  const rawPasses = readArray(config?.scanPasses ?? config?.passes);

  return rawPasses.map(readScanPass).slice(0, maxConfiguredRedditScanPasses);
};

export const sortRedditItemsByEngagement = (
  items: readonly FetchedSourceItem[],
): readonly FetchedSourceItem[] =>
  [...items].sort((left, right) => {
    const scoreDiff =
      redditEngagementScore(right) - redditEngagementScore(left);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return right.publishedAt.getTime() - left.publishedAt.getTime();
  });

export const filterPostsByAllowedSubreddits = (
  posts: readonly RedditPost[],
  allowedSubreddits: readonly string[] | undefined,
): readonly RedditPost[] => {
  if (allowedSubreddits === undefined || allowedSubreddits.length === 0) {
    return posts;
  }

  const allowed = new Set(
    allowedSubreddits.map((subreddit) => subreddit.toLowerCase()),
  );

  return posts.filter((post) => {
    const subreddit = post.subreddit?.toLowerCase();

    return subreddit !== undefined && allowed.has(subreddit);
  });
};

export const readRequiredString = (
  value: unknown,
  field: string,
  fallback?: string,
): string => {
  const resolved = readOptionalString(value) ?? fallback?.trim();

  if (resolved === undefined || resolved.length === 0) {
    throw new Error(`Reddit source config field is required: ${field}`);
  }

  return resolved;
};

export const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

export const firstNonEmptyString = (
  ...values: readonly unknown[]
): string | undefined =>
  values.map(readOptionalString).find((value) => value !== undefined);

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
      `Reddit source config integer must be between ${min} and ${max}`,
    );
  }

  return value;
};

export const readOptionalNonNegativeInteger = (
  value: unknown,
  max: number,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > max
  ) {
    throw new Error(
      `Reddit source config integer must be between 0 and ${max}`,
    );
  }

  return value;
};

export const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.filter((value) => value.trim().length > 0)),
];

const readScanPass = (value: unknown, index: number): RedditScanPass => {
  const pass = readRecord(value, `scanPasses[${index}]`);
  const mode = readOptionalString(pass.mode) ?? "listing";
  const maxItems = readOptionalPositiveInteger(pass.maxItems, 100);
  const minScore = readOptionalNonNegativeInteger(pass.minScore, 1_000_000);

  if (mode === "listing") {
    return {
      mode,
      subreddit: readRequiredString(
        pass.subreddit ?? pass.query,
        `scanPasses[${index}].subreddit`,
      ),
      listing: readListing(pass.listing),
      topTime:
        readOptionalString(pass.topTime) === undefined
          ? undefined
          : readTopTime(pass.topTime),
      ...(maxItems === undefined ? {} : { maxItems }),
      ...(minScore === undefined ? {} : { minScore }),
      ...readCommentExpansion(pass),
    };
  }

  if (mode === "search") {
    return {
      mode,
      query: readRequiredString(pass.query, `scanPasses[${index}].query`),
      ...readSearchParameters(pass),
      ...(maxItems === undefined ? {} : { maxItems }),
      ...(minScore === undefined ? {} : { minScore }),
      ...readAllowedSubreddits(pass),
      ...readCommentExpansion(pass),
    };
  }

  throw new Error(`Unsupported Reddit scan pass mode: ${mode}`);
};

const readSearchParameters = (
  pass: Readonly<Record<string, unknown>>,
): {
  readonly searchSort?: RedditSearchSort;
  readonly searchTime?: RedditSearchTime;
} => ({
  ...optionalSearchSortParameter(pass.searchSort ?? pass.sort),
  ...optionalSearchTimeParameter(pass.searchTime ?? pass.time ?? pass.topTime),
});

const optionalSearchSortParameter = (
  value: unknown,
): { readonly searchSort?: RedditSearchSort } => {
  const searchSort = readOptionalSearchSort(value);

  return searchSort === undefined ? {} : { searchSort };
};

const optionalSearchTimeParameter = (
  value: unknown,
): { readonly searchTime?: RedditSearchTime } => {
  const searchTime = readOptionalSearchTime(value);

  return searchTime === undefined ? {} : { searchTime };
};

const readAllowedSubreddits = (
  pass: Readonly<Record<string, unknown>>,
): { readonly allowedSubreddits?: readonly string[] } => {
  const raw = pass.allowedSubreddits ?? pass.subreddits;

  if (raw === undefined) {
    return {};
  }

  if (!Array.isArray(raw)) {
    throw new Error(
      "Reddit source config field allowedSubreddits must be an array",
    );
  }

  const allowedSubreddits = compactUnique(
    raw.flatMap((value) => {
      const subreddit = readOptionalString(value);

      return subreddit === undefined ? [] : [subreddit];
    }),
  );

  return allowedSubreddits.length === 0 ? {} : { allowedSubreddits };
};

const readCommentExpansion = (
  pass: Readonly<Record<string, unknown>>,
): {
  readonly includeComments?: boolean;
  readonly maxCommentsPerPost?: number;
  readonly commentDepth?: number;
  readonly commentSort?: RedditCommentSort;
} => {
  if (pass.includeComments !== true) {
    return {};
  }

  const maxCommentsPerPost = readOptionalPositiveInteger(
    pass.maxCommentsPerPost,
    100,
  );

  return {
    includeComments: true,
    ...(maxCommentsPerPost === undefined ? {} : { maxCommentsPerPost }),
    commentDepth: readPositiveInteger(pass.commentDepth, 2, 0, 10),
    commentSort: readCommentSort(pass.commentSort),
  };
};

const redditEngagementScore = (item: FetchedSourceItem): number => {
  const metadata = readRecordOrUndefined(item.metadata);
  const score = readNumber(metadata?.score);
  const comments = readNumber(metadata?.numComments);
  const upvoteRatio = readNumber(metadata?.upvoteRatio);
  const ratioBoost = upvoteRatio === undefined ? 0 : upvoteRatio * 50;

  return (
    Math.max(0, score ?? 0) + Math.max(0, comments ?? 0) * 1.5 + ratioBoost
  );
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
      `Reddit source config integer must be between 1 and ${max}`,
    );
  }

  return value;
};

const readArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const readRecord = (
  value: unknown,
  field: string,
): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Reddit source config object is required: ${field}`);
  }

  return value as Readonly<Record<string, unknown>>;
};

const readRecordOrUndefined = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
