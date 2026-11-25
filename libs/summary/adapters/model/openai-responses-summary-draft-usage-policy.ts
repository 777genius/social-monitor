import type { GeneratedSummaryDraft } from '../../ports';

// Metering invariants are not a citation or narrative admission policy.
export const assertOpenAiSummaryDraftUsage = (
  draft: Pick<GeneratedSummaryDraft, 'usage'>,
): void => {
  if (
    !Number.isSafeInteger(draft.usage.inputTokens) || draft.usage.inputTokens < 0 ||
    !Number.isSafeInteger(draft.usage.outputTokens) || draft.usage.outputTokens < 0 ||
    !Number.isFinite(draft.usage.estimatedCostUsd) || draft.usage.estimatedCostUsd < 0
  ) {
    throw new Error('Summary usage values must be non-negative');
  }
};
