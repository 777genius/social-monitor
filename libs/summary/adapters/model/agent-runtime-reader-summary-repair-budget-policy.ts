import type { ReaderSummaryModelBudget } from "../../ports";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-failure";
import type { AgentRuntimeModelEstimate } from "./agent-runtime-model-usage";

/** Refuse a paid retry when already-spent usage and its estimate cannot fit. */
export const assertReaderSummaryRepairWithinBudget = (
  spent: AgentRuntimeModelEstimate,
  estimate: AgentRuntimeModelEstimate,
  budget: ReaderSummaryModelBudget | undefined,
): void => {
  if (budget !== undefined &&
      (spent.inputTokens + spent.outputTokens + estimate.inputTokens +
        estimate.outputTokens > budget.remainingTokens ||
       spent.estimatedCostUsd >= budget.remainingCostUsd ||
       spent.estimatedCostUsd + estimate.estimatedCostUsd > budget.remainingCostUsd)) {
    throw new AgentRuntimeModelProviderError({
      kind: "budget_exceeded", retryable: false,
      message: "Daily editorial writer cannot repair within the shared model budget",
    });
  }
};
