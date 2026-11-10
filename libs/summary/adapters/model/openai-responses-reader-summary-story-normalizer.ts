import type {
  ReaderSummaryCitation,
  ReaderSummaryTopStory,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { reconcileModelTopStoriesWithCitations } from "./openai-responses-reader-summary-story-citations";
import { normalizeDailyEditorialStories } from "./openai-responses-reader-summary-daily-editorial-stories";
export { clusterIdFromCitations } from "./openai-responses-reader-summary-story-citations";
import {
  fallbackTopStories,
  immutableEditorialSlateTopStories,
  topUpTopStories,
  ensureCoveragePlanStories,
} from "./openai-responses-reader-summary-story-fallback";

export const normalizeTopStories = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  if (input.dailyEditorialPlan !== undefined) {
    return normalizeDailyEditorialStories(values, input, citationMap);
  }
  if (input.evidence.editorialSlate?.top.length === 0 ||
      (input.evidence.editorialSlate === undefined &&
        input.coveragePlan.lead === undefined)) {
    return [];
  }

  const repaired = reconcileModelTopStoriesWithCitations(values, input, citationMap);
  const normalized =
    repaired.length === 0 ? fallbackTopStories(input, citationMap) : repaired;
  if (input.evidence.editorialSlate !== undefined) {
    return immutableEditorialSlateTopStories(
      normalized,
      input,
      citationMap,
    );
  }
  const coverageComplete = ensureCoveragePlanStories(
    normalized,
    input,
    citationMap,
  );

  return topUpTopStories(coverageComplete, input, citationMap).slice(
    0,
    input.policy.maxStories,
  );
};

