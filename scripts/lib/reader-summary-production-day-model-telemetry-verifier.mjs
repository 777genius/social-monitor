export function validateDailyModelExecution(
  value,
  evidence,
  frontend,
  binding,
  _reportContract = "current",
  executionMode = "live-production",
) {
  const daily = evidence?.provenance?.dailySourceAuthority;
  if (daily === undefined) {
    if (value !== null && value !== undefined) {
      fail("non-daily report contains daily model telemetry");
    }
    return;
  }
  assertObject(value, "report.model.modelExecution");
  assertObject(daily.modelExecution, "daily model execution");
  const expected = {
    ...daily.modelExecution,
    modelJobIdentity: daily.modelJobIdentity,
    receiptSha256: daily.receiptSha256,
    readerSummaryJobId: binding.readerSummaryJobId,
    readerSummaryArtifactId: binding.readerSummaryId,
  };
  const artifactUsage = frontend?.readerSummaryArtifact?.usage;
  const runtime = binding.runtimeProvenance;
  const historicalIncomplete =
    value.usageSource === "HISTORICAL_INCOMPLETE" &&
    value.inputTokens === null && value.outputTokens === null &&
    value.totalTokens === null && value.durationMs === null;
  const providerReported =
    value.usageSource === "PROVIDER_REPORTED" &&
    nonNegativeInteger(value.inputTokens) &&
    nonNegativeInteger(value.outputTokens) &&
    nonNegativeInteger(value.totalTokens) &&
    value.totalTokens === value.inputTokens + value.outputTokens &&
    Number.isSafeInteger(value.durationMs) && value.durationMs >= 1;
  const historicalExecution =
    executionMode === "historical-regeneration" ||
    executionMode === "historical-reuse";
  if (
    stableJson(value) !== stableJson(expected) ||
    (!providerReported && !(historicalExecution && historicalIncomplete)) ||
    !nonEmptyText(value.provider) || !nonEmptyText(value.model) ||
    !nonEmptyText(value.reasoningEffort) ||
    !isSha256(value.modelJobIdentity) || !isSha256(value.receiptSha256) ||
    (executionMode === "live-production" &&
      (value.provider !== "codex" || value.model !== "gpt-5.6-sol" ||
        value.reasoningEffort !== "high")) ||
    value.provider !== runtime.provider ||
    value.model !== runtime.physicalModel ||
    value.reasoningEffort !== runtime.reasoningEffort ||
    artifactUsage?.inputTokens !== value.inputTokens ||
    artifactUsage?.outputTokens !== value.outputTokens
  ) {
    fail("daily model telemetry is incomplete or not artifact-bound");
  }
}

const assertObject = (value, label) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
};
const nonNegativeInteger = (value) =>
  Number.isSafeInteger(value) && value >= 0;
const nonEmptyText = (value) =>
  typeof value === "string" && value.length > 0;
const isSha256 = (value) =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const stableJson = (value) => JSON.stringify(sortDeep(value));
const sortDeep = (value) => Array.isArray(value)
  ? value.map(sortDeep)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)).map(([key, item]) => [key, sortDeep(item)]))
    : value;
const fail = (message) => {
  throw new Error(message);
};
