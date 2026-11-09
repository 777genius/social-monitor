import type {
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelPolicy,
} from '../../ports';

/**
 * Deterministic model token accounting stays independent of route selection.
 * No external provider is called, and the estimated cost remains zero.
 */
export const estimateDeterministicSummaryTokens = (
  input: SummaryModelInput,
): SummaryModelEstimate => {
  const evidenceTextLength = input.evidence.items.reduce(
    (total, item) =>
      total + item.title.length + (item.bodyPreview?.length ?? 0),
    0,
  );
  const memoryTextLength = input.memoryContext?.renderedText?.length ?? 0;
  const inputTokens = Math.ceil(
    (input.interestId.length + evidenceTextLength + memoryTextLength) / 4,
  );
  const outputTokens = input.evidence.items.length === 0 ? 48 : 160;

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd: 0,
  };
};

/** Enforce all five historical route policy / remaining budget thresholds. */
export const assertDeterministicSummaryBudget = (
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
    throw new Error('Summary model budget exceeded');
  }
};
