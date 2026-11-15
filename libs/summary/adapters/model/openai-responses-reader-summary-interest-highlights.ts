import type { ReaderSummaryCitation, ReaderSummaryInterestHighlight } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { knownStringSubset, normalizeStringArrayLike, optionalString } from "./openai-responses-reader-summary-json";

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
