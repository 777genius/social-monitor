import type { GeneratedSummaryDraft } from '../../ports';
import { assertOpenAiSummaryDraftCitations } from './openai-responses-summary-draft-citations';
import { assertOpenAiSummaryDraftQuality } from './openai-responses-summary-draft-quality-policy';
import { assertOpenAiSummaryDraftUsage } from './openai-responses-summary-draft-usage-policy';

export { summaryQualityFlagSet } from './openai-responses-summary-draft-quality-policy';

export const assertOpenAiSummaryDraftShape = (
  draft: GeneratedSummaryDraft,
): void => {
  if (draft.headline.trim().length === 0) {
    throw new Error('Summary headline must be non-empty');
  }

  if (draft.executiveSummary.trim().length === 0) {
    throw new Error('Summary executive summary must be non-empty');
  }

  assertOpenAiSummaryDraftCitations(draft);


  assertOpenAiSummaryDraftQuality(draft);
  assertOpenAiSummaryDraftUsage(draft);
};
