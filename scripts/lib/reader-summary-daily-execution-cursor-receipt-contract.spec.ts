import { createHash } from "node:crypto";

import { dailyCompletionReceiptFixture } from
  "./reader-summary-daily-execution-cursor-receipt-contract";
import { canonicalJsonBytes } from "./reader-summary-daily-canonical-recovery-v4";

describe("daily execution cursor production receipt fixture", () => {
  const fixture = dailyCompletionReceiptFixture({
    tenantId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000002",
    requestedUtcDate: "2026-08-23",
    sourceAuthoritySha256: "a".repeat(64),
    worker: "worker-a",
    fence: "1",
    finishedAt: "2026-08-24T00:00:00.000Z",
  });

  it("uses the production builder's canonical envelope", () => {
    const receipt = JSON.parse(fixture.receiptBytes.toString("utf8")) as
      Record<string, unknown>;
    expect(Object.keys(receipt).sort()).toEqual([
      "attestation", "attestationSha256", "executionUsage", "modelJobIdentity",
      "requestedUtcDate", "responseByteLength", "responseSha256", "schemaVersion",
      "sourceAuthoritySha256",
    ]);
    expect(fixture.receiptBytes.toString("utf8").startsWith('{"attestation":')).toBe(true);
  });

  it("mutates every required shape and binding at the PostgreSQL boundary", () => {
    const labels = fixture.negativeSealMutations.map(([label]) => label);
    for (const key of [
      "schemaVersion", "modelJobIdentity", "requestedUtcDate",
      "sourceAuthoritySha256", "responseSha256", "responseByteLength",
      "attestationSha256", "attestation", "executionUsage",
    ]) expect(labels).toContain(`missing receipt ${key}`);
    for (const key of [
      "schemaVersion", "requestId", "purpose", "canonicalRequestSha256",
      "provider", "model", "reasoningEffort", "runtimeEngine",
      "runtimePackageVersion", "launcherSha256", "selectedOutputKind",
      "selectedOutputSha256",
    ]) expect(labels).toContain(`missing attestation ${key}`);
    for (const key of [
      "inputTokens", "outputTokens", "totalTokens", "usageSource", "durationMs",
    ]) expect(labels).toContain(`missing execution usage ${key}`);
    expect(labels).toEqual(expect.arrayContaining([
      "estimated usage with canonical bindings",
      "non-JSON response with canonical bindings",
      "array response with canonical bindings",
      "scalar response with canonical bindings",
      "null response with canonical bindings",
      "extra receipt key", "extra usage key", "extra attestation key",
      "requested UTC date", "source authority SHA", "response byte length",
      "noncanonical receipt bytes", "noncanonical attestation bytes",
    ]));
  });

  it("recomputes every canonical binding for publication-ineligible cases", () => {
    const inadmissible = fixture.negativeSealMutations.filter(([label]) =>
      label.endsWith("with canonical bindings"));
    expect(inadmissible).toHaveLength(5);
    for (const [, values] of inadmissible) {
      const responseBytes = requiredBuffer(values[6]);
      const attestation = recordValue(values[8]);
      const attestationBytes = requiredBuffer(values[9]);
      const receiptBytes = requiredBuffer(values[11]);
      const receipt = recordValue(JSON.parse(receiptBytes.toString("utf8")));
      expect(values[7]).toBe(hash(responseBytes));
      expect(attestationBytes.equals(canonicalJsonBytes(attestation))).toBe(true);
      expect(values[10]).toBe(hash(attestationBytes));
      expect(receiptBytes.equals(canonicalJsonBytes(receipt))).toBe(true);
      expect(values[12]).toBe(hash(receiptBytes));
      expect(receipt).toMatchObject({
        responseSha256: values[7],
        responseByteLength: responseBytes.length,
        attestationSha256: values[10],
        attestation,
        executionUsage: {
          inputTokens: values[13], outputTokens: values[14],
          totalTokens: values[15], usageSource: values[16],
          durationMs: values[17],
        },
      });
    }
  });
});

const requiredBuffer = (value: unknown): Buffer => {
  if (!Buffer.isBuffer(value)) throw new Error("expected fixture bytes");
  return value;
};
const recordValue = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("expected fixture object");
  }
  return value as Record<string, unknown>;
};
const hash = (value: Buffer): string =>
  createHash("sha256").update(value).digest("hex");
