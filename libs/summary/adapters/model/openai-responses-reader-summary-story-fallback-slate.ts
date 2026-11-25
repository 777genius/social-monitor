import type { ReaderSummaryCitation, ReaderSummaryTopStory } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { fallbackTopStories } from "./openai-responses-reader-summary-story-fallback-evidence";

// Immutable editorial Top slots are not reordered or filled from outside the slate.
export const immutableEditorialSlateTopStories = (
  modelStories: readonly ReaderSummaryTopStory[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  const modelByClusterId = new Map(modelStories.map((story) =>
    [story.storyClusterId, story] as const));
  const fallbackByClusterId = new Map(
    fallbackTopStories(input, citationMap).map((story) =>
      [story.storyClusterId, story] as const),
  );
  return (input.evidence.editorialSlate?.top ?? []).map((entry) => {
    const story = modelByClusterId.get(entry.storyClusterId) ??
      fallbackByClusterId.get(entry.storyClusterId);
    if (story === undefined) {
      throw new Error(
        `Editorial slate Top entry has no citable evidence: ${entry.candidateId}`,
      );
    }
    return { ...story, storyClusterId: entry.storyClusterId };
  });
};
