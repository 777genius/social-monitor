import type { JsonObject, JsonValue } from '@social-monitor/shared-kernel';
import {
  hackerNewsProviderSourceKey,
  redditProviderSourceKey,
  xProviderSourceKey,
} from './feed-provider-source-keys';
import {
  githubRepositoryMetrics,
  githubTrendingRepositoryMetrics,
} from "./feed-github-provider-metrics";

export type FeedProviderMetrics =
  | RedditPostMetrics
  | RedditCommentMetrics
  | GitHubRepositoryMetrics
  | GitHubTrendingRepositoryMetrics
  | HackerNewsStoryMetrics
  | HackerNewsCommentMetrics
  | XPostMetrics;

export type FeedMetricDelta = {
  readonly window: string;
  readonly value: number;
};

export type RedditPostMetrics = {
  readonly kind: 'reddit_post';
  readonly providerKey: 'reddit';
  readonly sourceKey: string;
  readonly contentType: 'post';
  readonly score: number;
  readonly comments: number;
  readonly upvoteRatio?: number;
};

export type RedditCommentRole = 'top_level_comment' | 'reply';
export type CommentScoreConfidence = 'provider_reported' | 'not_available';
export type RedditCommentScoreConfidence = 'provider_reported';

export type RedditCommentMetrics = {
  readonly kind: 'reddit_comment';
  readonly providerKey: 'reddit';
  readonly sourceKey: string;
  readonly contentType: 'comment';
  readonly score: number;
  readonly replies: number;
  readonly depth: number;
  readonly role: RedditCommentRole;
  readonly scoreConfidence: RedditCommentScoreConfidence;
};

export type GitHubRepositoryMetrics = {
  readonly kind: 'github_repository';
  readonly providerKey: 'github-repo-radar';
  readonly sourceKey: string;
  readonly contentType: 'repository';
  readonly evidenceSource: 'gh_archive_watch_event';
  readonly evidenceLabel: string;
  readonly stars: number;
  readonly forks: number;
  readonly checkedAt?: string;
  readonly source?: string;
  readonly trendingDelta: FeedMetricDelta;
  readonly trendDeltas: readonly FeedMetricDelta[];
};

export type GitHubTrendingRepositoryMetrics = {
  readonly kind: 'github_trending_repository';
  readonly providerKey: 'github-trending-page';
  readonly sourceKey: string;
  readonly contentType: 'repository';
  readonly stars: number;
  readonly forks: number;
  readonly rank: number;
  readonly starsGained: number;
  readonly window: 'daily' | 'weekly' | 'monthly';
};

export type HackerNewsStoryMetrics = {
  readonly kind: 'hacker_news_story';
  readonly providerKey: 'hacker-news';
  readonly sourceKey: string;
  readonly contentType: 'story';
  readonly points: number;
  readonly comments: number;
};

export type HackerNewsCommentMetrics = {
  readonly kind: 'hacker_news_comment';
  readonly providerKey: 'hacker-news';
  readonly sourceKey: string;
  readonly contentType: 'comment';
  readonly score: number;
  readonly replies: number;
  readonly depth: number;
  readonly rank?: number;
  readonly role: RedditCommentRole;
  readonly scoreConfidence: CommentScoreConfidence;
};

export type XPostMetrics = {
  readonly kind: 'x_post';
  readonly providerKey: 'x-twitter';
  readonly sourceKey: string;
  readonly contentType: 'post';
  readonly likes: number;
  readonly reposts: number;
  readonly replies: number;
  readonly quotes: number;
  readonly bookmarks: number;
  readonly impressions: number;
};

export const feedProviderMetricsFromMetadata = (params: {
  readonly providerKey: string;
  readonly providerMetadata?: JsonObject;
}): FeedProviderMetrics | undefined => {
  switch (params.providerKey) {
    case 'reddit':
      return redditMetrics(params.providerMetadata);
    case 'github-repo-radar':
      return githubRepositoryMetrics(params.providerMetadata);
    case 'github-trending-page':
      return githubTrendingRepositoryMetrics(params.providerMetadata);
    case 'hacker-news':
      return hackerNewsMetrics(params.providerMetadata);
    case 'x-twitter':
      return xPostMetrics(params.providerMetadata);
    default:
      return undefined;
  }
};

export const feedProviderMetricStrength = (
  metrics: FeedProviderMetrics,
): number => {
  switch (metrics.kind) {
    case 'reddit_post': {
      const ratioBoost =
        metrics.upvoteRatio === undefined
          ? 0
          : Math.max(-0.4, Math.min(0.4, metrics.upvoteRatio - 0.5));

      return Math.max(
        0,
        Math.log1p(Math.max(0, metrics.score)) * 0.65 +
          Math.log1p(metrics.comments) * 0.35 +
          ratioBoost,
      );
    }
    case 'reddit_comment': {
      const roleBoost = metrics.role === 'top_level_comment' ? 0.18 : 0;
      const depthPenalty = Math.min(0.75, Math.max(0, metrics.depth - 1) * 0.18);

      return Math.max(
        0,
        Math.log1p(Math.max(0, metrics.score)) * 0.62 +
          Math.log1p(metrics.replies) * 0.18 +
          roleBoost -
          depthPenalty,
      );
    }
    case 'github_repository': {
      const stars24h = metricDelta(metrics, '24h');
      const stars48h = metricDelta(metrics, '48h');
      return (
        Math.log1p(stars24h) * 0.45 +
        Math.log1p(stars48h) * 0.25 +
        Math.log1p(metrics.trendingDelta.value) * 0.2 +
        Math.log1p(metrics.stars) * 0.1 +
        Math.log1p(metrics.forks) * 0.1
      );
    }
    case 'github_trending_repository':
      return (
        Math.log1p(metrics.starsGained) +
        Math.log1p(metrics.stars) * 0.12 +
        Math.log1p(metrics.forks) * 0.08 +
        Math.max(0, 25 - metrics.rank) * 0.04
      );
    case 'hacker_news_story':
      return Math.log1p(metrics.points) + Math.log1p(metrics.comments) * 0.6;
    case 'hacker_news_comment': {
      const roleBoost = metrics.role === 'top_level_comment' ? 0.15 : 0;
      const depthPenalty = Math.min(0.5, Math.max(0, metrics.depth - 1) * 0.15);
      const rankBoost =
        metrics.score > 0 || metrics.rank === undefined
          ? 0
          : Math.max(0, 1.2 - Math.log1p(metrics.rank) * 0.2);

      return Math.max(
        0,
        Math.log1p(metrics.score) * 0.7 +
          Math.log1p(metrics.replies) * 0.15 +
          rankBoost +
          roleBoost -
          depthPenalty,
      );
    }
    case 'x_post':
      return Math.log1p(
        metrics.likes +
          metrics.reposts * 2 +
          metrics.replies * 0.5 +
          metrics.quotes * 1.5 +
          metrics.bookmarks * 0.4,
      );
  }
};

const metricDelta = (
  metrics: GitHubRepositoryMetrics,
  window: string,
): number =>
  metrics.trendDeltas.find((delta) => delta.window === window)?.value ?? 0;

const redditMetrics = (
  metadata: JsonObject | undefined,
): RedditPostMetrics | RedditCommentMetrics | undefined => {
  if (metadata?.kind === 'reddit_comment') {
    return redditCommentMetrics(metadata);
  }

  return redditPostMetrics(metadata);
};

const redditPostMetrics = (
  metadata: JsonObject | undefined,
): RedditPostMetrics | undefined => {
  const score = readInteger(metadata?.score);
  const comments = readNonNegativeInteger(
    metadata?.numComments ?? metadata?.comments,
  );

  if (score === undefined && comments === undefined) {
    return undefined;
  }

  return {
    kind: 'reddit_post',
    providerKey: 'reddit',
    sourceKey: redditProviderSourceKey(readString(metadata?.subreddit)),
    contentType: 'post',
    score: score ?? 0,
    comments: comments ?? 0,
    upvoteRatio: readRatio(metadata?.upvoteRatio),
  };
};

const redditCommentMetrics = (
  metadata: JsonObject | undefined,
): RedditCommentMetrics | undefined => {
  const score = readInteger(metadata?.score ?? metadata?.providerScore);
  const replies = readNonNegativeInteger(metadata?.replies ?? metadata?.replyCount);
  const depth = readNonNegativeInteger(metadata?.depth);

  if (score === undefined && replies === undefined && depth === undefined) {
    return undefined;
  }

  return {
    kind: 'reddit_comment',
    providerKey: 'reddit',
    sourceKey: redditProviderSourceKey(readString(metadata?.subreddit)),
    contentType: 'comment',
    score: score ?? 0,
    replies: replies ?? 0,
    depth: depth ?? 0,
    role: readRedditCommentRole(metadata?.role),
    scoreConfidence: 'provider_reported',
  };
};

const hackerNewsMetrics = (
  metadata: JsonObject | undefined,
): HackerNewsStoryMetrics | HackerNewsCommentMetrics | undefined =>
  metadata?.kind === 'hacker_news_comment'
    ? hackerNewsCommentMetrics(metadata)
    : hackerNewsStoryMetrics(metadata);

const hackerNewsStoryMetrics = (
  metadata: JsonObject | undefined,
): HackerNewsStoryMetrics | undefined => {
  if (metadata?.kind !== 'hacker_news_story') {
    return undefined;
  }

  const points = readNonNegativeInteger(metadata.points);
  const comments = readNonNegativeInteger(metadata.comments);

  if (points === undefined && comments === undefined) {
    return undefined;
  }

  return {
    kind: 'hacker_news_story',
    providerKey: 'hacker-news',
    sourceKey: hackerNewsProviderSourceKey(readString(metadata.source)),
    contentType: 'story',
    points: points ?? 0,
    comments: comments ?? 0,
  };
};

const hackerNewsCommentMetrics = (
  metadata: JsonObject | undefined,
): HackerNewsCommentMetrics | undefined => {
  const score = readNonNegativeInteger(metadata?.score ?? metadata?.providerScore);
  const replies = readNonNegativeInteger(metadata?.replies ?? metadata?.replyCount);
  const depth = readNonNegativeInteger(metadata?.depth);
  const rank = readPositiveInteger(metadata?.rank);

  if (
    score === undefined &&
    replies === undefined &&
    depth === undefined &&
    rank === undefined
  ) {
    return undefined;
  }

  return {
    kind: 'hacker_news_comment',
    providerKey: 'hacker-news',
    sourceKey: hackerNewsProviderSourceKey(readString(metadata?.source)),
    contentType: 'comment',
    score: score ?? 0,
    replies: replies ?? 0,
    depth: depth ?? 0,
    ...(rank === undefined ? {} : { rank }),
    role: readRedditCommentRole(metadata?.role),
    scoreConfidence: score === undefined ? 'not_available' : 'provider_reported',
  };
};

const xPostMetrics = (
  metadata: JsonObject | undefined,
): XPostMetrics | undefined => {
  if (metadata?.kind !== 'x_post' && metadata?.kind !== 'twitter_post') {
    return undefined;
  }

  const publicMetrics = readObject(
    metadata.public_metrics ?? metadata.publicMetrics,
  );
  const likes = readNonNegativeInteger(
    metadata.likes ?? publicMetrics?.like_count ?? publicMetrics?.likeCount,
  );
  const reposts = readNonNegativeInteger(
    metadata.reposts ??
      metadata.retweets ??
      publicMetrics?.retweet_count ??
      publicMetrics?.retweetCount,
  );
  const replies = readNonNegativeInteger(
    metadata.replies ?? publicMetrics?.reply_count ?? publicMetrics?.replyCount,
  );
  const quotes = readNonNegativeInteger(
    metadata.quotes ?? publicMetrics?.quote_count ?? publicMetrics?.quoteCount,
  );
  const bookmarks = readNonNegativeInteger(
    metadata.bookmarks ??
      publicMetrics?.bookmark_count ??
      publicMetrics?.bookmarkCount,
  );
  const impressions = readNonNegativeInteger(
    metadata.impressions ??
      publicMetrics?.impression_count ??
      publicMetrics?.impressionCount,
  );

  if (
    likes === undefined &&
    reposts === undefined &&
    replies === undefined &&
    quotes === undefined &&
    bookmarks === undefined &&
    impressions === undefined
  ) {
    return undefined;
  }

  return {
    kind: 'x_post',
    providerKey: 'x-twitter',
    sourceKey: xProviderSourceKey({
      account: readString(metadata.accountHandle ?? metadata.authorHandle),
      topic: readString(metadata.topic),
      searchQuery: readString(metadata.searchQuery),
    }),
    contentType: 'post',
    likes: likes ?? 0,
    reposts: reposts ?? 0,
    replies: replies ?? 0,
    quotes: quotes ?? 0,
    bookmarks: bookmarks ?? 0,
    impressions: impressions ?? 0,
  };
};

const readObject = (value: JsonValue | undefined): JsonObject | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;

const readString = (value: JsonValue | undefined): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

const readNonNegativeInteger = (
  value: JsonValue | undefined,
): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return undefined;
};

const readPositiveInteger = (
  value: JsonValue | undefined,
): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  return undefined;
};

const readInteger = (value: JsonValue | undefined): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) ? value : undefined;

const readRatio = (value: JsonValue | undefined): number | undefined =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1
    ? value
    : undefined;

const readRedditCommentRole = (
  value: JsonValue | undefined,
): RedditCommentRole =>
  value === 'reply' ? 'reply' : 'top_level_comment';
