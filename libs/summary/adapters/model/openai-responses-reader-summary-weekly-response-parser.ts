import { ReaderSummaryWeeklyArtifact } from "../../domain/entities/reader-summary-weekly-artifact";
import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import {
  assertFiniteDenseJson,
  exactStringArray,
  expandedLegacyOutputKeys,
  expandedLegacySectionKeys,
  expandedLegacySectionKeysWithoutClaimType,
  expandedLegacyStoryKeys,
  hasExactKeys,
  legacyOutputKeys,
  legacySectionKeys,
  legacySectionKeysWithoutTakeaway,
  normalizeExpandedLegacySectionKind,
  normalizeExpandedLegacyStoryStatus,
  normalizeLegacySectionKind,
  normalizeLegacyStoryStatus,
  sealedCompactOutputKeys,
  sealedCompactStoryKeys,
  sealedCompactStoryKeysWithHeadline,
} from "./openai-responses-reader-summary-weekly-response-shapes";

export const parseOpenAiReaderSummaryWeeklyResponse = (
  input: ReaderSummaryWeeklyModelInput,
  value: string,
): ReaderSummaryWeeklyModelOutput => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OpenAiReaderSummaryWeeklyOutputParseError(
      "response must be non-empty JSON text",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown JSON parse failure";
    throw new OpenAiReaderSummaryWeeklyOutputParseError(detail);
  }
  return parseOpenAiReaderSummaryWeeklyValue(input, parsed);
};

export const parseOpenAiReaderSummaryWeeklyValue = (
  input: ReaderSummaryWeeklyModelInput,
  value: unknown,
): ReaderSummaryWeeklyModelOutput => {
  try {
    assertFiniteDenseJson(value, "weekly output", new Set<object>());
    const normalized = normalizeLegacyWeeklyModelOutput(input, value);
    return ReaderSummaryWeeklyArtifact.create({
      input,
      output: normalized as ReaderSummaryWeeklyModelOutput,
    }).toModelOutput();
  } catch (error) {
    if (error instanceof OpenAiReaderSummaryWeeklyOutputParseError) {
      throw error;
    }
    const detail =
      error instanceof Error ? error.message : "unknown validation failure";
    throw new OpenAiReaderSummaryWeeklyOutputParseError(detail);
  }
};

const normalizeLegacyWeeklyModelOutput = (
  input: ReaderSummaryWeeklyModelInput,
  value: unknown,
): unknown => {
  if (hasExactKeys(value, sealedCompactOutputKeys)) {
    return normalizeSealedCompactWeeklyModelOutput(input, value);
  }
  if (hasExactKeys(value, expandedLegacyOutputKeys)) {
    return normalizeExpandedLegacyWeeklyModelOutput(input, value);
  }
  if (!hasExactKeys(value, legacyOutputKeys)) {
    return value;
  }
  if (!Array.isArray(value.citationIds) || !Array.isArray(value.sections)) {
    throw new Error("Legacy weekly output citations and sections must be arrays");
  }
  const rootCitationIds = exactStringArray(
    value.citationIds,
    "legacy weekly output citations",
  );
  const rootRange = citedRange(input, rootCitationIds);
  if (
    value.observedFrom !== rootRange.observedFrom ||
    value.observedThrough !== rootRange.observedThrough
  ) {
    throw new Error("Legacy weekly output fabricates root chronology");
  }
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
    stories: sections.map((section) => section.story),
    sections: sections.map((section) => section.section),
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
  const sections = value.sections.map((rawSection, index) => {
    const section = hasExactKeys(rawSection, expandedLegacySectionKeys)
      ? rawSection
      : hasExactKeys(rawSection, expandedLegacySectionKeysWithoutClaimType)
        ? {
            ...rawSection,
            claimType: legacyClaimTypeFromStories(
              value.stories,
              rawSection.storyId,
              `sealed compact weekly section ${index + 1}`,
            ),
          }
        : undefined;
    if (section === undefined) {
      throw new Error(
        `Sealed compact weekly section ${index + 1} must contain exactly the supported fields`,
      );
    }
    const citationIds = exactLegacyCitationRange(
      input,
      section,
      `sealed compact weekly section ${index + 1}`,
    );
    return {
      sectionId: section.sectionId,
      storyId: section.storyId,
      kind: normalizeExpandedLegacySectionKind(section.kind),
      claimType: exactLegacyClaimType(
        section.claimType,
        `sealed compact weekly section ${index + 1}`,
      ),
      heading: section.headline,
      text: section.synthesis,
      observedFrom: section.observedFrom,
      observedThrough: section.observedThrough,
      citationIds,
    };
  });
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
  const sections = value.sections.map((rawSection, index) => {
    const section = hasExactKeys(rawSection, expandedLegacySectionKeys)
      ? rawSection
      : hasExactKeys(rawSection, expandedLegacySectionKeysWithoutClaimType)
        ? {
            ...rawSection,
            claimType: legacyClaimTypeFromStories(
              value.stories,
              rawSection.storyId,
              `expanded legacy weekly section ${index + 1}`,
            ),
          }
        : undefined;
    if (section === undefined) {
      throw new Error(
        `Expanded legacy weekly section ${index + 1} must contain exactly the supported fields`,
      );
    }
    const citationIds = exactLegacyCitationRange(
      input,
      section,
      `expanded legacy weekly section ${index + 1}`,
    );
    return {
      sectionId: section.sectionId,
      storyId: section.storyId,
      kind: normalizeExpandedLegacySectionKind(section.kind),
      claimType: exactLegacyClaimType(
        section.claimType,
        `expanded legacy weekly section ${index + 1}`,
      ),
      heading: section.headline,
      text: section.synthesis,
      observedFrom: section.observedFrom,
      observedThrough: section.observedThrough,
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

const exactLegacyCitationRange = (
  input: ReaderSummaryWeeklyModelInput,
  value: Readonly<Record<string, unknown>>,
  label: string,
): string[] => {
  if (!Array.isArray(value.citationIds)) {
    throw new Error(`${label} citations must be an array`);
  }
  const citationIds = exactStringArray(value.citationIds, `${label} citations`);
  const range = citedRange(input, citationIds);
  if (
    value.observedFrom !== range.observedFrom ||
    value.observedThrough !== range.observedThrough
  ) {
    throw new Error(`${label} fabricates chronology`);
  }
  return citationIds;
};

const exactLegacyClaimType = (value: unknown, label: string): string => {
  if (value !== "snapshot" && value !== "evolution" && value !== "resolution") {
    throw new Error(`${label} claim type is invalid`);
  }
  return value;
};

const legacyClaimTypeFromStories = (
  stories: unknown,
  storyId: unknown,
  label: string,
): string => {
  if (!Array.isArray(stories)) {
    throw new Error(`${label} must inherit its claim type from a story`);
  }
  const matches = stories.filter(
    (story) =>
      story !== null &&
      typeof story === "object" &&
      (story as Record<string, unknown>).storyId === storyId,
  );
  if (matches.length !== 1) {
    throw new Error(
      `${label} must inherit its claim type from exactly one story`,
    );
  }
  return exactLegacyClaimType(
    (matches[0] as Record<string, unknown>).claimType,
    label,
  );
};

const citedRange = (
  input: ReaderSummaryWeeklyModelInput,
  citationIds: readonly string[],
): { observedFrom: string; observedThrough: string } => {
  const citationById = new Map(
    input.citations.map((citation) => [citation.citationId, citation] as const),
  );
  const dates = citationIds.map((citationId) => {
    const citation = citationById.get(citationId);
    if (citation === undefined) {
      throw new Error("Legacy weekly output cites unknown evidence");
    }
    return citation.observedOn;
  });
  dates.sort();
  return {
    observedFrom: dates[0]!,
    observedThrough: dates[dates.length - 1]!,
  };
};

export class OpenAiReaderSummaryWeeklyOutputParseError extends Error {
  constructor(readonly detail: string) {
    super(`OpenAI reader summary weekly output is invalid: ${detail}`);
    this.name = "OpenAiReaderSummaryWeeklyOutputParseError";
  }
}

