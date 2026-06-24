import type { JsonObject, JsonValue } from '@social-monitor/shared-kernel';

export type FeedProviderMetrics =
  | RedditPostMetrics
  | GitHubRepositoryMetrics
  | HackerNewsStoryMetrics
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

export type GitHubRepositoryMetrics = {
  readonly kind: 'github_repository';
  readonly providerKey: 'github-repo-radar';
  readonly sourceKey: string;
  readonly contentType: 'repository';
  readonly stars: number;
  readonly forks: number;
  readonly trendingDelta: FeedMetricDelta;
  readonly trendDeltas: readonly FeedMetricDelta[];
};

export type HackerNewsStoryMetrics = {
  readonly kind: 'hacker_news_story';
  readonly providerKey: 'hacker-news';
  readonly sourceKey: string;
  readonly contentType: 'story';
  readonly points: number;
  readonly comments: number;
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
      return redditPostMetrics(params.providerMetadata);
    case 'github-repo-radar':
      return githubRepositoryMetrics(params.providerMetadata);
    case 'hacker-news':
      return hackerNewsStoryMetrics(params.providerMetadata);
    case 'x-twitter':
      return xPostMetrics(params.providerMetadata);
    default:
      return undefined;
  }
};

export const feedProviderMetricStrength = (metrics: FeedProviderMetrics): number => {
  switch (metrics.kind) {
    case 'reddit_post': {
      const ratioBoost = metrics.upvoteRatio === undefined
        ? 0
        : Math.max(-0.4, Math.min(0.4, metrics.upvoteRatio - 0.5));

      return Math.max(
        0,
        Math.log1p(Math.max(0, metrics.score)) + Math.log1p(metrics.comments) * 0.55 + ratioBoost,
      );
    }
    case 'github_repository':
      return Math.log1p(metrics.trendingDelta.value) +
        Math.log1p(metrics.stars) * 0.15 +
        Math.log1p(metrics.forks) * 0.1;
    case 'hacker_news_story':
      return Math.log1p(metrics.points) + Math.log1p(metrics.comments) * 0.6;
    case 'x_post':
      return Math.log1p(metrics.likes) +
        Math.log1p(metrics.reposts) * 0.8 +
        Math.log1p(metrics.replies + metrics.quotes) * 0.45 +
        Math.log1p(metrics.bookmarks) * 0.35;
  }
};

const redditPostMetrics = (metadata: JsonObject | undefined): RedditPostMetrics | undefined => {
  const score = readInteger(metadata?.score);
  const comments = readNonNegativeInteger(metadata?.numComments ?? metadata?.comments);

  if (score === undefined && comments === undefined) {
    return undefined;
  }

  return {
    kind: 'reddit_post',
    providerKey: 'reddit',
    sourceKey: redditSourceKey(readString(metadata?.subreddit)),
    contentType: 'post',
    score: score ?? 0,
    comments: comments ?? 0,
    upvoteRatio: readRatio(metadata?.upvoteRatio),
  };
};

const githubRepositoryMetrics = (metadata: JsonObject | undefined): GitHubRepositoryMetrics | undefined => {
  if (metadata?.kind !== 'github_repository_trend') {
    return undefined;
  }

  const repository = readObject(metadata.repository);
  const trend = readObject(metadata.trend);

  if (repository === undefined || trend === undefined) {
    return undefined;
  }

  const primaryWindow = readString(trend.primaryWindow) ?? '48h';
  const delta = githubTrendDelta(trend, primaryWindow);

  return {
    kind: 'github_repository',
    providerKey: 'github-repo-radar',
    sourceKey: `repo-trending:${primaryWindow}`,
    contentType: 'repository',
    stars: readNonNegativeInteger(trend.totalStars) ?? 0,
    forks: readNonNegativeInteger(repository.forksCount) ?? 0,
    trendingDelta: {
      window: primaryWindow,
      value: delta,
    },
    trendDeltas: githubTrendDeltas(trend),
  };
};

const githubTrendDeltas = (trend: JsonObject): readonly FeedMetricDelta[] =>
  ([
    ['24h', 'stars24h'],
    ['48h', 'stars48h'],
    ['7d', 'stars7d'],
    ['30d', 'stars30d'],
    ['90d', 'stars90d'],
  ] as const).map(([window, field]) => ({
    window,
    value: readNonNegativeInteger(trend[field]) ?? 0,
  }));

const hackerNewsStoryMetrics = (metadata: JsonObject | undefined): HackerNewsStoryMetrics | undefined => {
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
    sourceKey: `hn:${readString(metadata.source) ?? 'unknown'}`,
    contentType: 'story',
    points: points ?? 0,
    comments: comments ?? 0,
  };
};

const xPostMetrics = (metadata: JsonObject | undefined): XPostMetrics | undefined => {
  if (metadata?.kind !== 'x_post' && metadata?.kind !== 'twitter_post') {
    return undefined;
  }

  const publicMetrics = readObject(metadata.public_metrics ?? metadata.publicMetrics);
  const likes = readNonNegativeInteger(
    metadata.likes ?? publicMetrics?.like_count ?? publicMetrics?.likeCount,
  );
  const reposts = readNonNegativeInteger(
    metadata.reposts ?? metadata.retweets ?? publicMetrics?.retweet_count ?? publicMetrics?.retweetCount,
  );
  const replies = readNonNegativeInteger(
    metadata.replies ?? publicMetrics?.reply_count ?? publicMetrics?.replyCount,
  );
  const quotes = readNonNegativeInteger(
    metadata.quotes ?? publicMetrics?.quote_count ?? publicMetrics?.quoteCount,
  );
  const bookmarks = readNonNegativeInteger(
    metadata.bookmarks ?? publicMetrics?.bookmark_count ?? publicMetrics?.bookmarkCount,
  );
  const impressions = readNonNegativeInteger(
    metadata.impressions ?? publicMetrics?.impression_count ?? publicMetrics?.impressionCount,
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
    sourceKey: xSourceKey(metadata),
    contentType: 'post',
    likes: likes ?? 0,
    reposts: reposts ?? 0,
    replies: replies ?? 0,
    quotes: quotes ?? 0,
    bookmarks: bookmarks ?? 0,
    impressions: impressions ?? 0,
  };
};

const githubTrendDelta = (
  trend: JsonObject,
  primaryWindow: string,
): number => {
  const trendField = {
    '24h': 'stars24h',
    '48h': 'stars48h',
    '7d': 'stars7d',
    '30d': 'stars30d',
    '90d': 'stars90d',
  }[primaryWindow] ?? 'stars48h';

  return readNonNegativeInteger(trend[trendField]) ?? 0;
};

const redditSourceKey = (subreddit: string | undefined): string =>
  subreddit === undefined ? 'reddit:unknown' : `r/${subreddit.toLocaleLowerCase('en-US')}`;

const xSourceKey = (metadata: JsonObject): string => {
  const account = readString(metadata.accountHandle ?? metadata.authorHandle);
  const topic = readString(metadata.topic ?? metadata.searchQuery);

  if (account !== undefined) {
    return `account:${account.toLocaleLowerCase('en-US')}`;
  }

  return topic === undefined ? 'x:unknown' : `topic:${topic.toLocaleLowerCase('en-US')}`;
};

const readObject = (value: JsonValue | undefined): JsonObject | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : undefined;

const readString = (value: JsonValue | undefined): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readNonNegativeInteger = (value: JsonValue | undefined): number | undefined => {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  return undefined;
};

const readInteger = (value: JsonValue | undefined): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) ? value : undefined;

const readRatio = (value: JsonValue | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;
