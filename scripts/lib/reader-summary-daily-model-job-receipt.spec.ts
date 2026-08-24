import { createHash } from "node:crypto";

import { readerSummaryDailyModelJobIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";

import {
  buildReaderSummaryDailyCanonicalRecoveryReceipt,
  buildReaderSummaryDailyModelJobReceipt,
  readReaderSummaryDailyModelTelemetry,
  requireReaderSummaryDailyProviderTelemetry,
  verifyReaderSummaryDailyCanonicalRecoveryReceipt,
} from "./reader-summary-daily-model-job-receipt";
import { canonicalJsonBytes } from "./reader-summary-daily-canonical-recovery-v4";

const modelJob = readerSummaryDailyModelJobIdentity({
  tenantId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000002",
  requestedUtcDate: "2026-07-31",
  sourceAuthoritySha256: "a".repeat(64),
});

describe("buildReaderSummaryDailyModelJobReceipt", () => {
  it("binds exact response bytes to a verified immutable attestation receipt", () => {
    const responseBytes = Buffer.from('{"answer":true}', "utf8");
    const receipt = buildReaderSummaryDailyModelJobReceipt({
      modelJob,
      responseBytes,
      attestation: attestation(responseBytes),
      modelTelemetry: telemetry(),
    });
    expect(receipt.responseBytes.equals(responseBytes)).toBe(true);
    expect(receipt.responseSha256).toBe(hash(responseBytes));
    expect(hash(receipt.attestationBytes)).toBe(receipt.attestationSha256);
    expect(hash(receipt.receiptBytes)).toBe(receipt.receiptSha256);
    expect(readReaderSummaryDailyModelTelemetry(receipt.receiptBytes)).toEqual(
      telemetry(),
    );
  });

  it.each([
    ["provider", { provider: "claude" }],
    ["model", { model: "gpt-5.5" }],
    ["effort", { reasoningEffort: "xhigh" }],
    ["engine", { runtimeEngine: "other" }],
    ["response", { selectedOutputSha256: "0".repeat(64) }],
  ])("rejects a divergent %s attestation", (_label, patch) => {
    const responseBytes = Buffer.from('{"answer":true}', "utf8");
    expect(() => buildReaderSummaryDailyModelJobReceipt({
      modelJob,
      responseBytes,
      attestation: { ...attestation(responseBytes), ...patch },
      modelTelemetry: telemetry(),
    })).toThrow(/attestation/u);
  });

  it.each([
    ["missing", undefined],
    ["partial", { inputTokens: 12 }],
    ["malformed", { inputTokens: "12", outputTokens: 3, durationMs: 8 }],
  ])("keeps %s historical usage unavailable", (_label, executionUsage) => {
    const receiptBytes = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      attestation: attestation(Buffer.from("historical")),
      ...(executionUsage === undefined ? {} : { executionUsage }),
    }));
    expect(readReaderSummaryDailyModelTelemetry(receiptBytes)).toMatchObject({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      usageSource: "HISTORICAL_INCOMPLETE",
      durationMs: null,
    });
    expect(() => requireReaderSummaryDailyProviderTelemetry(receiptBytes))
      .toThrow(/provider-reported/u);
  });

  it("preserves genuine provider-reported zero counts without fabricating them", () => {
    const responseBytes = Buffer.from('{"answer":"zero-usage"}', "utf8");
    const receipt = buildReaderSummaryDailyModelJobReceipt({
      modelJob,
      responseBytes,
      attestation: attestation(responseBytes),
      modelTelemetry: telemetry({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      }),
    });
    expect(requireReaderSummaryDailyProviderTelemetry(receipt.receiptBytes))
      .toMatchObject({ inputTokens: 0, outputTokens: 0, durationMs: 25 });
  });

  it("rejects publication-ineligible telemetry and response payloads", () => {
    const responseBytes = Buffer.from('{"answer":true}', "utf8");
    expect(() => buildReaderSummaryDailyModelJobReceipt({
      modelJob,
      responseBytes,
      attestation: attestation(responseBytes),
      modelTelemetry: telemetry({ usageSource: "ESTIMATED" }),
    })).toThrow(/provider-reported/u);

    for (const invalidResponse of [
      Buffer.from("not-json", "utf8"),
      Buffer.from("[]", "utf8"),
      Buffer.from('"answer"', "utf8"),
      Buffer.from("null", "utf8"),
    ]) {
      expect(() => buildReaderSummaryDailyModelJobReceipt({
        modelJob,
        responseBytes: invalidResponse,
        attestation: attestation(invalidResponse),
        modelTelemetry: telemetry(),
      })).toThrow(/response/u);
    }
  });

  it("binds output_text to the consumed canonical recovery identity", () => {
    const responseBytes = Buffer.from('{"canonical":true}', "utf8");
    const receipt = buildReaderSummaryDailyCanonicalRecoveryReceipt({
      modelJobIdentity: "d".repeat(64),
      requestedUtcDate: "2026-07-23",
      sourceAuthoritySha256: "e".repeat(64),
      responseBytes,
      rawOutputSha256: hash(responseBytes),
      rawOutputByteLength: responseBytes.length,
      attestation: {
        ...attestation(responseBytes),
        purpose: "social_monitor.reader_summary.weekly.generate",
        reasoningEffort: "xhigh",
        selectedOutputKind: "output_text",
      },
    });
    expect(JSON.parse(receipt.receiptBytes.toString("utf8"))).toMatchObject({
      modelJobIdentity: "d".repeat(64),
      requestedUtcDate: "2026-07-23",
      sourceAuthoritySha256: "e".repeat(64),
      canonicalOutputSha256: hash(responseBytes),
      canonicalOutputByteLength: responseBytes.length,
      rawOutputSha256: hash(responseBytes),
      rawOutputByteLength: responseBytes.length,
    });
  });

  it("rejects independent raw and canonical recovery receipt tampering", () => {
    const responseBytes = Buffer.from('{"canonical":true}', "utf8");
    const rawOutputBytes = Buffer.from('{ "canonical": true }', "utf8");
    const input = {
      modelJobIdentity: "d".repeat(64),
      requestedUtcDate: "2026-07-23",
      sourceAuthoritySha256: "e".repeat(64),
      responseBytes,
    } as const;
    const receipt = buildReaderSummaryDailyCanonicalRecoveryReceipt({
      ...input,
      rawOutputSha256: hash(rawOutputBytes),
      rawOutputByteLength: rawOutputBytes.length,
      attestation: {
        ...attestation(rawOutputBytes),
        purpose: "social_monitor.reader_summary.weekly.generate",
        reasoningEffort: "xhigh",
        selectedOutputKind: "output_text",
      },
    });
    expect(() => verifyReaderSummaryDailyCanonicalRecoveryReceipt({
      ...input,
      receiptBytes: receipt.receiptBytes,
    })).not.toThrow();

    const canonicalTamper = JSON.parse(receipt.receiptBytes.toString("utf8")) as Record<string, unknown>;
    canonicalTamper.canonicalOutputSha256 = "0".repeat(64);
    expect(() => verifyReaderSummaryDailyCanonicalRecoveryReceipt({
      ...input,
      receiptBytes: canonicalJsonBytes(canonicalTamper),
    })).toThrow(/receipt/u);

    const rawTamper = JSON.parse(receipt.receiptBytes.toString("utf8")) as Record<string, unknown>;
    rawTamper.rawOutputSha256 = "0".repeat(64);
    expect(() => verifyReaderSummaryDailyCanonicalRecoveryReceipt({
      ...input,
      receiptBytes: canonicalJsonBytes(rawTamper),
    })).toThrow(/attestation/u);
  });
});

const attestation = (responseBytes: Buffer) => ({
  schemaVersion: 1,
  requestId: "daily-job-1",
  purpose: "social_monitor.reader_summary.generate.v2",
  canonicalRequestSha256: "b".repeat(64),
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  runtimeEngine: "subscription-runtime-cli",
  runtimePackageVersion: "1.2.3",
  launcherSha256: "c".repeat(64),
  selectedOutputKind: "structured_output",
  selectedOutputSha256: hash(responseBytes),
});
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
const telemetry = (patch = {}) => ({
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  inputTokens: 120,
  outputTokens: 30,
  totalTokens: 150,
  usageSource: "PROVIDER_REPORTED" as const,
  durationMs: 25,
  ...patch,
});
