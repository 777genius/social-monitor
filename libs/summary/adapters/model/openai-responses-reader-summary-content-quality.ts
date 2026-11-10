import type {
  ReaderSummaryContent,
  ReaderSummaryQualityFlag,
  ReaderSummarySourceMixEntry,
  ReaderSummaryTrendDelta,
} from "../../domain";
import {
  nonNegativeNumberOrFallback,
  normalizeSetValue,
  optionalStringArray,
  requiredNumber,
  requiredRecord,
  requiredString,
  requiredStringArray,
} from "./openai-responses-reader-summary-parsers";

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

export const normalizeSourceMixEntry = (
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

export const normalizeTrendDelta = (
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

export const normalizeQualityState = (
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

