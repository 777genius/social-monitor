import type { SourceEngagementMetrics } from './source-engagement-metrics';

/** Provider-family metadata contracts. Adding a source never edits metric decoding. */
export type MetricKind = "count" | "rank" | "ratio" | "signed";

type MetricPath = {
  readonly canonicalKey: keyof SourceEngagementMetrics;
  readonly path: readonly string[];
  readonly kind: MetricKind;
};

export type ProviderMetricShape = {
  readonly providerKey: string;
  readonly metadataKinds: readonly string[];
  readonly metricPaths: readonly MetricPath[];
  readonly volatileContentPaths: readonly (readonly string[])[];
};

const X_SHAPE: ProviderMetricShape = {
  providerKey: "x-twitter",
  metadataKinds: ["x_post", "twitter_post"],
  metricPaths: [
    metric("likes", "count", "likes"),
    metric("likes", "count", "publicMetrics", "like_count"),
    metric("likes", "count", "public_metrics", "like_count"),
    metric("likes", "count", "publicMetrics", "likeCount"),
    metric("likes", "count", "metrics", "likes"),
    metric("reposts", "count", "retweets"),
    metric("reposts", "count", "reposts"),
    metric("reposts", "count", "publicMetrics", "retweet_count"),
    metric("reposts", "count", "public_metrics", "retweet_count"),
    metric("reposts", "count", "publicMetrics", "retweetCount"),
    metric("reposts", "count", "metrics", "retweets"),
    metric("reposts", "count", "metrics", "reposts"),
    metric("replies", "count", "replies"),
    metric("replies", "count", "publicMetrics", "reply_count"),
    metric("replies", "count", "public_metrics", "reply_count"),
    metric("replies", "count", "publicMetrics", "replyCount"),
    metric("replies", "count", "metrics", "replies"),
    metric("quotes", "count", "quotes"),
    metric("quotes", "count", "publicMetrics", "quote_count"),
    metric("quotes", "count", "public_metrics", "quote_count"),
    metric("quotes", "count", "publicMetrics", "quoteCount"),
    metric("quotes", "count", "metrics", "quotes"),
    metric("bookmarks", "count", "bookmarks"),
    metric("bookmarks", "count", "publicMetrics", "bookmark_count"),
    metric("bookmarks", "count", "public_metrics", "bookmark_count"),
    metric("bookmarks", "count", "publicMetrics", "bookmarkCount"),
    metric("bookmarks", "count", "metrics", "bookmarks"),
    metric("impressions", "count", "impressions"),
    metric("impressions", "count", "publicMetrics", "impression_count"),
    metric("impressions", "count", "public_metrics", "impression_count"),
    metric("impressions", "count", "publicMetrics", "impressionCount"),
    metric("views", "count", "views"),
    metric("views", "count", "metrics", "views"),
  ],
  volatileContentPaths: [
    ["searchQuery"],
    ["sourceQueryLane"],
    ["sourceProduct"],
    ["trendScore"],
  ],
};

const REDDIT_POST_SHAPE: ProviderMetricShape = {
  providerKey: "reddit",
  metadataKinds: ["reddit_post"],
  metricPaths: [
    metric("score", "signed", "score"),
    metric("score", "signed", "providerScore"),
    metric("comments", "count", "numComments"),
    metric("upvoteRatioBps", "ratio", "upvoteRatio"),
  ],
  volatileContentPaths: [
    ["sourceQueryLane"],
    ["searchQuery"],
    ["sourceProduct"],
  ],
};

const REDDIT_COMMENT_SHAPE: ProviderMetricShape = {
  providerKey: "reddit",
  metadataKinds: ["reddit_comment"],
  metricPaths: [
    metric("score", "signed", "score"),
    metric("score", "signed", "providerScore"),
    metric("replies", "count", "replies"),
    metric("replies", "count", "replyCount"),
    metric("providerRank", "rank", "rank"),
  ],
  volatileContentPaths: [
    ["scoreConfidence"],
    ["rankConfidence"],
  ],
};

const HACKER_NEWS_STORY_SHAPE: ProviderMetricShape = {
  providerKey: "hacker-news",
  metadataKinds: ["hacker_news_story"],
  metricPaths: [
    metric("points", "count", "points"),
    metric("comments", "count", "comments"),
  ],
  volatileContentPaths: [["source"], ["searchQuery"]],
};

const HACKER_NEWS_COMMENT_SHAPE: ProviderMetricShape = {
  providerKey: "hacker-news",
  metadataKinds: ["hacker_news_comment"],
  metricPaths: [
    metric("score", "signed", "score"),
    metric("score", "signed", "providerScore"),
    metric("replies", "count", "replies"),
    metric("replies", "count", "replyCount"),
    metric("providerRank", "rank", "rank"),
  ],
  volatileContentPaths: [
    ["source"],
    ["searchQuery"],
    ["scoreConfidence"],
    ["rankConfidence"],
  ],
};

const GITHUB_TRENDING_SHAPE: ProviderMetricShape = {
  providerKey: "github-trending-page",
  metadataKinds: ["github_trending_page_repository"],
  metricPaths: [
    metric("stars", "count", "repository", "totalStars"),
    metric("forks", "count", "repository", "forksCount"),
    metric("starsGained", "count", "trending", "starsGained"),
    metric("providerRank", "rank", "trending", "rank"),
  ],
  volatileContentPaths: [
    ["trending", "fetchStartedAt"],
    ["trending", "checkedAt"],
    ["trending", "source"],
  ],
};

const GITHUB_RADAR_SHAPE: ProviderMetricShape = {
  providerKey: "github-repo-radar",
  metadataKinds: ["github_repository_trend"],
  metricPaths: [
    metric("stars", "count", "trend", "totalStars"),
    metric("forks", "count", "repository", "forksCount"),
    metric("starsGained", "count", "trend", "stars24h"),
    metric("providerRank", "rank", "trend", "rank"),
  ],
  volatileContentPaths: [
    ["trend", "stars48h"],
    ["trend", "stars7d"],
    ["trend", "stars30d"],
    ["trend", "stars90d"],
    ["trend", "checkedAt"],
    ["trend", "source"],
    ["sourceCohort"],
  ],
};

export const PROVIDER_SHAPES: readonly ProviderMetricShape[] = [
  X_SHAPE,
  REDDIT_POST_SHAPE,
  REDDIT_COMMENT_SHAPE,
  HACKER_NEWS_STORY_SHAPE,
  HACKER_NEWS_COMMENT_SHAPE,
  GITHUB_TRENDING_SHAPE,
  GITHUB_RADAR_SHAPE,
];

export const KNOWN_PROVIDER_KEYS = new Set(
  PROVIDER_SHAPES.map((shape) => shape.providerKey),
);

function metric(
  canonicalKey: keyof SourceEngagementMetrics,
  kind: MetricKind,
  ...path: readonly string[]
): MetricPath {
  return { canonicalKey, kind, path };
}

