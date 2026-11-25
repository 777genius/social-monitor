import type { ReaderSummaryCitation } from "../../domain";

/**
 * Translate only the trusted citation inventory to feed-item identifiers.
 * The last citation for a repeated feed item retains its historical priority.
 * Coverage-plan policy must not inspect model-produced citation claims.
 */
export const citationIdsForPlannedFeedItems = (
  citationMap: readonly ReaderSummaryCitation[],
): ((feedItemIds: readonly string[]) => Set<string>) => {
  const citationByFeedItemId = new Map(
    citationMap.map(
      (citation) => [citation.feedItemId, citation.citationId] as const,
    ),
  );
  const citationIdsFor = (feedItemIds: readonly string[]) =>
    new Set(
      feedItemIds
        .map((feedItemId) => citationByFeedItemId.get(feedItemId))
        .filter((id): id is string => id !== undefined),
    );
  return citationIdsFor;
};
