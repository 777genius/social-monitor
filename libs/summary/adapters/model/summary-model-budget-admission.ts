/** Provider-neutral admission: all five limits apply before dispatch.
 * Failure projection belongs to each provider, not to this pure predicate.
 * Preserve comparison order and equality admission for existing adapters.
 */
export type SummaryBudgetEstimate = Readonly<{
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}>;

export type SummaryBudgetPolicyLimits = Readonly<{
  maxInputTokens: number;
  maxOutputTokens: number;
  maxEstimatedCostUsd: number;
}>;

export type SummaryBudgetRemaining = Readonly<{
  remainingTokens: number;
  remainingCostUsd: number;
}>;

export const exceedsSummaryModelBudget = (
  estimate: SummaryBudgetEstimate,
  policy: SummaryBudgetPolicyLimits,
  budget: SummaryBudgetRemaining,
): boolean =>
  estimate.inputTokens > policy.maxInputTokens ||
  estimate.outputTokens > policy.maxOutputTokens ||
  estimate.estimatedCostUsd > policy.maxEstimatedCostUsd ||
  estimate.inputTokens + estimate.outputTokens > budget.remainingTokens ||
  estimate.estimatedCostUsd > budget.remainingCostUsd;
