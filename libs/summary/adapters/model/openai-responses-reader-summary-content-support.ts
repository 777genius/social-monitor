import {
  emptyReaderSummaryReliabilityReport,
  type ReaderSummaryCitation,
  type ReaderSummaryNextAction,
  type ReaderSummaryProviderMetric,
  type ReaderSummaryQualityFlag,
  type ReaderSummaryContent,
  type ReaderSummaryItem,
  type ReaderSummaryInterestSection,
  type ReaderSummarySourceMixEntry,
  type ReaderSummaryTrendDelta,
} from "../../domain";
import { nextActionKinds } from "./openai-responses-reader-summary-json-schema";
import {
  nonNegativeNumberOrFallback,
  normalizeSetValue,
  optionalArray,
  optionalString,
  optionalStringArray,
  requiredArray,
  requiredNumber,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "./openai-responses-reader-summary-parsers";

export { openAiReaderSummaryContentJsonSchemaDefs } from "./openai-responses-reader-summary-json-schema";

const qualityFlags = new Set<ReaderSummaryQualityFlag>([
  "no_signal",
  "low_confidence",
  "conflicting_evidence",
  "limited_sources",
  "partial_evidence",
  "context_unavailable",
  "provider_failed",
]);

const qualityStatuses = new Set<ReaderSummaryContent["qualityState"]["status"]>(
  [
    "ready",
    "partial",
    "limited_sources",
    "low_confidence",
    "no_signal",
    "failed_provider",
  ],
);

export const normalizeOpenAiReaderBrief = (
  value: Record<string, unknown>,
  citationMap: readonly ReaderSummaryCitation[],
): ReaderSummaryContent => {
  const citationById = new Map(
    citationMap.map((citation) => [citation.citationId, citation] as const),
  );
  const sourceMix = requiredArray<Record<string, unknown>>(
    value.sourceMix,
    "reader summary content source mix",
  ).map(normalizeSourceMixEntry);

  return {
    headline: requiredString(value.headline, "reader summary content headline"),
    oneLineTakeaway: requiredString(
      value.oneLineTakeaway,
      "reader summary content takeaway",
    ),
    bullets: requiredStringArray(
      value.bullets,
      "reader summary content bullets",
    ),
    qualityState: normalizeQualityState(value.qualityState, sourceMix),
    interestSections: requiredArray<Record<string, unknown>>(
      value.interestSections,
      "reader summary content interest sections",
    ).map((section) => normalizeReaderInterestSection(section, citationById)),
    sourceMix,
    topReads: requiredArray<Record<string, unknown>>(
      value.topReads,
      "reader summary content top reads",
    ).map((item) => normalizeReaderItem(item, citationById)),
    claimBoard: [],
    reliabilityReport: emptyReaderSummaryReliabilityReport(),
    trendDelta: normalizeTrendDelta(
      requiredRecord(value.trendDelta, "reader summary content trend delta"),
    ),
    openQuestions: requiredStringArray(
      value.openQuestions,
      "reader summary content open questions",
    ),
    risks: requiredStringArray(value.risks, "reader summary content risks"),
    nextActions: requiredArray<Record<string, unknown>>(
      value.nextActions,
      "reader summary content next actions",
    ).map((action) => normalizeNextAction(action, citationById)),
  };
};

const normalizeReaderInterestSection = (
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

const normalizeReaderItem = (
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

const normalizeSourceMixEntry = (
  value: Record<string, unknown>,
): ReaderSummarySourceMixEntry => ({
  providerKey: requiredString(value.providerKey, "source mix provider"),
  itemCount: requiredNumber(value.itemCount, "source mix item count"),
  citationCount: requiredNumber(
    value.citationCount,
    "source mix citation count",
  ),
  storyClusterCount: nonNegativeNumberOrFallback(value.storyClusterCount, 0),
  crossSourceClusterCount: nonNegativeNumberOrFallback(
    value.crossSourceClusterCount,
    0,
  ),
  singleSourceOnly:
    typeof value.singleSourceOnly === "boolean" ? value.singleSourceOnly : true,
  interestIds: optionalStringArray(value.interestIds),
});

const normalizeTrendDelta = (
  value: Record<string, unknown>,
): ReaderSummaryTrendDelta => ({
  newSignals: requiredStringArray(value.newSignals, "trend delta new signals"),
  growingSignals: requiredStringArray(
    value.growingSignals,
    "trend delta growing signals",
  ),
  repeatedSignals: requiredStringArray(
    value.repeatedSignals,
    "trend delta repeated signals",
  ),
  fadingSignals: requiredStringArray(
    value.fadingSignals,
    "trend delta fading signals",
  ),
});

const normalizeNextAction = (
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

const normalizeQualityState = (
  value: unknown,
  sourceMix: readonly ReaderSummarySourceMixEntry[],
): ReaderSummaryContent["qualityState"] => {
  const record =
    value === undefined
      ? undefined
      : requiredRecord(value, "reader summary content quality state");
  const flags = optionalStringArray(record?.flags)
    .map((flag) => normalizeSetValue(flag, qualityFlags, "reader quality flag"))
    .filter((flag): flag is ReaderSummaryQualityFlag => flag !== undefined);
  const isSingleSource =
    typeof record?.isSingleSource === "boolean"
      ? record.isSingleSource
      : sourceMix.length === 1 ||
        sourceMix.every((source) => source.singleSourceOnly);
  const rawStatus = normalizeSetValue(
    record?.status,
    qualityStatuses,
    "reader quality status",
  );
  const status =
    rawStatus === "ready" && isSingleSource
      ? "limited_sources"
      : (rawStatus ?? (isSingleSource ? "limited_sources" : "ready"));
  const normalizedFlags = isSingleSource
    ? uniqueStrings([...flags, "limited_sources"])
    : flags;
  const warnings = optionalStringArray(record?.warnings);

  return {
    status,
    flags: normalizedFlags,
    warnings:
      isSingleSource && warnings.length === 0
        ? [
            "Source coverage needs confirmation from another monitored provider.",
          ]
        : warnings,
    isSingleSource,
  };
};

const uniqueStrings = <T extends string>(
  values: readonly T[],
): readonly T[] => [...new Set(values)];

const normalizeProviderMetric = (
  value: Record<string, unknown>,
): ReaderSummaryProviderMetric => ({
  label: requiredString(value.label, "provider metric label"),
  value: requiredString(value.value, "provider metric value"),
});
