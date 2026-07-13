export const READER_SUMMARY_PRODUCTION_RUNTIME_POLICY = {
  storyRelationTimeoutMs: 900_000,
  summaryModelTimeoutMs: 900_000,
  topicLabelerTimeoutMs: 1_800_000,
  topicRelationTimeoutMs: 300_000,
  captureGraceMs: 60_000,
  captureTimeoutMs: 3_960_000,
  orchestrationGraceMs: 120_000,
  orchestrationTimeoutMs: 4_080_000,
} as const;

export const readerSummaryProductionMinimumCaptureTimeoutMs = (): number =>
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.storyRelationTimeoutMs +
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelTimeoutMs +
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.topicLabelerTimeoutMs +
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.topicRelationTimeoutMs +
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.captureGraceMs;

export const readerSummaryProductionMinimumOrchestrationTimeoutMs =
  (): number =>
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.captureTimeoutMs +
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.orchestrationGraceMs;
