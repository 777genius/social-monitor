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
      executionMode: "live-production",
    });
    expect(report).toEqual({
      provider: "codex",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
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
      executionMode: "live-production",
    })).toThrow(/telemetry is incomplete/u);
  });

  it("keeps non-daily production evidence free of fabricated telemetry", () => {
    expect(productionDayModelExecutionReport({
      durableEvidence: { provenance: {} },
      readerSummaryJobId: jobId,
      readerSummaryArtifactId: artifactId,
      executionMode: "live-production",
    })).toBeNull();
  });

  it("exposes unknown historical usage as nullable HISTORICAL_INCOMPLETE", () => {
    const value = evidence();
    Object.assign(value.provenance.dailySourceAuthority.modelExecution, {
      reasoningEffort: "xhigh",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      usageSource: "HISTORICAL_INCOMPLETE",
      durationMs: null,
    });
    expect(productionDayModelExecutionReport({
      durableEvidence: value,
      readerSummaryJobId: jobId,
      readerSummaryArtifactId: artifactId,
      executionMode: "historical-reuse",
    })).toMatchObject({
      reasoningEffort: "xhigh",
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      usageSource: "HISTORICAL_INCOMPLETE",
      durationMs: null,
    });
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
        reasoningEffort: "high",
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        usageSource: "PROVIDER_REPORTED",
        durationMs: 250,
      },
    },
  },
});
