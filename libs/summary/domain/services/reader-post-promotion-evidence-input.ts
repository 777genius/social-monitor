import type { SummaryEvidenceItem, SummarySourceWindow } from "../value-objects/summary-evidence-item";
import type { ReaderPostPromotionInput } from "../policies/reader-post-promotion-policy";
import { buildReaderPostPromotionTitle, hasReaderFacingPromotionSource } from "./reader-post-promotion-title";
import { readerPostPromotionBoundary, readerPostPromotionFreshnessIsValid } from "./reader-post-promotion-freshness";

/** Maps the same evidence facts at producer admission and writer validation. */
export const readerPostPromotionEvidenceInput = (
  item: SummaryEvidenceItem,
  sourceWindow: SummarySourceWindow,
  citationId: string,
  citationValid: boolean,
  clusterId?: string,
): ReaderPostPromotionInput => {
  const periodStart = sourceWindow.periodStartedAt ??
    sourceWindow.startedAt;
  const periodEnd = sourceWindow.periodEndedAt ??
    sourceWindow.endedAt;
  const ingestionCutoff = sourceWindow.ingestionCutoff ?? periodEnd;
  const quality = item.contentQuality;
  const facts = item.promotionFacts;
  return {
    candidateId: item.feedItemId,
    provider: item.providerKey,
    contentKind: facts?.contentKind ?? "unknown",
    canonicalIdentity: facts?.canonicalIdentity ?? "",
    citationId,
    publishedAt: item.publishedAt,
    observedAt: item.observedAt,
    ...(facts?.checkedAt === undefined ? {} : { checkedAt: facts.checkedAt }),
    periodStart,
    periodEnd,
    ingestionCutoff,
    exactPeriodStart: readerPostPromotionBoundary(periodStart),
    exactPeriodEnd: readerPostPromotionBoundary(periodEnd),
    exactPublishedAt: facts?.freshnessProvenance?.status === "observed"
      ? facts.freshnessProvenance.exactPublishedAt
      : undefined,
    exactObservedAt: facts?.freshnessProvenance?.status === "observed"
      ? facts.freshnessProvenance.exactObservedAt
      : undefined,
    exactIngestionCutoff: facts?.freshnessProvenance?.status === "observed"
      ? facts.freshnessProvenance.exactIngestionCutoff
      : undefined,
    freshnessValid: readerPostPromotionFreshnessIsValid({
      facts,
      publishedAt: item.publishedAt,
      observedAt: item.observedAt,
      ingestionCutoff,
    }),
    qualityScore: quality?.qualityScore ?? Number.NaN,
    relevanceScore: quality?.interestRelevanceScore ?? Number.NaN,
    integrityScore: quality?.engagementIntegrityScore ?? Number.NaN,
    qualityValid: hasReaderFacingPromotionSource(item) &&
      quality?.eligibleForSummary === true &&
      quality.eligibleForTopRead === true &&
      quality.needsLlmReview === false &&
      quality.decision !== "downrank" &&
      quality.decision !== "reject",
    safetyValid: facts?.safetyValid === true,
    citationValid,
    ...(facts?.authorityAttestation === undefined
      ? {}
      : { authorityAttestation: facts.authorityAttestation }),
    metricsState: facts?.metricsState ??
      (facts?.metrics === undefined ? "missing" : "observed"),
    ...(facts?.metrics === undefined ? {} : { metrics: facts.metrics }),
    whyImportant: item.whyImportant.find((reason) => reason.trim().length > 0) ??
      buildReaderPostPromotionTitle({ lead: item }),
    clusterId,
  };
};
