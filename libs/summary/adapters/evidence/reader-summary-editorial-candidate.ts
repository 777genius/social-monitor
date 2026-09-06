import {
  evaluateReaderPromotionV2,
} from "@social-monitor/feed/domain";
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
import { hasReaderFacingPromotionSource } from
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
    engagementCutoffAt: canonicalTimestamp(promotionCutoff(selection)),
    admission: {
      relevanceFloorMet: quality?.eligibleForSummary === true,
      qualityFloorMet: quality?.eligibleForTopRead === true &&
        quality.needsLlmReview === false &&
        quality.decision !== "downrank" &&
        quality.decision !== "reject" &&
        hasReaderFacingPromotionSource(item),
      integrityFloorMet: quality?.engagementIntegrityScore !== undefined,
      safetyFloorMet: facts.safetyValid,
      freshnessFloorMet: validFreshness(item, selection),
    },
    engagement: promotionEngagement(item, provider),
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
  const candidate = readerSummaryPromotionV2Candidate(item, selection);
  return candidate !== undefined && evaluateReaderPromotionV2(candidate).admitted;
};

const promotionEngagement = (
  item: SummaryEvidenceItem,
  provider: ReaderPromotionV2Provider,
): ReaderPromotionV2Engagement => {
  const facts = item.promotionFacts;
  const state = facts?.metricsState ??
    (facts?.metrics === undefined ? "missing" : "observed");
  if (state !== "observed" || facts?.metrics === undefined) {
    return { state: state === "observed" ? "missing" : state };
  }
  const metrics = observedMetrics(facts.metrics);
  if (metrics === undefined) return { state: "malformed" };
  const authority = provider === "github"
    ? facts.checkedAt === undefined
      ? undefined
      : {
          source: "github_checked_at" as const,
          observedAt: canonicalTimestamp(facts.checkedAt),
          regressionState: "stable" as const,
        }
    : facts.engagementAuthority === undefined
      ? undefined
      : {
          source: "durable_projection" as const,
          observedAt: canonicalTimestamp(
            facts.engagementAuthority.observedAt,
          ),
          regressionState: facts.engagementAuthority.regressionState,
        };
  return {
    state: "observed",
    authoritative: authority !== undefined,
    ...(authority === undefined ? {} : { authority }),
    metrics,
  };
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
            checkedAt: canonicalTimestamp(metrics.windowEndedAt),
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
  const cutoff = promotionCutoff(selection);
  return facts?.freshnessValid === true &&
    provenance?.status === "observed" &&
    provenance.publishedAt.getTime() === item.publishedAt.getTime() &&
    provenance.observedAt.getTime() === item.observedAt.getTime() &&
    provenance.ingestionCutoff.getTime() === cutoff.getTime() &&
    item.publishedAt.getTime() <= item.observedAt.getTime() &&
    item.observedAt.getTime() <= cutoff.getTime();
};

const promotionCutoff = (
  selection: SummaryEvidenceSelection,
): Date => selection.sourceWindow.ingestionCutoff ??
  selection.sourceWindow.endedAt;

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
