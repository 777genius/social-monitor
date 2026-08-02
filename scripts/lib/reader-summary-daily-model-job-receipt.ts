import { createHash } from "node:crypto";

import {
  readerSummaryDailyModel,
  readerSummaryDailyModelProvider,
  readerSummaryDailyReasoningEffort,
  readerSummaryDailyRuntimeEngine,
  type ReaderSummaryDailyModelJobIdentity,
} from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";

export type ReaderSummaryDailyRuntimeAttestation = Readonly<{
  schemaVersion: 1;
  requestId: string;
  purpose: string;
  canonicalRequestSha256: string;
  provider: typeof readerSummaryDailyModelProvider;
  model: typeof readerSummaryDailyModel;
  reasoningEffort: typeof readerSummaryDailyReasoningEffort;
  runtimeEngine: typeof readerSummaryDailyRuntimeEngine;
  runtimePackageVersion: string;
  launcherSha256: string;
  selectedOutputKind: "structured_output";
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
}>;

export const buildReaderSummaryDailyModelJobReceipt = (input: {
  readonly modelJob: ReaderSummaryDailyModelJobIdentity;
  readonly responseBytes: Buffer;
  readonly attestation: Readonly<Record<string, unknown>>;
}): ReaderSummaryDailyModelJobReceipt => {
  const responseBytes = Buffer.from(input.responseBytes);
  const responseSha256 = sha256(responseBytes);
  const attestation = verifyAttestation(input.attestation, input.modelJob, responseSha256);
  const attestationBytes = canonicalBytes(attestation);
  const receiptRecord = {
    schemaVersion: 1,
    modelJobIdentity: input.modelJob.value,
    requestedUtcDate: input.modelJob.requestedUtcDate,
    sourceAuthoritySha256: input.modelJob.sourceAuthoritySha256,
    responseSha256,
    responseByteLength: responseBytes.length,
    attestationSha256: sha256(attestationBytes),
    attestation,
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
  });
};

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
