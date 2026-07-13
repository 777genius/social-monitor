import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { isReaderSummaryEvidenceEligible } from "./reader-summary-evidence-eligibility-policy";
import { isFirstPartyOfficialQuality } from "./reader-summary-source-authority-policy";
import { isTopReadEligibleEvidence } from "./top-read-eligibility-policy";

const weakWatchFlags = new Set([
  "engagement_bait",
  "generic_question",
  "missing_topic_context",
  "truncated",
  "truncated_source",
  "weak_interest_match",
]);

export const isReaderSummaryWatchEligibleEvidence = (params: {
  readonly evidence: SummaryEvidenceItem;
  readonly crossProviderSupported: boolean;
}): boolean => {
  const { evidence } = params;
  const quality = evidence.contentQuality;
  const firstParty = isFirstPartyOfficialQuality(quality);
  const text = [evidence.title, evidence.sourceText ?? evidence.bodyPreview]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  const selfContained =
    (firstParty || text.length >= 80) &&
    !/(?:\.{3}|…|\b(?:read more|continued)\s*)$/iu.test(text) &&
    !(quality?.flags ?? []).some((flag) =>
      weakWatchFlags.has(flag.toLocaleLowerCase("en-US")),
    );
  const strongSignal =
    ((evidence.providerMetricLabels?.length ?? 0) > 0 &&
      isTopReadEligibleEvidence(evidence)) ||
    firstParty ||
    params.crossProviderSupported;

  return (
    isReaderSummaryEvidenceEligible(evidence) &&
    quality?.needsLlmReview !== true &&
    quality?.decision !== "downrank" &&
    (quality?.qualityScore ?? 0.6) >= 0.55 &&
    (quality?.interestRelevanceScore ?? 1) >= 0.55 &&
    (quality?.engagementIntegrityScore ?? 1) >= 0.5 &&
    selfContained &&
    strongSignal
  );
};
