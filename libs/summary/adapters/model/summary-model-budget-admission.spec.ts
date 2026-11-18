import { exceedsSummaryModelBudget } from "./summary-model-budget-admission";
import { assertOpenAiSummaryWithinBudget } from "./openai-responses-summary-budget";
import { SummaryModelProviderError } from "./openai-responses-summary-model-error";
import { isReaderSummaryBudgetExceeded } from "./reader-summary-token-budget";
import { assertDeterministicReaderSummaryBudget } from "./deterministic-reader-summary-budget-policy";

const estimate = Object.freeze({
  inputTokens: 110, outputTokens: 40, estimatedCostUsd: 0.002,
});
const policy = Object.freeze({
  maxInputTokens: 110, maxOutputTokens: 40, maxEstimatedCostUsd: 0.002,
});
const remaining = Object.freeze({
  remainingTokens: 150, remainingCostUsd: 0.002,
});

describe("provider-neutral summary model budget admission", () => {
  it("accepts equality in all five gates with unchanged provider semantics", () => {
    expect(exceedsSummaryModelBudget(estimate, policy, remaining)).toBe(false);
    expect(isReaderSummaryBudgetExceeded(estimate, {
      ...policy, preferredProvider: "deterministic-local",
    }, remaining)).toBe(false);
    expect(() => assertOpenAiSummaryWithinBudget(estimate, {
      ...policy, preferredProvider: "openai-responses",
    }, remaining)).not.toThrow();
    expect(() => assertDeterministicReaderSummaryBudget(estimate, {
      ...policy, preferredProvider: "deterministic-local",
    }, remaining)).not.toThrow();
  });

  const denied = [
    ["policy input cap", { inputTokens: 111 }, {}, {}],
    ["policy output cap", { outputTokens: 41 }, {}, {}],
    ["policy estimated cost", { estimatedCostUsd: 0.003 }, {}, {}],
    ["shared remaining tokens", {}, {}, { remainingTokens: 149 }],
    ["shared remaining cost", {}, {}, { remainingCostUsd: 0.001 }],
  ] as const;

  it.each(denied)("rejects %s identically without mutating inputs", (
    _label, usageDelta, policyDelta, budgetDelta,
  ) => {
    const actualEstimate = Object.freeze({ ...estimate, ...usageDelta });
    const actualPolicy = Object.freeze({ ...policy, ...policyDelta });
    const actualBudget = Object.freeze({ ...remaining, ...budgetDelta });
    const prior = JSON.stringify([actualEstimate, actualPolicy, actualBudget]);

    expect(exceedsSummaryModelBudget(actualEstimate, actualPolicy, actualBudget)).toBe(true);
    expect(isReaderSummaryBudgetExceeded(actualEstimate, {
      ...actualPolicy, preferredProvider: "deterministic-local",
    }, actualBudget)).toBe(true);
    expect(() => assertOpenAiSummaryWithinBudget(actualEstimate, {
      ...actualPolicy, preferredProvider: "openai-responses",
    }, actualBudget)).toThrow(SummaryModelProviderError);
    expect(() => assertDeterministicReaderSummaryBudget(actualEstimate, {
      ...actualPolicy, preferredProvider: "deterministic-local",
    }, actualBudget)).toThrow("Reader summary model budget exceeded");
    expect(JSON.stringify([actualEstimate, actualPolicy, actualBudget])).toBe(prior);
  });
});
