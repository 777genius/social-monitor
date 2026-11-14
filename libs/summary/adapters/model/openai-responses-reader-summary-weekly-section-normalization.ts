import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import {
  expandedLegacySectionKeys,
  expandedLegacySectionKeysWithoutClaimType,
  hasExactKeys,
  normalizeExpandedLegacySectionKind,
} from "./openai-responses-reader-summary-weekly-response-shapes";
import {
  exactLegacyCitationRange,
  exactLegacyClaimType,
  legacyClaimTypeFromStories,
} from "./openai-responses-reader-summary-weekly-legacy-evidence-policy";

// The two wire envelopes share only section admission, not story validation.
export const normalizeExpandedWeeklySection = (
  input: ReaderSummaryWeeklyModelInput,
  rawSection: unknown,
  stories: unknown,
  label: string,
) => {
  const section = hasExactKeys(rawSection, expandedLegacySectionKeys)
    ? rawSection
    : hasExactKeys(rawSection, expandedLegacySectionKeysWithoutClaimType)
      ? {
          ...rawSection,
          claimType: legacyClaimTypeFromStories(stories, rawSection.storyId, label),
        }
      : undefined;
  if (section === undefined) {
    throw new Error(`${label} must contain exactly the supported fields`);
  }
  const citationIds = exactLegacyCitationRange(input, section, label);
  return {
    sectionId: section.sectionId,
    storyId: section.storyId,
    kind: normalizeExpandedLegacySectionKind(section.kind),
    claimType: exactLegacyClaimType(section.claimType, label),
    heading: section.headline,
    text: section.synthesis,
    observedFrom: section.observedFrom,
    observedThrough: section.observedThrough,
    citationIds,
  };
};

