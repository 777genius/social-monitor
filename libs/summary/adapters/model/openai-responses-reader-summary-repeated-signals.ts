import type { ReaderSummaryCitation, ReaderSummaryRepeatedSignal } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { knownStringSubset, normalizeStringArrayLike, optionalString, uniqueNonEmptyStrings } from "./openai-responses-reader-summary-json";
import { clusterIdFromCitations } from "./openai-responses-reader-summary-story-citations";

const normalizeRepeatedSignal = (
  value: Record<string, unknown>,
): ReaderSummaryRepeatedSignal => ({
  storyClusterId: optionalString(value.storyClusterId) ?? "",
  title: optionalString(value.title) ?? "Repeated signal",
  interestIds: normalizeStringArrayLike(
    value.interestIds,
    "repeated signal interests",
  ),
  citationIds: normalizeStringArrayLike(
    value.citationIds,
    "repeated signal citations",
  ),
});

export const normalizeRepeatedSignals = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryRepeatedSignal[] => {
  const knownClusterIds = new Set(
    input.evidence.clusters.map((cluster) => cluster.id),
  );
  const citationById = new Map(
    citationMap.map((citation) => [citation.citationId, citation] as const),
  );
  const knownCitationIds = new Set(citationById.keys());

  return values
    .map(normalizeRepeatedSignal)
    .flatMap((signal): readonly ReaderSummaryRepeatedSignal[] => {
      const storyClusterId = knownClusterIds.has(signal.storyClusterId)
        ? signal.storyClusterId
        : clusterIdFromCitations(signal.citationIds, citationById, input);
      if (storyClusterId === undefined) {
        return [];
      }

      const citationIds = knownStringSubset(
        signal.citationIds,
        knownCitationIds,
      );
      const interestIds = uniqueNonEmptyStrings(signal.interestIds);
      if (citationIds.length === 0 || interestIds.length < 2) {
        return [];
      }

      return [
        {
          ...signal,
          storyClusterId,
          interestIds,
          citationIds,
        },
      ];
    });
};
