import { createHash } from "node:crypto";

import { readerSummaryDailyModelJobIdentity } from "@social-monitor/summary/domain/value-objects/reader-summary-daily-model-job";

import { buildReaderSummaryDailyModelJobReceipt } from "./reader-summary-daily-model-job-receipt";

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
    });
    expect(receipt.responseBytes.equals(responseBytes)).toBe(true);
    expect(receipt.responseSha256).toBe(hash(responseBytes));
    expect(hash(receipt.attestationBytes)).toBe(receipt.attestationSha256);
    expect(hash(receipt.receiptBytes)).toBe(receipt.receiptSha256);
  });

  it.each([
    ["provider", { provider: "claude" }],
    ["model", { model: "gpt-5.5" }],
    ["effort", { reasoningEffort: "high" }],
    ["engine", { runtimeEngine: "other" }],
    ["response", { selectedOutputSha256: "0".repeat(64) }],
  ])("rejects a divergent %s attestation", (_label, patch) => {
    const responseBytes = Buffer.from("response");
    expect(() => buildReaderSummaryDailyModelJobReceipt({
      modelJob,
      responseBytes,
      attestation: { ...attestation(responseBytes), ...patch },
    })).toThrow(/attestation/u);
  });
});

const attestation = (responseBytes: Buffer) => ({
  schemaVersion: 1,
  requestId: "daily-job-1",
  purpose: "social_monitor.reader_summary.generate",
  canonicalRequestSha256: "b".repeat(64),
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  runtimeEngine: "subscription-runtime-cli",
  runtimePackageVersion: "1.2.3",
  launcherSha256: "c".repeat(64),
  selectedOutputKind: "structured_output",
  selectedOutputSha256: hash(responseBytes),
});
const hash = (value: Buffer) => createHash("sha256").update(value).digest("hex");
