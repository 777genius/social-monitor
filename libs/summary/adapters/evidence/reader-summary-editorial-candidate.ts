import type {
  ReaderPromotionV2Candidate,
  ReaderPromotionV2Engagement,
  ReaderPromotionV2ObservedMetrics,
  ReaderPromotionV2Provider,
} from "@social-monitor/feed/domain";

import {
  readerPostProviderFamily,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
} from "../../domain";
import { hasReaderFacingPromotionTitle } from
  "../../domain/services/reader-post-promotion-title";

export const readerSummaryPromotionV2Candidate = (
  item: SummaryEvidenceItem,
  selection: SummaryEvidenceSelection,
): ReaderPromotionV2Candidate | undefined => {
  const providerFamily = readerPostProviderFamily(item.providerKey);
  const facts = item.promotionFacts;
  if (providerFamily === undefined || facts === undefined) return undefined;
  const provider: ReaderPromotionV2Provider = providerFamily === "github_radar"
    ? "github"
    : providerFamily;
  const quality = item.contentQuality;
  return {
    candidateId: item.feedItemId,
    canonicalIdentity: facts.canonicalIdentity,
    provider,
    contentKind: admittedContentKind(facts.contentKind, provider),
    publishedAt: canonicalTimestamp(item.publishedAt),
    admission: {
      relevanceFloorMet: quality?.eligibleForSummary === true,
      qualityFloorMet: quality?.eligibleForTopRead === true &&
        quality.needsLlmReview === false &&
        quality.decision !== "downrank" &&
        quality.decision !== "reject" &&
        hasReaderFacingPromotionTitle(item),
      integrityFloorMet: quality?.engagementIntegrityScore !== undefined,
      safetyFloorMet: facts.safetyValid,
      freshnessFloorMet: validFreshness(item, selection),
    },
    engagement: promotionEngagement(item),
    relevanceScore: quality?.interestRelevanceScore ?? Number.NaN,
    evidenceQualityScore: quality?.qualityScore ?? Number.NaN,
    integrityScore: quality?.engagementIntegrityScore ?? Number.NaN,
    freshnessScore: freshnessScore(item, selection),
  };
};

export const isEligibleReaderSummarySameStorySupport = (
  item: SummaryEvidenceItem,
  selection: SummaryEvidenceSelection,
): boolean => {
  const quality = item.contentQuality;
  return readerPostProviderFamily(item.providerKey) !== undefined &&
    item.promotionFacts !== undefined &&
    item.promotionFacts.safetyValid &&
    validFreshness(item, selection) &&
    quality?.eligibleForSummary === true &&
    quality.eligibleForTopRead &&
    !quality.needsLlmReview &&
    quality.decision !== "downrank" &&
    quality.decision !== "reject" &&
    hasReaderFacingPromotionTitle(item);
};

const promotionEngagement = (
  item: SummaryEvidenceItem,
): ReaderPromotionV2Engagement => {
  const facts = item.promotionFacts;
  const state = facts?.metricsState ??
    (facts?.metrics === undefined ? "missing" : "observed");
  if (state !== "observed" || facts?.metrics === undefined) {
    return { state: state === "observed" ? "missing" : state };
  }
  const metrics = observedMetrics(facts.metrics);
  if (metrics === undefined) return { state: "malformed" };
  return { state: "observed", authoritative: true, metrics };
};

const observedMetrics = (
  metrics: NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"],
): ReaderPromotionV2ObservedMetrics | undefined => {
  if (metrics === undefined) return undefined;
  switch (metrics.provider) {
    case "x":
      return {
        provider: "x",
        likes: metrics.likes,
        reposts: metrics.reposts,
        reportedSignal: metrics.weightedScore,
      };
    case "reddit":
      return {
        provider: "reddit",
        score: metrics.score,
        upvoteRatio: metrics.upvoteRatio,
      };
    case "hacker_news":
      return { provider: "hacker_news", points: metrics.points };
    case "github_radar":
      return isTwentyFourHourWindow(metrics)
        ? {
            provider: "github",
            window: "24h",
            starsDelta: metrics.starsDelta,
            forksDelta: metrics.forksDelta,
          }
        : undefined;
  }
};

const admittedContentKind = (
  kind: NonNullable<SummaryEvidenceItem["promotionFacts"]>["contentKind"],
  provider: ReaderPromotionV2Provider,
): ReaderPromotionV2Candidate["contentKind"] => {
  if (kind === "original_post" || kind === "story" || kind === "repository") {
    return kind;
  }
  return provider === "x" || provider === "reddit"
    ? "story"
    : "original_post";
};

const validFreshness = (
  item: SummaryEvidenceItem,
  selection: SummaryEvidenceSelection,
): boolean => {
  const facts = item.promotionFacts;
  const provenance = facts?.freshnessProvenance;
  const cutoff = selection.sourceWindow.ingestionCutoff ??
    selection.sourceWindow.endedAt;
  return facts?.freshnessValid === true &&
    provenance?.status === "observed" &&
    provenance.publishedAt.getTime() === item.publishedAt.getTime() &&
    provenance.observedAt.getTime() === item.observedAt.getTime() &&
    provenance.ingestionCutoff.getTime() === cutoff.getTime() &&
    item.publishedAt.getTime() <= item.observedAt.getTime() &&
    item.observedAt.getTime() <= cutoff.getTime();
};

const freshnessScore = (
  item: SummaryEvidenceItem,
  selection: SummaryEvidenceSelection,
): number => {
  const start = (selection.sourceWindow.periodStartedAt ??
    selection.sourceWindow.startedAt).getTime();
  const end = (selection.sourceWindow.periodEndedAt ??
    selection.sourceWindow.endedAt).getTime();
  const duration = end - start;
  return duration <= 0 || !Number.isFinite(item.publishedAt.getTime())
    ? Number.NaN
    : Math.max(0, Math.min(1, (item.publishedAt.getTime() - start) / duration));
};

const isTwentyFourHourWindow = (
  metrics: Extract<
    NonNullable<NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"]>,
    { readonly provider: "github_radar" }
  >,
): boolean =>
  metrics.windowEndedAt.getTime() - metrics.windowStartedAt.getTime() ===
    24 * 60 * 60 * 1_000;

const canonicalTimestamp = (value: Date): string => {
  try {
    return value.toISOString();
  } catch {
    return "";
  }
};
