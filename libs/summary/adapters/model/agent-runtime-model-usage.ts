import type { AgentRuntimeUsage, ReaderSummaryModelBudget } from "../../ports";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-failure";

export type AgentRuntimeModelEstimate = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
};

export const usageFromAgentRuntime = (
  usage: AgentRuntimeUsage | undefined,
  estimate: AgentRuntimeModelEstimate,
): AgentRuntimeModelEstimate => {
  if (usage === undefined) {
    return estimate;
  }

  return {
    inputTokens: nonNegativeIntegerOrFallback(
      usage.inputTokens,
      estimate.inputTokens,
    ),
    outputTokens: nonNegativeIntegerOrFallback(
      usage.outputTokens,
      estimate.outputTokens,
    ),
    estimatedCostUsd:
      Number.isFinite(usage.estimatedCostUsd) && usage.estimatedCostUsd >= 0
        ? usage.estimatedCostUsd
        : estimate.estimatedCostUsd,
  };
};

const nonNegativeIntegerOrFallback = (
  value: number,
  fallback: number,
): number =>
  Number.isInteger(value) && value >= 0
    ? value
    : fallback;

/** Aggregate the physical usage of primary and repair attempts. */
export const sumReaderSummaryUsage = (
  accumulated: AgentRuntimeModelEstimate | undefined,
  attempt: AgentRuntimeModelEstimate,
): AgentRuntimeModelEstimate => accumulated === undefined
  ? attempt
  : {
      inputTokens: accumulated.inputTokens + attempt.inputTokens,
      outputTokens: accumulated.outputTokens + attempt.outputTokens,
      estimatedCostUsd: accumulated.estimatedCostUsd + attempt.estimatedCostUsd,
    };

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
