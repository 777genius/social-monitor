import type { ReaderSummaryCitation, ReaderSummaryTopStory } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { knownStringSubset, uniqueNonEmptyStrings } from "./openai-responses-reader-summary-json";
import { normalizeTopStory } from "./openai-responses-reader-summary-story-input";
import {
  clusterIdByFeedItemId,
  clusterIdsFromCitations,
} from "./openai-responses-reader-summary-cluster-citations";
import {
  completeClusterCitationCoverage,
  providerKeysCoveredByCitations,
} from "./openai-responses-reader-summary-citation-coverage";

// Historical direct-import surface remains the same function objects.
export {
  clusterIdFromCitations,
  clusterIdByFeedItemId,
  clusterIdsFromCitations,
} from "./openai-responses-reader-summary-cluster-citations";
export {
  maximumTopStoryCitationCount,
  completeClusterCitationCoverage,
  providerKeysCoveredByCitations,
} from "./openai-responses-reader-summary-citation-coverage";

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
