import { classifyFeedPromotionEligibility } from "@social-monitor/feed/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";

import {
  canonicalReaderSummaryPreparationTimestamp,
  readerPromotionSourceForProviderKey,
  type ReaderPostPromotionEngagement,
} from "../../domain";

/**
 * Engagement fact of one frozen candidate.
 *
 * The value comes from the provider metadata frozen in the preparation
 * manifest, with the same signal methods as `reader_promotion_policy.v2`:
 * X likes + 2 * reposts, Reddit score, HN points, GitHub
 * max(starsDelta, forksDelta / 2). `observedAt` is the frozen
 * `engagementObservedAt`: the engagement snapshot time, or the feed item
 * observation time as a lower bound when no snapshot exists. Anything missing,
 * unobserved or malformed is `null` (unknown); unranked sources never get a
 * value. Shared by promotion and both publication guards.
 */
export const readerPostPromotionEngagementFact = (params: {
  readonly providerKey: string;
  readonly providerMetadata?: JsonObject;
  readonly engagementObservedAt: string | null;
}): ReaderPostPromotionEngagement | null => {
  const source = readerPromotionSourceForProviderKey(params.providerKey);
  if (source?.engagementClass !== "ranked" || params.engagementObservedAt === null) {
    return null;
  }
  let observedAt: string;
  try {
    observedAt = canonicalReaderSummaryPreparationTimestamp(params.engagementObservedAt);
  } catch {
    return null;
  }
  const eligibility = classifyFeedPromotionEligibility(params);
  if (!eligibility.eligible) return null;
  const metrics = eligibility.metrics;
  const signal = ((): Omit<ReaderPostPromotionEngagement, "observedAt"> | null => {
    switch (metrics.kind) {
      case "x_post":
        return metrics.likes === undefined || metrics.reposts === undefined ? null
          : { method: "likes_plus_two_reposts", value: metrics.likes + 2 * metrics.reposts };
      case "reddit_post":
        return { method: "reddit_score", value: metrics.score };
      case "hacker_news_story":
        return { method: "hacker_news_points", value: metrics.points };
      case "github_repository": {
        const window = metrics.trendingDelta.window;
        const stars = metrics.trendingDelta.value;
        const forks = metrics.forkTrendDeltas.find((delta) => delta.window === window)?.value;
        return stars === undefined || forks === undefined ? null
          : { method: "max_stars_or_half_forks", value: Math.max(stars, forks / 2) };
      }
    }
  })();
  return signal === null || !Number.isFinite(signal.value) || signal.value < 0
    ? null : Object.freeze({ ...signal, observedAt });
};
