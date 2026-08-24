import { createHash } from "node:crypto";

import {
  readerSummaryDailyModel,
  readerSummaryDailyModelProvider,
  readerSummaryDailyReasoningEffort,
  readerSummaryDailyRuntimeEngine,
  type ReaderSummaryDailyModelJobIdentity,
} from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";
import type {
  AgentRuntimeProvider,
} from "@social-monitor/summary/ports/agent-runtime-client.port";
import type {
  ReaderSummaryDailyModelTelemetry,
} from "@social-monitor/summary/ports/reader-summary-daily-execution-cursor.port";

export type ReaderSummaryDailyRuntimeAttestation = Readonly<{
  schemaVersion: 1;
  requestId: string;
  purpose: string;
  canonicalRequestSha256: string;
  provider: AgentRuntimeProvider;
  model: string;
  reasoningEffort: string;
  runtimeEngine: typeof readerSummaryDailyRuntimeEngine;
  runtimePackageVersion: string;
  launcherSha256: string;
  selectedOutputKind: "structured_output" | "output_text";
  selectedOutputSha256: string;
}>;

export type ReaderSummaryDailyModelJobReceipt = Readonly<{
  responseBytes: Buffer;
  responseSha256: string;
  attestation: ReaderSummaryDailyRuntimeAttestation;
  attestationBytes: Buffer;
  attestationSha256: string;
  receiptBytes: Buffer;
  receiptSha256: string;
  modelTelemetry: ReaderSummaryDailyModelTelemetry;
}>;

/**
 * V4 records the provider-selected raw output only as metadata. The raw bytes
 * are intentionally absent from this durable type: responseBytes is always the
 * server-canonical payload that may be replayed or published.
 */
export type ReaderSummaryDailyCanonicalRecoveryReceipt =
  Omit<ReaderSummaryDailyModelJobReceipt, "modelTelemetry"> & Readonly<{
    canonicalOutputSha256: string;
    canonicalOutputByteLength: number;
    rawOutputSha256: string;
    rawOutputByteLength: number;
  }>;

/** Creates the exact, byte-addressable receipt for the V4 output_text route. */
export const buildReaderSummaryDailyCanonicalRecoveryReceipt = (input: {
  readonly modelJobIdentity: string;
  readonly requestedUtcDate: string;
  readonly sourceAuthoritySha256: string;
  /** Canonical server bytes only; never the selected provider bytes. */
  readonly responseBytes: Buffer;
  readonly rawOutputSha256: string;
  readonly rawOutputByteLength: number;
  readonly attestation: Readonly<Record<string, unknown>>;
}): ReaderSummaryDailyCanonicalRecoveryReceipt => {
  if (
    !sha(input.modelJobIdentity) ||
    !/^2026-07-(?:2[3-9]|30)$/u.test(input.requestedUtcDate) ||
    !sha(input.sourceAuthoritySha256)
  ) {
    throw new Error("Daily canonical recovery receipt input is invalid");
  }
  const responseBytes = Buffer.from(input.responseBytes);
  if (responseBytes.length < 1 || responseBytes.length > 1_000_000) {
    throw new Error("Daily canonical recovery canonical output receipt is oversized");
  }
  const responseSha256 = sha256(responseBytes);
  if (
    !sha(input.rawOutputSha256) ||
    !Number.isSafeInteger(input.rawOutputByteLength) ||
    input.rawOutputByteLength < 1 || input.rawOutputByteLength > 1_000_000
  ) {
    throw new Error("Daily canonical recovery raw output receipt metadata is invalid");
  }
  const attestation = verifyReaderSummaryDailyCanonicalRecoveryRawAttestation(
    input.attestation,
    input.rawOutputSha256,
  );
  const attestationBytes = canonicalBytes(attestation);
  const receiptRecord = {
    schemaVersion: 2,
    modelJobIdentity: input.modelJobIdentity,
    requestedUtcDate: input.requestedUtcDate,
    sourceAuthoritySha256: input.sourceAuthoritySha256,
    canonicalOutputSha256: responseSha256,
    canonicalOutputByteLength: responseBytes.length,
    rawOutputSha256: input.rawOutputSha256,
    rawOutputByteLength: input.rawOutputByteLength,
    attestationSha256: sha256(attestationBytes),
    attestation,
  };
  const receiptBytes = canonicalBytes(receiptRecord);
  return Object.freeze({
    responseBytes,
    responseSha256,
    canonicalOutputSha256: responseSha256,
    canonicalOutputByteLength: responseBytes.length,
    rawOutputSha256: input.rawOutputSha256,
    rawOutputByteLength: input.rawOutputByteLength,
    attestation,
    attestationBytes,
    attestationSha256: receiptRecord.attestationSha256,
    receiptBytes,
    receiptSha256: sha256(receiptBytes),
  });
};

/** Revalidates the exact V4 output_text receipt before it can be replayed. */
export const verifyReaderSummaryDailyCanonicalRecoveryReceipt = (input: {
  readonly modelJobIdentity: string;
  readonly requestedUtcDate: string;
  readonly sourceAuthoritySha256: string;
  readonly responseBytes: Buffer;
  readonly receiptBytes: Buffer;
}): ReaderSummaryDailyCanonicalRecoveryReceipt => {
  const responseBytes = Buffer.from(input.responseBytes);
  if (responseBytes.length < 1 || responseBytes.length > 1_000_000) {
    throw new Error("Daily canonical recovery canonical output receipt is oversized");
  }
  const receiptBytes = Buffer.from(input.receiptBytes);
  let decoded: unknown;
  try {
    decoded = JSON.parse(receiptBytes.toString("utf8"));
  } catch {
    throw new Error("Daily canonical recovery receipt is not JSON");
  }
  const receipt = record(decoded, "Daily canonical recovery receipt");
  exactKeys(receipt, [
    "schemaVersion",
    "modelJobIdentity",
    "requestedUtcDate",
    "sourceAuthoritySha256",
    "canonicalOutputSha256",
    "canonicalOutputByteLength",
    "rawOutputSha256",
    "rawOutputByteLength",
    "attestationSha256",
    "attestation",
  ], "Daily canonical recovery receipt");
  const responseSha256 = sha256(responseBytes);
  const rawOutputSha256 = stringSha(receipt.rawOutputSha256);
  const rawOutputByteLength = positiveByteLength(receipt.rawOutputByteLength);
  const attestation = verifyReaderSummaryDailyCanonicalRecoveryRawAttestation(
    record(receipt.attestation, "Daily canonical recovery attestation"),
    rawOutputSha256,
  );
  const attestationBytes = canonicalBytes(attestation);
  if (
    receipt.schemaVersion !== 2 ||
    receipt.modelJobIdentity !== input.modelJobIdentity ||
    receipt.requestedUtcDate !== input.requestedUtcDate ||
    receipt.sourceAuthoritySha256 !== input.sourceAuthoritySha256 ||
    receipt.canonicalOutputSha256 !== responseSha256 ||
    receipt.canonicalOutputByteLength !== responseBytes.length ||
    receipt.rawOutputSha256 !== rawOutputSha256 ||
    receipt.rawOutputByteLength !== rawOutputByteLength ||
    receipt.attestationSha256 !== sha256(attestationBytes) ||
    !canonicalBytes(receipt).equals(receiptBytes)
  ) {
    throw new Error("Daily canonical recovery receipt binding diverged");
  }
  return Object.freeze({
    responseBytes,
    responseSha256,
    canonicalOutputSha256: responseSha256,
    canonicalOutputByteLength: responseBytes.length,
    rawOutputSha256,
    rawOutputByteLength,
    attestation,
    attestationBytes,
    attestationSha256: receipt.attestationSha256 as string,
    receiptBytes,
    receiptSha256: sha256(receiptBytes),
  });
};

export const buildReaderSummaryDailyModelJobReceipt = (input: {
  readonly modelJob: ReaderSummaryDailyModelJobIdentity;
  readonly responseBytes: Buffer;
  readonly attestation: Readonly<Record<string, unknown>>;
  readonly modelTelemetry: ReaderSummaryDailyModelTelemetry;
}): ReaderSummaryDailyModelJobReceipt => {
  const responseBytes = Buffer.from(input.responseBytes);
  parseJsonRecord(responseBytes, "daily model response");
  const responseSha256 = sha256(responseBytes);
  const attestation = verifyAttestation(input.attestation, input.modelJob, responseSha256);
  const modelTelemetry = verifyCompletedModelTelemetry(
    input.modelTelemetry,
    attestation,
  );
  if (modelTelemetry.usageSource !== "PROVIDER_REPORTED") {
    throw new Error(
      "Daily model job completion requires provider-reported telemetry",
    );
  }
  const attestationBytes = canonicalBytes(attestation);
  const receiptRecord = {
    schemaVersion: 2,
    modelJobIdentity: input.modelJob.value,
    requestedUtcDate: input.modelJob.requestedUtcDate,
    sourceAuthoritySha256: input.modelJob.sourceAuthoritySha256,
    responseSha256,
    responseByteLength: responseBytes.length,
    attestationSha256: sha256(attestationBytes),
    attestation,
    executionUsage: {
      inputTokens: modelTelemetry.inputTokens,
      outputTokens: modelTelemetry.outputTokens,
      totalTokens: modelTelemetry.totalTokens,
      usageSource: modelTelemetry.usageSource,
      durationMs: modelTelemetry.durationMs,
    },
  };
  const receiptBytes = canonicalBytes(receiptRecord);
  return Object.freeze({
    responseBytes,
    responseSha256,
    attestation,
    attestationBytes,
    attestationSha256: receiptRecord.attestationSha256,
    receiptBytes,
    receiptSha256: sha256(receiptBytes),
    modelTelemetry,
  });
};

export const readReaderSummaryDailyModelTelemetry = (
  receiptBytes: Buffer,
): ReaderSummaryDailyModelTelemetry => {
  const receipt = parseJsonRecord(receiptBytes, "daily model receipt");
  const attestation = asRecord(receipt.attestation);
  const provider = nonEmptyText(attestation?.provider);
  const model = nonEmptyText(attestation?.model);
  const reasoningEffort = nonEmptyText(attestation?.reasoningEffort);
  const executionUsage = asRecord(receipt.executionUsage);
  if (
    receipt.schemaVersion !== 2 || provider === null || model === null ||
    reasoningEffort === null || executionUsage === null
  ) {
    return Object.freeze({
      provider: provider ?? "unknown",
      model: model ?? "unknown",
      reasoningEffort: reasoningEffort ?? "unknown",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      usageSource: "HISTORICAL_INCOMPLETE",
      durationMs: null,
    });
  }
  return verifyCompletedModelTelemetry({
    provider,
    model,
    reasoningEffort,
    inputTokens: executionUsage.inputTokens as number,
    outputTokens: executionUsage.outputTokens as number,
    totalTokens: executionUsage.totalTokens as number,
    usageSource: executionUsage.usageSource as ReaderSummaryDailyModelTelemetry["usageSource"],
    durationMs: executionUsage.durationMs as number,
  }, attestation!);
};

export const requireReaderSummaryDailyProviderTelemetry = (
  receiptBytes: Buffer,
): ReaderSummaryDailyModelTelemetry => {
  const telemetry = readReaderSummaryDailyModelTelemetry(receiptBytes);
  if (
    telemetry.usageSource !== "PROVIDER_REPORTED" ||
    telemetry.inputTokens === null || telemetry.outputTokens === null ||
    telemetry.totalTokens === null ||
    telemetry.durationMs === null
  ) {
    throw new Error("Daily live publication requires provider-reported model telemetry");
  }
  return telemetry;
};

const verifyCompletedModelTelemetry = (
  telemetry: ReaderSummaryDailyModelTelemetry,
  attestation: Readonly<Record<string, unknown>>,
): ReaderSummaryDailyModelTelemetry => {
  const measured = telemetry.usageSource === "PROVIDER_REPORTED" ||
    telemetry.usageSource === "ESTIMATED";
  if (
    telemetry.provider !== attestation.provider ||
    telemetry.model !== attestation.model ||
    telemetry.reasoningEffort !== attestation.reasoningEffort ||
    !measured ||
    !nonNegativeSafeInteger(telemetry.inputTokens) ||
    !nonNegativeSafeInteger(telemetry.outputTokens) ||
    !nonNegativeSafeInteger(telemetry.totalTokens) ||
    telemetry.totalTokens !== telemetry.inputTokens + telemetry.outputTokens ||
    !positiveSafeInteger(telemetry.durationMs)
  ) {
    throw new Error("Daily model job telemetry is incomplete or conflicts with attestation");
  }
  return Object.freeze({ ...telemetry });
};

const parseJsonRecord = (bytes: Buffer, label: string): Record<string, unknown> => {
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    const result = asRecord(value);
    if (result !== null) return result;
  } catch {
    // The safe error below intentionally omits receipt content and parser text.
  }
  throw new Error(`${label} is invalid`);
};
const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
const nonEmptyText = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;
const nonNegativeSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const positiveSafeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) > 0;

const verifyAttestation = (
  input: Readonly<Record<string, unknown>>,
  modelJob: ReaderSummaryDailyModelJobIdentity,
  responseSha256: string,
): ReaderSummaryDailyRuntimeAttestation => {
  if (
    input.schemaVersion !== 1 ||
    typeof input.requestId !== "string" || input.requestId.length === 0 ||
    typeof input.purpose !== "string" || input.purpose.length === 0 ||
    input.provider !== readerSummaryDailyModelProvider ||
    input.model !== readerSummaryDailyModel ||
    input.reasoningEffort !== readerSummaryDailyReasoningEffort ||
    input.runtimeEngine !== readerSummaryDailyRuntimeEngine ||
    input.selectedOutputKind !== "structured_output" ||
    input.selectedOutputSha256 !== responseSha256 ||
    !sha(input.canonicalRequestSha256) ||
    !sha(input.launcherSha256) ||
    typeof input.runtimePackageVersion !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(input.runtimePackageVersion)
  ) {
    throw new Error("Daily model job execution attestation is invalid");
  }
  if (
    modelJob.provider !== input.provider || modelJob.model !== input.model ||
    modelJob.reasoningEffort !== input.reasoningEffort ||
    modelJob.runtimeEngine !== input.runtimeEngine
  ) {
    throw new Error("Daily model job execution attestation conflicts with job identity");
  }
  return Object.freeze({ ...input } as ReaderSummaryDailyRuntimeAttestation);
};

/**
 * Validates the complete 12-key provider attestation against raw selected
 * output bytes. Call this before any JSON parsing or canonicalization.
 */
export const verifyReaderSummaryDailyCanonicalRecoveryRawAttestation = (
  input: Readonly<Record<string, unknown>>,
  rawOutputSha256: string,
): ReaderSummaryDailyRuntimeAttestation => {
  exactKeys(input, [
    "schemaVersion",
    "requestId",
    "purpose",
    "canonicalRequestSha256",
    "provider",
    "model",
    "reasoningEffort",
    "runtimeEngine",
    "runtimePackageVersion",
    "launcherSha256",
    "selectedOutputKind",
    "selectedOutputSha256",
  ], "Daily canonical recovery attestation");
  if (
    input.schemaVersion !== 1 ||
    typeof input.requestId !== "string" || input.requestId.length === 0 ||
    input.purpose !== "social_monitor.reader_summary.weekly.generate" ||
    input.provider !== readerSummaryDailyModelProvider ||
    input.model !== readerSummaryDailyModel ||
    input.reasoningEffort !== "xhigh" ||
    input.runtimeEngine !== readerSummaryDailyRuntimeEngine ||
    input.selectedOutputKind !== "output_text" ||
    input.selectedOutputSha256 !== rawOutputSha256 ||
    !sha(input.canonicalRequestSha256) ||
    !sha(input.launcherSha256) ||
    typeof input.runtimePackageVersion !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(input.runtimePackageVersion)
  ) {
    throw new Error("Daily canonical recovery execution attestation is invalid");
  }
  return Object.freeze({ ...input } as ReaderSummaryDailyRuntimeAttestation);
};

const stringSha = (value: unknown): string => {
  if (!sha(value)) throw new Error("Daily canonical recovery raw output SHA-256 is invalid");
  return value;
};

const positiveByteLength = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 1_000_000
  ) {
    throw new Error("Daily canonical recovery raw output length is invalid");
  }
  return value;
};

const record = (value: unknown, label: string): Readonly<Record<string, unknown>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} is invalid`);
  }
  return value as Readonly<Record<string, unknown>>;
};

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length ||
    actual.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${label} schema is invalid`);
  }
};

const canonicalBytes = (value: unknown): Buffer => Buffer.from(canonicalJson(value), "utf8");
const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
};
const sha256 = (value: Buffer): string => createHash("sha256").update(value).digest("hex");
const sha = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
