import {
  productionDayModelExecutionMatches,
  productionDayModelExecutionReport,
} from "./reader-summary-production-day-model-telemetry";

const jobId = "10000000-0000-4000-8000-000000000001";
const artifactId = "20000000-0000-4000-8000-000000000002";

describe("production-day daily model telemetry", () => {
  it("exposes provider telemetry with job, artifact, receipt, and logical-run binding", () => {
    const report = productionDayModelExecutionReport({
      durableEvidence: evidence(),
      readerSummaryJobId: jobId,
      readerSummaryArtifactId: artifactId,
    });
    expect(report).toEqual({
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "medium-profile",
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      usageSource: "PROVIDER_REPORTED",
      durationMs: 250,
      modelJobIdentity: "a".repeat(64),
      receiptSha256: "b".repeat(64),
      readerSummaryJobId: jobId,
      readerSummaryArtifactId: artifactId,
    });
    expect(productionDayModelExecutionMatches(report, report)).toBe(true);
  });

  it.each([
    { usageSource: "ESTIMATED" },
    { durationMs: 0 },
    { inputTokens: null },
    { outputTokens: "30" },
    { totalTokens: 151 },
  ])("blocks incomplete live telemetry %#", (patch) => {
    const value = evidence();
    Object.assign(
      value.provenance.dailySourceAuthority.modelExecution,
      patch,
    );
    expect(() => productionDayModelExecutionReport({
      durableEvidence: value,
      readerSummaryJobId: jobId,
      readerSummaryArtifactId: artifactId,
    })).toThrow(/telemetry is incomplete/u);
  });

  it("keeps non-daily production evidence free of fabricated telemetry", () => {
    expect(productionDayModelExecutionReport({
      durableEvidence: { provenance: {} },
      readerSummaryJobId: jobId,
      readerSummaryArtifactId: artifactId,
    })).toBeNull();
  });
});

const evidence = () => ({
  provenance: {
    dailySourceAuthority: {
      modelJobIdentity: "a".repeat(64),
      receiptSha256: "b".repeat(64),
      modelExecution: {
        provider: "codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "medium-profile",
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        usageSource: "PROVIDER_REPORTED",
        durationMs: 250,
      },
    },
  },
});
