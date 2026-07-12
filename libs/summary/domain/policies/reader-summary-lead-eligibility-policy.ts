import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { isReaderSummaryEvidenceEligible } from "./reader-summary-evidence-eligibility-policy";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

export const isReaderSummaryLeadEligibleEvidence = (
  evidence: SummaryEvidenceItem,
): boolean => {
  const quality = evidence.contentQuality;

  return (
    isReaderSummaryEvidenceEligible(evidence) &&
    isTopReadEligibleEvidence(evidence) &&
    quality?.needsLlmReview !== true &&
    quality?.decision !== "downrank" &&
    (quality?.interestRelevanceScore ?? 1) >= 0.5 &&
    (quality?.engagementIntegrityScore ?? 1) >= 0.5
  );
};
