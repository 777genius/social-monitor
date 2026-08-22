import {
  classifyFeedPromotionEligibility,
  feedProviderMetricsFromMetadata,
  formatFeedProviderMetrics,
  summarizeFeedProviderMetrics,
} from "@social-monitor/feed/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";

import type { SummaryEvidenceItem } from "../../domain";
import {
  isHackerNewsCanonicalUrl,
  normalizeProviderKey,
} from "./relevance-reader-summary-evidence-normalization";

export const providerMetricFacts = (params: {
  readonly providerKey: string;
  readonly providerMetadata?: JsonObject;
}): Pick<
  SummaryEvidenceItem,
  "providerMetricLabels" | "providerMetricSummary"
> => {
  if (params.providerKey === "github-trending-page") {
    const appendixMetrics = feedProviderMetricsFromMetadata(params);
    return {
      providerMetricLabels: formatFeedProviderMetrics(appendixMetrics),
      providerMetricSummary: summarizeFeedProviderMetrics(appendixMetrics),
    };
  }
  const eligibility = classifyFeedPromotionEligibility(params);
  if (!eligibility.eligible) {
    return {};
  }
  const labels = canonicalMetricLabels(eligibility.metrics);

  return {
    providerMetricLabels: labels,
    providerMetricSummary: labels
      .map((metric) => `${metric.value} ${metric.label.toLowerCase()}`)
      .join(", "),
  };
};

const canonicalMetricLabels = (
  metrics: Extract<ReturnType<typeof classifyFeedPromotionEligibility>,
    { readonly eligible: true }>["metrics"],
): readonly { readonly label: string; readonly value: string }[] => {
  switch (metrics.kind) {
    case "x_post":
      return [metric("Likes", metrics.likes ?? 0),
        metric("Reposts", metrics.reposts ?? 0)];
    case "reddit_post":
      return [metric("Score", metrics.score),
        ...(metrics.upvoteRatio === undefined ? [] : [{
          label: "Upvoted",
          value: `${Math.round(metrics.upvoteRatio * 100)}%`,
        }])];
    case "hacker_news_story":
      return [metric("Points", metrics.points)];
    case "github_repository": {
      const window = metrics.trendingDelta.window;
      return [metric(`Stars ${window}`, metrics.trendingDelta.value ?? 0),
        metric(`Forks ${window}`,
          metrics.forkTrendDeltas.find((delta) => delta.window === window)
            ?.value ?? 0)];
    }
  }
};

const metric = (label: string, value: number) => ({
  label,
  value: value.toLocaleString("en-US"),
});

export const sourceOriginUrlFromProviderMetadata = (params: {
  readonly providerKey: string;
  readonly providerMetadata?: JsonObject;
}): string | undefined => {
  const providerKey = normalizeProviderKey(params.providerKey);
  if (providerKey !== "hacker-news" && providerKey !== "hn") {
    return undefined;
  }
  const externalUrl = params.providerMetadata?.externalUrl;
  if (typeof externalUrl !== "string") {
    return undefined;
  }

  try {
    const url = new URL(externalUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};

export const readerActionKindForProvider = (
  providerKey: string,
): SummaryEvidenceItem["readerActionKind"] =>
  providerKey === "github-repo-radar" || providerKey === "github-trending-page"
    ? "watch_repository"
    : "read_source";

export const providerNameForProvider = (providerKey: string): string => {
  switch (providerKey.toLowerCase()) {
    case "github-trending-page":
      return "GitHub Trending";
    case "github-repo-radar":
      return "Repo Radar";
    case "github-issues":
    case "github":
      return "GitHub";
    case "hacker-news":
    case "hn":
      return "Hacker News";
    case "reddit":
      return "Reddit";
    case "x-twitter":
    case "twitter":
      return "X/Twitter";
    case "rss":
      return "RSS";
    default:
      return providerKey;
  }
};

export const providerNameForEvidence = (params: {
  readonly providerKey: string;
  readonly canonicalUrl?: string;
}): string =>
  params.providerKey.toLowerCase() === "rss" &&
  isHackerNewsCanonicalUrl(params.canonicalUrl)
    ? "Hacker News via RSS"
    : providerNameForProvider(params.providerKey);
