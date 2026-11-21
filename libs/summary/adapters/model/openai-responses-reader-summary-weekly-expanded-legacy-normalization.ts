import { projectLegacyWeeklyDocument } from "./openai-responses-reader-summary-weekly-document-projection";
import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import { expandedLegacyOutputKeys, expandedLegacyStoryKeys } from "./openai-responses-reader-summary-weekly-legacy-shape-keys";
import { hasExactKeys, normalizeExpandedLegacyStoryStatus } from "./openai-responses-reader-summary-weekly-response-shapes";
import { exactLegacyCitationRange } from "./openai-responses-reader-summary-weekly-legacy-evidence-policy";
import { exactLegacyClaimType } from "./openai-responses-reader-summary-weekly-legacy-claim-policy";
import { normalizeExpandedWeeklySection } from "./openai-responses-reader-summary-weekly-section-normalization";

// Expanded legacy owns its own exact story keys and validation sequence.
const normalizeExpandedLegacyWeeklyModelOutput = (
  input: ReaderSummaryWeeklyModelInput,
  value: Record<(typeof expandedLegacyOutputKeys)[number], unknown>,
): unknown => {
  if (!Array.isArray(value.stories) || !Array.isArray(value.sections)) {
    throw new Error("Expanded legacy weekly stories and sections must be arrays");
  }
  const rootCitationIds = exactLegacyCitationRange(
    input,
    value,
    "expanded legacy weekly output",
  );
  exactLegacyClaimType(value.claimType, "expanded legacy weekly output");
  const stories = value.stories.map((story, index) => {
    if (!hasExactKeys(story, expandedLegacyStoryKeys)) {
      throw new Error(
        `Expanded legacy weekly story ${index + 1} must contain exactly the supported fields`,
      );
    }
    const citationIds = exactLegacyCitationRange(
      input,
      story,
      `expanded legacy weekly story ${index + 1}`,
    );
    exactLegacyClaimType(
      story.claimType,
      `expanded legacy weekly story ${index + 1}`,
    );
    return {
      storyId: story.storyId,
      headline: story.headline,
      summary: story.synthesis,
      status: normalizeExpandedLegacyStoryStatus(story.status),
      observedFrom: story.observedFrom,
      observedThrough: story.observedThrough,
      citationIds,
    };
  });
  const sections = value.sections.map((rawSection, index) =>
    normalizeExpandedWeeklySection(
      input, rawSection, value.stories, `Expanded legacy weekly section ${index + 1}`,
    ),
  );
  return projectLegacyWeeklyDocument(value, rootCitationIds, stories, sections);
};

export { normalizeExpandedLegacyWeeklyModelOutput };
