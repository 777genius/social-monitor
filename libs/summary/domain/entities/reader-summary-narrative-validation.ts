import type { ReaderSummaryClaim } from "./reader-summary-claim";
import type { ReaderSummaryNarrativeSection } from "./reader-summary-narrative-section";

export const assertReaderSummaryNarrativeSections = (
  sections: readonly ReaderSummaryNarrativeSection[],
  knownCitationIds: ReadonlySet<string>,
  storyClusterIds: ReadonlySet<string>,
): void => {
  for (const section of sections) {
    if (
      section.id.trim().length === 0 ||
      section.title.trim().length === 0 ||
      section.text.trim().length === 0
    ) {
      throw new Error("Reader summary narrative sections must be non-empty");
    }
    if (section.citationIds.some((id) => !knownCitationIds.has(id))) {
      throw new Error(
        "Reader summary narrative section cites evidence outside citation map",
      );
    }
    if (
      section.storyClusterId !== undefined &&
      !storyClusterIds.has(section.storyClusterId)
    ) {
      throw new Error(
        "Reader summary narrative section cluster must exist in evidence",
      );
    }
  }
};

export const assertReaderSummaryClaimIdentity = (
  claim: ReaderSummaryClaim,
): void => {
  if (claim.id !== undefined && claim.id.trim().length === 0) {
    throw new Error("Reader summary claim id must be non-empty when present");
  }
};
