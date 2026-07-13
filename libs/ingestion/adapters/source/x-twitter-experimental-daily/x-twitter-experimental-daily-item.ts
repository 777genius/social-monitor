import {
  normalizeJsonObject,
  redactSensitiveText,
  type JsonObject,
} from "@social-monitor/shared-kernel";

import type { FetchedSourceItem } from "../../../ports";
import type { XExperimentalDailyScanConfig } from "./x-twitter-experimental-daily-config";
import type {
  XDailyCollectedPost,
  XDailyCollectorWarning,
  XDailyPostMetrics,
} from "./x-daily-collector-client.port";

const providerKey = "x-twitter";

export const normalizeXPost = (
  post: XDailyCollectedPost,
  searchQuery: string,
  maxItems: number,
): FetchedSourceItem => ({
  externalId: `${providerKey}:${post.tweetId}`,
  canonicalUrl: post.canonicalUrl,
  title: titleForPost(post),
  body: post.text,
  authorHandle: post.authorHandle,
  publishedAt: post.publishedAt,
  metadata: normalizeJsonObject({
    kind: "x_post",
    provider: providerKey,
    tweetId: post.tweetId,
    ...(post.authorHandle === undefined
      ? {}
      : { authorHandle: post.authorHandle }),
    searchQuery,
    sourceQueryLane: {
      providerKey,
      mode: "search",
      query: searchQuery,
      maxItems,
    },
    sourceProduct: post.sourceProduct,
    trendScore: post.trendScore,
    likes: post.metrics.likes,
    retweets: post.metrics.retweets,
    replies: post.metrics.replies,
    ...(post.metrics.quotes === undefined
      ? {}
      : { quotes: post.metrics.quotes }),
    ...(post.metrics.views === undefined
      ? {}
      : { impressions: post.metrics.views }),
    publicMetrics: {
      like_count: post.metrics.likes,
      retweet_count: post.metrics.retweets,
      reply_count: post.metrics.replies,
      ...(post.metrics.quotes === undefined
        ? {}
        : { quote_count: post.metrics.quotes }),
      ...(post.metrics.views === undefined
        ? {}
        : { impression_count: post.metrics.views }),
    },
    metrics: xPostMetricsMetadata(post.metrics),
    mediaUrls: post.mediaUrls,
  }),
});

export const xPostMatchesMetricThresholds = (
  metrics: XDailyPostMetrics,
  config: XExperimentalDailyScanConfig,
): boolean =>
  (config.minLikes === undefined || metrics.likes >= config.minLikes) &&
  (config.minRetweets === undefined ||
    metrics.retweets >= config.minRetweets) &&
  (config.minReplies === undefined || metrics.replies >= config.minReplies);

export const compareXCollectedPosts = (
  left: XDailyCollectedPost,
  right: XDailyCollectedPost,
): number => {
  const scoreDiff = xPostSignalScore(right) - xPostSignalScore(left);

  return scoreDiff !== 0
    ? scoreDiff
    : right.publishedAt.getTime() - left.publishedAt.getTime();
};

export const xPostSignalScore = (post: XDailyCollectedPost): number =>
  post.trendScore +
  post.metrics.likes +
  post.metrics.retweets * 2 +
  post.metrics.replies * 1.5 +
  (post.metrics.quotes ?? 0) * 2;

export const formatXCollectorWarning = (
  warning: XDailyCollectorWarning,
): string => {
  const code = redactSensitiveText(warning.code).trim();
  const message = redactSensitiveText(warning.message);

  return code.length === 0 ? message : `${code}: ${message}`;
};

const xPostMetricsMetadata = (metrics: XDailyPostMetrics): JsonObject =>
  normalizeJsonObject({
    likes: metrics.likes,
    retweets: metrics.retweets,
    replies: metrics.replies,
    ...(metrics.quotes === undefined ? {} : { quotes: metrics.quotes }),
    ...(metrics.views === undefined ? {} : { views: metrics.views }),
  });

const titleForPost = (post: XDailyCollectedPost): string => {
  const author = post.authorHandle ?? "unknown";
  const text = post.text.replace(/\s+/gu, " ").trim();
  const preview = text.length > 96 ? `${text.slice(0, 93)}...` : text;

  return `X post by @${author}: ${preview}`;
};
