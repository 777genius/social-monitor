import type { FeedProviderMetrics } from "./feed-provider-metrics";

export type FeedProviderMetricLabel = {
  readonly label: string;
  readonly value: string;
};

export const formatFeedProviderMetrics = (
  metrics: FeedProviderMetrics | undefined,
): readonly FeedProviderMetricLabel[] => {
  if (metrics === undefined) {
    return [];
  }

  switch (metrics.kind) {
    case "github_repository":
      return compactMetrics([
        metric("Evidence", metrics.evidenceLabel),
        metric("Checked", formatCheckedAt(metrics.checkedAt)),
        metric("Source lag", "GH Archive can lag by about an hour"),
        metric("Stars", metrics.stars),
        ...metrics.trendDeltas.map((delta) =>
          metric(
            metrics.trendDeltas.length > 1 ? `Trend ${delta.window}` : "Trend",
            `+${delta.value}${delta.window.length === 0 ? "" : ` / ${delta.window}`}`,
          ),
        ),
        metric("Forks", metrics.forks),
      ]);
    case "github_trending_repository":
      return compactMetrics([
        metric(
          `GitHub Trending ${trendingWindowLabel(metrics.window)}`,
          formatTrendingPageSignal(
            metrics.rank,
            metrics.starsGained,
            metrics.window,
          ),
        ),
        metric("Stars", metrics.stars),
        metric("Forks", metrics.forks),
      ]);
    case "reddit_post":
      return compactMetrics([
        metric("Score", metrics.score),
        metric("Comments", metrics.comments),
        metric("Upvote ratio", formatRatio(metrics.upvoteRatio)),
      ]);
    case "hacker_news_story":
      return compactMetrics([
        metric("Points", metrics.points),
        metric("Comments", metrics.comments),
      ]);
    case "x_post":
      return compactMetrics([
        metric("Likes", metrics.likes),
        metric("Reposts", metrics.reposts),
        metric("Replies", metrics.replies),
        metric("Quotes", metrics.quotes),
        metric("Bookmarks", metrics.bookmarks),
        metric("Impressions", metrics.impressions),
      ]);
  }
};

export const summarizeFeedProviderMetrics = (
  metrics: FeedProviderMetrics | undefined,
): string | undefined => {
  if (metrics === undefined) {
    return undefined;
  }

  switch (metrics.kind) {
    case "github_repository": {
      const trend = `${formatSigned(metrics.trendingDelta.value)} stars / ${metrics.trendingDelta.window}`;
      return compactText([
        trend,
        `${metrics.stars.toLocaleString("en-US")} total stars`,
      ]);
    }
    case "github_trending_repository":
      return formatTrendingPageSignal(
        metrics.rank,
        metrics.starsGained,
        metrics.window,
      );
    case "reddit_post":
      return compactText([
        formatNamedNumber("score", metrics.score),
        formatNamedNumber("comments", metrics.comments),
        metrics.upvoteRatio === undefined
          ? undefined
          : `${formatRatio(metrics.upvoteRatio)} upvoted`,
      ]);
    case "hacker_news_story":
      return compactText([
        formatNamedNumber("points", metrics.points),
        formatNamedNumber("comments", metrics.comments),
      ]);
    case "x_post":
      return compactText([
        formatNamedNumber("likes", metrics.likes),
        formatNamedNumber("reposts", metrics.reposts),
        formatNamedNumber("replies", metrics.replies),
      ]);
  }
};

const compactMetrics = (
  values: readonly (FeedProviderMetricLabel | undefined)[],
): readonly FeedProviderMetricLabel[] =>
  values.filter(
    (value): value is FeedProviderMetricLabel => value !== undefined,
  );

const metric = (
  label: string,
  value: number | string | undefined,
): FeedProviderMetricLabel | undefined =>
  value === undefined
    ? undefined
    : {
        label,
        value:
          typeof value === "number" ? value.toLocaleString("en-US") : value,
      };

const formatCheckedAt = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
};

const formatRatio = (value: number | undefined): string | undefined =>
  value === undefined ? undefined : `${Math.round(value * 100)}%`;

const formatRank = (value: number): string => `#${value}`;

const formatSigned = (value: number): string =>
  value < 0
    ? value.toLocaleString("en-US")
    : `+${value.toLocaleString("en-US")}`;

const formatTrendingPageSignal = (
  rank: number,
  starsGained: number,
  window: string,
): string =>
  `${formatRank(rank)}, ${formatSigned(starsGained)} stars ${trendingWindowLabel(window)}`;

const trendingWindowLabel = (window: string): string => {
  switch (window) {
    case "weekly":
      return "this week";
    case "monthly":
      return "this month";
    case "daily":
    default:
      return "today";
  }
};

const formatNamedNumber = (label: string, value: number): string =>
  `${value.toLocaleString("en-US")} ${label}`;

const compactText = (
  parts: readonly (string | undefined)[],
): string | undefined => {
  const compacted = parts.filter((part): part is string => part !== undefined);

  return compacted.length === 0 ? undefined : compacted.join(", ");
};
