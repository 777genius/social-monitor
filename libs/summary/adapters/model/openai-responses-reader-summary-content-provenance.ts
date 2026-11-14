import type {
  ReaderSummarySourceMixEntry,
  ReaderSummaryTrendDelta,
} from "../../domain";
import {
  nonNegativeNumberOrFallback,
  optionalStringArray,
  requiredNumber,
  requiredString,
  requiredStringArray,
} from "./openai-responses-reader-summary-parsers";

// Raw provider source counters and trend windows are decoded independently
// from editorial quality policy. Missing required fields continue to fail closed.
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

