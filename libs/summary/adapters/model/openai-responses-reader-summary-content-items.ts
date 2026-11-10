import type {
  ReaderSummaryCitation,
  ReaderSummaryInterestSection,
  ReaderSummaryItem,
  ReaderSummaryNextAction,
  ReaderSummaryProviderMetric,
} from "../../domain";
import { nextActionKinds } from "./openai-responses-reader-summary-json-schema";
import {
  nonNegativeNumberOrFallback,
  normalizeSetValue,
  optionalArray,
  optionalString,
  optionalStringArray,
  requiredArray,
  requiredString,
  requiredStringArray,
} from "./openai-responses-reader-summary-parsers";

export const normalizeReaderInterestSection = (
  value: Record<string, unknown>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryInterestSection => ({
  interestId: optionalString(value.interestId),
  title: requiredString(value.title, "reader interest title"),
  insight: requiredString(value.insight, "reader interest insight"),
  items: requiredArray<Record<string, unknown>>(
    value.items,
    "reader interest items",
  ).map((item) => normalizeReaderItem(item, citationById)),
  citationIds: requiredStringArray(value.citationIds, "reader interest citations"),
});

export const normalizeReaderItem = (
  value: Record<string, unknown>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryItem => {
  const citationIds = requiredStringArray(
    value.citationIds,
    "reader item citations",
  );
  const trustedCitation = citationIds
    .map((citationId) => citationById.get(citationId))
    .find(Boolean);
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

export const normalizeNextAction = (
  value: Record<string, unknown>,
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): ReaderSummaryNextAction => {
  const citationIds = requiredStringArray(
    value.citationIds,
    "next action citations",
  );
  const trustedCitation = citationIds
    .map((citationId) => citationById.get(citationId))
    .find(Boolean);

  return {
    kind:
      normalizeSetValue(value.kind, nextActionKinds, "next action kind") ??
      "read_source",
    label: requiredString(value.label, "next action label"),
    reason: requiredString(value.reason, "next action reason"),
    citationIds,
    canonicalUrl: trustedCitation?.canonicalUrl,
  };
};

const normalizeProviderMetric = (
  value: Record<string, unknown>,
): ReaderSummaryProviderMetric => ({
  label: requiredString(value.label, "provider metric label"),
  value: requiredString(value.value, "provider metric value"),
});
