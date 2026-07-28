import {
  assertReaderSummaryWeeklyModelInput,
  readerSummaryWeeklyClaimTypes,
  readerSummaryWeeklyModelOutputSchemaVersion,
  readerSummaryWeeklySectionKinds,
  readerSummaryWeeklyStoryStatuses,
  type ReaderSummaryWeeklyModelInput,
} from "../../ports/reader-summary-weekly-model.port";

export const buildOpenAiReaderSummaryWeeklyJsonSchema = (
  input: ReaderSummaryWeeklyModelInput,
) => {
  assertReaderSummaryWeeklyModelInput(input);
  const storyIds = input.stories.map((story) => story.storyId);
  const citationIds = input.citations.map((citation) => citation.citationId);
  const certifiedDates = input.days.map((day) => day.date);

  return {
    type: "object",
    additionalProperties: false,
    required: [
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
    ],
    properties: {
      schemaVersion: { const: readerSummaryWeeklyModelOutputSchemaVersion },
      sealId: { const: input.sealId },
      sealSha: { const: input.sealSha },
      weekStartedOn: { const: input.weekStartedOn },
      weekEndedOn: { const: input.weekEndedOn },
      headline: stringSchema(160, 12),
      headlineCitationIds: citationIdsSchema(citationIds, 12),
      takeaway: stringSchema(320, 20),
      takeawayCitationIds: citationIdsSchema(citationIds, 12),
      synthesis: {
        ...stringSchema(3_200, 80),
        description:
          "One cross-day weekly synthesis, never concatenated daily summaries.",
      },
      synthesisCitationIds: citationIdsSchema(citationIds, 24),
      stories: {
        type: "array",
        minItems: 1,
        maxItems: Math.min(12, storyIds.length),
        uniqueItems: true,
        items: { $ref: "#/$defs/story" },
      },
      sections: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        description:
          "Story-organized weekly sections; daily or dated slots are forbidden.",
        uniqueItems: true,
        items: { $ref: "#/$defs/section" },
      },
    },
    $defs: {
      story: objectSchema(
        [
          "storyId",
          "headline",
          "summary",
          "status",
          "observedFrom",
          "observedThrough",
          "citationIds",
        ],
        {
          storyId: { enum: storyIds },
          headline: stringSchema(180, 8),
          summary: stringSchema(1_200, 30),
          status: { enum: [...readerSummaryWeeklyStoryStatuses] },
          observedFrom: certifiedDateSchema(certifiedDates),
          observedThrough: certifiedDateSchema(certifiedDates),
          citationIds: citationIdsSchema(citationIds, 24),
        },
      ),
      section: objectSchema(
        [
          "sectionId",
          "storyId",
          "kind",
          "claimType",
          "heading",
          "text",
          "observedFrom",
          "observedThrough",
          "citationIds",
        ],
        {
          sectionId: stringSchema(160, 1),
          storyId: { enum: storyIds },
          kind: { enum: [...readerSummaryWeeklySectionKinds] },
          claimType: { enum: [...readerSummaryWeeklyClaimTypes] },
          heading: stringSchema(140, 4),
          text: stringSchema(1_200, 30),
          observedFrom: certifiedDateSchema(certifiedDates),
          observedThrough: certifiedDateSchema(certifiedDates),
          citationIds: citationIdsSchema(citationIds, 24),
        },
      ),
    },
  };
};

export const buildOpenAiReaderSummaryWeeklyResponseFormat = (
  input: ReaderSummaryWeeklyModelInput,
) => ({
  type: "json_schema",
  name: "reader_summary_weekly_output_v1",
  strict: true,
  schema: buildOpenAiReaderSummaryWeeklyJsonSchema(input),
});

const objectSchema = (
  required: readonly string[],
  properties: Readonly<Record<string, unknown>>,
) => ({
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

const stringSchema = (maxLength: number, minLength: number) => ({
  type: "string",
  minLength,
  maxLength,
});

const certifiedDateSchema = (certifiedDates: readonly string[]) => ({
  type: "string",
  format: "date",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  enum: certifiedDates,
});

const citationIdsSchema = (
  citationIds: readonly string[],
  maxItems: number,
) => ({
  type: "array",
  minItems: 1,
  maxItems: Math.min(maxItems, citationIds.length),
  uniqueItems: true,
  items: { enum: citationIds },
});
