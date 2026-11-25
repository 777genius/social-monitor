import type { AgentRuntimeUsage } from "../../ports";

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
  Number.isSafeInteger(value) && value >= 0
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

export { assertReaderSummaryRepairWithinBudget } from "./agent-runtime-reader-summary-repair-budget-policy";
