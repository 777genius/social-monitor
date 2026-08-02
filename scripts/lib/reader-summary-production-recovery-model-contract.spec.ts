import {
  assertReaderSummaryProductionRecoveryExecutionAttestation,
  assertReaderSummaryProductionRecoveryModelSelection,
  readerSummaryProductionRecoveryGenerationProfile,
  readerSummaryProductionRecoveryModelContract,
} from "./reader-summary-production-recovery-model-contract";

describe("reader summary production recovery model contract", () => {
  it("fixes subscription-runtime gpt-5.6-sol with xhigh reasoning", () => {
    expect(
      assertReaderSummaryProductionRecoveryModelSelection({
        provider: "codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "xhigh",
        runtimeEngine: "subscription-runtime-cli",
      }),
    ).toBe(readerSummaryProductionRecoveryModelContract);
    expect(readerSummaryProductionRecoveryGenerationProfile.modelVersion).toBe(
      "codex:gpt-5.6-sol:xhigh",
    );
  });

  it.each([
    ["gpt-5.5", "xhigh"],
    ["gpt-5.6-sol", "high"],
    ["gpt-5.6-sol", ""],
  ])("rejects ambiguous or obsolete model selection %s/%s", (model, effort) => {
    expect(() =>
      assertReaderSummaryProductionRecoveryModelSelection({
        provider: "codex",
        model,
        reasoningEffort: effort,
        runtimeEngine: "subscription-runtime-cli",
      }),
    ).toThrow("requires exact subscription-runtime");
  });

  it("requires an exact attestation", () => {
    const exact = {
      schemaVersion: 1 as const,
      requestId: "request-1",
      purpose: "social_monitor.reader_summary.generate",
      provider: "codex" as const,
      model: "gpt-5.6-sol",
      reasoningEffort: "xhigh",
      runtimeEngine: "subscription-runtime-cli" as const,
      runtimePackageVersion: "codex-cli-1.2.3",
      canonicalRequestSha256: "a".repeat(64),
      launcherSha256: "b".repeat(64),
      selectedOutputKind: "structured_output" as const,
      selectedOutputSha256: "c".repeat(64),
    };
    expect(
      assertReaderSummaryProductionRecoveryExecutionAttestation(exact),
    ).toBe(exact);
    expect(() =>
      assertReaderSummaryProductionRecoveryExecutionAttestation({
        ...exact,
        model: "gpt-5.5",
      }),
    ).toThrow("attestation is not exact");
  });
});
