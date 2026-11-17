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
  if (
    params.kind === "lead" &&
    params.coverage.mode === "single_story" &&
    params.authoredStoryClusterId !== undefined &&
    params.authoredStoryClusterId !== params.coverage.leadClusterId
  ) {
    return false;
  }
  if (!params.citationsAllowed(params.kind, params.citationIds)) {
    return false;
  }
  if (
    params.kind === "secondary_signal" &&
    !validSecondarySection(
      params.storyClusterId,
      params.citationIds,
      params.coverage.secondaryCitationIds,
    )
  ) {
    return false;
  }
  if (
    params.kind === "lead" &&
    !isValidReaderSummaryNarrativeLead(params.citationIds, params.coverage)
  ) {
    return false;
  }
  return true;
};
