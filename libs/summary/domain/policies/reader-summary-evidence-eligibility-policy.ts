import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

const readerSummaryEvidenceHardBlockQualityFlags = new Set([
  "crypto_promo",
  "engagement_bait",
  "generic_question",
  "media_only_without_context",
  "needs_link_context",
  "personal_medical_anecdote",
  "prediction_market_rumor",
  "promo_offer",
  "rumor_only",
  "speculative_financial_challenge",
  "tco_only",
  "url_only",
  "weak_interest_match",
  "weak_topic_match",
]);

export const hasReaderSummaryEvidenceHardBlock = (
  flags: readonly string[],
): boolean =>
  flags.some((flag) => readerSummaryEvidenceHardBlockQualityFlags.has(flag));

export const isReaderSummaryEvidenceEligible = (
  evidence: SummaryEvidenceItem,
): boolean => {
  const quality = evidence.contentQuality;

  return (
    quality?.eligibleForSummary !== false &&
    !hasReaderSummaryEvidenceHardBlock(quality?.flags ?? [])
  );
};
