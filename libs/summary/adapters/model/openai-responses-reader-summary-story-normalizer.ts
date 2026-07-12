import type {
  ReaderSummaryCitation,
  ReaderSummaryTopStory,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import {
  firstNonEmptyString,
  knownStringSubset,
  optionalString,
  requiredStringArray,
  uniqueNonEmptyStrings,
} from "./openai-responses-reader-summary-json";

const minimumUsefulTopStoryCount = 8;

type SelectedEvidenceItem =
  ReaderSummaryModelInput["evidence"]["selectedEvidence"][number];

export const normalizeTopStories = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  if (input.coveragePlan.lead === undefined) {
    return [];
  }

  const knownClusterIds = new Set(
    input.evidence.clusters.map((cluster) => cluster.id),
  );
  const clusterById = new Map(
    input.evidence.clusters.map((cluster) => [cluster.id, cluster] as const),
  );
  const citationById = new Map(
    citationMap.map((citation) => [citation.citationId, citation] as const),
  );
  const knownCitationIds = new Set(citationById.keys());
  const repaired = values
    .map(normalizeTopStory)
    .flatMap((story): readonly ReaderSummaryTopStory[] => {
      const storyClusterId = knownClusterIds.has(story.storyClusterId)
        ? story.storyClusterId
        : clusterIdFromCitations(story.citationIds, citationById, input);
      if (storyClusterId === undefined) {
        return [];
      }

      const citationIds = knownStringSubset(
        story.citationIds,
        knownCitationIds,
      );
      if (citationIds.length === 0) {
        return [];
      }

      const cluster = clusterById.get(storyClusterId);

      return [
        {
          ...story,
          storyClusterId,
          interestIds: uniqueNonEmptyStrings([
            ...story.interestIds,
            ...(cluster?.interestIds ?? []),
          ]),
          providerKeys: uniqueNonEmptyStrings([
            ...story.providerKeys,
            ...(cluster?.providerKeys ?? []),
          ]),
          citationIds,
        },
      ];
    });

  const normalized =
    repaired.length === 0 ? fallbackTopStories(input, citationMap) : repaired;
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

export const clusterIdFromCitations = (
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  input: ReaderSummaryModelInput,
): string | undefined => {
  const clusterByFeedItemId = new Map(
    input.evidence.clusters.flatMap((cluster) =>
      [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].map(
        (feedItemId) => [feedItemId, cluster.id] as const,
      ),
    ),
  );

  for (const citationId of citationIds) {
    const citation = citationById.get(citationId);
    const clusterId =
      citation === undefined
        ? undefined
        : clusterByFeedItemId.get(citation.feedItemId);
    if (clusterId !== undefined) {
      return clusterId;
    }
  }

  return undefined;
};

const normalizeTopStory = (
  value: Record<string, unknown>,
): ReaderSummaryTopStory => ({
  storyClusterId: optionalString(value.storyClusterId) ?? "",
  title: optionalString(value.title) ?? "Cited story",
  summary:
    optionalString(value.summary) ??
    optionalString(value.description) ??
    "Selected evidence supports this story.",
  interestIds: normalizeStringArrayLike(
    value.interestIds,
    "top story interests",
  ),
  providerKeys: normalizeStringArrayLike(
    value.providerKeys,
    "top story providers",
  ),
  citationIds: normalizeStringArrayLike(
    value.citationIds,
    "top story citations",
  ),
});

const normalizeStringArrayLike = (
  value: unknown,
  label: string,
): readonly string[] => {
  if (Array.isArray(value)) {
    return requiredStringArray(value, label);
  }

  const scalar = optionalString(value);
  if (scalar === undefined) {
    return [];
  }

  return uniqueNonEmptyStrings(scalar.split(","));
};

const fallbackTopStories = (
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
          interestIds: uniqueNonEmptyStrings([
            ...cluster.interestIds,
            leadEvidence.interestId,
          ]),
          providerKeys: uniqueNonEmptyStrings([
            ...cluster.providerKeys,
            leadEvidence.providerKey,
          ]),
          citationIds: uniqueNonEmptyStrings(citationIds).slice(0, 4),
        },
      ];
    })
    .slice(0, input.policy.maxStories);
};

const topUpTopStories = (
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

const ensureCoveragePlanStories = (
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
