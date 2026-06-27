export const briefingQualityFlags = [
  "no_signal",
  "low_confidence",
  "conflicting_evidence",
  "limited_sources",
  "partial_evidence",
  "context_unavailable",
  "provider_failed",
] as const;

export const briefingCitationFields = ["title", "bodyPreview", "canonicalUrl"] as const;
export const briefingConfidenceLevels = ["none", "low", "medium", "high"] as const;
export const briefingRiskReasons = [
  "insufficient_evidence",
  "conflicting_evidence",
  "source_limit",
  "provider_outage",
] as const;
export const briefingNextActionKinds = [
  "read_source",
  "watch_repository",
  "monitor_topic",
  "compare_sources",
  "ignore_low_confidence",
  "add_topic_rule",
  "request_deeper_scan",
  "mark_relevant",
  "mark_not_relevant",
] as const;
export const briefingReaderPrimaryActionKinds = [
  "read_source",
  "watch_repository",
] as const;
export const briefingReaderQualityStatuses = [
  "ready",
  "partial",
  "limited_sources",
  "low_confidence",
  "no_signal",
  "failed_provider",
] as const;
