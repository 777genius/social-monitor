import type { ProviderReaderSummaryAttempt, ReaderSummaryModelInput } from "../../ports";
import {
  citationIdForDeterministicReaderEvidence,
  indexDeterministicReaderSummaryCitations,
} from "./deterministic-reader-summary-citation-index";

// First-occurrence interest highlights are separate from story ranking.
export const buildInterestHighlightsWithIndex = (
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  citationIdsByFeedItemId: ReadonlyMap<string, string>,
) => {
  const firstByInterest = new Map<
    string,
    ReaderSummaryModelInput["evidence"]["selectedEvidence"][number]
  >();
  for (const item of selectedEvidence) {
    if (!firstByInterest.has(item.interestId)) {
      firstByInterest.set(item.interestId, item);
    }
  }

  return [...firstByInterest.entries()]
    .slice(0, 8)
    .map(([interestId, item]) => ({
      interestId,
      title: item.title,
      summary: item.whyImportant[0] ?? "Selected as a relevant summary signal.",
      citationIds: [
        citationIdForDeterministicReaderEvidence(citationIdsByFeedItemId, item.feedItemId),
      ],
    }));
};

// Preserve the original public helper contract for existing deterministic consumers.
export const buildInterestHighlights = (
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  citationMap: ProviderReaderSummaryAttempt["draft"]["citationMap"],
) => buildInterestHighlightsWithIndex(
  selectedEvidence,
  indexDeterministicReaderSummaryCitations(citationMap),
);
