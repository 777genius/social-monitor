import { dailyCompletionReceiptFixture } from
  "./reader-summary-daily-execution-cursor-receipt-contract";

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
      "extra receipt key", "extra usage key", "extra attestation key",
      "requested UTC date", "source authority SHA", "response byte length",
      "noncanonical receipt bytes", "noncanonical attestation bytes",
    ]));
  });
});
