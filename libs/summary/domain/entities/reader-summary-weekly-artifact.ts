import {
  assertReaderSummaryWeeklyEditorialPublishable,
  type ReaderSummaryWeeklyEditorialQualityResult,
} from "../policies/reader-summary-weekly-editorial-quality-policy";
import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  canonicalizeReaderSummaryWeeklyJson,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
  exactReaderSummaryWeeklySha256,
  exactReaderSummaryWeeklyUtcDay,
} from "../value-objects/reader-summary-weekly-canonical-json";
import {
  assertReaderSummaryWeeklyModelInput,
  readerSummaryWeeklyClaimTypes,
  readerSummaryWeeklyModelOutputSchemaVersion,
  readerSummaryWeeklySectionKinds,
  readerSummaryWeeklyStoryStatuses,
  type ReaderSummaryWeeklyClaimType,
  type ReaderSummaryWeeklyModelCitation,
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelOutput,
  type ReaderSummaryWeeklyModelOutputSection,
  type ReaderSummaryWeeklyModelOutputStory,
  type ReaderSummaryWeeklySectionKind,
  type ReaderSummaryWeeklyStoryStatus,
} from "../../ports/reader-summary-weekly-model.port";

export type ReaderSummaryWeeklyArtifactProps = Readonly<{
  input: ReaderSummaryWeeklyModelInput;
  output: ReaderSummaryWeeklyModelOutput;
}>;

export type ReaderSummaryWeeklyArtifactSnapshot = Readonly<{
  output: ReaderSummaryWeeklyModelOutput;
  editorialQuality: ReaderSummaryWeeklyEditorialQualityResult;
}>;

const outputKeys = [
  "schemaVersion",
  "sealId",
  "sealSha",
  "weekStartedOn",
  "weekEndedOn",
  "headline",
  "headlineCitationIds",
  "takeaway",
  "takeawayCitationIds",
  "synthesis",
  "synthesisCitationIds",
  "stories",
  "sections",
] as const;
const storyKeys = [
  "storyId",
  "headline",
  "summary",
  "status",
  "observedFrom",
  "observedThrough",
  "citationIds",
] as const;
const sectionKeys = [
  "sectionId",
  "storyId",
  "kind",
  "claimType",
  "heading",
  "text",
  "observedFrom",
  "observedThrough",
  "citationIds",
] as const;

export class ReaderSummaryWeeklyArtifact {
  private constructor(
    private readonly output: ReaderSummaryWeeklyModelOutput,
    private readonly editorialQuality: ReaderSummaryWeeklyEditorialQualityResult,
  ) {}

  static create(props: ReaderSummaryWeeklyArtifactProps): ReaderSummaryWeeklyArtifact {
    assertReaderSummaryWeeklyModelInput(props.input);
    const output = canonicalOutput(props.input, props.output);
    const editorialQuality = assertReaderSummaryWeeklyEditorialPublishable(
      props.input,
      output,
    );
    return new ReaderSummaryWeeklyArtifact(output, editorialQuality);
  }

  toSnapshot(): ReaderSummaryWeeklyArtifactSnapshot {
    return deepFreezeReaderSummaryWeekly({
      output: this.output,
      editorialQuality: this.editorialQuality,
    });
  }

  toModelOutput(): ReaderSummaryWeeklyModelOutput {
    return this.output;
  }
}

export function assertReaderSummaryWeeklyModelOutput(
  input: ReaderSummaryWeeklyModelInput,
  output: unknown,
): asserts output is ReaderSummaryWeeklyModelOutput {
  canonicalOutput(input, output);
}

const canonicalOutput = (
  input: ReaderSummaryWeeklyModelInput,
  value: unknown,
): ReaderSummaryWeeklyModelOutput => {
  canonicalizeReaderSummaryWeeklyJson(value, "weekly model output");
  assertReaderSummaryWeeklyExactObject(
    value,
    outputKeys,
    "weekly model output",
    { allowAuthoritativeHashes: true },
  );
  const output = value as unknown as ReaderSummaryWeeklyModelOutput;
  if (
    output.schemaVersion !== readerSummaryWeeklyModelOutputSchemaVersion ||
    output.sealId !== input.sealId ||
    exactReaderSummaryWeeklySha256(output.sealSha, "output seal") !==
      input.sealSha ||
    output.weekStartedOn !== input.weekStartedOn ||
    output.weekEndedOn !== input.weekEndedOn
  ) {
    throw new Error(
      "Reader summary weekly model output does not bind the sealed input",
    );
  }
  const citationById = new Map(
    input.citations.map((citation) => [citation.citationId, citation] as const),
  );
  const storyIds = new Set(input.stories.map((story) => story.storyId));
  const headlineCitationIds = canonicalCitationIds(
    output.headlineCitationIds,
    citationById,
    "headline",
  );
  const takeawayCitationIds = canonicalCitationIds(
    output.takeawayCitationIds,
    citationById,
    "takeaway",
  );
  const synthesisCitationIds = canonicalCitationIds(
    output.synthesisCitationIds,
    citationById,
    "synthesis",
  );
  assertReaderSummaryWeeklyDenseArray(output.stories, "weekly output stories");
  assertReaderSummaryWeeklyDenseArray(
    output.sections,
    "weekly output sections",
  );
  if (
    output.stories.length === 0 ||
    output.stories.length > 12 ||
    output.sections.length === 0 ||
    output.sections.length > 16
  ) {
    throw new Error("Reader summary weekly model output has invalid cardinality");
  }
  const stories = output.stories.map((story, index) =>
    canonicalStory(story, index, storyIds, citationById),
  );
  assertUnique(
    stories.map((story) => story.storyId),
    "output story ids",
  );
  const outputStoryIds = new Set(stories.map((story) => story.storyId));
  const sections = output.sections.map((section, index) =>
    canonicalSection(section, index, outputStoryIds, citationById),
  );
  assertUnique(
    sections.map((section) => section.sectionId),
    "output section ids",
  );
  assertUnique(
    sections.map((section) => `${section.storyId}:${section.kind}`),
    "output story sections",
  );

  return deepFreezeReaderSummaryWeekly({
    schemaVersion: readerSummaryWeeklyModelOutputSchemaVersion,
    sealId: input.sealId,
    sealSha: input.sealSha,
    weekStartedOn: input.weekStartedOn,
    weekEndedOn: input.weekEndedOn,
    headline: exactText(output.headline, "headline", 160, 12),
    headlineCitationIds,
    takeaway: exactText(output.takeaway, "takeaway", 320, 20),
    takeawayCitationIds,
    synthesis: exactText(output.synthesis, "synthesis", 3_200, 80),
    synthesisCitationIds,
    stories,
    sections,
  });
};

const canonicalStory = (
  story: ReaderSummaryWeeklyModelOutputStory,
  index: number,
  knownStoryIds: ReadonlySet<string>,
  citationById: ReadonlyMap<string, ReaderSummaryWeeklyModelCitation>,
): ReaderSummaryWeeklyModelOutputStory => {
  assertReaderSummaryWeeklyExactObject(
    story,
    storyKeys,
    `weekly output story ${index + 1}`,
    { allowAuthoritativeHashes: true },
  );
  const storyId = exactReaderSummaryWeeklyIdentity(
    story.storyId,
    "output story id",
  );
  if (!knownStoryIds.has(storyId)) {
    throw new Error("Reader summary weekly output invents a story id");
  }
  const citationIds = canonicalCitationIds(
    story.citationIds,
    citationById,
    `story ${storyId}`,
    storyId,
  );
  const range = exactCitedRange(citationIds, citationById);
  const observedFrom = exactReaderSummaryWeeklyUtcDay(story.observedFrom);
  const observedThrough = exactReaderSummaryWeeklyUtcDay(
    story.observedThrough,
  );
  if (
    observedFrom !== range.observedFrom ||
    observedThrough !== range.observedThrough
  ) {
    throw new Error(
      `Reader summary weekly story ${storyId} fabricates chronology`,
    );
  }
  return deepFreezeReaderSummaryWeekly({
    storyId,
    headline: exactText(story.headline, "story headline", 180, 8),
    summary: exactText(story.summary, "story summary", 1_200, 30),
    status: exactStoryStatus(story.status),
    observedFrom,
    observedThrough,
    citationIds,
  });
};

const canonicalSection = (
  section: ReaderSummaryWeeklyModelOutputSection,
  index: number,
  knownStoryIds: ReadonlySet<string>,
  citationById: ReadonlyMap<string, ReaderSummaryWeeklyModelCitation>,
): ReaderSummaryWeeklyModelOutputSection => {
  assertReaderSummaryWeeklyExactObject(
    section,
    sectionKeys,
    `weekly output section ${index + 1}`,
  );
  const storyId = exactReaderSummaryWeeklyIdentity(
    section.storyId,
    "section story id",
  );
  if (!knownStoryIds.has(storyId)) {
    throw new Error("Reader summary weekly section references unknown story");
  }
  const citationIds = canonicalCitationIds(
    section.citationIds,
    citationById,
    `section ${section.sectionId}`,
    storyId,
  );
  const range = exactCitedRange(citationIds, citationById);
  const observedFrom = exactReaderSummaryWeeklyUtcDay(section.observedFrom);
  const observedThrough = exactReaderSummaryWeeklyUtcDay(
    section.observedThrough,
  );
  if (
    observedFrom !== range.observedFrom ||
    observedThrough !== range.observedThrough
  ) {
    throw new Error(
      `Reader summary weekly section ${section.sectionId} fabricates chronology`,
    );
  }
  return deepFreezeReaderSummaryWeekly({
    sectionId: exactReaderSummaryWeeklyIdentity(
      section.sectionId,
      "section id",
    ),
    storyId,
    kind: exactSectionKind(section.kind),
    claimType: exactClaimType(section.claimType),
    heading: exactText(section.heading, "section heading", 140, 4),
    text: exactText(section.text, "section text", 1_200, 30),
    observedFrom,
    observedThrough,
    citationIds,
  });
};

const canonicalCitationIds = (
  input: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryWeeklyModelCitation>,
  label: string,
  storyId?: string,
): readonly string[] => {
  assertReaderSummaryWeeklyDenseArray(input, `${label} citations`);
  if (input.length === 0 || input.length > 24) {
    throw new Error(`Reader summary weekly ${label} must cite evidence`);
  }
  const citationIds = input.map((citationId) =>
    exactReaderSummaryWeeklyIdentity(citationId, `${label} citation id`),
  );
  assertUnique(citationIds, `${label} citations`);
  for (const citationId of citationIds) {
    const citation = citationById.get(citationId);
    if (citation === undefined) {
      throw new Error(
        `Reader summary weekly ${label} cites unknown evidence`,
      );
    }
    if (storyId !== undefined && citation.storyId !== storyId) {
      throw new Error(
        `Reader summary weekly ${label} cites another story`,
      );
    }
  }
  return deepFreezeReaderSummaryWeekly(citationIds);
};

const exactCitedRange = (
  citationIds: readonly string[],
  citationById: ReadonlyMap<string, ReaderSummaryWeeklyModelCitation>,
): Readonly<{ observedFrom: string; observedThrough: string }> => {
  const dates = citationIds
    .map((citationId) => citationById.get(citationId)?.observedOn)
    .filter((date): date is string => date !== undefined)
    .sort();
  return {
    observedFrom: dates[0]!,
    observedThrough: dates[dates.length - 1]!,
  };
};

const exactStoryStatus = (value: unknown): ReaderSummaryWeeklyStoryStatus => {
  if (
    !readerSummaryWeeklyStoryStatuses.includes(
      value as ReaderSummaryWeeklyStoryStatus,
    )
  ) {
    throw new Error("Reader summary weekly story status is invalid");
  }
  return value as ReaderSummaryWeeklyStoryStatus;
};

const exactSectionKind = (value: unknown): ReaderSummaryWeeklySectionKind => {
  if (
    !readerSummaryWeeklySectionKinds.includes(
      value as ReaderSummaryWeeklySectionKind,
    )
  ) {
    throw new Error("Reader summary weekly section kind is invalid");
  }
  return value as ReaderSummaryWeeklySectionKind;
};

const exactClaimType = (value: unknown): ReaderSummaryWeeklyClaimType => {
  if (
    !readerSummaryWeeklyClaimTypes.includes(
      value as ReaderSummaryWeeklyClaimType,
    )
  ) {
    throw new Error("Reader summary weekly claim type is invalid");
  }
  return value as ReaderSummaryWeeklyClaimType;
};

const exactText = (
  value: unknown,
  label: string,
  maxLength: number,
  minLength: number,
): string => {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length < minLength ||
    value.length > maxLength ||
    value.includes("\0")
  ) {
    throw new Error(`Reader summary weekly ${label} is invalid`);
  }
  return value;
};

const assertUnique = (values: readonly string[], label: string): void => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Reader summary weekly has duplicate ${label}`);
  }
};
