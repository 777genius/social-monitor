import { classifyAgentRuntimeError, mapAgentRuntimeFailure } from "./agent-runtime-model-failure";
import { usageFromAgentRuntime, sumReaderSummaryUsage, assertReaderSummaryRepairWithinBudget } from "./agent-runtime-model-usage";

describe("Agent Runtime failure and usage policies", () => {
  it("keeps missing runtime failure fail-closed and retryable", () => {
    expect(mapAgentRuntimeFailure(undefined, "synthetic task failed")).toEqual({
      kind: "provider_unavailable", retryable: true, message: "synthetic task failed",
    });
    expect(classifyAgentRuntimeError(new Error("synthetic schema invalid"), "fallback"))
      .toMatchObject({ kind: "invalid_schema", retryable: false });
  });

  it("tracks physical usage across paid repair attempts", () => {
    const estimate = { inputTokens: 100, outputTokens: 20, estimatedCostUsd: 0.1 };
    expect(usageFromAgentRuntime(undefined, estimate)).toEqual(estimate);
    const spent = sumReaderSummaryUsage(estimate, estimate);
    expect(spent).toEqual({ inputTokens: 200, outputTokens: 40, estimatedCostUsd: 0.2 });
    expect(() => assertReaderSummaryRepairWithinBudget(spent, estimate, {
      remainingTokens: 250, remainingCostUsd: 1,
    })).toThrow("Daily editorial writer cannot repair within the shared model budget");
  });
});
