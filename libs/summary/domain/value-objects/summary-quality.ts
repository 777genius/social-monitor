export type ReaderSummaryQualityFlag =
  | "no_signal"
  | "low_confidence"
  | "conflicting_evidence"
  | "limited_sources"
  | "partial_evidence"
  | "context_unavailable"
  | "provider_failed";

export type ReaderSummaryQualityStatus =
  | "ready"
  | "partial"
  | "limited_sources"
  | "low_confidence"
  | "no_signal"
  | "failed_provider";

export type ReaderSummaryQualityState = {
  readonly status: ReaderSummaryQualityStatus;
  readonly flags: readonly ReaderSummaryQualityFlag[];
  readonly warnings: readonly string[];
  readonly isSingleSource: boolean;
};
