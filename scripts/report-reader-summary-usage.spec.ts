import { summarizeReaderSummaryUsage } from "./report-reader-summary-usage";

describe("reader summary usage report", () => {
  const common = { version: 1, targetDate: "2026-11-09", stage: "summary", model: "gpt-6.1-terra", effort: "medium", identitySource: "runtime_reported" };
  it("sums real tokens, prices known cache, and keeps missing usage visible", () => {
    const result = summarizeReaderSummaryUsage([
      JSON.stringify({ ...common, inputTokens: 100_000, outputTokens: 10_000, cachedInputTokens: 80_000, usageSource: "runtime_reported" }),
      JSON.stringify({ ...common, inputTokens: null, outputTokens: null, cachedInputTokens: null, usageSource: "unavailable" }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ calls: 2, unknownUsage: 1, inputTokens: 100_000,
      outputTokens: 10_000, cachedInputTokens: 80_000, unpricedCalls: 0 });
    expect(result[0]?.estimatedApiUsd).toBeCloseTo(0.074);
  });
  it("does not silently price unknown models or accept invalid token counts", () => {
    const record = { ...common, model: "unknown", inputTokens: 2, outputTokens: 1,
      cachedInputTokens: null, usageSource: "runtime_reported" };
    expect(summarizeReaderSummaryUsage([JSON.stringify(record)])[0]).toMatchObject({ unpricedCalls: 1, unknownCacheCalls: 1 });
    expect(() => summarizeReaderSummaryUsage([JSON.stringify({ ...record, cachedInputTokens: 3 })])).toThrow("Invalid usage token counts");
  });
  it("keeps separate executions of the same job separate", () => {
    const record = { ...common, jobId: "job-1", inputTokens: null, outputTokens: null,
      cachedInputTokens: null, usageSource: "unavailable", status: "error" };
    const results = summarizeReaderSummaryUsage([JSON.stringify({ ...record, runId: "one" }),
      JSON.stringify({ ...record, runId: "two" })]);
    expect(results.map(({ jobId, runId }) => ({ jobId, runId }))).toEqual([
      { jobId: "job-1", runId: "one" }, { jobId: "job-1", runId: "two" },
    ]);
    expect(results[0]).toMatchObject({ failedCalls: 1, unknownUsage: 1 });
  });
});
