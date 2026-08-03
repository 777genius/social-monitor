import { createHash } from "node:crypto";

export const readerSummaryDailyModelProvider = "codex" as const;
export const readerSummaryDailyModel = "gpt-5.6-sol" as const;
export const readerSummaryDailyReasoningEffort = "xhigh" as const;
export const readerSummaryDailyRuntimeEngine =
  "subscription-runtime-cli" as const;

export type ReaderSummaryDailyModelJobIdentity = Readonly<{
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
  sourceAuthoritySha256: string;
  provider: typeof readerSummaryDailyModelProvider;
  model: typeof readerSummaryDailyModel;
  reasoningEffort: typeof readerSummaryDailyReasoningEffort;
  runtimeEngine: typeof readerSummaryDailyRuntimeEngine;
  value: string;
}>;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const utcDatePattern = /^\d{4}-\d{2}-\d{2}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;

export const readerSummaryDailyModelJobIdentity = (input: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly requestedUtcDate: string;
  readonly sourceAuthoritySha256: string;
}): ReaderSummaryDailyModelJobIdentity => {
  assertUuid(input.tenantId, "tenantId");
  assertUuid(input.workspaceId, "workspaceId");
  assertUtcDate(input.requestedUtcDate);
  if (!sha256Pattern.test(input.sourceAuthoritySha256)) {
    throw new Error("Daily model job source authority SHA-256 is invalid");
  }
  const identityPreimage = [
    "reader-summary-daily:v1",
    input.tenantId,
    input.workspaceId,
    input.requestedUtcDate,
    input.sourceAuthoritySha256,
    readerSummaryDailyModelProvider,
    readerSummaryDailyModel,
    readerSummaryDailyReasoningEffort,
  ].join("|");
  return Object.freeze({
    ...input,
    provider: readerSummaryDailyModelProvider,
    model: readerSummaryDailyModel,
    reasoningEffort: readerSummaryDailyReasoningEffort,
    runtimeEngine: readerSummaryDailyRuntimeEngine,
    value: createHash("sha256").update(identityPreimage, "utf8").digest("hex"),
  });
};

const assertUuid = (value: string, label: string): void => {
  if (!uuidPattern.test(value)) {
    throw new Error(`Daily model job ${label} is not a canonical UUID`);
  }
};

const assertUtcDate = (value: string): void => {
  if (!utcDatePattern.test(value)) {
    throw new Error("Daily model job requested UTC date is invalid");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Daily model job requested UTC date is invalid");
  }
};
