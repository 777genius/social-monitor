import type { ReaderSummaryCitation, ReaderSummaryItem, ReaderSummaryProviderMetric } from "../../domain";
import { nonNegativeNumberOrFallback, optionalArray, optionalString, optionalStringArray, requiredString, requiredStringArray } from "./openai-responses-reader-summary-parsers";
import { findTrustedReaderCitation } from "./openai-responses-reader-summary-citation-binding";

export const normalizeReaderItem = (
  value: Record<string, unknown>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryItem => {
  const citationIds = requiredStringArray(
    value.citationIds,
    "reader item citations",
  );
  const trustedCitation = findTrustedReaderCitation(citationIds, citationById);
  const providerKey =
    trustedCitation?.providerKey ??
    requiredString(value.providerKey, "reader item provider");
  const reason = requiredString(value.reason, "reader item reason");
  const signalScore = nonNegativeNumberOrFallback(value.signalScore, 0);

  return {
    title: requiredString(value.title, "reader item title"),
    providerKey,
    providerName: providerKey,
    primaryActionKind: "read_source",
    reason,
    matchedInterestIds:
      optionalStringArray(value.matchedInterestIds).length > 0
        ? optionalStringArray(value.matchedInterestIds)
        : ["unknown-interest"],
    matchedRules:
      optionalStringArray(value.matchedRules).length > 0
        ? optionalStringArray(value.matchedRules)
        : [`provider:${providerKey}`],
    signalScore,
    confidence: {
      level: signalScore >= 1 ? "medium" : "low",
      score: signalScore >= 1 ? 0.5 : 0.35,
      rationale:
        "Model-provided reader item normalized without story clustering evidence.",
    },
    confirmedProviderKeys: [providerKey],
    providerMetrics: optionalArray<Record<string, unknown>>(
      value.providerMetrics,
    ).map(normalizeProviderMetric),
    whyImportant:
      optionalStringArray(value.whyImportant).length > 0
        ? optionalStringArray(value.whyImportant)
        : [reason],
    whyNow:
      optionalString(value.whyNow) ?? "Selected in the current summary window.",
    canonicalUrl: trustedCitation?.canonicalUrl,
    citationIds,
  };
};

const normalizeProviderMetric = (
  value: Record<string, unknown>,
): ReaderSummaryProviderMetric => ({
  label: requiredString(value.label, "provider metric label"),
  value: requiredString(value.value, "provider metric value"),
});
