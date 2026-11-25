import {
  independentEvidenceProviderKeys,
  isReaderSummaryWatchEligibleEvidence,
  type ReaderSummaryCitation,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";

/** Trusted watch admission, separate from narrative copy/fallback. */
export const watchEligibleCitationIds = (
  input: ReaderSummaryModelInput,
  citationMap: readonly ReaderSummaryCitation[],
): ReadonlySet<string> => {
  const evidenceById = new Map(
    input.evidence.selectedEvidence.map(
      (evidence) => [evidence.feedItemId, evidence] as const,
    ),
  );
  const crossProviderEvidenceIds = new Set<string>();

  for (const cluster of input.evidence.clusters) {
    const clusterEvidence = [
      cluster.representativeFeedItemId,
      ...cluster.duplicateFeedItemIds,
    ].flatMap((feedItemId) => {
      const evidence = evidenceById.get(feedItemId);

      return evidence === undefined ? [] : [evidence];
    });

    if (independentEvidenceProviderKeys(clusterEvidence).length > 1) {
      for (const evidence of clusterEvidence) {
        crossProviderEvidenceIds.add(evidence.feedItemId);
      }
    }
  }

  return new Set(
    citationMap
      .filter((citation) => {
        const evidence = evidenceById.get(citation.feedItemId);

        return (
          evidence !== undefined &&
          isReaderSummaryWatchEligibleEvidence({
            evidence,
            crossProviderSupported: crossProviderEvidenceIds.has(
              evidence.feedItemId,
            ),
          })
        );
      })
      .map((citation) => citation.citationId),
  );
};
