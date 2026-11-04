import { feedProviderMetricsFromMetadata } from "@social-monitor/feed/domain";
import { buildSourceEngagementMetrics } from "@social-monitor/ingestion/domain";
import type { JsonObject, JsonValue } from "@social-monitor/shared-kernel";
import { readerPostPromotionEngagementFact } from "./reader-post-promotion-engagement-facts";
import { readerPromotionSourceForProviderKey } from "../../domain/policies/reader-promotion-source-registry";

/** Manual Likes display/order uses genuine X likes, independently of weighted engagement. */
export function readerBrowseSourceLikeCount(params: {
  providerKey: string; providerMetadata?: JsonObject;
}): number | null | undefined {
  if (readerPromotionSourceForProviderKey(params.providerKey)?.family !== "x") return undefined;
  const result = buildSourceEngagementMetrics({ providerKey: "x-twitter", metadata: xLikeAliases(params.providerMetadata) });
  return result.qualityFlags.invalidMetricValue || result.qualityFlags.conflictingAliases
    ? null : result.metrics?.likes ?? null;
}

/** Project only the documented native X like aliases; the shared parser still owns all validation. */
const xLikeAliases = (metadata: JsonObject = {}): JsonObject => {
  const projected: Record<string, JsonValue> = {};
  for (const key of ["kind", "likes"]) if (Object.hasOwn(metadata, key)) projected[key] = metadata[key]!;
  for (const [container, aliases] of [
    ["publicMetrics", ["like_count", "likeCount"]],
    ["public_metrics", ["like_count"]],
    ["metrics", ["likes"]],
  ] as const) {
    const values = metadata[container];
    if (values !== null && typeof values === "object" && !Array.isArray(values)) {
      const object = values as JsonObject;
      projected[container] = Object.fromEntries(aliases.filter(key => Object.hasOwn(object, key))
        .map(key => [key, object[key]!]));
    }
  }
  return projected;
};

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
