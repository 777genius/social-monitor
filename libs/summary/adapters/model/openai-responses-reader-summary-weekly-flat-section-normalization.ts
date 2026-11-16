import {
  exactStringArray,
  hasExactKeys,
  legacySectionKeys,
  legacySectionKeysWithoutTakeaway,
  normalizeLegacySectionKind,
  normalizeLegacyStoryStatus,
} from "./openai-responses-reader-summary-weekly-response-shapes";

// A flat legacy section is simultaneously a story and a section. Keep its
// exact field admission, citation cloning and duplicate-story rejection local.
export const normalizeLegacyFlatWeeklySections = (
  value: Readonly<{ sections: readonly unknown[] }>,
) => {
  const sections = value.sections.map((rawSection, index) => {
    const section = hasExactKeys(rawSection, legacySectionKeys)
      ? rawSection
      : hasExactKeys(rawSection, legacySectionKeysWithoutTakeaway)
        ? { ...rawSection, takeaway: rawSection.synthesis }
        : undefined;
    if (section === undefined) {
      throw new Error(
        `Legacy weekly output section ${index + 1} must contain exactly the supported fields`,
      );
    }
    if (!Array.isArray(section.citationIds)) {
      throw new Error(
        `Legacy weekly output section ${index + 1} citations must be an array`,
      );
    }
    const citationIds = exactStringArray(
      section.citationIds,
      `legacy weekly output section ${index + 1} citations`,
    );
    return {
      section: {
        sectionId: section.sectionId,
        storyId: section.storyId,
        kind: normalizeLegacySectionKind(section.kind),
        claimType: section.claimType,
        heading: section.headline,
        text: section.synthesis,
        observedFrom: section.observedFrom,
        observedThrough: section.observedThrough,
        citationIds: [...citationIds],
      },
      story: {
        storyId: section.storyId,
        headline: section.headline,
        summary: section.takeaway,
        status: normalizeLegacyStoryStatus(section.status),
        observedFrom: section.observedFrom,
        observedThrough: section.observedThrough,
        citationIds: [...citationIds],
      },
    };
  });
  const storyIds = sections.map((section) => section.story.storyId);
  if (new Set(storyIds).size !== storyIds.length) {
    throw new Error("Legacy weekly output contains duplicate story ids");
  }
  return sections;
};
