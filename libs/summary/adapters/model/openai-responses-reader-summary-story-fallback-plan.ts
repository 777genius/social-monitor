import type { ReaderSummaryCitation, ReaderSummaryTopStory } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { fallbackTopStories } from "./openai-responses-reader-summary-story-fallback-evidence";

// Explicit lead/secondary coverage plan priorities; no ad hoc top-ups here.
export const ensureCoveragePlanStories = (
  stories: readonly ReaderSummaryTopStory[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  const plannedClusterIds = [
    input.coveragePlan.lead?.clusterId,
    ...input.coveragePlan.secondary.map((item) => item.clusterId),
  ].filter((clusterId): clusterId is string => clusterId !== undefined);
  if (plannedClusterIds.length === 0) {
    return stories;
  }

  const storyByClusterId = new Map(
    stories.map((story) => [story.storyClusterId, story] as const),
  );
  const fallbackByClusterId = new Map(
    fallbackTopStories(input, citationMap).map(
      (story) => [story.storyClusterId, story] as const,
    ),
  );
  const plannedStories = plannedClusterIds.flatMap((clusterId) => {
    const story =
      storyByClusterId.get(clusterId) ?? fallbackByClusterId.get(clusterId);

    return story === undefined ? [] : [story];
  });
  const plannedSet = new Set(
    plannedStories.map((story) => story.storyClusterId),
  );

  return [
    ...plannedStories,
    ...stories.filter((story) => !plannedSet.has(story.storyClusterId)),
  ];
};
