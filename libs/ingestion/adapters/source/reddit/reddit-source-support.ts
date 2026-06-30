import type {
  FetchedSourceItem,
  SourceProviderScanContext,
} from "../../../ports";
import { redditListings, redditTopTimes } from "./http-reddit-client";
import type {
  RedditCommentSort,
  RedditPost,
  RedditPostListing,
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
      readonly maxItems?: number;
      readonly minScore?: number;
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

export const normalizePost = (
  post: RedditPost,
  minScore: number | undefined,
): readonly FetchedSourceItem[] => {
  if (post.over18 || post.removedByCategory !== undefined) {
    return [];
  }

  if (
    minScore !== undefined &&
    post.score !== undefined &&
    post.score < minScore
  ) {
    return [];
  }

  const title = post.title?.trim() ?? "";
  const body = post.selftext?.trim() ?? "";

  if (title.length + body.length === 0) {
    return [];
  }

  const publishedAt = publishedAtForPost(post);

  if (publishedAt === undefined) {
    return [];
  }

  return [
    {
      externalId: `reddit:${post.name ?? post.id}`,
      canonicalUrl: canonicalUrl(post),
      title,
      body,
      authorHandle: post.author,
      publishedAt,
      metadata: redditPostMetadata(post),
    },
  ];
};

export const redditWarnings = (
  posts: readonly RedditPost[],
  minScore: number | undefined,
): readonly string[] => [
  ...(posts.some((post) => post.over18 || post.removedByCategory !== undefined)
    ? ["Some Reddit posts were skipped because they were adult or removed."]
    : []),
  ...(posts.some((post) => isTimestampMissingCandidate(post, minScore))
    ? [
        "Some Reddit posts had no valid created_utc timestamp; they were skipped.",
      ]
    : []),
];

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

export const readScanPasses = (
  config: SourceProviderScanContext["config"] | undefined,
): readonly RedditScanPass[] => {
  const rawPasses = readArray(config?.scanPasses ?? config?.passes);

  return rawPasses.map(readScanPass).slice(0, 10);
};

export const sortRedditItemsByEngagement = (
  items: readonly FetchedSourceItem[],
): readonly FetchedSourceItem[] =>
  [...items].sort((left, right) => {
    const scoreDiff = redditEngagementScore(right) - redditEngagementScore(left);

    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return right.publishedAt.getTime() - left.publishedAt.getTime();
  });

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
      ...(maxItems === undefined ? {} : { maxItems }),
      ...(minScore === undefined ? {} : { minScore }),
      ...readCommentExpansion(pass),
    };
  }

  throw new Error(`Unsupported Reddit scan pass mode: ${mode}`);
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

const isTimestampMissingCandidate = (
  post: RedditPost,
  minScore: number | undefined,
): boolean => {
  if (post.over18 || post.removedByCategory !== undefined) {
    return false;
  }

  if (
    minScore !== undefined &&
    post.score !== undefined &&
    post.score < minScore
  ) {
    return false;
  }

  const title = post.title?.trim() ?? "";
  const body = post.selftext?.trim() ?? "";

  return title.length + body.length > 0 && publishedAtForPost(post) === undefined;
};

const publishedAtForPost = (post: RedditPost): Date | undefined => {
  if (
    post.createdUtc === undefined ||
    !Number.isFinite(post.createdUtc) ||
    post.createdUtc <= 0
  ) {
    return undefined;
  }

  const publishedAt = new Date(post.createdUtc * 1000);

  return Number.isNaN(publishedAt.getTime()) ? undefined : publishedAt;
};

const canonicalUrl = (post: RedditPost): string => {
  if (post.permalink !== undefined) {
    return new URL(post.permalink, "https://www.reddit.com").toString();
  }

  return post.url ?? `https://www.reddit.com/comments/${post.id}`;
};

const redditEngagementScore = (item: FetchedSourceItem): number => {
  const metadata = readRecordOrUndefined(item.metadata);
  const score = readNumber(metadata?.score);
  const comments = readNumber(metadata?.numComments);
  const upvoteRatio = readNumber(metadata?.upvoteRatio);
  const ratioBoost = upvoteRatio === undefined ? 0 : upvoteRatio * 50;

  return Math.max(0, score ?? 0) + Math.max(0, comments ?? 0) * 1.5 + ratioBoost;
};

const redditPostMetadata = (post: RedditPost) => ({
  kind: "reddit_post",
  ...(post.subreddit === undefined ? {} : { subreddit: post.subreddit }),
  ...(linkedUrl(post) === undefined ? {} : { linkedUrl: linkedUrl(post) }),
  ...(post.score === undefined ? {} : { score: post.score }),
  ...(post.numComments === undefined ? {} : { numComments: post.numComments }),
  ...(post.upvoteRatio === undefined ? {} : { upvoteRatio: post.upvoteRatio }),
});

const linkedUrl = (post: RedditPost): string | undefined => {
  if (post.url === undefined) {
    return undefined;
  }

  const discussionUrl = canonicalUrl(post);

  return post.url === discussionUrl ? undefined : post.url;
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
    throw new Error(`Reddit source config integer must be between 1 and ${max}`);
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
