export const READER_SUMMARY_PRODUCTION_RUNTIME_POLICY = {
  runtimeHealthTimeoutMs: 30_000,
  storyRelationTimeoutMs: 900_000,
  storyRelationMaximumAttempts: 1,
  summaryModelTimeoutMs: 900_000,
  summaryModelMaximumAttempts: 2,
  topicLabelerTimeoutMs: 1_800_000,
  topicRelationTimeoutMs: 300_000,
  topicMapMaximumAttempts: 2,
  assessmentTimeoutMs: 3_600_000,
  captureGraceMs: 60_000,
  captureTimeoutMs: 10_560_000,
  collectionReadinessDelayMs: 3_900_000,
  collectionExecutionGraceMs: 600_000,
  orchestrationGraceMs: 300_000,
  orchestrationTimeoutMs: 15_660_000,
  historicalRecoveryTimeoutMs: 11_760_000,
  lockedOperationTimeoutMs: 11_760_000,
} as const;

export const readerSummaryProductionMinimumCaptureTimeoutMs = (): number =>
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.assessmentTimeoutMs +
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.storyRelationTimeoutMs *
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.storyRelationMaximumAttempts +
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelTimeoutMs *
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.summaryModelMaximumAttempts +
  (READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.topicLabelerTimeoutMs +
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.topicRelationTimeoutMs) *
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.topicMapMaximumAttempts +
  READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.captureGraceMs;

export const readerSummaryProductionMinimumOrchestrationTimeoutMs =
  (): number =>
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.captureTimeoutMs +
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.collectionReadinessDelayMs +
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.collectionExecutionGraceMs +
    READER_SUMMARY_PRODUCTION_RUNTIME_POLICY.orchestrationGraceMs;
