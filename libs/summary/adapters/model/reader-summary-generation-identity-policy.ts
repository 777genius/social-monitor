// Preserve the public direct-import surface while separating pure model
// admission from environment-backed backend selection. Neither owner imports this file.
export {
  readerSummaryRouteControls,
  resolveReaderSummaryBackendEffort,
  assertReaderSummaryBackendModel,
  resolveReaderSummaryGenerationIdentity,
  parseActiveReaderSummaryModel,
  parseActiveReaderSummaryReasoningEffort,
  assertActiveReaderSummaryProvider,
} from "./reader-summary-generation-identity-core";
export {
  resolveReaderSummaryReasoningEffortFromEnv,
  resolveReaderSummaryGenerationIdentityFromEnv,
  resolveReaderSummaryDailyTaskIdentityFromEnv,
} from "./reader-summary-generation-env-resolution";
