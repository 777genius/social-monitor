import {
  classifyFeedPromotionEligibility, evaluateReaderPromotionV2,
  type ReaderPromotionV2ObservedMetrics,
} from "@social-monitor/feed/domain";
import type { SourceContentQualityFlag } from "../../domain";
import { hasHardBlocker } from "../../domain/source-content-quality-verdict";
import type { RankedFeedItemView } from "./rank-feed-items.result";

// Reuse V2's native floors/authority/cutoff rules. Optimistic content scores
// select work only; they are never exposed as evidence or used for admission.
export const canCompeteForPromotionAssessment = (
  item: RankedFeedItemView, cutoff: string,
): boolean => {
  const flags = item.contentQuality.flags;
  if (hasHardBlocker(flags as readonly SourceContentQualityFlag[]) || flags.some((flag) =>
    ["engagement_bait", "generic_question", "prediction_market_rumor",
      "speculative_financial_challenge"].includes(flag))) return false;
  const canonical = classifyFeedPromotionEligibility(item);
  if (!canonical.eligible) return false;
  const native = canonical.metrics;
  let metrics: ReaderPromotionV2ObservedMetrics;
  switch (native.kind) {
    case "x_post": metrics = { provider: "x", likes: native.likes!,
      reposts: native.reposts! }; break;
    case "reddit_post": metrics = { provider: "reddit", score: native.score,
      upvoteRatio: native.upvoteRatio }; break;
    case "hacker_news_story": metrics = { provider: "hacker_news", points: native.points }; break;
    default: return false;
  }
  const observed = Date.parse(item.observedAt);
  const published = Date.parse(item.publishedAt);
  return evaluateReaderPromotionV2({
    candidateId: item.feedItemId, canonicalIdentity: item.canonicalUrl,
    provider: metrics.provider, contentKind: canonical.contentKind,
    publishedAt: item.publishedAt, engagementCutoffAt: cutoff,
    admission: { relevanceFloorMet: true, qualityFloorMet: true, integrityFloorMet: true,
      safetyFloorMet: item.safety.status !== "blocked",
      freshnessFloorMet: published <= observed && observed <= Date.parse(cutoff) },
    engagement: { state: "observed", authoritative: item.engagementAuthority !== undefined,
      ...(item.engagementAuthority === undefined ? {} : { authority: {
        source: "durable_projection", ...item.engagementAuthority,
      } }), metrics },
    relevanceScore: 1, evidenceQualityScore: 1, integrityScore: 1, freshnessScore: 1,
  }).admitted;
};
