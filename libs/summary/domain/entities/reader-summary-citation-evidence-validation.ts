import type { SummaryEvidenceSelection } from "../value-objects/summary-evidence-item";
import type { GeneratedReaderSummaryDraft } from "./reader-summary-artifact";

export const assertReaderSummaryCitationsAgainstEvidence = (
  draft: Pick<
    GeneratedReaderSummaryDraft,
    | "citationMap"
    | "topStories"
    | "topicHighlights"
    | "repeatedSignals"
    | "risksAndUnknowns"
  >,
  evidence: SummaryEvidenceSelection,
): void => {
  const selectedFeedItemIds = new Set(
    evidence.sourceWindow.selectedFeedItemIds,
  );

  for (const citation of draft.citationMap) {
    if (!selectedFeedItemIds.has(citation.feedItemId)) {
      throw new Error(
        `Reader summary citation ${citation.citationId} references evidence outside selection`,
      );
    }
  }
};
