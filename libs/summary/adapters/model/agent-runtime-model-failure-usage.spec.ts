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

describe("agent runtime trust-boundary regression cases", () => {
  const failure = (overrides: Partial<NonNullable<Parameters<typeof mapAgentRuntimeFailure>[0]>> = {}) => ({
    code: "execution_failed",
    safeMessage: "Synthetic failure",
    retryable: false,
    reconnectRequired: false,
    causeCategory: "worker",
    details: {},
    ...overrides,
  });

  it("never lets untrusted validation path override the failure category", () => {
    expect(mapAgentRuntimeFailure(failure({
      details: { outputValidationPath: "quota_rate_limit" },
    }), "fallback")).toEqual({
      kind: "unknown", retryable: false,
      message: "Synthetic failure at quota_rate_limit",
    });
    expect(mapAgentRuntimeFailure(failure({
      code: "rate_limited", retryable: true,
      safeMessage: "Synthetic limit",
      details: { outputValidationPath: "draft.json" },
    }), "fallback")).toEqual({
      kind: "provider_rate_limited", retryable: true,
      message: "Synthetic limit at draft.json",
    });
  });

  it("retains reconnect advice without silently upgrading failure classification", () => {
    expect(mapAgentRuntimeFailure(failure({
      safeMessage: "", reconnectRequired: true,
    }), "Synthetic fallback")).toEqual({
      kind: "unknown", retryable: true, message: "Synthetic fallback",
    });
  });

  it("refuses paid repair at exact cost exhaustion, even with zero estimated tokens", () => {
    expect(() => assertReaderSummaryRepairWithinBudget(
      { inputTokens: 30, outputTokens: 5, estimatedCostUsd: 0.2 },
      { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
      { remainingTokens: 100, remainingCostUsd: 0.2 },
    )).toThrow("Daily editorial writer cannot repair within the shared model budget");
  });
});
