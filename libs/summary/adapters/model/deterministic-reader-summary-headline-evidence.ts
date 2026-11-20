import type { ReaderSummaryModelInput } from "../../ports";

/** Editorial slate order belongs to trusted headline selection, not publication assembly.
 * Deliberately retains duplicate candidate IDs and skips missing IDs, as the original
 * deterministic model did; selectedEvidence is used unchanged without a slate.
 */
export const selectDeterministicReaderSummaryHeadlineEvidence = (
  input: ReaderSummaryModelInput,
  selectedEvidence: ReaderSummaryModelInput["evidence"]["selectedEvidence"],
): ReaderSummaryModelInput["evidence"]["selectedEvidence"] => {
    const headlineEvidence = input.evidence.editorialSlate === undefined
      ? selectedEvidence
      : input.evidence.editorialSlate.orderedCandidateIds.flatMap(
          (candidateId) => {
            const item = input.evidence.selectedEvidence.find(
              (evidence) => evidence.feedItemId === candidateId,
            );
            return item === undefined ? [] : [item];
          },
        );
  return headlineEvidence;
};
