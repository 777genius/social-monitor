import type {
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelPolicy,
} from "../../ports";
import { assertOpenAiSummaryWithinBudget } from "./openai-responses-summary-budget";
import { SummaryModelProviderError } from "./openai-responses-summary-model-error";

const estimate: SummaryModelEstimate = {
  inputTokens: 110,
  outputTokens: 40,
  estimatedCostUsd: 0.002,
};
const policy: SummaryModelPolicy = {
  preferredProvider: "openai-responses",
  maxInputTokens: 110,
  maxOutputTokens: 40,
  maxEstimatedCostUsd: 0.002,
};
const budget: SummaryModelBudget = {
  remainingTokens: 150,
  remainingCostUsd: 0.002,
};

describe("OpenAI summary budget admission", () => {
  it("accepts exact configured and remaining limits", () => {
    expect(() => assertOpenAiSummaryWithinBudget(estimate, policy, budget))
      .not.toThrow();
  });

  const deniedCases: readonly [
    string,
    Partial<SummaryModelEstimate>,
    SummaryModelPolicy,
    SummaryModelBudget,
  ][] = [
    ["input limit", { inputTokens: 111 }, policy, budget],
    ["output limit", { outputTokens: 41 }, policy, budget],
    ["policy cost", { estimatedCostUsd: 0.003 }, policy, budget],
    ["remaining tokens", {}, policy, { ...budget, remainingTokens: 149 }],
    ["remaining cost", {}, policy, { ...budget, remainingCostUsd: 0.001 }],
  ];

  it.each(deniedCases)("denies %s without retrying", (_reason, delta, selectedPolicy, remaining) => {
    try {
      assertOpenAiSummaryWithinBudget(
        { ...estimate, ...delta },
        selectedPolicy,
        remaining,
      );
      throw new Error("Expected budget admission to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(SummaryModelProviderError);
      expect((error as SummaryModelProviderError).failure).toEqual({
        kind: "budget_exceeded",
        retryable: false,
        message: "Summary model budget exceeded",
      });
    }
  });
});
