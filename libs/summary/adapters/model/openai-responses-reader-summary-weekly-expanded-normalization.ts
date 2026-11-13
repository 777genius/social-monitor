import type { ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import {
  expandedLegacyOutputKeys,
  expandedLegacySectionKeys,
  expandedLegacySectionKeysWithoutClaimType,
  expandedLegacyStoryKeys,
  hasExactKeys,
  normalizeExpandedLegacySectionKind,
  normalizeExpandedLegacyStoryStatus,
  sealedCompactOutputKeys,
  sealedCompactStoryKeys,
  sealedCompactStoryKeysWithHeadline,
} from "./openai-responses-reader-summary-weekly-response-shapes";
import {
  exactLegacyCitationRange,
  exactLegacyClaimType,
  legacyClaimTypeFromStories,
} from "./openai-responses-reader-summary-weekly-legacy-evidence-policy";

// Both accepted legacy envelopes share this decoder, retaining original
// per-envelope labels and story-validation order in their callers.
const normalizeExpandedWeeklySection = (
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

const normalizeSealedCompactWeeklyModelOutput = (
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

export {
  normalizeExpandedLegacyWeeklyModelOutput,
  normalizeSealedCompactWeeklyModelOutput,
};
