import {
  classifyFeedPromotionEligibility,
  type FeedItem,
  type FeedPromotionEligibility,
  feedPromotionMetricStrength,
} from "@social-monitor/feed/domain";
import type { JsonObject } from "@social-monitor/shared-kernel";

import type {
  RankedRelevanceCandidate,
  RankingCandidate,
} from "../../domain";
import type { ConfiguredInterest } from "../../ports";
import {
  presentSourceContentQuality,
  presentSourceContentSafety,
} from "../shared/relevance-presenter";
import type { RankedFeedItemView } from "./rank-feed-items.result";
import {
  type PromotionTopicScope,
  trustedPromotionTopicContext,
} from "./trusted-promotion-topic-context";


type FeedItemSnapshot = ReturnType<FeedItem["toSnapshot"]>;

export const toRankingCandidate = (
  item: FeedItem,
): RankingCandidate => {
  const snapshot = item.toSnapshot();

  return {
    id: snapshot.id,
    interestId: snapshot.interestId,
    providerKey: snapshot.providerKey,
    canonicalUrl: snapshot.canonicalUrl,
    title: snapshot.title,
    bodyPreview: snapshot.bodyPreview,
    authorHandle: snapshot.authorHandle,
    providerMetadata: snapshot.providerMetadata,
    publishedAt: snapshot.publishedAt,
    sourceSignalScore: providerSignalScore(
      snapshot.providerKey,
      snapshot.providerMetadata,
    ),
  };
};

export const presentRankedFeedItem = (
  item: RankedRelevanceCandidate,
  snapshot: FeedItemSnapshot,
  rank: number,
): RankedFeedItemView => ({
  feedItemId: snapshot.id,
  sourceItemId: snapshot.sourceItemId,
  sourceBindingId: snapshot.sourceBindingId,
  interestId: snapshot.interestId,
  providerKey: snapshot.providerKey,
  canonicalUrl: item.safety.sanitizedCanonicalUrl ?? snapshot.canonicalUrl,
  title: item.safety.sanitizedTitle,
  bodyPreview: item.safety.sanitizedBodyPreview,
  providerMetadata: promotionSafeProviderMetadata(
    snapshot.providerKey,
    snapshot.providerMetadata,
  ),
  authorHandle: snapshot.authorHandle,
  publishedAt: snapshot.publishedAt.toISOString(),
  observedAt: snapshot.observedAt.toISOString(),
  score: item.score,
  rank,
  clusterId: item.clusterId,
  clusterSize: item.clusterSize,
  duplicateFeedItemIds: item.duplicateCandidateIds,
  whyImportant: item.whyImportant,
  safety: presentSourceContentSafety(item.safety),
  contentQuality: presentSourceContentQuality(item.contentQuality),
});

const providerSignalScore = (
  providerKey: string,
  providerMetadata: FeedItemSnapshot["providerMetadata"],
): number => {
  const eligibility = classifyFeedPromotionEligibility({
    providerKey,
    providerMetadata,
  });

  if (!eligibility.eligible) {
    return 0;
  }

  return Math.min(0.85, feedPromotionMetricStrength(eligibility.metrics) / 10);
};

export const promotionSafeProviderMetadata = (
  providerKey: string,
  providerMetadata: FeedItemSnapshot["providerMetadata"],
  scope?: PromotionTopicScope,
  interest?: ConfiguredInterest,
): JsonObject | undefined => {
  const eligibility = classifyFeedPromotionEligibility({
    providerKey,
    providerMetadata,
  });
  if (scope === undefined && !eligibility.eligible) return providerMetadata;
  const native = eligibility.eligible ? canonicalProviderMetadata(eligibility)
    : supplementalProviderMetadata(providerMetadata);
  return {
    ...native,
    ...(scope !== undefined && ["github-repo-radar", "github-trending-page"].includes(providerKey) && providerMetadata?.topics !== undefined
      ? { topics: providerMetadata.topics } : {}),
    ...trustedPromotionTopicContext(
      scope?.providerKey === providerKey ? scope : undefined, interest,
    ),
  };
};

const canonicalProviderMetadata = (
  eligibility: Extract<FeedPromotionEligibility, { readonly eligible: true }>,
): JsonObject => {
  const authority: JsonObject = eligibility.authorityAttestation === undefined
    ? {}
    : { promotionAuthority: {
        official: eligibility.authorityAttestation.official,
        trusted: eligibility.authorityAttestation.trusted,
        attestedBy: eligibility.authorityAttestation.attestedBy,
      } };
  const metrics = eligibility.metrics;
  switch (metrics.kind) {
    case "x_post":
      return { kind: "x_post", contentKind: "original_post",
        likes: metrics.likes ?? 0, reposts: metrics.reposts ?? 0, ...authority };
    case "reddit_post":
      return { kind: "reddit_post", contentKind: "original_post",
        score: metrics.score, ...(metrics.upvoteRatio === undefined
          ? {} : { upvoteRatio: metrics.upvoteRatio }), ...authority };
    case "hacker_news_story":
      return { kind: "hacker_news_story", contentKind: "story",
        points: metrics.points, ...authority };
    case "github_repository": {
      const window = metrics.trendingDelta.window;
      const forks = metrics.forkTrendDeltas.find((delta) =>
        delta.window === window)?.value ?? 0;
      return { kind: "github_repository_trend", contentKind: "repository",
        repository: { forksCount: metrics.forks }, trend: {
          primaryWindow: window, checkedAt: metrics.checkedAt!,
          totalStars: metrics.stars,
          ...(window === "24h"
            ? { stars24h: metrics.trendingDelta.value ?? 0, forks24h: forks }
            : { stars48h: metrics.trendingDelta.value ?? 0, forks48h: forks }),
        }, ...authority };
    }
  }
};

// Supplemental provider fields retain their existing metric/rendering semantics;
// application/acquisition topic slots cannot contribute topical evidence.
const supplementalProviderMetadata = (metadata: JsonObject | undefined): JsonObject => {
  const result = { ...metadata };
  for (const key of ["query", "searchQuery", "topic", "topics", "interestQuerySnapshot",
    "sourceBindingSnapshot", "workspaceScopeSnapshot"]) delete result[key];
  return result;
};
