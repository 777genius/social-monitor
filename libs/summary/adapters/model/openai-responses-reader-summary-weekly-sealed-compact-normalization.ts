import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import {
  hasExactKeys,
  normalizeExpandedLegacyStoryStatus,
  sealedCompactOutputKeys,
  sealedCompactStoryKeys,
  sealedCompactStoryKeysWithHeadline,
} from "./openai-responses-reader-summary-weekly-response-shapes";
import {
  exactLegacyCitationRange,
  exactLegacyClaimType,
} from "./openai-responses-reader-summary-weekly-legacy-evidence-policy";
import { normalizeExpandedWeeklySection } from "./openai-responses-reader-summary-weekly-section-normalization";

// Sealed compact owns story-to-section headline reconciliation.
export const normalizeSealedCompactWeeklyModelOutput = (
  input: ReaderSummaryWeeklyModelInput,
  value: Record<(typeof sealedCompactOutputKeys)[number], unknown>,
): unknown => {
  if (!Array.isArray(value.stories) || !Array.isArray(value.sections)) {
    throw new Error("Sealed compact weekly stories and sections must be arrays");
  }
  const rootCitationIds = exactLegacyCitationRange(
    input,
    value,
    "sealed compact weekly output",
  );
  const sections = value.sections.map((rawSection, index) =>
    normalizeExpandedWeeklySection(
      input, rawSection, value.stories, `Sealed compact weekly section ${index + 1}`,
    ),
  );
  const stories = value.stories.map((rawStory, index) => {
    const story = hasExactKeys(rawStory, sealedCompactStoryKeys)
      ? rawStory
      : hasExactKeys(rawStory, sealedCompactStoryKeysWithHeadline)
        ? rawStory
        : undefined;
    if (story === undefined) {
      throw new Error(
        `Sealed compact weekly story ${index + 1} must contain exactly the supported fields`,
      );
    }
    const citationIds = exactLegacyCitationRange(
      input,
      story,
      `sealed compact weekly story ${index + 1}`,
    );
    exactLegacyClaimType(
      story.claimType,
      `sealed compact weekly story ${index + 1}`,
    );
    const heading = sections.find(
      (section) => section.storyId === story.storyId,
    )?.heading;
    if (typeof heading !== "string") {
      throw new Error(
        `Sealed compact weekly story ${index + 1} lacks a matching section headline`,
      );
    }
    return {
      storyId: story.storyId,
      headline: heading,
      summary: story.synthesis,
      status: normalizeExpandedLegacyStoryStatus(story.status),
      observedFrom: story.observedFrom,
      observedThrough: story.observedThrough,
      citationIds,
    };
  });
  return {
    schemaVersion: value.schemaVersion,
    sealId: value.sealId,
    sealSha: value.sealSha,
    weekStartedOn: value.weekStartedOn,
    weekEndedOn: value.weekEndedOn,
    headline: value.headline,
    headlineCitationIds: [...rootCitationIds],
    takeaway: value.takeaway,
    takeawayCitationIds: [...rootCitationIds],
    synthesis: value.synthesis,
    synthesisCitationIds: [...rootCitationIds],
    stories,
    sections,
  };
};

