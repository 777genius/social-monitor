import type {
  ReaderSummaryCitation,
  ReaderSummaryConfidence,
  ReaderSummaryQualityFlag,
  ReaderSummaryRisk,
} from "../../domain";

export const openAiReaderSummaryQualityFlags = [
  "no_signal",
  "low_confidence",
  "conflicting_evidence",
  "limited_sources",
  "partial_evidence",
  "context_unavailable",
  "provider_failed",
] as const satisfies readonly ReaderSummaryQualityFlag[];

export const openAiReaderSummaryConfidenceLevels = [
  "none",
  "low",
  "medium",
  "high",
] as const satisfies readonly ReaderSummaryConfidence["level"][];

export const openAiReaderSummaryCitationFields = [
  "title",
  "bodyPreview",
  "canonicalUrl",
] as const satisfies readonly ReaderSummaryCitation["field"][];

export const openAiReaderSummaryRiskReasons = [
  "insufficient_evidence",
  "conflicting_evidence",
  "source_limit",
  "provider_outage",
] as const satisfies readonly NonNullable<ReaderSummaryRisk["reason"]>[];
