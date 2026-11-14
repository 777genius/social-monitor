import type { ReaderSummaryCitation, ReaderSummaryTopStory } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { fallbackTopStories } from "./openai-responses-reader-summary-story-fallback-evidence";
const minimumUsefulTopStoryCount = 8;

// Planned coverage and evidence-safe top-up are independent of slate admission.
export const topUpTopStories = (
  stories: readonly ReaderSummaryTopStory[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  const fallbackStories = fallbackTopStories(input, citationMap);
  const targetCount = Math.min(
    input.policy.maxStories,
    minimumUsefulTopStoryCount,
    fallbackStories.length,
  );

  if (stories.length >= targetCount) {
    return stories;
  }

  const selectedClusterIds = new Set(
    stories.map((story) => story.storyClusterId),
  );
  const selectedCitationIds = new Set(
    stories.flatMap((story) => story.citationIds),
  );
  const topUps = fallbackStories.filter(
    (story) =>
      !selectedClusterIds.has(story.storyClusterId) &&
      story.citationIds.every(
        (citationId) => !selectedCitationIds.has(citationId),
      ),
  );

  return [...stories, ...topUps].slice(0, targetCount);
};

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
