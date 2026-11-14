import type { ProviderReaderSummaryAttempt } from "../../ports";

/** Bind citations by trusted evidence identity, never by ranked story position.
 * The first cited occurrence wins, matching the historical Array.find behavior.
 */
export const indexDeterministicReaderSummaryCitations = (
  citations: ProviderReaderSummaryAttempt["draft"]["citationMap"],
): ReadonlyMap<string, string> => {
  const firstCitationIdByFeedItemId = new Map<string, string>();
  for (const citation of citations) {
    if (!firstCitationIdByFeedItemId.has(citation.feedItemId)) {
      firstCitationIdByFeedItemId.set(citation.feedItemId, citation.citationId);
    }
  }
  return firstCitationIdByFeedItemId;
};

/** Historical deterministic fallback remains c1 for a missing citation. */
export const citationIdForDeterministicReaderEvidence = (
  index: ReadonlyMap<string, string>,
  feedItemId: string,
): string => index.get(feedItemId) ?? "c1";
