import type { ReaderSummaryCitation, ReaderSummaryTopStory } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { knownStringSubset, uniqueNonEmptyStrings } from "./openai-responses-reader-summary-json";
import { normalizeTopStory } from "./openai-responses-reader-summary-story-input";

type StoryCluster = ReaderSummaryModelInput["evidence"]["clusters"][number];
export const maximumTopStoryCitationCount = 4;

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

export const clusterIdByFeedItemId = (
  input: ReaderSummaryModelInput,
): ReadonlyMap<string, string> =>
  new Map(
    input.evidence.clusters.flatMap((cluster) =>
      [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].map(
        (feedItemId) => [feedItemId, cluster.id] as const,
      ),
    ),
  );

export const clusterIdsFromCitations = (
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

export const completeClusterCitationCoverage = (params: {
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

export const providerKeysCoveredByCitations = (
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


// Fail-closed reconciliation of untrusted model-supplied story identities against
// selected, cited evidence. Fallback/coverage decisions belong to the caller.
export const reconcileModelTopStoriesWithCitations = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryTopStory[] => {
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

  return repaired;
};
