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
const maximumTopStoryCitationCount = 4;

type SelectedEvidenceItem =
  ReaderSummaryModelInput["evidence"]["selectedEvidence"][number];
type StoryCluster = ReaderSummaryModelInput["evidence"]["clusters"][number];

export const normalizeTopStories = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
  if (input.evidence.editorialSlate?.top.length === 0 ||
      (input.evidence.editorialSlate === undefined &&
        input.coveragePlan.lead === undefined)) {
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
  const clusterByFeedItemId = clusterIdByFeedItemId(input);
  const repaired = values
    .map(normalizeTopStory)
    .flatMap((story): readonly ReaderSummaryTopStory[] => {
      const citationIds = knownStringSubset(
        story.citationIds,
        knownCitationIds,
      );
      if (citationIds.length === 0) {
        return [];
      }

      const citedClusterIds = clusterIdsFromCitations(
        citationIds,
        citationById,
        clusterByFeedItemId,
      );
      if (citedClusterIds.length > 1) {
        return [];
      }

      const declaredClusterId = knownClusterIds.has(story.storyClusterId)
        ? story.storyClusterId
        : undefined;
      const citedClusterId = citedClusterIds[0];
      if (
        declaredClusterId !== undefined &&
        citedClusterId !== undefined &&
        declaredClusterId !== citedClusterId
      ) {
        return [];
      }

      const storyClusterId = declaredClusterId ?? citedClusterId;
      if (storyClusterId === undefined) {
        return [];
      }

      const cluster = clusterById.get(storyClusterId);
      if (cluster === undefined) {
        return [];
      }
      const providerKeys = uniqueNonEmptyStrings([
        ...story.providerKeys,
        ...cluster.providerKeys,
      ]);
      const completedCitationIds = completeClusterCitationCoverage({
        citationIds,
        providerKeys,
        cluster,
        citationById,
      });
      if (completedCitationIds.length === 0) {
        return [];
      }

      return [
        {
          ...story,
          storyClusterId,
          interestIds: uniqueNonEmptyStrings([
            ...story.interestIds,
            ...cluster.interestIds,
          ]),
          providerKeys: providerKeysCoveredByCitations(
            providerKeys,
            completedCitationIds,
            citationById,
          ),
          citationIds: completedCitationIds,
        },
      ];
    });

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

export const clusterIdFromCitations = (
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  input: ReaderSummaryModelInput,
): string | undefined =>
  clusterIdsFromCitations(
    citationIds,
    citationById,
    clusterIdByFeedItemId(input),
  )[0];

const clusterIdByFeedItemId = (
  input: ReaderSummaryModelInput,
): ReadonlyMap<string, string> =>
  new Map(
    input.evidence.clusters.flatMap((cluster) =>
      [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].map(
        (feedItemId) => [feedItemId, cluster.id] as const,
      ),
    ),
  );

const clusterIdsFromCitations = (
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
  clusterByFeedItemId: ReadonlyMap<string, string>,
): readonly string[] =>
  uniqueNonEmptyStrings(
    citationIds.flatMap((citationId) => {
      const citation = citationById.get(citationId);
      const clusterId =
        citation === undefined
          ? undefined
          : clusterByFeedItemId.get(citation.feedItemId);

      return clusterId === undefined ? [] : [clusterId];
    }),
  );

const completeClusterCitationCoverage = (params: {
  readonly citationIds: readonly string[];
  readonly providerKeys: readonly string[];
  readonly cluster: StoryCluster;
  readonly citationById: ReadonlyMap<string, ReaderSummaryCitation>;
}): readonly string[] => {
  const clusterFeedItemIds = new Set([
    params.cluster.representativeFeedItemId,
    ...params.cluster.duplicateFeedItemIds,
  ]);
  const clusterCitationIds = [...params.citationById.values()]
    .filter((citation) => clusterFeedItemIds.has(citation.feedItemId))
    .map((citation) => citation.citationId);
  const candidateCitationIds = uniqueNonEmptyStrings([
    ...params.citationIds.filter((citationId) =>
      clusterCitationIds.includes(citationId),
    ),
    ...clusterCitationIds,
  ]);
  const coverageCitationIds = params.providerKeys.flatMap((providerKey) => {
    const citationId = candidateCitationIds.find(
      (candidateId) =>
        params.citationById.get(candidateId)?.providerKey === providerKey,
    );

    return citationId === undefined ? [] : [citationId];
  });

  return uniqueNonEmptyStrings([
    ...coverageCitationIds,
    ...candidateCitationIds,
  ]).slice(0, maximumTopStoryCitationCount);
};

const providerKeysCoveredByCitations = (
  providerKeys: readonly string[],
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): readonly string[] => {
  const citedProviderKeys = new Set(
    citationIds.flatMap((citationId) => {
      const providerKey = citationById.get(citationId)?.providerKey;

      return providerKey === undefined ? [] : [providerKey];
    }),
  );

  return providerKeys.filter((providerKey) =>
    citedProviderKeys.has(providerKey),
  );
};

const normalizeTopStory = (
  value: Record<string, unknown>,
): ReaderSummaryTopStory => {
  const storyClusterId = optionalString(value.storyClusterId) ?? "";
  const modelSummary = optionalString(value.summary) ??
    optionalString(value.description);
  const citationIds = normalizeStringArrayLike(
    value.citationIds,
    "top story citations",
  );
  return {
    storyClusterId,
    title: optionalString(value.title) ?? "Cited story",
    summary:
      modelSummary ??
      "Selected evidence supports this story.",
    interestIds: normalizeStringArrayLike(
      value.interestIds,
      "top story interests",
    ),
    providerKeys: normalizeStringArrayLike(
      value.providerKeys,
      "top story providers",
    ),
    citationIds,
    // Never read provenance supplied by the model. Keep its complete original
    // binding before unknown citations, cluster repair, or coverage completion.
    readerReasonProvenance: modelSummary === undefined
      ? { kind: "normalizer_fallback" }
      : {
          kind: "model",
          originalStoryClusterId: storyClusterId,
          originalCitationIds: [...citationIds],
          originalSummary: modelSummary,
        },
  };
};

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

const immutableEditorialSlateTopStories = (
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
