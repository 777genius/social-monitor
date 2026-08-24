import { createHash } from "node:crypto";

import { readerSummaryDailyModelJobIdentity } from
  "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";

import { canonicalJsonBytes } from "./reader-summary-daily-canonical-recovery-v4";
import { buildReaderSummaryDailyModelJobReceipt } from
  "./reader-summary-daily-model-job-receipt";

type CompletionFixture = Readonly<{
  completionValues: readonly unknown[];
  negativeSealMutations: ReadonlyArray<readonly [string, readonly unknown[]]>;
  receiptBytes: Buffer;
}>;

export const dailyCompletionReceiptFixture = (input: {
  tenantId: string;
  workspaceId: string;
  requestedUtcDate: string;
  sourceAuthoritySha256: string;
  worker: string;
  fence: string;
  finishedAt: string;
}): CompletionFixture => {
  const responseBytes = Buffer.from('{"daily":"complete"}', "utf8");
  const modelJob = readerSummaryDailyModelJobIdentity({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    requestedUtcDate: input.requestedUtcDate,
    sourceAuthoritySha256: input.sourceAuthoritySha256,
  });
  const attestation = {
    schemaVersion: 1,
    requestId: "pg18-daily-1",
    purpose: "social_monitor.reader_summary.generate.v2",
    canonicalRequestSha256: "a".repeat(64),
    provider: "codex",
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    runtimeEngine: "subscription-runtime-cli",
    runtimePackageVersion: "1.2.3",
    launcherSha256: "b".repeat(64),
    selectedOutputKind: "structured_output",
    selectedOutputSha256: hash(responseBytes),
  } as const;
  const receipt = buildReaderSummaryDailyModelJobReceipt({
    modelJob,
    responseBytes,
    attestation,
    modelTelemetry: {
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      usageSource: "PROVIDER_REPORTED",
      durationMs: 250,
    },
  });
  const completionValues = [
    input.tenantId, input.workspaceId, input.requestedUtcDate, input.worker,
    input.fence, input.finishedAt, receipt.responseBytes, receipt.responseSha256,
    receipt.attestation, receipt.attestationBytes, receipt.attestationSha256,
    receipt.receiptBytes, receipt.receiptSha256,
    120, 30, 150, "PROVIDER_REPORTED", 250,
  ] as const;
  const envelope = record(receipt.receiptBytes);
  const usage = recordValue(envelope.executionUsage);
  const negativeSealMutations: Array<readonly [string, readonly unknown[]]> = [];

  for (const key of Object.keys(envelope)) {
    negativeSealMutations.push([
      `missing receipt ${key}`,
      completionWithEnvelope(completionValues, without(envelope, key)),
    ]);
  }
  for (const key of Object.keys(usage)) {
    negativeSealMutations.push([
      `missing execution usage ${key}`,
      completionWithEnvelope(completionValues, {
        ...envelope,
        executionUsage: without(usage, key),
      }),
    ]);
  }
  for (const key of Object.keys(attestation)) {
    negativeSealMutations.push([
      `missing attestation ${key}`,
      completionWithAttestation(completionValues, without(attestation, key)),
    ]);
  }
  negativeSealMutations.push(
    ["extra receipt key", completionWithEnvelope(completionValues, {
      ...envelope, unexpected: true,
    })],
    ["extra usage key", completionWithEnvelope(completionValues, {
      ...envelope, executionUsage: { ...usage, unexpected: true },
    })],
    ["extra attestation key", completionWithAttestation(completionValues, {
      ...attestation, unexpected: true,
    })],
    ["requested UTC date", completionWithEnvelope(completionValues, {
      ...envelope, requestedUtcDate: "2020-01-01",
    })],
    ["source authority SHA", completionWithEnvelope(completionValues, {
      ...envelope, sourceAuthoritySha256: "e".repeat(64),
    })],
    ["response byte length", completionWithEnvelope(completionValues, {
      ...envelope, responseByteLength: responseBytes.length + 1,
    })],
    ["noncanonical receipt bytes", withNoncanonicalReceipt(completionValues)],
    ["noncanonical attestation bytes",
      withNoncanonicalAttestation(completionValues, attestation)],
    ["response bytes", replaceCompletionValue(
      completionValues, 6, Buffer.from("changed", "utf8"))],
    ["response SHA", replaceCompletionValue(completionValues, 7, "e".repeat(64))],
    ["receipt SHA", replaceCompletionValue(completionValues, 12, "e".repeat(64))],
    ["attestation JSON", replaceCompletionValue(completionValues, 8, {
      ...attestation, requestId: "divergent",
    })],
    ["attestation SHA", replaceCompletionValue(completionValues, 10, "e".repeat(64))],
  );
  return { completionValues, negativeSealMutations,
    receiptBytes: receipt.receiptBytes };
};

export const replaceCompletionValue = (
  values: readonly unknown[],
  index: number,
  value: unknown,
): readonly unknown[] => values.map((current, currentIndex) =>
  currentIndex === index ? value : current);

const completionWithEnvelope = (
  values: readonly unknown[],
  envelope: Record<string, unknown>,
): readonly unknown[] => {
  const bytes = canonicalJsonBytes(envelope);
  return replaceCompletionValue(replaceCompletionValue(values, 11, bytes), 12, hash(bytes));
};

const completionWithAttestation = (
  values: readonly unknown[],
  attestation: Record<string, unknown>,
): readonly unknown[] => {
  const attestationBytes = canonicalJsonBytes(attestation);
  const envelope = record(requiredBuffer(values[11]));
  return completionWithEnvelope(
    replaceCompletionValue(replaceCompletionValue(replaceCompletionValue(
      values, 8, attestation), 9, attestationBytes), 10, hash(attestationBytes)),
    { ...envelope, attestation, attestationSha256: hash(attestationBytes) },
  );
};

const withNoncanonicalReceipt = (values: readonly unknown[]): readonly unknown[] => {
  const bytes = Buffer.concat([requiredBuffer(values[11]), Buffer.from(" ")]);
  return replaceCompletionValue(replaceCompletionValue(values, 11, bytes), 12, hash(bytes));
};

const withNoncanonicalAttestation = (
  values: readonly unknown[],
  attestation: Record<string, unknown>,
): readonly unknown[] => {
  const bytes = Buffer.from(JSON.stringify(attestation), "utf8");
  const envelope = record(requiredBuffer(values[11]));
  return completionWithEnvelope(
    replaceCompletionValue(replaceCompletionValue(values, 9, bytes), 10, hash(bytes)),
    { ...envelope, attestationSha256: hash(bytes) },
  );
};

const without = (
  value: Record<string, unknown>,
  omitted: string,
): Record<string, unknown> => Object.fromEntries(
  Object.entries(value).filter(([key]) => key !== omitted),
);
const record = (bytes: Buffer): Record<string, unknown> =>
  recordValue(JSON.parse(bytes.toString("utf8")) as unknown);
const recordValue = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("daily completion fixture record is invalid");
  }
  return value as Record<string, unknown>;
};
const requiredBuffer = (value: unknown): Buffer => {
  if (!Buffer.isBuffer(value)) throw new Error("daily completion fixture bytes are absent");
  return value;
};
const hash = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");
