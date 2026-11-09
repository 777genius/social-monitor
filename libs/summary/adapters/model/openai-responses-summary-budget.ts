import type {
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelPolicy,
} from "../../ports";
import { buildPromptPayload } from "./openai-responses-summary-prompt";
import { SummaryModelProviderError } from "./openai-responses-summary-model-error";

/** Provider pricing and token estimate policy, independent of HTTP orchestration. */
export type OpenAiSummaryEstimationSettings = {
  readonly maxOutputTokens: number;
  readonly inputTokenDivisor: number;
  readonly estimatedInputCostUsdPerMillionTokens: number;
  readonly estimatedOutputCostUsdPerMillionTokens: number;
};

export const estimateOpenAiSummaryUsage = (
  input: SummaryModelInput,
  settings: OpenAiSummaryEstimationSettings,
): SummaryModelEstimate => {
  const inputTokens = Math.ceil(
    buildPromptPayload(input).length / settings.inputTokenDivisor,
  );
  const outputTokens =
    input.evidence.items.length === 0
      ? 96
      : Math.min(
          settings.maxOutputTokens,
          Math.max(256, input.policy.maxKeyPoints * 220),
        );
  const estimatedCostUsd =
    (inputTokens * settings.estimatedInputCostUsdPerMillionTokens +
      outputTokens * settings.estimatedOutputCostUsdPerMillionTokens) /
    1_000_000;

  return { inputTokens, outputTokens, estimatedCostUsd };
};

/** Preserve the same policy, remaining-token and remaining-cost rejection order. */
export const assertOpenAiSummaryWithinBudget = (
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
    throw new SummaryModelProviderError({
      kind: "budget_exceeded",
      retryable: false,
      message: "Summary model budget exceeded",
    });
  }
};
