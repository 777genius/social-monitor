import type {
  ReaderSummaryCitation,
  ReaderSummaryInterestHighlight,
  ReaderSummaryRepeatedSignal,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import {
  knownStringSubset,
  normalizeStringArrayLike,
  optionalString,
  uniqueNonEmptyStrings,
} from "./openai-responses-reader-summary-json";
import { clusterIdFromCitations } from "./openai-responses-reader-summary-story-citations";

const normalizeInterestHighlight = (
  value: Record<string, unknown>,
): ReaderSummaryInterestHighlight => ({
  interestId: optionalString(value.interestId) ?? "",
  title: optionalString(value.title) ?? "Interest signal",
  summary:
    optionalString(value.summary) ??
    optionalString(value.description) ??
    "Selected evidence mentions this interest.",
  citationIds: normalizeStringArrayLike(
    value.citationIds,
    "interest highlight citations",
  ),
});

export const normalizeInterestHighlights = (
  values: readonly Record<string, unknown>[],
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): readonly ReaderSummaryInterestHighlight[] => {
  const knownCitationIds = new Set(
    citationMap.map((citation) => citation.citationId),
  );
  const citationById = new Map(
    citationMap.map((citation) => [citation.citationId, citation] as const),
  );
  const evidenceByFeedItemId = new Map(
    input.evidence.selectedEvidence.map(
      (item) => [item.feedItemId, item] as const,
    ),
  );

  return values
    .map(normalizeInterestHighlight)
    .flatMap((highlight): readonly ReaderSummaryInterestHighlight[] => {
      const citationIds = knownStringSubset(
        highlight.citationIds,
        knownCitationIds,
      );
      if (citationIds.length === 0) {
        return [];
      }

      const interestId =
        optionalString(highlight.interestId) ??
        citationIds
          .map((citationId) => citationById.get(citationId)?.feedItemId)
          .map((feedItemId) =>
            feedItemId === undefined
              ? undefined
              : evidenceByFeedItemId.get(feedItemId)?.interestId,
          )
          .find((value): value is string => value !== undefined);
      if (interestId === undefined) {
        return [];
      }

      return [
        {
          ...highlight,
          interestId,
          citationIds,
        },
      ];
    });
};

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

