import type { SummaryModelBudget, SummaryModelEstimate, SummaryModelPolicy, SummaryModelRoute } from "../../ports";
import { SummaryModelProviderError } from "./openai-responses-summary-model-error";
import { admitOpenAiSummaryRoute } from "./openai-responses-summary-route-admission";

const policy: SummaryModelPolicy = Object.freeze({
  preferredProvider: "openai-responses", maxInputTokens: 110,
  maxOutputTokens: 40, maxEstimatedCostUsd: 0.002,
});
const budget: SummaryModelBudget = Object.freeze({
  remainingTokens: 150, remainingCostUsd: 0.002,
});
const usage: SummaryModelEstimate = Object.freeze({
  inputTokens: 110, outputTokens: 40, estimatedCostUsd: 0.002,
});

describe("OpenAI ordinary summary route identity/admission", () => {
  it("pins exact order, identity, freshness and equality-boundary admission", () => {
    const seen: SummaryModelRoute[] = [];
    const estimate = jest.fn((route: SummaryModelRoute) => {
      seen.push(route);
      return usage;
    });
    const params = Object.freeze({ model: "model-a", promptVersion: "prompt-a", policy, budget, estimate });
    const first = admitOpenAiSummaryRoute(params);
    const second = admitOpenAiSummaryRoute(params);
    expect(first).toEqual({
      provider: "openai-responses", model: "model-a",
      promptVersion: "prompt-a", schemaVersion: "summary.artifact.v1",
    });
    expect(Object.keys(first)).toEqual(["provider", "model", "promptVersion", "schemaVersion"]);
    expect(first).not.toBe(second);
    expect(seen).toEqual([first, second]);
    expect(estimate).toHaveBeenCalledTimes(2);
    expect(policy.maxInputTokens).toBe(110);
    expect(budget.remainingTokens).toBe(150);
  });

  const denied: readonly [string, SummaryModelEstimate, SummaryModelPolicy, SummaryModelBudget][] = [
    ["policy input", { ...usage, inputTokens: 111 }, policy, budget],
    ["policy output", { ...usage, outputTokens: 41 }, policy, budget],
    ["policy cost", { ...usage, estimatedCostUsd: 0.003 }, policy, budget],
    ["remaining tokens", usage, policy, { ...budget, remainingTokens: 149 }],
    ["remaining cost", usage, policy, { ...budget, remainingCostUsd: 0.001 }],
  ];
  it.each(denied)("rejects %s without any transport or retry", (_reason, estimateValue, limit, remaining) => {
    const estimate = jest.fn(() => estimateValue);
    let caught: unknown;
    try {
      admitOpenAiSummaryRoute({ model: "model-a", promptVersion: "prompt-a",
        policy: limit, budget: remaining, estimate });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SummaryModelProviderError);
    expect((caught as SummaryModelProviderError).failure).toEqual({
      kind: "budget_exceeded", retryable: false, message: "Summary model budget exceeded",
    });
    expect(estimate).toHaveBeenCalledTimes(1);
  });
});
