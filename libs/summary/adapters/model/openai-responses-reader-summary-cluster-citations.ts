import type { ReaderSummaryCitation } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { uniqueNonEmptyStrings } from "./openai-responses-reader-summary-json";

// Cluster identity depends solely on trusted evidence bindings, never model-declared IDs.
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
