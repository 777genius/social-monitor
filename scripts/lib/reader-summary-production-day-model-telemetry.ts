import type {
  ReaderSummaryDailyModelTelemetry,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";

type ModelExecutionReport = ReaderSummaryDailyModelTelemetry & Readonly<{
  modelJobIdentity: string;
  receiptSha256: string;
  readerSummaryJobId: string;
  readerSummaryArtifactId: string;
}>;

export const productionDayModelExecutionReport = (input: {
  readonly durableEvidence: unknown;
  readonly readerSummaryJobId: string | null;
  readonly readerSummaryArtifactId: string | null;
}): ModelExecutionReport | null => {
  const evidence = record(input.durableEvidence);
  const provenance = record(evidence?.provenance);
  const daily = record(provenance?.dailySourceAuthority);
  if (daily === null) return null;
  const telemetry = record(daily.modelExecution);
  if (
    telemetry === null || input.readerSummaryJobId === null ||
    input.readerSummaryArtifactId === null ||
    !sha(daily.modelJobIdentity) || !sha(daily.receiptSha256) ||
    !text(telemetry.provider) || !text(telemetry.model) ||
    !text(telemetry.reasoningEffort) ||
    telemetry.usageSource !== "PROVIDER_REPORTED" ||
    !nonNegativeInteger(telemetry.inputTokens) ||
    !nonNegativeInteger(telemetry.outputTokens) ||
    !positiveInteger(telemetry.durationMs)
  ) {
    throw new Error("Daily production report model telemetry is incomplete");
  }
  return Object.freeze({
    provider: telemetry.provider as string,
    model: telemetry.model as string,
    reasoningEffort: telemetry.reasoningEffort as string,
    inputTokens: telemetry.inputTokens as number,
    outputTokens: telemetry.outputTokens as number,
    usageSource: "PROVIDER_REPORTED",
    durationMs: telemetry.durationMs as number,
    modelJobIdentity: daily.modelJobIdentity as string,
    receiptSha256: daily.receiptSha256 as string,
    readerSummaryJobId: input.readerSummaryJobId,
    readerSummaryArtifactId: input.readerSummaryArtifactId,
  });
};

export const productionDayModelExecutionMatches = (
  value: unknown,
  expected: ModelExecutionReport | null,
): boolean => expected === null ? value === null : sameRecord(value, expected);

const sameRecord = (value: unknown, expected: ModelExecutionReport): boolean => {
  const candidate = record(value);
  return candidate !== null && Object.entries(expected).every(
    ([key, expectedValue]) => candidate[key] === expectedValue,
  );
};
const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const sha = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const nonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const positiveInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;
