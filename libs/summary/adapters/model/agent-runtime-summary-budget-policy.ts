import type {
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelPolicy,
} from "../../ports";
import { buildPromptPayload } from "./openai-responses-summary-prompt";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-support";

/** Admission is a pure policy: never dispatch a paid task before all limits pass. */
export const assertAgentRuntimeSummaryWithinBudget = (
  estimate: SummaryModelEstimate,
  policy: SummaryModelPolicy,
  budget: SummaryModelBudget,
): void => {
  if (
    estimate.inputTokens > policy.maxInputTokens ||
    estimate.outputTokens > policy.maxOutputTokens ||
    estimate.estimatedCostUsd > policy.maxEstimatedCostUsd ||
    estimate.inputTokens + estimate.outputTokens > budget.remainingTokens ||
    estimate.estimatedCostUsd > budget.remainingCostUsd
  ) {
    throw new AgentRuntimeModelProviderError({
      kind: "budget_exceeded",
      retryable: false,
      message: "Summary model budget exceeded",
    });
  }
};

/** Preserve the agent-runtime summary's distinct no-evidence 96-token reserve. */
export const estimateAgentRuntimeSummaryUsage = (
  input: SummaryModelInput,
  inputTokenDivisor: number,
  maxOutputTokens: number,
): SummaryModelEstimate => {
  const inputTokens = Math.ceil(
    buildPromptPayload(input).length / inputTokenDivisor,
  );
  const outputTokens =
    input.evidence.items.length === 0
      ? 96
      : Math.min(
          maxOutputTokens,
          Math.max(256, input.policy.maxKeyPoints * 220),
        );

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: 0,
  };
};
