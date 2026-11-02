import { feedProviderMetricsFromMetadata } from "@social-monitor/feed/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";
import { readerPostPromotionEngagementFact } from "./reader-post-promotion-engagement-facts";

/** Native counts may exist without a timestamp, but missing counts stay unknown. */
export function readerBrowseSourceEngagement(params: {
  providerKey: string; providerMetadata?: JsonObject; engagementObservedAt: string | null;
}): number | null {
  const canonical = readerPostPromotionEngagementFact(params);
  if (canonical !== null) return canonical.value;
  const metrics = feedProviderMetricsFromMetadata(params);
  const metadata = params.providerMetadata;
  const numeric = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
  switch (metrics?.kind) {
    case "x_post": return metrics.likes === undefined || metrics.reposts === undefined
      ? null : metrics.likes + 2 * metrics.reposts;
    case "reddit_post": return numeric(metadata?.score) ? metrics.score : null;
    case "reddit_comment": case "hacker_news_comment":
      return metrics.scoreConfidence === "provider_reported" ? metrics.score : null;
    case "hacker_news_story": return numeric(metadata?.points) ? metrics.points : null;
    case "github_repository": {
      const stars = metrics.trendingDelta.value;
      const forks = metrics.forkTrendDeltas.find((delta) => delta.window === metrics.trendingDelta.window)?.value;
      return stars === undefined || forks === undefined ? null : Math.max(stars, forks / 2);
    }
    case "github_trending_repository": {
      const trending = metadata?.trending;
      return trending !== null && typeof trending === "object" && !Array.isArray(trending) && numeric((trending as JsonObject).starsGained)
        ? metrics.starsGained : null;
    }
    default: return null;
  }
}
