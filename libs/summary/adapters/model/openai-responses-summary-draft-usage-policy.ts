import type { GeneratedSummaryDraft } from '../../ports';

// Metering invariants are not a citation or narrative admission policy.
export const assertOpenAiSummaryDraftUsage = (
  draft: Pick<GeneratedSummaryDraft, 'usage'>,
): void => {
  if (
    draft.usage.inputTokens < 0 ||
    draft.usage.outputTokens < 0 ||
    draft.usage.estimatedCostUsd < 0
  ) {
    throw new Error('Summary usage values must be non-negative');
  }
};
