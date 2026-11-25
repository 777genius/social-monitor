import type {
  ReaderSummaryCitation,
  ReaderSummaryConfidence,
  ReaderSummaryQualityFlag,
  ReaderSummaryRisk,
} from "../../domain";
import {
  openAiReaderSummaryConfidenceLevels,
  openAiReaderSummaryQualityFlags,
  openAiReaderSummaryRiskReasons,
} from "./openai-responses-reader-summary-contract";
import {
  knownStringSubset,
  normalizeStringArrayLike,
  normalizeSetValue,
  optionalString,
  requiredOptionalStringArray,
} from "./openai-responses-reader-summary-json";

const qualityFlags = new Set<ReaderSummaryQualityFlag>(
  openAiReaderSummaryQualityFlags,
);
const confidenceLevels = new Set<ReaderSummaryConfidence["level"]>(
  openAiReaderSummaryConfidenceLevels,
);
const riskReasons = new Set<NonNullable<ReaderSummaryRisk["reason"]>>(
  openAiReaderSummaryRiskReasons,
);

const normalizeRisk = (value: Record<string, unknown>): ReaderSummaryRisk => ({
  description:
    optionalString(value.description ?? value.risk) ??
    "Selected evidence has unresolved uncertainty.",
  citationIds: normalizeStringArrayLike(
    value.citationIds ?? value.citations,
    "risk citations",
  ),
  reason: normalizeSetValue(value.reason, riskReasons, "risk reason"),
});

export const normalizeRisks = (
  values: readonly Record<string, unknown>[],
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryRisk[] => {
  const knownCitationIds = new Set(
    citationMap.map((citation) => citation.citationId),
  );

  return values.map((value) => {
    const risk = normalizeRisk(value);
    return {
      ...risk,
      citationIds:
        risk.citationIds === undefined
          ? undefined
          : knownStringSubset(risk.citationIds, knownCitationIds),
    };
  });
};

export const normalizeConfidence = (
  value: Record<string, unknown>,
  topStoryCount: number,
): ReaderSummaryConfidence => {
  const level =
    normalizeSetValue(value.level, confidenceLevels, "confidence level") ??
    (topStoryCount > 0 ? "low" : "none");
  const score =
    typeof value.score === "number" && Number.isFinite(value.score)
      ? value.score
      : topStoryCount > 0
        ? 0.55
        : 0;

  return {
    level: topStoryCount > 0 && level === "none" ? "low" : level,
    score,
    rationale:
      optionalString(value.rationale) ??
      "Confidence inferred from cited reader summary evidence.",
  };
};

export const normalizeQualityFlags = (
  value: unknown,
): readonly ReaderSummaryQualityFlag[] =>
  requiredOptionalStringArray(value, "quality flags")
    .map((flag) => normalizeSetValue(flag, qualityFlags, "quality flag"))
    .filter((flag): flag is ReaderSummaryQualityFlag => flag !== undefined);
