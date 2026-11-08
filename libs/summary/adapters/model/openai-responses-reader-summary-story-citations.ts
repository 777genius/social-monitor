import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { uniqueNonEmptyStrings } from "./openai-responses-reader-summary-json";

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

