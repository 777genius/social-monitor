import type { ProviderReaderSummaryAttempt, ReaderSummaryModelInput } from "../../ports";

export const buildStorySummary = (
  title: string,
  interestIds: readonly string[],
  providerKeys: readonly string[],
): string =>
  `${title} appeared across ${interestIds.length} interest(s) and ${providerKeys.length} provider(s).`;

export const buildInterestHighlights = (
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
  citationMap: ProviderReaderSummaryAttempt["draft"]["citationMap"],
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
        citationMap.find((citation) => citation.feedItemId === item.feedItemId)
          ?.citationId ?? "c1",
      ],
    }));
};
