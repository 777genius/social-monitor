import type { ReaderSummaryNarrativeSection } from "../../domain";
import {
  isValidReaderSummaryNarrativeLead,
  type ReaderSummaryNarrativeCoverage,
} from "./openai-responses-reader-summary-narrative-coverage";
import { validSecondarySection } from "./openai-responses-reader-summary-narrative-secondary-coverage";

// Trust admission is independent of projecting provider-authored text and titles.
// The caller has already decoded the citation IDs against the trusted map.
export const isAdmissibleGroundedNarrativeSection = (params: {
  readonly kind: ReaderSummaryNarrativeSection["kind"];
  readonly authoredStoryClusterId: string | undefined;
  readonly storyClusterId: string | undefined;
  readonly citationIds: readonly string[];
  readonly coverage: ReaderSummaryNarrativeCoverage;
  readonly citationsAllowed: (
    kind: ReaderSummaryNarrativeSection["kind"] | undefined,
    citationIds: readonly string[],
  ) => boolean;
}): boolean => {
  const {
    kind,
    authoredStoryClusterId,
    storyClusterId,
    citationIds,
    coverage,
    citationsAllowed,
  } = params;
  if (
    kind === "lead" &&
    coverage.mode === "single_story" &&
    authoredStoryClusterId !== undefined &&
    authoredStoryClusterId !== coverage.leadClusterId
  ) {
    return false;
  }
  if (!citationsAllowed(kind, citationIds)) {
    return false;
  }
  if (
    kind === "secondary_signal" &&
    !validSecondarySection(
      storyClusterId,
      citationIds,
      coverage.secondaryCitationIds,
    )
  ) {
    return false;
  }
  if (
    kind === "lead" &&
    !isValidReaderSummaryNarrativeLead(citationIds, coverage)
  ) {
    return false;
  }
  return true;
};
