import { ReaderSummaryWeeklyArtifact } from "../../domain/entities/reader-summary-weekly-artifact";
import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";

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

const legacyOutputKeys = [
  "schemaVersion",
  "sealId",
  "sealSha",
  "weekStartedOn",
  "weekEndedOn",
  "observedFrom",
  "observedThrough",
  "headline",
  "takeaway",
  "synthesis",
  "citationIds",
  "sections",
] as const;

const legacySectionKeys = [
  "sectionId",
  "kind",
  "storyId",
  "claimType",
  "status",
  "observedFrom",
  "observedThrough",
  "headline",
  "takeaway",
  "synthesis",
  "citationIds",
] as const;

const normalizeLegacyWeeklyModelOutput = (
  input: ReaderSummaryWeeklyModelInput,
  value: unknown,
): unknown => {
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
  const sections = value.sections.map((section, index) => {
    if (!hasExactKeys(section, legacySectionKeys)) {
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

const hasExactKeys = <const Keys extends readonly string[]>(
  value: unknown,
  expected: Keys,
): value is Record<Keys[number], unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));

const exactStringArray = (value: readonly unknown[], label: string): string[] => {
  const strings = value.map((item) => {
    if (typeof item !== "string") {
      throw new Error(`${label} must contain only strings`);
    }
    return item;
  });
  if (strings.length === 0 || new Set(strings).size !== strings.length) {
    throw new Error(`${label} must be non-empty and unique`);
  }
  return strings;
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

const normalizeLegacySectionKind = (value: unknown): unknown =>
  value === "supporting" ? "development" : value;

const normalizeLegacyStoryStatus = (value: unknown): unknown =>
  value === "open" ? "watch" : value;

export class OpenAiReaderSummaryWeeklyOutputParseError extends Error {
  constructor(readonly detail: string) {
    super(`OpenAI reader summary weekly output is invalid: ${detail}`);
    this.name = "OpenAiReaderSummaryWeeklyOutputParseError";
  }
}

const assertFiniteDenseJson = (
  value: unknown,
  path: string,
  ancestors: Set<object>,
): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} contains a non-finite number`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${path} contains a non-JSON value`);
  }
  if (ancestors.has(value)) {
    throw new Error(`${path} contains a circular reference`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new Error(`${path} contains a non-dense array`);
      }
      assertFiniteDenseJson(value[index], `${path}[${index}]`, ancestors);
    }
  } else {
    for (const [key, child] of Object.entries(value)) {
      assertFiniteDenseJson(child, `${path}.${key}`, ancestors);
    }
  }
  ancestors.delete(value);
};
