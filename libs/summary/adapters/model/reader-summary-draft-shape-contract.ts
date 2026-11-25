import type { GeneratedReaderSummaryDraft } from "../../domain";

/** The normalized reader-summary trust contract, independent of transport and provider routing. */
export const assertOpenAiReaderSummaryDraftShape = (
  draft: GeneratedReaderSummaryDraft,
): void => {
  if (
    draft.headline.trim().length === 0 ||
    draft.executiveSummary.trim().length === 0
  ) {
    throw new Error(
      "Reader summary draft must include headline and executive summary",
    );
  }
  if (draft.confidence.score < 0 || draft.confidence.score > 1) {
    throw new Error("Reader summary confidence score must be between 0 and 1");
  }
  if (
    draft.topStories.length === 0 &&
    !draft.qualityFlags.includes("no_signal")
  ) {
    throw new Error(
      "Reader summary draft without top stories must be marked no_signal",
    );
  }
};
