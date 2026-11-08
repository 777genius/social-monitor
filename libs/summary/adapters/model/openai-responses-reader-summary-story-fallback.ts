import type { ReaderSummaryCitation, ReaderSummaryTopStory } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import {
  firstNonEmptyString,
  uniqueNonEmptyStrings,
} from "./openai-responses-reader-summary-json";
import { maximumTopStoryCitationCount } from "./openai-responses-reader-summary-story-citations";

type SelectedEvidenceItem = ReaderSummaryModelInput["evidence"]["selectedEvidence"][number];
const minimumUsefulTopStoryCount = 8;

export const fallbackTopStories = (
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  const citationByFeedItemId = new Map(
    citationMap.map((citation) => [citation.feedItemId, citation] as const),
  );
  const evidenceByFeedItemId = new Map(
    input.evidence.selectedEvidence.map(
      (item) => [item.feedItemId, item] as const,
    ),
  );

  return input.evidence.clusters
    .flatMap((cluster): readonly ReaderSummaryTopStory[] => {
      const feedItemIds = [
        cluster.representativeFeedItemId,
        ...cluster.duplicateFeedItemIds,
      ];
      const citationIds = feedItemIds
        .map((feedItemId) => citationByFeedItemId.get(feedItemId)?.citationId)
        .filter((citationId): citationId is string => citationId !== undefined);
      const evidence = feedItemIds
        .map((feedItemId) => evidenceByFeedItemId.get(feedItemId))
        .filter((item): item is SelectedEvidenceItem => item !== undefined);
      const leadEvidence = evidence[0];
      if (citationIds.length === 0 || leadEvidence === undefined) {
        return [];
      }

      return [
        {
          storyClusterId: cluster.id,
          title: leadEvidence.title,
          summary: firstNonEmptyString(
            leadEvidence.bodyPreview,
            cluster.whyImportant[0],
            leadEvidence.title,
          ),
          readerReasonProvenance: { kind: "normalizer_fallback" },
          interestIds: uniqueNonEmptyStrings([
            ...cluster.interestIds,
            leadEvidence.interestId,
          ]),
          providerKeys: uniqueNonEmptyStrings([
            ...cluster.providerKeys,
            leadEvidence.providerKey,
          ]),
          citationIds: uniqueNonEmptyStrings(citationIds).slice(
            0,
            maximumTopStoryCitationCount,
          ),
        },
      ];
    })
    .slice(
      0,
      input.evidence.editorialSlate?.top.length ?? input.policy.maxStories,
    );
};

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

